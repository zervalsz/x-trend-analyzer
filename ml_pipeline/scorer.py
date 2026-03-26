import asyncio
import os
import numpy as np
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
topics = db["topics"]
trends = db["trends"]
posts = db["posts"]

def calculate_status(growth_rates: list[float]) -> str:
    if len(growth_rates) < 2:
        return "emerging"
    avg = np.mean(growth_rates)
    latest = growth_rates[-1]
    if avg > 0.2 and latest > 0.1:
        return "trending"
    elif avg > 0.1 and latest <= 0.05:
        return "peak"
    elif latest < 0:
        return "cooling"
    else:
        return "emerging"

async def score_trend(trend: dict) -> dict:
    topic_ids = trend["topic_ids"]

    # 每个 topic 的 size 和 engagement
    daily_sizes = []
    daily_engagement = []

    for topic_id in topic_ids:
        from bson import ObjectId
        topic = await topics.find_one({"_id": ObjectId(topic_id)})
        if not topic:
            continue

        # 获取这个 topic 下所有 posts
        post_list = await posts.find(
            {"cluster_id": str(topic["_id"])}
        ).to_list(None)

        size = len(post_list)
        if size == 0:
            continue

        avg_engagement = np.mean([
            p.get("likes", 0) + p.get("retweets", 0) + p.get("replies", 0)
            for p in post_list
        ])

        daily_sizes.append(size)
        daily_engagement.append(float(avg_engagement))

    if len(daily_sizes) < 2:
        return {}

    # 计算 growth rates
    growth_rates = [
        (daily_sizes[i] - daily_sizes[i-1]) / max(daily_sizes[i-1], 1)
        for i in range(1, len(daily_sizes))
    ]

    metrics = {
        "daily_sizes": daily_sizes,
        "daily_engagement": daily_engagement,
        "growth_rate": float(np.mean(growth_rates)),
        "velocity": float(daily_sizes[-1] - daily_sizes[0]),
        "avg_engagement": float(np.mean(daily_engagement)),
        "days_tracked": len(daily_sizes),
    }

    status = calculate_status(growth_rates)
    return {"metrics": metrics, "status": status}

async def run_scorer():
    all_trends = await trends.find({}).to_list(None)
    print(f"Scoring {len(all_trends)} trends...\n")

    for trend in all_trends:
        result = await score_trend(trend)
        if not result:
            continue

        await trends.update_one(
            {"_id": trend["_id"]},
            {"$set": {
                "metrics": result["metrics"],
                "status": result["status"],
                "scored_at": datetime.now(timezone.utc)
            }}
        )

        m = result["metrics"]
        print(f"Trend {trend['_id']}")
        print(f"  status:         {result['status']}")
        print(f"  days tracked:   {m['days_tracked']}")
        print(f"  growth rate:    {m['growth_rate']:.2f}")
        print(f"  velocity:       {m['velocity']:.0f}")
        print(f"  avg engagement: {m['avg_engagement']:.1f}")
        print()

    print("Done! All trends scored.")

asyncio.run(run_scorer())