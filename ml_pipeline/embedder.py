"""
embedder.py
-----------
从 MongoDB 读取未 embedded 的 posts, 调用 OpenAI text-embedding-3-small 生成向量，
存入 Supabase pgvector(embeddings 表），并在 MongoDB post 文档上标记 embedded_at。
"""

import os
import asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
from openai import AsyncOpenAI
from motor.motor_asyncio import AsyncIOMotorClient
from supabase import create_client, Client
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml_pipeline.noise_filter import keyword_filter

load_dotenv()

# ---------- 客户端初始化 ----------
openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DB_NAME", "trendhunter")]
posts_col = db["posts"]

supabase: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 50


async def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    response = await openai_client.embeddings.create(
        input=texts,
        model=EMBEDDING_MODEL,
    )
    return [item.embedding for item in response.data]


async def upsert_to_supabase(rows: list[dict]):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: supabase.table("embeddings").upsert(rows, on_conflict="post_id").execute()
    )


async def process_batch(docs: list[dict]):
    texts = [doc["text"] for doc in docs]
    post_ids = [doc["post_id"] for doc in docs]

    embeddings = await get_embeddings_batch(texts)

    rows = [
        {"post_id": post_id, "embedding": embedding}
        for post_id, embedding in zip(post_ids, embeddings)
    ]
    await upsert_to_supabase(rows)

    now = datetime.now(timezone.utc)
    for post_id in post_ids:
        await posts_col.update_one(
            {"post_id": post_id},
            {
                "$set": {"embedded_at": now},
                "$unset": {"embedding": ""},
            },
        )


async def run():
    query = {"embedded_at": {"$exists": False}}
    total = await posts_col.count_documents(query)
    print(f"[embedder] 待处理 posts: {total} 条")

    if total == 0:
        print("[embedder] 没有需要处理的 posts，退出。")
        return

    # 收集所有待处理 docs
    cursor = posts_col.find(query, {"post_id": 1, "text": 1})
    all_docs = []
    async for doc in cursor:
        all_docs.append(doc)

    # Layer 1 noise filter（在 embed 之前，省 token）
    from ml_pipeline.noise_filter import keyword_filter
    filtered_docs, stats = keyword_filter(all_docs, text_field="text")
    print(f"[embedder] noise filter: {stats['total']} -> {stats['kept']} 条 "
          f"(黑名单 -{stats['rejected_blacklist']}, 无AI关键词 -{stats['rejected_no_whitelist']})")

    if len(filtered_docs) == 0:
        print("[embedder] 过滤后没有 AI 相关 posts，退出。")
        return

    total = len(filtered_docs)
    processed = 0
    batch_docs = []

    for doc in filtered_docs:
        batch_docs.append(doc)
        if len(batch_docs) >= BATCH_SIZE:
            await process_batch(batch_docs)
            processed += len(batch_docs)
            print(f"[embedder] 进度: {processed}/{total}")
            batch_docs = []

    if batch_docs:
        await process_batch(batch_docs)
        processed += len(batch_docs)

    print(f"[embedder] 完成，共处理 {processed} 条 posts。")


if __name__ == "__main__":
    asyncio.run(run())

if __name__ == "__main__":
    # 临时测试 noise filter
    from ml_pipeline.noise_filter import keyword_filter
    test_posts = [
        {"post_id": "1", "text": "GPT-4 just released new features for AI agents"},
        {"post_id": "2", "text": "Political scandal rocks the government corruption case"},
        {"post_id": "3", "text": "New LLM benchmark shows impressive machine learning results"},
        {"post_id": "4", "text": "Celebrity drama and Hollywood gossip today"},
        {"post_id": "5", "text": "AI safety research from Anthropic on alignment"},
    ]
    kept, stats = keyword_filter(test_posts)
    print(stats)
    for p in kept:
        print("✅", p["text"])