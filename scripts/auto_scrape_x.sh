#!/bin/bash
# auto_scrape_x.sh — runs once on startup: scrape X via OpenCLI
# Requires Chrome to be open with X logged in and OpenCLI extension active.
# HN scraping + pipeline are handled by GitHub Actions (see .github/workflows/).

LOGFILE="/home/wf/projects/x-trend-analyzer/logs/scrape_x.log"
PROJECT="/home/wf/projects/x-trend-analyzer"
PYTHON="/home/wf/anaconda3/bin/python"

mkdir -p "$PROJECT/logs"
exec >> "$LOGFILE" 2>&1

echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S') X scrape on startup ==="

cd "$PROJECT"

# Check if opencli is reachable (Chrome needs to be open)
if ! command -v opencli &> /dev/null; then
    echo "opencli not found, skipping"
    exit 0
fi

echo "Scraping X..."
$PYTHON scraper/scraper_opencli.py && echo "X scrape done" || echo "X scrape failed — Chrome may not be open yet"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') done ==="
