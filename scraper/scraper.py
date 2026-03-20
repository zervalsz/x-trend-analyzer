import asyncio
from datetime import datetime, timezone
import os
from dotenv import load_dotenv

import twscrape
from twscrape import API
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

AI_QUERIES = [
    "AI agent lang:en min_faves:20",
    "LLM fine-tuning lang:en min_faves:20",
    "RAG embeddings lang:en min_faves:20",
    "AI coding tool lang:en min_faves:20",
]

class XScraper:
    def __init__(self):
        self.api = API()
        self.client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
        self.db = self.client[os.getenv("DB_NAME")]
        self.posts = self.db["posts"]

    async def setup_indexes(self):
        await self.posts.create_index("post_id", unique=True)
        await self.posts.create_index("created_at")

    def _normalize(self, tweet) -> dict:
        return {
            "post_id": str(tweet.id),
            "text": tweet.rawContent,
            "author": tweet.user.username,
            "author_followers": tweet.user.followersCount,
            "likes": tweet.likeCount,
            "retweets": tweet.retweetCount,
            "replies": tweet.replyCount,
            "views": tweet.viewCount or 0,
            "created_at": tweet.date,
            "scraped_at": datetime.now(timezone.utc),
            "lang": tweet.lang,
            "cluster_id": None,
            "trend_id": None,
        }

    async def scrape_query(self, query: str, limit: int = 100) -> int:
        inserted = 0
        async for tweet in self.api.search(query, limit=limit):
            doc = self._normalize(tweet)
            try:
                await self.posts.insert_one(doc)
                inserted += 1
            except Exception:
                pass
        return inserted

    async def run_full_scrape(self, limit_per_query: int = 200) -> dict:
        results = {}
        for query in AI_QUERIES:
            count = await self.scrape_query(query, limit=limit_per_query)
            results[query] = count
            await asyncio.sleep(10)
        return results