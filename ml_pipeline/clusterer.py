import asyncio
import os
import numpy as np
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from supabase import create_client, Client
import hdbscan
import umap

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
posts = db["posts"]
topics = db["topics"]

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

SOFT_ASSIGN_THRESHOLD = 0.6  # noise post 被软分配进最近 cluster 的最低相似度


def fetch_embeddings_from_supabase(post_ids: list[str]) -> dict[str, list[float]]:
    result = supabase.table("embeddings").select("post_id, embedding").in_(
        "post_id", post_ids
    ).execute()
    embedding_map = {}
    for row in result.data:
        emb = row["embedding"]
        if isinstance(emb, str):
            emb = [float(x) for x in emb.strip("[]").split(",")]
        embedding_map[row["post_id"]] = emb
    return embedding_map


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


async def cluster_day(target_date: datetime) -> int:
    start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    cursor = posts.find({
        "created_at": {"$gte": start, "$lt": end},
        "embedded_at": {"$exists": True},
    })
    day_posts = await cursor.to_list(length=None)

    if len(day_posts) < 5:
        print(f"Not enough posts for {start.date()}, skipping.")
        return 0

    post_ids = [str(p["post_id"]) for p in day_posts]
    embedding_map = fetch_embeddings_from_supabase(post_ids)

    day_posts = [p for p in day_posts if str(p["post_id"]) in embedding_map]
    if len(day_posts) < 5:
        print(f"Not enough embeddings for {start.date()}, skipping.")
        return 0

    embeddings = np.array([embedding_map[str(p["post_id"])] for p in day_posts])

    # UMAP 降维：1536 → 20 维
    n_neighbors = min(15, len(day_posts) - 1)
    reducer = umap.UMAP(
        n_components=20,
        n_neighbors=n_neighbors,
        min_dist=0.1,
        metric="cosine",
        random_state=42,
    )
    reduced = reducer.fit_transform(embeddings)

    # HDBSCAN：min_cluster_size=8 控制 cluster 数量在 10-20 个
    # eom（默认）比 leaf 更倾向合并，不会太碎
    clusterer = hdbscan.HDBSCAN(
        min_cluster_size=8,
        min_samples=1,
        metric="euclidean",
        cluster_selection_method="leaf",
    )
    labels = clusterer.fit_predict(reduced)

    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    n_noise = int(np.sum(labels == -1))
    print(f"  HDBSCAN: {len(day_posts)} posts → {n_clusters} clusters, {n_noise} noise")

    # ── Step 1: 收集硬聚类结果 ──────────────────────────────────────────────
    hard_clusters: dict[int, list] = {}
    noise_posts: list[tuple] = []  # (post, embedding_vector)

    for label, post in zip(labels, day_posts):
        pid = str(post["post_id"])
        if label == -1:
            noise_posts.append((post, np.array(embedding_map[pid])))
        else:
            hard_clusters.setdefault(label, []).append(post)

    # ── Step 2: 用硬聚类成员计算 centroid（原始 1536 维，linker 要用）──────
    centroids: dict[int, np.ndarray] = {}
    for label, cluster_posts in hard_clusters.items():
        pids = [str(p["post_id"]) for p in cluster_posts]
        vecs = np.array([embedding_map[pid] for pid in pids])
        centroids[label] = vecs.mean(axis=0)

    # ── Step 3: 软分配 noise posts ─────────────────────────────────────────
    soft_assigned = 0
    truly_unclustered = 0

    for post, vec in noise_posts:
        if not centroids:
            truly_unclustered += 1
            continue

        sims = {label: cosine_sim(vec, centroid) for label, centroid in centroids.items()}
        best_label = max(sims, key=sims.__getitem__)
        best_sim = sims[best_label]

        if best_sim >= SOFT_ASSIGN_THRESHOLD:
            hard_clusters[best_label].append(post)
            soft_assigned += 1
        else:
            truly_unclustered += 1

    print(f"  soft-assigned: {soft_assigned}, truly unclustered: {truly_unclustered}")

    # ── Step 4: 写入 MongoDB ───────────────────────────────────────────────
    inserted = 0
    for label, cluster_posts in hard_clusters.items():
        cluster_post_ids = [str(p["post_id"]) for p in cluster_posts]

        topic_doc = {
            "date": start,
            "cluster_label": int(label),
            "post_ids": cluster_post_ids,
            "size": len(cluster_posts),
            "centroid": centroids[label].tolist(),  # centroid 只用硬聚类成员，保持准确
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

    print(f"{start.date()} → {inserted} clusters, {truly_unclustered} posts truly unclustered")

    # ── Step 5: 合并同天近似重复的 cluster（sim > 0.85）────────────────────
    if inserted > 1:
        day_topics = await topics.find({"date": start, "centroid": {"$exists": True}}).to_list(None)
        topic_vecs = [(t, np.array(t["centroid"])) for t in day_topics]
        to_delete: set[str] = set()
        merges = 0
        for i, (t1, c1) in enumerate(topic_vecs):
            if str(t1["_id"]) in to_delete:
                continue
            for j, (t2, c2) in enumerate(topic_vecs[i + 1:], i + 1):
                if str(t2["_id"]) in to_delete:
                    continue
                sim = cosine_sim(c1, c2)
                if sim >= 0.85:
                    keep, drop = (t1, t2) if t1["size"] >= t2["size"] else (t2, t1)
                    merged_ids = list(dict.fromkeys(keep.get("post_ids", []) + drop.get("post_ids", [])))
                    await posts.update_many(
                        {"post_id": {"$in": drop.get("post_ids", [])}},
                        {"$set": {"cluster_id": str(keep["_id"])}}
                    )
                    await topics.update_one(
                        {"_id": keep["_id"]},
                        {"$set": {"post_ids": merged_ids, "size": len(merged_ids)}}
                    )
                    await topics.delete_one({"_id": drop["_id"]})
                    to_delete.add(str(drop["_id"]))
                    merges += 1
                    print(f"  dedup: cluster {drop['cluster_label']} → {keep['cluster_label']} (sim={sim:.3f})")
        if merges:
            print(f"  → {merges} near-duplicate clusters merged")

    return inserted


async def run_clusterer(days: int = 16):
    now = datetime.now(timezone.utc)
    total_clusters = 0
    for i in range(days):
        target = now - timedelta(days=days - 1 - i)
        count = await cluster_day(target)
        total_clusters += count
    print(f"\nDone! Total clusters created: {total_clusters}")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=16)
    args = parser.parse_args()
    asyncio.run(run_clusterer(days=args.days))
