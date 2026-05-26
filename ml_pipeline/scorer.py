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

MIN_TREND_SIZE = 5


def calculate_status(growth_rates: list[float], daily_sizes: list[int]) -> str:
    days = len(daily_sizes)
    if days < 2:
        return "emerging"

    avg_growth = float(np.mean(growth_rates))
    latest_growth = growth_rates[-1]
    peak_idx = int(np.argmax(daily_sizes))
    peak_val = float(max(daily_sizes))
    recent_avg = float(np.mean(daily_sizes[-3:])) if days >= 3 else float(daily_sizes[-1])

    # Launch spike then faded: peak was in first third, now well below it
    if peak_idx <= max(1, days // 3) and recent_avg < peak_val * 0.55:
        return "cooling" if avg_growth < -0.05 else "peak"

    # Clear mid-trend peak, declining since
    if peak_idx < days - 2 and recent_avg < peak_val * 0.7 and avg_growth < 0:
        return "peak"

    # Recently declining sharply (only meaningful if it had real traction first)
    if days >= 5 and latest_growth < -0.3 and avg_growth < 0:
        return "cooling"

    # Long-running with any positive growth → trending
    if days >= 10 and avg_growth > 0:
        return "trending"

    # Established and stable or growing (sustained attention ≥ 7 days)
    if days >= 7 and avg_growth > -0.05:
        return "trending"

    # Growing meaningfully in shorter window
    if days >= 5 and avg_growth > 0.05:
        return "trending"

    return "emerging"

async def score_trend(trend: dict) -> dict:
    topic_ids = trend["topic_ids"]

    daily_sizes = []
    daily_engagement = []

    for topic_id in topic_ids:
        from bson import ObjectId
        topic = await topics.find_one({"_id": ObjectId(topic_id)})
        if not topic:
            continue

        post_list = await posts.find(
            {"cluster_id": str(topic["_id"])}
        ).to_list(None)

        size = len(post_list)
        if size == 0:
            continue

        engagement_values = [
            p.get("likes", 0) + p.get("retweets", 0) + p.get("replies", 0)
            for p in post_list
        ]
        median_engagement = float(np.median(engagement_values))

        daily_sizes.append(size)
        daily_engagement.append(median_engagement)

    if len(daily_sizes) < 2:
        return {}

    total_posts = sum(daily_sizes)
    if total_posts < MIN_TREND_SIZE:
        print(f"  → skipping (too small: {total_posts} total posts)")
        return {}

    growth_rates = [
        (daily_sizes[i] - daily_sizes[i-1]) / max(daily_sizes[i-1], 1)
        for i in range(1, len(daily_sizes))
    ]

    median_eng = float(np.median(daily_engagement))

    metrics = {
        "daily_sizes": daily_sizes,
        "daily_engagement": daily_engagement,
        "growth_rate": float(np.mean(growth_rates)),
        "velocity": float(daily_sizes[-1] - daily_sizes[0]),
        "avg_engagement": median_eng,
        "days_tracked": len(daily_sizes),
    }

    status = calculate_status(growth_rates, daily_sizes)
    return {"metrics": metrics, "status": status}


async def run_scorer():
    all_trends = await trends.find({}).to_list(None)
    print(f"Scoring {len(all_trends)} trends...\n")

    for trend in all_trends:
        print(f"Trend {trend['_id']}")
        result = await score_trend(trend)
        if not result:
            print(f"  → skipped\n")
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
        print(f"  status:         {result['status']}")
        print(f"  days tracked:   {m['days_tracked']}")
        print(f"  growth rate:    {m['growth_rate']:.2f}")
        print(f"  velocity:       {m['velocity']:.0f}")
        print(f"  avg engagement: {m['avg_engagement']:.1f}")
        print()

    print("Done! All trends scored.")


asyncio.run(run_scorer())