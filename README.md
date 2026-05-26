# TrendRadar

> Track what AI Twitter is actually talking about — before it goes mainstream.

TrendRadar scrapes X (Twitter) and Hacker News, clusters posts by topic using embeddings, chains daily clusters into multi-day trend timelines, and scores each trend's momentum. The result is a live dashboard showing which AI topics are emerging, trending, or peaking right now.

**Live:** [x-trend-analyzer.vercel.app](https://x-trend-analyzer-hqemr2wzh-wenfan-s-projects.vercel.app)

---

## The Idea

AI moves fast. By the time something shows up in newsletters or aggregators, it's already old news. The goal is to surface what's actually gaining traction on X — not by follower count or algorithmic boosting, but by clustering raw post volume and tracking how topics grow day over day.

The pipeline turns this:

> 500 scattered posts about "Claude", "Anthropic", "MCP", "tool use"...

Into this:

> **Anthropic introduces MCP, sparking widespread adoption across tech platforms** — Trending · 8 days · +18% growth

---

## How It Works

```
X / HN posts
     │
     ▼
noise_filter       keyword blacklist (remove obvious off-topic)
     │
     ▼
embedder           OpenAI text-embedding-3-small → 1536-dim vectors → Supabase pgvector
     │
     ▼
clusterer          UMAP (1536→20 dim) + HDBSCAN → daily topic clusters + centroids
     │
     ▼
linker             cosine similarity to chain clusters across days into trend timelines
     │
     ▼
summarizer         GPT-4o → one-line news headline per topic and trend
     │
     ▼
scorer             growth rate, velocity, engagement → Emerging / Trending / Peak
     │
     ▼
frontend           Next.js dashboard on Vercel, reads from MongoDB
```

---

## ML Pipeline

### clusterer.py
Runs per-day on all embedded posts:
- UMAP: 1536 → 20 dimensions (cosine metric, `n_neighbors=15`)
- HDBSCAN: `min_cluster_size=8`, `cluster_selection_method="leaf"`
- Soft assignment: noise posts with cosine sim > 0.6 to any cluster centroid are reassigned
- Centroids stored in original 1536-dim space for linker use

### linker.py
Chains daily clusters into persistent trend timelines:
- **Global merge** (`global_threshold=0.83`): new topic first compared to all active trend centroids — if similar enough, merged directly
- **Day-to-day match** (`threshold=0.75`): compared against previous day's clusters
- **Coherence check** (`coherence_threshold=0.78`): averaged against last 3 topics in the trend — low coherence starts a new trend instead of extending
- **Stale cutoff** (`max_gap_days=3`): trends inactive for 3+ days are closed; a similar new cluster starts fresh

### summarizer.py
GPT-4o with a news editor persona:
- Topic level: one-sentence headline naming specific products/companies ("xAI launches Grok Build CLI for SuperGrok users")
- Trend level: anchored on the first event, notes evolution if present
- Skips already-summarized topics/trends unless `--force` is passed

### scorer.py
Computes metrics per trend from its topic chain:
- `growth_rate`: average day-over-day growth
- `velocity`: latest day vs first day post count delta
- `avg_engagement`: median of (likes + retweets + replies) across topics

Status classification:
| Status | Condition |
|--------|-----------|
| **Cooling** | 5+ days tracked, sharp recent decline (`latest_growth < -0.3`) |
| **Peak** | Clear mid-trend peak, declining since |
| **Trending** | 7+ days with stable or positive growth; or 5+ days with avg growth > 5% |
| **Emerging** | Everything else (new or unclear) |

### Running the pipeline

```bash
# Incremental (daily use, keeps existing topics/trends)
python run_pipeline.py --days 3 --skip-reset

# Full rebuild
python run_pipeline.py --days 16

# Force re-summarize everything
python run_pipeline.py --days 5 --force-summarize
```

`run_pipeline.py` runs: Reset → Cluster → Link → Summarize → Score

---

## Data Sources

| Source | Method | Schedule |
|--------|--------|----------|
| X (Twitter) | OpenCLI (browser-based, local only) | Manual — run `scrape_x.bat` |
| Hacker News | API scraper | Automated — GitHub Actions, twice daily |

The X scraper uses broad AI-related queries ("AI", "Claude", "LLM", "vibe coding", etc.) and lets the clustering algorithm find the actual topics. No hand-curated topic list.

### Daily X workflow (Windows)
Double-click `scrape_x - Shortcut.lnk` (or run `scrape_x.bat`) — it does everything:
1. Scrapes X via OpenCLI
2. Embeds new posts
3. Runs the ML pipeline (last 3 days, incremental)

---

## Frontend

Next.js 16 · TypeScript · Tailwind CSS · Deployed on Vercel

### Dashboard (`/`)

**Daily Hot Topics** — last 5 days of top clusters, sorted by post volume. Click any topic to jump to its trend.

**Trend columns** — Emerging / Trending / Peak, sorted by most recent activity. Each card shows:
- One-line trend summary (news headline style)
- Last seen date
- Growth rate, days tracked, velocity
- Sparkline with hover tooltip
- Filter state persists in URL (`?filter=trending`)

### Trend detail (`/trends/[id]`)

- Summary + date range (e.g. `May 12 – May 25`)
- Metrics panel: growth rate, avg engagement, velocity, days tracked
- Daily posts line chart with interactive tooltip
- Topic timeline: one row per day, expandable to show sample posts with links to original X/HN posts

---

## Database

### MongoDB Atlas (`trendhunter`)

**posts** — raw scraped content
```json
{
  "post_id": "string",
  "text": "string",
  "author": "string",
  "source": "x | hn",
  "post_url": "string",
  "likes": "int",
  "retweets": "int",
  "replies": "int",
  "views": "int",
  "created_at": "datetime",
  "cluster_id": "string | null"
}
```

**topics** — daily clusters
```json
{
  "date": "datetime",
  "cluster_label": "int",
  "size": "int",
  "centroid": "[float × 1536]",
  "keywords": ["string"],
  "summary": "string"
}
```

**trends** — multi-day trend chains
```json
{
  "topic_ids": ["string"],
  "status": "emerging | trending | peak | cooling",
  "last_topic_date": "datetime",
  "keywords": ["string"],
  "summary": "string",
  "metrics": {
    "growth_rate": "float",
    "velocity": "float",
    "avg_engagement": "float",
    "days_tracked": "int",
    "daily_sizes": ["int"]
  }
}
```

### Supabase pgvector

```sql
post_id    text unique
embedding  vector(1536)
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Scraping | OpenCLI (X) + custom API scraper (HN) |
| Database | MongoDB Atlas |
| Vector store | Supabase pgvector |
| Embedding | OpenAI `text-embedding-3-small` |
| Dimensionality reduction | UMAP |
| Clustering | HDBSCAN |
| Summarization | GPT-4o |
| Frontend | Next.js 16 + TypeScript + Tailwind CSS v4 |
| Deployment | Vercel (frontend) + GitHub Actions (HN automation) |

---

## Local Setup

```bash
git clone https://github.com/zervalsz/x-trend-analyzer.git
cd x-trend-analyzer

# Python dependencies
pip install -r requirements.txt

# Environment variables
cp .env.example .env
# Fill in: MONGO_URI, DB_NAME, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_KEY

# Frontend
cd frontend
npm install
# Create frontend/.env.local with MONGO_URI and DB_NAME
npm run dev
# → http://localhost:3000
```

For X scraping, install OpenCLI and log into x.com in Chrome first.

---

## Repo Structure

```
x-trend-analyzer/
├── scraper/
│   ├── scraper_opencli.py      # X scraper (OpenCLI, local only)
│   └── scraper_hn.py           # HN scraper (automated)
├── ml_pipeline/
│   ├── noise_filter.py         # Pre-embedding keyword filter
│   ├── embedder.py             # OpenAI embedding → Supabase
│   ├── clusterer.py            # UMAP + HDBSCAN daily clustering
│   ├── linker.py               # Cross-day trend chaining
│   ├── summarizer.py           # GPT-4o headline generation
│   └── scorer.py               # Metrics + status classification
├── frontend/                   # Next.js app (deployed on Vercel)
├── run_pipeline.py             # One-command pipeline runner
├── scrape_x.bat                # Windows: scrape + embed + pipeline
└── .github/workflows/
    └── daily_scrape.yml        # HN scrape + pipeline, twice daily
```
