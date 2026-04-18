# reset_summaries.py
import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client[os.getenv("DB_NAME", "trendhunter")]

async def main():
    result1 = await db["topics"].update_many(
        {},
        {"$set": {"keywords": [], "summary": "", }, "$unset": {"summarized_at": ""}}
    )
    print(f"Reset {result1.modified_count} topics")

    result2 = await db["trends"].update_many(
        {},
        {"$set": {"keywords": [], "summary": ""}, "$unset": {"summarized_at": ""}}
    )
    print(f"Reset {result2.modified_count} trends")

asyncio.run(main())