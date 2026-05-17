"""
scraper_opencli.py
------------------
用泛 query 广撒网，让聚类算法自己发现 AI 相关话题。
需要本地运行（Chrome 登录 x.com + OpenCLI 已安装）。
"""

import os
import json
import asyncio
import subprocess
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DB_NAME", "trendhunter")]
posts_col = db["posts"]

AI_QUERIES = [
    # 泛 AI
    "AI",
    "LLM",
    "artificial intelligence",
    "machine learning",
    "deep learning",
    "neural network",

    # 主流模型/产品
    "ChatGPT",
    "Claude",
    "Gemini",
    "GPT-4o",
    "GPT-5",
    "Llama",
    "Mistral",
    "DeepSeek",
    "Grok AI",

    # 热门话题
    "AI agent",
    "vibe coding",
    "MCP server",
    "AI coding",
    "open source AI",
    "AI tools",
    "AI automation",
    "AI safety",
    "AI alignment",

    # 细分方向
    "prompt engineering",
    "RAG AI",
    "multimodal AI",
    "AI image generation",
    "text to video AI",
    "AI startup",
    "foundation model",
    "reinforcement learning",
    "AI chip",
    # "AI infrastructure",
]
LIMIT_PER_QUERY = 50


def run_opencli(query: str, limit: int) -> list[dict]:
    cmd = ["opencli", "twitter", "search", query, "--limit", str(limit), "-f", "json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            print(f"[scraper] 错误: {result.stderr[:200]}")
            return []
        data = json.loads(result.stdout)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "data" in data:
            return data["data"]
        return []
    except subprocess.TimeoutExpired:
        print(f"[scraper] 超时: query={query}")
        return []
    except json.JSONDecodeError as e:
        print(f"[scraper] JSON parse 失败: {e}")
        return []


def normalize(raw: dict) -> dict | None:
    try:
        post_id = str(raw.get("id", ""))
        author = raw.get("author", "")
        return {
            "post_id": post_id,
            "text": raw.get("text", ""),
            "author": author,
            "post_url": f"https://x.com/{author}/status/{post_id}" if author and post_id else None,
            "source": "x",
            "author_followers": 0,
            "likes": int(raw.get("likes", 0) or 0),
            "retweets": 0,
            "replies": 0,
            "views": int(raw.get("views", 0) or 0),
            "created_at": _parse_date(raw.get("created_at")),
            "scraped_at": datetime.now(timezone.utc),
            "lang": raw.get("lang", "en"),
            "cluster_id": None,
            "trend_id": None,
        }
    except Exception as e:
        print(f"[scraper] normalize 失败: {e}")
        return None


def _parse_date(value) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return datetime.now(timezone.utc)


async def run_full_scrape():
    await posts_col.create_index("post_id", unique=True)
    await posts_col.create_index("created_at")

    total = 0
    for query in AI_QUERIES:
        raw_list = run_opencli(query, LIMIT_PER_QUERY)
        inserted = 0
        for raw in raw_list:
            doc = normalize(raw)
            if not doc or not doc["post_id"]:
                continue
            try:
                await posts_col.insert_one(doc)
                inserted += 1
            except Exception:
                pass
        print(f"[scraper] '{query}' → {inserted} 条新 posts")
        total += inserted
        await asyncio.sleep(5)

    print(f"\n[scraper] 本次共抓取 {total} 条新 posts")


if __name__ == "__main__":
    asyncio.run(run_full_scrape())