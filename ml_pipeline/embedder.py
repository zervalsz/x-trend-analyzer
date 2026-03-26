import asyncio
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
posts = db["posts"]

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

async def embed_texts(texts: list[str]) -> list[list[float]]:
    response = await openai_client.embeddings.create(
        model="text-embedding-3-small",
        input=texts
    )
    return [item.embedding for item in response.data]

async def run_embedder(batch_size: int = 50):
    # 只处理还没有 embedding 的 posts
    cursor = posts.find({"embedding": None})
    batch = []
    batch_ids = []
    total = 0

    async for post in cursor:
        batch.append(post["text"])
        batch_ids.append(post["_id"])

        if len(batch) >= batch_size:
            embeddings = await embed_texts(batch)
            for _id, embedding in zip(batch_ids, embeddings):
                await posts.update_one(
                    {"_id": _id},
                    {"$set": {"embedding": embedding, "embedded_at": datetime.now(timezone.utc)}}
                )
            total += len(batch)
            print(f"Embedded {total} posts so far...")
            batch = []
            batch_ids = []

    # 处理剩余不足一个 batch 的
    if batch:
        embeddings = await embed_texts(batch)
        for _id, embedding in zip(batch_ids, embeddings):
            await posts.update_one(
                {"_id": _id},
                {"$set": {"embedding": embedding, "embedded_at": datetime.now(timezone.utc)}}
            )
        total += len(batch)

    print(f"Done! Total embedded: {total} posts.")

asyncio.run(run_embedder())