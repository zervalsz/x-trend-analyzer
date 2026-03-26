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

async def run_linker(days: int = 7, threshold: float = 0.7):
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
                # 找到匹配 — 延续已有 trend
                existing_trend = await trends.find_one({
                    "topic_ids": str(best_match["_id"])
                })

                if existing_trend:
                    # 把今天的 topic 加进已有 trend
                    await trends.update_one(
                        {"_id": existing_trend["_id"]},
                        {
                            "$push": {"topic_ids": str(today_topic["_id"])},
                            "$set": {"last_updated": datetime.now(timezone.utc)}
                        }
                    )
                    print(f" → extended trend {existing_trend['_id']}")
                else:
                    # 创建新 trend，把昨天和今天都加进去
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
                print(f" → no match (below threshold {threshold})")

    total = await trends.count_documents({})
    print(f"\nDone! Total trends in DB: {total}")

asyncio.run(run_linker())