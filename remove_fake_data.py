import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

async def remove_fake_data():
    client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
    db = client[os.getenv("DB_NAME")]
    posts = db["posts"]

    result = await posts.delete_many({"is_fake": True})
    print(f"Removed {result.deleted_count} fake posts.")
    client.close()

asyncio.run(remove_fake_data())