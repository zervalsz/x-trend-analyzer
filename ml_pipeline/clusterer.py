import asyncio
import os
import numpy as np
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import hdbscan

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
posts = db["posts"]
topics = db["topics"]

async def cluster_day(target_date: datetime) -> int:
    # 取当天的所有已 embedded posts
    start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    cursor = posts.find({
        "created_at": {"$gte": start, "$lt": end},
        "embedding": {"$ne": None}
    })

    day_posts = await cursor.to_list(length=None)
    if len(day_posts) < 5:
        print(f"Not enough posts for {start.date()}, skipping.")
        return 0

    # 提取 embeddings 和 post_ids
    embeddings = np.array([p["embedding"] for p in day_posts])
    post_ids = [str(p["_id"]) for p in day_posts]

    # HDBSCAN 聚类
    clusterer = hdbscan.HDBSCAN(min_cluster_size=3, metric="euclidean")
    labels = clusterer.fit_predict(embeddings)

    # 把结果整理成 topic clusters
    clusters = {}
    for label, post_id, post in zip(labels, post_ids, day_posts):
        if label == -1:
            continue  # -1 是噪声点，跳过
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(post)

    # 每个 cluster 存成一个 topic
    inserted = 0
    for label, cluster_posts in clusters.items():
        post_ids_in_cluster = [str(p["_id"]) for p in cluster_posts]
        embeddings_in_cluster = np.array([p["embedding"] for p in cluster_posts])
        centroid = embeddings_in_cluster.mean(axis=0).tolist()

        topic_doc = {
            "date": start,
            "cluster_label": int(label),
            "post_ids": post_ids_in_cluster,
            "size": len(cluster_posts),
            "centroid": centroid,
            "keywords": [],     # 后面 LLM 来填
            "summary": "",      # 后面 LLM 来填
            "created_at": datetime.now(timezone.utc),
        }

        result = await topics.insert_one(topic_doc)

        # 更新 posts 的 cluster_id
        await posts.update_many(
            {"_id": {"$in": [p["_id"] for p in cluster_posts]}},
            {"$set": {"cluster_id": str(result.inserted_id)}}
        )
        inserted += 1

    print(f"{start.date()} → {inserted} clusters found from {len(day_posts)} posts")
    return inserted

async def run_clusterer(days: int = 7):
    now = datetime.now(timezone.utc)
    total_clusters = 0
    for i in range(days):
        target = now - timedelta(days=days - 1 - i)
        count = await cluster_day(target)
        total_clusters += count
    print(f"\nDone! Total clusters created: {total_clusters}")

asyncio.run(run_clusterer())