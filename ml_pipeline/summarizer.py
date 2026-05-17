"""
summarizer.py
-------------
为每个 topic cluster 生成 keywords 和 summary，写回 MongoDB topics collection。
然后汇总生成 trend 级别的 keywords 和 summary。
运行顺序：embedder.py → clusterer.py → summarizer.py → linker.py → scorer.py
"""

import asyncio
import os
import json
import numpy as np
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI
from supabase import create_client, Client
from bson import ObjectId

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
topics = db["topics"]
trends = db["trends"]
posts = db["posts"]

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
supabase: Client = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_KEY"))


# ── Embedding 工具 ─────────────────────────────────────────────────────────────

def _fetch_embeddings_sync(post_ids: list[str]) -> dict[str, np.ndarray]:
    result = supabase.table("embeddings").select("post_id, embedding").in_(
        "post_id", post_ids
    ).execute()
    out = {}
    for row in result.data:
        emb = row["embedding"]
        if isinstance(emb, str):
            emb = [float(x) for x in emb.strip("[]").split(",")]
        out[row["post_id"]] = np.array(emb, dtype=np.float32)
    return out


async def fetch_embeddings(post_ids: list[str]) -> dict[str, np.ndarray]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_embeddings_sync, post_ids)


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-10))


# ── Post 选取策略 ──────────────────────────────────────────────────────────────

def select_representative_posts(
    post_list: list[dict],
    centroid: list[float],
    embedding_map: dict[str, np.ndarray],
) -> list[dict]:
    """
    三个维度各取最优，合并去重：
    - top 5 by cosine similarity to centroid  → 最能代表 cluster 核心语义
    - top 5 by engagement (likes + rt*2 + replies) → 最有讨论热度
    - top 3 by recency                         → 最新动态
    """
    centroid_vec = np.array(centroid, dtype=np.float32)

    for post in post_list:
        pid = str(post["post_id"])
        emb = embedding_map.get(pid)
        post["_sim"] = cosine_sim(emb, centroid_vec) if emb is not None else 0.0
        post["_eng"] = (
            (post.get("likes") or 0)
            + (post.get("retweets") or 0) * 2
            + (post.get("replies") or 0)
        )

    by_sim = sorted(post_list, key=lambda p: p["_sim"], reverse=True)[:5]
    by_eng = sorted(post_list, key=lambda p: p["_eng"], reverse=True)[:5]
    by_rec = sorted(
        post_list,
        key=lambda p: p.get("created_at") or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )[:3]

    seen, selected = set(), []
    for p in by_sim + by_eng + by_rec:
        pid = str(p["post_id"])
        if pid not in seen:
            seen.add(pid)
            selected.append(p)

    return selected


# ── Topic summarizer ──────────────────────────────────────────────────────────

TOPIC_PROMPT = """\
You are a news editor. A cluster of X (Twitter) posts all discuss the same specific event, release, or development.
Write a precise news headline — like a journalist who knows exactly what happened.

Posts (ordered by relevance and engagement):
---
{posts}
---

RULES:
1. The headline must name the SPECIFIC thing: which model, which company, which person, what they did.
   GOOD: "OpenAI released GPT-5.5 with improved reasoning and coding"
   GOOD: "Anthropic launched Claude Code, a terminal-based AI coding CLI"
   GOOD: "xAI added web search and skill plugins to Grok"
   BAD:  "OpenAI announces new model" (which model? what does it do?)
   BAD:  "AI tools are improving" (not a headline)
2. Keywords: 2-3 proper nouns only — exact product names, company names, or people's names.
   Never use generic terms like "AI tools", "machine learning", "automation".
3. If posts are clearly off-topic (pure politics, celebrity gossip, spam) with no tech angle:
   return {{"keywords": [], "summary": ""}}

Respond ONLY with JSON:
{{"keywords": ["ExactName1", "ExactName2"], "summary": "Specific news headline in 10-15 words."}}"""


async def summarize_topic(topic: dict) -> dict:
    post_ids = topic.get("post_ids", [])
    centroid = topic.get("centroid")
    if not post_ids or not centroid:
        return {"keywords": [], "summary": ""}

    post_list = await posts.find({"post_id": {"$in": post_ids}}).to_list(None)
    if not post_list:
        return {"keywords": [], "summary": ""}

    # 拉 embeddings，选最有代表性的 posts
    embedding_map = await fetch_embeddings([str(p["post_id"]) for p in post_list])
    selected = select_representative_posts(post_list, centroid, embedding_map)

    combined = "\n---\n".join(p["text"] for p in selected)
    prompt = TOPIC_PROMPT.format(posts=combined)

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=200,
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        return {
            "keywords": result.get("keywords", []),
            "summary": result.get("summary", ""),
        }
    except Exception as e:
        print(f"[summarizer] GPT 调用失败: {e}")
        return {"keywords": [], "summary": ""}


# ── Trend summarizer ──────────────────────────────────────────────────────────

TREND_PROMPT = """\
You are summarizing a multi-day discussion on X (Twitter) that started from a specific event.

Daily headlines in chronological order (earliest first):
{summaries}

RULES:
1. summary: One precise headline (10-15 words) anchored to the FIRST headline — the original event. Name the specific product/company/person.
   GOOD: "OpenAI released GPT-5.5, sparking debate over benchmark claims."
   BAD:  "OpenAI continues to advance AI capabilities."
2. description: 3-5 sentences for someone reading this trend for the first time.
   - Sentence 1: What originally happened (slightly more detail than the headline).
   - Sentences 2-3: How the discussion evolved over the following days.
   - Sentence 4 (optional): Notable community reaction, key implication, or broader context.
   Always name specific products/companies/people. Never write generic descriptions.
   GOOD: "Anthropic released Claude Code, a terminal-based AI coding CLI for developers. In the days following the launch, developers began sharing benchmarks and workflows, frequently comparing it against Cursor. Discussions later expanded to enterprise pricing and integration with CI/CD pipelines."
   BAD:  "There has been sustained discussion about AI coding tools and their growing capabilities."
3. keywords: 2-4 proper nouns only — the names that define this trend across all days.

Respond ONLY with JSON:
{{"keywords": ["Term1", "Term2"], "summary": "Short headline 10-15 words.", "description": "3-5 sentences of detailed context."}}"""


async def run_summarizer(force: bool = False):
    query = {} if force else {"$or": [{"summary": ""}, {"summary": {"$exists": False}}]}
    total = await topics.count_documents(query)
    print(f"[summarizer] 待处理 topics: {total} 个")

    if total == 0:
        print("[summarizer] 没有需要处理的 topics，跳过。")
        return

    cursor = topics.find(query)
    processed = 0
    async for topic in cursor:
        result = await summarize_topic(topic)
        await topics.update_one(
            {"_id": topic["_id"]},
            {"$set": {
                "keywords": result["keywords"],
                "summary": result["summary"],
                "summarized_at": datetime.now(timezone.utc),
            }}
        )
        processed += 1
        print(f"[summarizer] {processed}/{total} — {result['keywords']}")
        await asyncio.sleep(1.5)

    print(f"\n[summarizer] topics 完成，共处理 {processed} 个。")


async def run_trend_summarizer(force: bool = False):
    query = {} if force else {"$or": [{"summary": ""}, {"summary": {"$exists": False}}]}
    total = await trends.count_documents(query)
    print(f"\n[summarizer] 待处理 trends: {total} 个")

    if total == 0:
        print("[summarizer] 没有需要处理的 trends，跳过。")
        return

    cursor = trends.find(query)
    processed = 0
    async for trend in cursor:
        topic_ids = trend.get("topic_ids", [])
        if not topic_ids:
            continue

        topic_list = await topics.find(
            {"_id": {"$in": [ObjectId(tid) for tid in topic_ids]}}
        ).to_list(None)

        # 按日期排序，只用有内容的
        valid = sorted(
            [t for t in topic_list if t.get("keywords") and t.get("summary")],
            key=lambda t: t.get("date") or datetime.min.replace(tzinfo=timezone.utc),
        )
        if not valid:
            continue

        summaries = "\n".join(f"- {t['summary']}" for t in valid)
        prompt = TREND_PROMPT.format(summaries=summaries)

        try:
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=200,
            )
            content = response.choices[0].message.content.strip()
            content = content.replace("```json", "").replace("```", "").strip()
            result = json.loads(content)

            await trends.update_one(
                {"_id": trend["_id"]},
                {"$set": {
                    "keywords": result.get("keywords", []),
                    "summary": result.get("summary", ""),
                    "description": result.get("description", ""),
                    "summarized_at": datetime.now(timezone.utc),
                }}
            )
            processed += 1
            print(f"[summarizer] trend {processed}/{total} — {result.get('keywords', [])}")

        except Exception as e:
            print(f"[summarizer] trend 处理失败: {e}")

    print(f"[summarizer] trends 完成，共处理 {processed} 个。")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true", help="Re-summarize all, not just empty ones")
    args = parser.parse_args()

    async def main():
        await run_summarizer(force=args.force)
        await run_trend_summarizer(force=args.force)

    asyncio.run(main())
