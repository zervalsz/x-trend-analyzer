"""
migrate_embeddings.py
---------------------
一次性迁移脚本：把 MongoDB posts 里已有的 embedding 字段
迁移到 Supabase pgvector，然后清掉 MongoDB 里的 embedding 字段。
"""

import os
import asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from supabase import create_client, Client

load_dotenv()

mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DB_NAME", "trendhunter")]
posts_col = db["posts"]

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

BATCH_SIZE = 50


async def migrate_batch(docs: list[dict]):
    rows = [
        {"post_id": doc["post_id"], "embedding": doc["embedding"]}
        for doc in docs
        if doc.get("embedding") and doc.get("post_id")
    ]
    if not rows:
        return

    supabase.table("embeddings").upsert(rows, on_conflict="post_id").execute()

    now = datetime.now(timezone.utc)
    post_ids = [doc["post_id"] for doc in docs]
    await posts_col.update_many(
        {"post_id": {"$in": post_ids}},
        {
            "$set": {"embedded_at": now},
            "$unset": {"embedding": ""},
        },
    )


async def run():
    query = {
        "embedding": {"$exists": True},
        "embedded_at": {"$exists": False},
    }
    total = await posts_col.count_documents(query)
    print(f"[migrate] 找到 {total} 条需要迁移的 posts")

    if total == 0:
        print("[migrate] 没有需要迁移的数据，退出。")
        return

    processed = 0
    cursor = posts_col.find(query, {"post_id": 1, "embedding": 1})

    batch = []
    async for doc in cursor:
        batch.append(doc)
        if len(batch) >= BATCH_SIZE:
            await migrate_batch(batch)
            processed += len(batch)
            print(f"[migrate] 进度: {processed}/{total}")
            batch = []

    if batch:
        await migrate_batch(batch)
        processed += len(batch)

    print(f"[migrate] 迁移完成，共处理 {processed} 条。")


if __name__ == "__main__":
    asyncio.run(run())