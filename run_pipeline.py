"""
run_pipeline.py — 一键跑完整 ML pipeline

快速验证（3天）：  python run_pipeline.py --days 3
完整运行（16天）：  python run_pipeline.py --days 16
跳过 reset：       python run_pipeline.py --days 5 --skip-reset
"""

import argparse
import asyncio
import os
import sys
import subprocess
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

db = AsyncIOMotorClient(os.getenv("MONGO_URI"))[os.getenv("DB_NAME")]
PYTHON = sys.executable


async def reset(days: int):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )

    r = await db.trends.delete_many({})
    print(f"  cleared {r.deleted_count} trends")

    r = await db.topics.delete_many({"date": {"$gte": cutoff}})
    print(f"  cleared {r.deleted_count} topics (last {days} days)")

    r = await db.posts.update_many(
        {"created_at": {"$gte": cutoff}, "cluster_id": {"$exists": True}},
        {"$unset": {"cluster_id": ""}},
    )
    print(f"  cleared cluster_id from {r.modified_count} posts")


def run(label: str, cmd: list[str]):
    print(f"\n── {label} {'─' * (44 - len(label))}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"[pipeline] {label} failed (exit {result.returncode}), stopping.")
        sys.exit(result.returncode)


def main():
    parser = argparse.ArgumentParser(description="TrendRadar ML pipeline")
    parser.add_argument("--days", type=int, default=5,
                        help="Number of recent days to process (default: 5)")
    parser.add_argument("--skip-reset", action="store_true",
                        help="Skip reset step (keep existing topics/trends)")
    parser.add_argument("--force-summarize", action="store_true",
                        help="Re-summarize all topics/trends, not just empty ones")
    args = parser.parse_args()

    print(f"\n{'='*50}")
    print(f"  TrendRadar Pipeline  ·  last {args.days} days")
    print(f"{'='*50}")

    if not args.skip_reset:
        print(f"\n── Reset {'─'*42}")
        asyncio.run(reset(args.days))

    run("Cluster", [PYTHON, "-m", "ml_pipeline.clusterer", "--days", str(args.days)])
    run("Link",    [PYTHON, "-m", "ml_pipeline.linker",    "--days", str(args.days)])
    summarize_cmd = [PYTHON, "-m", "ml_pipeline.summarizer"]
    if args.force_summarize:
        summarize_cmd.append("--force")
    run("Summarize", summarize_cmd)
    run("Score",   [PYTHON, "-m", "ml_pipeline.scorer"])

    print(f"\n{'='*50}")
    print(f"  Done! Open http://localhost:3000 to view results.")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
