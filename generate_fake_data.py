import asyncio
from datetime import datetime, timezone, timedelta
import random
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os

load_dotenv()

# 模拟几个AI话题方向，每个话题下有相关的post内容
FAKE_TOPICS = {
    "AI agents": [
        "AI agents are taking over software development. The future is agentic.",
        "Just built my first autonomous AI agent using LangChain. Mind blown.",
        "AI agents can now browse the web, write code, and deploy — all without human input.",
        "The agentic AI era is here. Traditional SaaS is dead.",
        "Multi-agent systems are the next big thing in AI. Excited to explore this.",
        "OpenAI's new agent framework is insane. Tried it today and it replaced 3 hours of work.",
        "AI agents + tools = the new operating system for knowledge work.",
        "Everyone is building AI agents but nobody talks about how to evaluate them.",
        "Autonomous agents are going to change how we think about software architecture.",
        "The best AI agent I've used so far is still Claude with computer use.",
    ],
    "LLM fine-tuning": [
        "Fine-tuning LLMs on domain-specific data is still underrated.",
        "LoRA fine-tuning is a game changer. 10x cheaper than full fine-tuning.",
        "Just fine-tuned Llama 3 on my company data. Results are incredible.",
        "The real unlock in 2026 is cheap, fast fine-tuning for every business vertical.",
        "QLoRA lets you fine-tune a 70B model on a single GPU. Wild.",
        "Fine-tuning vs RAG — when should you use which? A thread.",
        "Domain-specific fine-tuned models are beating GPT-4 on specialized tasks.",
        "PEFT methods have made fine-tuning accessible to everyone. This is huge.",
        "I fine-tuned a model on 10k customer support tickets. Cut resolution time by 40%.",
        "The fine-tuning ecosystem has exploded. Axolotl, Unsloth, LLaMA-Factory — so many options.",
    ],
    "RAG and embeddings": [
        "RAG is still the most practical way to ground LLMs in real data.",
        "Vector databases are becoming the backbone of every AI application.",
        "Advanced RAG techniques: HyDE, query rewriting, re-ranking. A breakdown.",
        "Embeddings are the unsung heroes of modern AI systems.",
        "RAG vs fine-tuning: not an either/or. Use both.",
        "The embedding model you choose matters more than the vector DB.",
        "GraphRAG from Microsoft is a step change in knowledge retrieval.",
        "Hybrid search (BM25 + vector) consistently beats pure vector search.",
        "Building a RAG pipeline from scratch taught me more than any course.",
        "Chunking strategy is the most underrated part of building a good RAG system.",
    ],
    "Open source models": [
        "Llama 3 is now good enough to replace GPT-4 for 80% of use cases.",
        "The open source AI ecosystem is moving faster than anyone expected.",
        "Mistral just dropped a new model and it's beating closed models on benchmarks.",
        "Running LLMs locally with Ollama is now a legitimate production strategy.",
        "Open source models are closing the gap with frontier models fast.",
        "DeepSeek R2 is the most impressive open source reasoning model I've tested.",
        "The commoditization of LLMs is happening. Open source wins long term.",
        "Phi-3 mini is shockingly good for a 3B parameter model.",
        "Community fine-tunes of open source models are often better than the base.",
        "The real AI moat is data and distribution, not the model. Open source proves it.",
    ],
    "AI coding tools": [
        "Cursor AI has replaced my entire dev workflow. I can't go back.",
        "GitHub Copilot vs Cursor vs Windsurf — which AI coding tool actually wins?",
        "AI coding assistants are making senior devs 3x more productive.",
        "The best AI coding tool is the one that understands your codebase.",
        "Claude in Cursor is the combo I didn't know I needed.",
        "AI coding tools are not replacing developers, they're replacing bad developers.",
        "Windsurf's cascade feature is the most impressive agentic coding I've seen.",
        "I built a full SaaS in a weekend with AI coding tools. 2 years ago that was impossible.",
        "The terminal-first AI coding experience (Claude Code) is underrated.",
        "AI coding tools have made me realize how much time I was wasting on boilerplate.",
    ],
}

async def generate_fake_data(days: int = 7, posts_per_topic_per_day: int = 8):
    client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
    db = client[os.getenv("DB_NAME")]
    posts = db["posts"]

    await posts.create_index("post_id", unique=True)

    inserted = 0
    now = datetime.now(timezone.utc)
    fake_id = 1000000000000

    for day_offset in range(days):
        post_date = now - timedelta(days=days - day_offset)

        for topic, texts in FAKE_TOPICS.items():
            for i in range(posts_per_topic_per_day):
                text = random.choice(texts)
                # 越近的数据，engagement 越高（模拟 emerging trend）
                multiplier = 1 + (day_offset * 0.3)
                doc = {
                    "post_id": str(fake_id),
                    "text": text + f" #{topic.replace(' ', '')} #{random.choice(['AI', 'ML', 'LLM', 'GenAI'])}",
                    "author": f"fake_user_{random.randint(1, 50)}",
                    "author_followers": random.randint(500, 50000),
                    "likes": int(random.randint(20, 500) * multiplier),
                    "retweets": int(random.randint(5, 100) * multiplier),
                    "replies": int(random.randint(2, 50) * multiplier),
                    "views": int(random.randint(500, 10000) * multiplier),
                    "created_at": post_date,
                    "scraped_at": now,
                    "lang": "en",
                    "is_fake": True,
                    "fake_topic": topic,
                    "cluster_id": None,
                    "trend_id": None,
                }
                try:
                    await posts.insert_one(doc)
                    inserted += 1
                except Exception:
                    pass
                fake_id += 1

    print(f"Done! Inserted {inserted} fake posts across {days} days.")
    print(f"Topics: {list(FAKE_TOPICS.keys())}")
    client.close()

asyncio.run(generate_fake_data())