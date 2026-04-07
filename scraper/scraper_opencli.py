"""
scraper_opencli.py
------------------
基于 OpenCLI 的 X 抓取器，替代 twscrape 版本。
需要本地运行（电脑开着 + Chrome 登录 x.com + OpenCLI 已安装）。

安装 OpenCLI：
    npm install -g @jackwener/opencli
    # 然后安装 Chrome 扩展，见 https://github.com/jackwener/opencli
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
    "AI agent",
    "LLM fine-tuning",
    "RAG embeddings",
    "AI coding tool",
]

LIMIT_PER_QUERY = 20  # opencli 每次抓多少条，可调


def run_opencli(query: str, limit: int) -> list[dict]:
    cmd = [
        "opencli", "twitter", "search",
        "--query", query,
        "--limit", str(limit),
        "-f", "json",
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode != 0:
            print(f"[scraper] opencli 错误: {result.stderr}")
            return []

        data = json.loads(result.stdout)
        
        # 打印第一条原始数据，用于确认字段结构
        if isinstance(data, list) and len(data) > 0:
            print(f"[scraper] 原始数据样本:\n{json.dumps(data[0], indent=2, ensure_ascii=False)}")
        elif isinstance(data, dict) and "data" in data and len(data["data"]) > 0:
            print(f"[scraper] 原始数据样本:\n{json.dumps(data['data'][0], indent=2, ensure_ascii=False)}")

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
        print(f"[scraper] 原始输出: {result.stdout[:500]}")  # 打印前500字符帮助debug
        return []


def normalize(raw: dict) -> dict | None:
    """
    把 opencli 返回的 tweet 格式标准化为 MongoDB 存储格式。
    opencli 字段名可能是 id/text/author/metrics 等，做个适配。
    """
    try:
        # opencli twitter-cli 的字段结构
        metrics = raw.get("metrics", raw.get("public_metrics", {}))
        author = raw.get("author", raw.get("user", {}))

        return {
            "post_id": str(raw.get("id", raw.get("post_id", ""))),
            "text": raw.get("text", raw.get("content", "")),
            "author": author.get("username", "") if isinstance(author, dict) else str(author),
            "author_followers": author.get("followers_count", 0) if isinstance(author, dict) else 0,
            "likes": metrics.get("like_count", metrics.get("likes", 0)),
            "retweets": metrics.get("retweet_count", metrics.get("retweets", 0)),
            "replies": metrics.get("reply_count", metrics.get("replies", 0)),
            "views": metrics.get("impression_count", metrics.get("views", 0)),
            "created_at": _parse_date(raw.get("created_at")),
            "scraped_at": datetime.now(timezone.utc),
            "lang": raw.get("lang", "en"),
            "cluster_id": None,
            "trend_id": None,
        }
    except Exception as e:
        print(f"[scraper] normalize 失败: {e}, raw={raw}")
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


async def scrape_query(query: str, limit: int = LIMIT_PER_QUERY) -> int:
    """抓一个 query，存入 MongoDB，返回新增条数。"""
    raw_tweets = run_opencli(query, limit)
    inserted = 0
    for raw in raw_tweets:
        doc = normalize(raw)
        if not doc or not doc["post_id"]:
            continue
        try:
            await posts_col.insert_one(doc)
            inserted += 1
        except Exception:
            pass  # 重复 post_id 直接跳过
    return inserted


async def run_full_scrape(limit_per_query: int = LIMIT_PER_QUERY) -> dict:
    """跑所有 queries，返回每个 query 的抓取数量。"""
    # 确保索引存在
    await posts_col.create_index("post_id", unique=True)
    await posts_col.create_index("created_at")

    results = {}
    for query in AI_QUERIES:
        count = await scrape_query(query, limit=limit_per_query)
        results[query] = count
        print(f"[scraper] '{query}' → {count} 条新 posts")
        await asyncio.sleep(5)  # 每个 query 之间稍微等一下，避免触发限流

    total = sum(results.values())
    print(f"[scraper] 本次共抓取 {total} 条新 posts")
    return results


if __name__ == "__main__":
    asyncio.run(run_full_scrape())