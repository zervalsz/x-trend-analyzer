import asyncio
import os
import numpy as np
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from supabase import create_client, Client
import hdbscan

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
posts = db["posts"]
topics = db["topics"]

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)


def fetch_embeddings_from_supabase(post_ids: list[str]) -> dict[str, list[float]]:
    result = supabase.table("embeddings").select("post_id, embedding").in_(
        "post_id", post_ids
    ).execute()
    embedding_map = {}
    for row in result.data:
        emb = row["embedding"]
        # Supabase 可能返回字符串，需要转成 float list
        if isinstance(emb, str):
            emb = [float(x) for x in emb.strip("[]").split(",")]
        embedding_map[row["post_id"]] = emb
    return embedding_map

async def cluster_day(target_date: datetime) -> int:
    start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    # 从 MongoDB 拿当天的 posts（有 embedded_at 的才处理）
    cursor = posts.find({
        "created_at": {"$gte": start, "$lt": end},
        "embedded_at": {"$exists": True},
    })
    day_posts = await cursor.to_list(length=None)

    if len(day_posts) < 5:
        print(f"Not enough posts for {start.date()}, skipping.")
        return 0

    # 从 Supabase 拉 embeddings
    post_ids = [str(p["post_id"]) for p in day_posts]
    embedding_map = fetch_embeddings_from_supabase(post_ids)

    # 过滤掉没有 embedding 的 posts
    day_posts = [p for p in day_posts if str(p["post_id"]) in embedding_map]
    if len(day_posts) < 5:
        print(f"Not enough embeddings for {start.date()}, skipping.")
        return 0


    embeddings = np.array([embedding_map[str(p["post_id"])] for p in day_posts])

    # 确保是 2D 数组
    if embeddings.ndim == 1:
        embeddings = embeddings.reshape(1, -1)

    # HDBSCAN 聚类
    clusterer = hdbscan.HDBSCAN(min_cluster_size=3, metric="euclidean")
    labels = clusterer.fit_predict(embeddings)

    # 整理成 topic clusters
    clusters = {}
    for label, post in zip(labels, day_posts):
        if label == -1:
            continue
        if label not in clusters:
            clusters[label] = []
        clusters[label].append(post)

    inserted = 0
    for label, cluster_posts in clusters.items():
        cluster_post_ids = [str(p["post_id"]) for p in cluster_posts]
        embeddings_in_cluster = np.array([embedding_map[pid] for pid in cluster_post_ids])
        centroid = embeddings_in_cluster.mean(axis=0).tolist()

        topic_doc = {
            "date": start,
            "cluster_label": int(label),
            "post_ids": cluster_post_ids,
            "size": len(cluster_posts),
            "centroid": centroid,
            "keywords": [],
            "summary": "",
            "created_at": datetime.now(timezone.utc),
        }

        result = await topics.insert_one(topic_doc)

        await posts.update_many(
            {"post_id": {"$in": cluster_post_ids}},
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