# reset_clusters.py
import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client[os.getenv("DB_NAME", "trendhunter")]

async def main():
    # 1. 清空 topics
    result1 = await db["topics"].delete_many({})
    print(f"Deleted {result1.deleted_count} topics")

    # 2. 清除 posts 里的 cluster_id
    result2 = await db["posts"].update_many(
        {"cluster_id": {"$exists": True}},
        {"$unset": {"cluster_id": ""}}
    )
    print(f"Cleared cluster_id from {result2.modified_count} posts")

asyncio.run(main())