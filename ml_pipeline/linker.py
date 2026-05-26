import asyncio
import os
import numpy as np
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
topics = db["topics"]
trends = db["trends"]


def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


async def build_trend_centroid_cache(today: datetime, max_gap_days: int = 3) -> dict[str, tuple[dict, np.ndarray]]:
    """
    Build {trend_id: (trend_doc, latest_centroid)} cache.
    Only includes trends whose last topic is within max_gap_days of today —
    trends that have been silent longer are considered closed and won't be extended.
    """
    stale_cutoff = today - timedelta(days=max_gap_days)

    all_trends = await trends.find({}, {"_id": 1, "topic_ids": 1, "last_topic_date": 1}).to_list(None)
    if not all_trends:
        return {}

    # Filter out stale trends before doing DB lookups
    active_trends = [
        t for t in all_trends
        if t.get("topic_ids") and (
            t.get("last_topic_date") is None or
            t["last_topic_date"].replace(tzinfo=timezone.utc) >= stale_cutoff
        )
    ]

    last_topic_ids = [t["topic_ids"][-1] for t in active_trends]
    last_topics = await topics.find(
        {"_id": {"$in": [ObjectId(tid) for tid in last_topic_ids]}},
        {"_id": 1, "centroid": 1, "date": 1},
    ).to_list(None)
    topic_map = {str(t["_id"]): t for t in last_topics}

    cache = {}
    for trend in active_trends:
        last_tid = trend["topic_ids"][-1]
        t = topic_map.get(last_tid)
        if not t or not t.get("centroid"):
            continue
        # Double-check recency using the topic's actual date
        topic_date = t["date"].replace(tzinfo=timezone.utc) if t["date"].tzinfo is None else t["date"]
        if topic_date < stale_cutoff:
            continue
        cache[str(trend["_id"])] = (trend, np.array(t["centroid"]))
    return cache


async def run_linker(
    days: int = 16,
    threshold: float = 0.75,           # min similarity to link today→yesterday topic
    coherence_threshold: float = 0.78, # min avg similarity to extend an existing trend
    global_threshold: float = 0.83,    # min similarity for same-topic global merge
):
    now = datetime.now(timezone.utc)

    for day_offset in range(1, days):
        today = (now - timedelta(days=days - 1 - day_offset)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        yesterday = today - timedelta(days=1)

        today_topics = await topics.find({"date": today}).to_list(None)
        yesterday_topics = await topics.find({"date": yesterday}).to_list(None)

        if not today_topics:
            continue

        print(f"\n{today.date()} → {len(today_topics)} topics")

        # 每天开始时重建缓存（只含 7 天内仍活跃的 trend）
        trend_cache = await build_trend_centroid_cache(today)

        for today_topic in today_topics:
            today_vec = np.array(today_topic["centroid"])

            # ── 全局查重：找所有现有活跃 trend 里最相似的 ──────────────────
            best_global_id, best_global_score = None, 0.0
            for tid, (_, centroid) in trend_cache.items():
                score = cosine_similarity(today_vec, centroid)
                if score > best_global_score:
                    best_global_score = score
                    best_global_id = tid

            if best_global_score >= global_threshold and best_global_id:
                await trends.update_one(
                    {"_id": ObjectId(best_global_id)},
                    {
                        "$push": {"topic_ids": str(today_topic["_id"])},
                        "$set": {"last_updated": datetime.now(timezone.utc), "last_topic_date": today},
                    },
                )
                trend_cache[best_global_id] = (trend_cache[best_global_id][0], today_vec)
                print(
                    f"  cluster {today_topic['cluster_label']} → global merge "
                    f"into {best_global_id} (sim={best_global_score:.3f})"
                )
                continue

            # ── 全局未命中，走逐日匹配逻辑 ────────────────────────────────
            if not yesterday_topics:
                trend_doc = _new_trend([str(today_topic["_id"])], today)
                result = await trends.insert_one(trend_doc)
                trend_cache[str(result.inserted_id)] = (trend_doc, today_vec)
                print(f"  cluster {today_topic['cluster_label']} → new trend started (no yesterday)")
                continue

            best_match, best_score = None, 0.0
            for yt in yesterday_topics:
                score = cosine_similarity(today_vec, np.array(yt["centroid"]))
                if score > best_score:
                    best_score = score
                    best_match = yt

            print(
                f"  cluster {today_topic['cluster_label']} → day match score: {best_score:.3f}",
                end="",
            )

            if best_score >= threshold and best_match:
                existing_trend = await trends.find_one(
                    {"topic_ids": str(best_match["_id"])}
                )

                if existing_trend:
                    eid = str(existing_trend["_id"])
                    # Coherence check against last 3 topics
                    trend_topic_ids = existing_trend.get("topic_ids", [])
                    recent_ids = trend_topic_ids[-3:]
                    trend_topics_docs = await topics.find(
                        {"_id": {"$in": [ObjectId(tid) for tid in recent_ids]}}
                    ).to_list(None)
                    sims = [
                        cosine_similarity(today_vec, t["centroid"])
                        for t in trend_topics_docs
                        if t.get("centroid")
                    ]
                    avg_sim = sum(sims) / len(sims) if sims else 0

                    if avg_sim >= coherence_threshold:
                        await trends.update_one(
                            {"_id": existing_trend["_id"]},
                            {
                                "$push": {"topic_ids": str(today_topic["_id"])},
                                "$set": {"last_updated": datetime.now(timezone.utc), "last_topic_date": today},
                            },
                        )
                        trend_cache[eid] = (existing_trend, today_vec)
                        print(f" → extended {existing_trend['_id']} (coherence={avg_sim:.3f})")
                    else:
                        trend_doc = _new_trend(
                            [str(best_match["_id"]), str(today_topic["_id"])], today
                        )
                        result = await trends.insert_one(trend_doc)
                        trend_cache[str(result.inserted_id)] = (trend_doc, today_vec)
                        print(f" → new trend (low coherence={avg_sim:.3f})")
                else:
                    trend_doc = _new_trend(
                        [str(best_match["_id"]), str(today_topic["_id"])], today
                    )
                    result = await trends.insert_one(trend_doc)
                    trend_cache[str(result.inserted_id)] = (trend_doc, today_vec)
                    print(f" → new trend created {result.inserted_id}")
            else:
                trend_doc = _new_trend([str(today_topic["_id"])], today)
                result = await trends.insert_one(trend_doc)
                trend_cache[str(result.inserted_id)] = (trend_doc, today_vec)
                print(f" → new trend started")

    total = await trends.count_documents({})
    print(f"\nDone! Total trends in DB: {total}")


def _new_trend(topic_ids: list[str], last_topic_date: datetime | None = None) -> dict:
    return {
        "topic_ids": topic_ids,
        "status": "emerging",
        "created_at": datetime.now(timezone.utc),
        "last_updated": datetime.now(timezone.utc),
        "last_topic_date": last_topic_date,
        "keywords": [],
        "summary": "",
        "metrics": {},
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=16)
    args = parser.parse_args()
    asyncio.run(run_linker(days=args.days))
