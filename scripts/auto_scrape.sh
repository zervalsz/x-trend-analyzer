#!/bin/bash
# auto_scrape.sh — runs every day: scrape X + HN → embed → pipeline
# Cron: 0 8,20 * * * /home/wf/projects/x-trend-analyzer/scripts/auto_scrape.sh

set -e
LOGFILE="/home/wf/projects/x-trend-analyzer/logs/auto_scrape.log"
PROJECT="/home/wf/projects/x-trend-analyzer"
PYTHON="/home/wf/anaconda3/bin/python"

mkdir -p "$PROJECT/logs"
exec >> "$LOGFILE" 2>&1

echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S') START ==="

cd "$PROJECT"

# Step 1: Hacker News (no Chrome needed, always runs)
echo "[1/4] Scraping Hacker News..."
$PYTHON -m scraper.scraper_hn && echo "HN done" || echo "HN failed (non-fatal)"

# Step 2: X via OpenCLI (requires Chrome open with extension)
echo "[2/4] Scraping X (requires Chrome)..."
$PYTHON scraper/scraper_opencli.py && echo "X done" || echo "X failed — Chrome may not be open"

# Step 3: Embed new posts
echo "[3/4] Embedding new posts..."
$PYTHON -m ml_pipeline.embedder

# Step 4: Run pipeline (last 3 days incremental, skip full reset)
echo "[4/4] Running ML pipeline (3 days, skip-reset)..."
$PYTHON run_pipeline.py --days 3 --skip-reset

echo "=== $(date '+%Y-%m-%d %H:%M:%S') DONE ==="
