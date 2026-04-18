"""
cleanup_noise.py
一次性脚本：从 Supabase embeddings 表删除噪音 posts 的向量
运行完删掉这个文件
"""

import asyncio
import os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from supabase import create_client
from ml_pipeline.noise_filter import keyword_filter

load_dotenv()

mongo_client = AsyncIOMotorClient(os.getenv("MONGO_URI"))
db = mongo_client[os.getenv("DB_NAME", "trendhunter")]
posts_col = db["posts"]

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

async def main():
    # 1. 从 MongoDB 读所有 posts
    print("读取 MongoDB posts...")
    all_docs = await posts_col.find({}, {"post_id": 1, "text": 1}).to_list(length=None)
    print(f"共 {len(all_docs)} 条 posts")

    # 2. 跑 noise filter
    kept, stats = keyword_filter(all_docs, text_field="text")
    print(f"noise filter 结果: {stats}")

    kept_ids = {doc["post_id"] for doc in kept}
    noise_ids = [doc["post_id"] for doc in all_docs if doc["post_id"] not in kept_ids]
    print(f"需要从 Supabase 删除: {len(noise_ids)} 条")

    if not noise_ids:
        print("没有需要删除的，退出。")
        return

    # 3. 打印将要删除的内容，确认
    print("\n将要删除的 post_ids:")
    for pid in noise_ids:
        doc = next(d for d in all_docs if d["post_id"] == pid)
        print(f"  - {pid}: {doc['text'][:80]}")

    # DEBUG: 找出每条被删 post 是被哪条规则命中的
    from ml_pipeline.noise_filter import _BLACKLIST_RE, BLACKLIST_PATTERNS
    print("\n=== DEBUG: 被删原因 ===")
    for doc in all_docs:
        if doc["post_id"] not in kept_ids:
            text = doc["text"]
            for i, pattern in enumerate(_BLACKLIST_RE):
                if pattern.search(text):
                    print(f"Rule [{i}] {BLACKLIST_PATTERNS[i]}")
                    print(f"  → {text[:100]}")
                    break
    print("=== END DEBUG ===\n")

    confirm = input("\n确认删除？(yes/no): ")
    if confirm.lower() != "yes":
        print("取消。")
        return

    # 4. 从 Supabase 删除（分批，每次最多 100 条）
    batch_size = 100
    deleted = 0
    for i in range(0, len(noise_ids), batch_size):
        batch = noise_ids[i:i + batch_size]
        supabase.table("embeddings").delete().in_("post_id", batch).execute()
        deleted += len(batch)
        print(f"已删除 {deleted}/{len(noise_ids)}")

    print(f"\n完成！Supabase 清理了 {deleted} 条噪音向量。")
    print("现在可以重跑 clusterer / linker / scorer。")

if __name__ == "__main__":
    asyncio.run(main())