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
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

async def run_linker(days: int = 7, threshold: float = 0.65, coherence_threshold: float = 0.7):
    now = datetime.now(timezone.utc)

    for day_offset in range(1, days):
        today = (now - timedelta(days=days - 1 - day_offset)).replace(
            hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)

        today_topics = await topics.find({"date": today}).to_list(None)
        yesterday_topics = await topics.find({"date": yesterday}).to_list(None)

        if not today_topics or not yesterday_topics:
            continue

        print(f"\n{today.date()} → comparing {len(today_topics)} topics vs {len(yesterday_topics)} yesterday")

        for today_topic in today_topics:
            best_match = None
            best_score = 0

            for yesterday_topic in yesterday_topics:
                score = cosine_similarity(
                    today_topic["centroid"],
                    yesterday_topic["centroid"]
                )
                if score > best_score:
                    best_score = score
                    best_match = yesterday_topic

            print(f"  cluster {today_topic['cluster_label']} → best match score: {best_score:.3f}", end="")

            if best_score >= threshold and best_match:
                existing_trend = await trends.find_one({
                    "topic_ids": str(best_match["_id"])
                })

                if existing_trend:
                    # 检查主题一致性：today_topic 和 trend 里已有的 topics 是否相似
                    trend_topic_ids = existing_trend.get("topic_ids", [])
                    trend_topics = await topics.find(
                        {"_id": {"$in": [ObjectId(tid) for tid in trend_topic_ids]}}
                    ).to_list(None)

                    # 计算 today_topic 与 trend 内所有 topics 的平均相似度
                    similarities = [
                        cosine_similarity(today_topic["centroid"], t["centroid"])
                        for t in trend_topics
                        if t.get("centroid")
                    ]
                    avg_similarity = sum(similarities) / len(similarities) if similarities else 0

                    if avg_similarity >= coherence_threshold:
                        # 主题一致，extend 这个 trend
                        await trends.update_one(
                            {"_id": existing_trend["_id"]},
                            {
                                "$push": {"topic_ids": str(today_topic["_id"])},
                                "$set": {"last_updated": datetime.now(timezone.utc)}
                            }
                        )
                        print(f" → extended trend {existing_trend['_id']} (coherence={avg_similarity:.3f})")
                    else:
                        # 主题不一致，开新 trend
                        trend_doc = {
                            "topic_ids": [str(best_match["_id"]), str(today_topic["_id"])],
                            "status": "emerging",
                            "created_at": datetime.now(timezone.utc),
                            "last_updated": datetime.now(timezone.utc),
                            "keywords": [],
                            "summary": "",
                            "metrics": {}
                        }
                        result = await trends.insert_one(trend_doc)
                        print(f" → new trend created {result.inserted_id} (low coherence={avg_similarity:.3f})")
                else:
                    # 没有找到已有 trend，创建新的
                    trend_doc = {
                        "topic_ids": [str(best_match["_id"]), str(today_topic["_id"])],
                        "status": "emerging",
                        "created_at": datetime.now(timezone.utc),
                        "last_updated": datetime.now(timezone.utc),
                        "keywords": [],
                        "summary": "",
                        "metrics": {}
                    }
                    result = await trends.insert_one(trend_doc)
                    print(f" → new trend created {result.inserted_id}")
            else:
                 # 没有匹配，自己成为新 trend 的起点
                trend_doc = {
                    "topic_ids": [str(today_topic["_id"])],
                    "status": "emerging",
                    "created_at": datetime.now(timezone.utc),
                    "last_updated": datetime.now(timezone.utc),
                    "keywords": [],
                    "summary": "",
                    "metrics": {}
                }
                result = await trends.insert_one(trend_doc)
                print(f" → new trend started {result.inserted_id}")

    total = await trends.count_documents({})
    print(f"\nDone! Total trends in DB: {total}")

asyncio.run(run_linker())