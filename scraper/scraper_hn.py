"""
scraper_hn.py
-------------
Fetch AI-related stories from Hacker News via the Algolia search API.
No auth required. Stores into the same posts collection as the X scraper.
"""

import asyncio
import os
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DB_NAME", "trendhunter")]
posts_col = db["posts"]

HN_API = "https://hn.algolia.com/api/v1/search"
HITS_PER_QUERY = 50

HN_QUERIES = [
    "artificial intelligence",
    "large language model",
    "ChatGPT",
    "Claude AI",
    "Gemini AI",
    "GPT-4",
    "Llama",
    "Mistral AI",
    "DeepSeek",
    "AI agent",
    "machine learning",
    "open source AI",
    "AI safety",
    "AI alignment",
    "foundation model",
    "AI startup",
    "AI coding",
    "MCP server",
]


def normalize_hn(hit: dict) -> dict | None:
    try:
        story_id = str(hit.get("objectID", ""))
        title = hit.get("title", "").strip()
        url = hit.get("url", "")
        author = hit.get("author", "")
        points = int(hit.get("points") or 0)
        num_comments = int(hit.get("num_comments") or 0)
        created_at_str = hit.get("created_at", "")

        if not story_id or not title:
            return None

        # Combine title + URL as the "text" so the embedder captures both
        text = title
        if url:
            text = f"{title} [{url}]"

        try:
            created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        except Exception:
            created_at = datetime.now(timezone.utc)

        return {
            "post_id": f"hn_{story_id}",
            "text": text,
            "author": author,
            "post_url": f"https://news.ycombinator.com/item?id={story_id}",
            "source": "hn",
            "author_followers": 0,
            "likes": points,
            "retweets": 0,
            "replies": num_comments,
            "views": 0,
            "created_at": created_at,
            "scraped_at": datetime.now(timezone.utc),
            "lang": "en",
            "cluster_id": None,
            "trend_id": None,
        }
    except Exception as e:
        print(f"[hn] normalize failed: {e}")
        return None


async def fetch_hn_query(client: httpx.AsyncClient, query: str) -> list[dict]:
    try:
        r = await client.get(
            HN_API,
            params={
                "query": query,
                "tags": "story",
                "hitsPerPage": HITS_PER_QUERY,
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.json().get("hits", [])
    except Exception as e:
        print(f"[hn] fetch failed for '{query}': {e}")
        return []


async def run_hn_scrape():
    await posts_col.create_index("post_id", unique=True)

    total = 0
    async with httpx.AsyncClient() as client:
        for query in HN_QUERIES:
            hits = await fetch_hn_query(client, query)
            inserted = 0
            for hit in hits:
                doc = normalize_hn(hit)
                if not doc:
                    continue
                try:
                    await posts_col.insert_one(doc)
                    inserted += 1
                except Exception:
                    pass  # duplicate
            print(f"[hn] '{query}' → {inserted} new posts")
            total += inserted
            await asyncio.sleep(1)

    print(f"\n[hn] total new posts: {total}")


if __name__ == "__main__":
    asyncio.run(run_hn_scrape())
