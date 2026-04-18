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
from datetime import datetime, timezone
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from openai import AsyncOpenAI
from bson import ObjectId

load_dotenv()

client_mongo = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = client_mongo[os.getenv("DB_NAME")]
topics = db["topics"]
trends = db["trends"]
posts = db["posts"]

openai_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def summarize_topic(topic: dict) -> dict:
    """给一个 topic cluster 生成 keywords 和 summary。"""
    post_ids = topic.get("post_ids", [])
    if not post_ids:
        return {"keywords": [], "summary": ""}

    post_list = await posts.find(
        {"post_id": {"$in": post_ids}}
    ).to_list(None)

    if not post_list:
        return {"keywords": [], "summary": ""}

    texts = [p["text"] for p in post_list[:15]]
    combined = "\n---\n".join(texts)

    prompt = f"""You are analyzing a cluster of posts from X (Twitter) for an AI trend tracking system.

    Here are the posts in this cluster:
    ---
    {combined}
    ---

    Your job is to identify the AI/technology angle of this cluster.
    If the posts are primarily about politics, entertainment, or non-tech topics with no clear AI relevance, return:
    {{"keywords": [], "summary": ""}}

    Otherwise provide:
    1. keywords: 3-5 short keywords focused on the AI/tech topic (e.g. ["AI agents", "LLM", "automation"])
    2. summary: 1-2 sentence summary focused on the AI/tech discussion only

    Respond ONLY with a JSON object:
    {{"keywords": ["keyword1", "keyword2"], "summary": "Summary here."}}"""

    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
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


async def run_summarizer():
    """为所有没有 summary 的 topics 生成摘要。"""
    query = {"$or": [{"summary": ""}, {"summary": {"$exists": False}}]}
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

    print(f"\n[summarizer] topics 完成，共处理 {processed} 个。")


async def run_trend_summarizer():
    """为所有 trends 汇总生成 keywords 和 summary。"""
    query = {"$or": [{"summary": ""}, {"summary": {"$exists": False}}]}
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

        all_keywords = []
        all_summaries = []
        for t in topic_list:
            # 只用有内容的 topics
            if t.get("keywords") and t.get("summary"):
                all_keywords.extend(t.get("keywords", []))
                all_summaries.append(t["summary"])

        if not all_summaries:
            continue

        prompt = f"""You are summarizing an AI trend tracked over multiple days.

Daily topic summaries:
{chr(10).join(f'- {s}' for s in all_summaries)}

All keywords from daily topics: {list(set(all_keywords))}

Generate:
1. keywords: 3-5 keywords that best represent this overall trend
2. summary: 1-2 sentence summary of this trend's overall theme and trajectory

Respond ONLY with JSON:
{{"keywords": ["kw1", "kw2", "kw3"], "summary": "Summary here."}}"""

        try:
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.3,
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
                    "summarized_at": datetime.now(timezone.utc),
                }}
            )
            processed += 1
            print(f"[summarizer] trend {processed}/{total} — {result.get('keywords', [])}")

        except Exception as e:
            print(f"[summarizer] trend 处理失败: {e}")

    print(f"[summarizer] trends 完成，共处理 {processed} 个。")


if __name__ == "__main__":
    async def main():
        await run_summarizer()
        await run_trend_summarizer()

    asyncio.run(main())