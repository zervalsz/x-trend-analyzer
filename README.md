# TrendRadar

> AI领域趋势发现与预测系统 — 从 X (Twitter) 实时抓取 AI 相关内容，自动识别 emerging topics，追踪其演化路径，预测哪些趋势即将爆发。

---

## 产品定位

把 X 上碎片化的 AI 内容 → 结构化 topic → 跨天演化的 trend chain → 趋势预测与情报输出。

**目标用户：** 科技类 Content Creator（AI 视频博主、写作者），帮助他们在话题爆发前 3-7 天发现它。

---

## 项目现状（2026年4月 · Mid-term Demo）

### 已完成 ✅

#### 基础设施
- GitHub Codespaces 开发环境配置完成
- MongoDB Atlas 连接（cluster: `social-media-data`，db: `trendhunter`）
- Supabase pgvector 配置完成（用于存储 embedding 向量）
- 本地 VS Code 开发环境（Windows）配置完成

#### 数据采集层 (`scraper/`)
- `scraper_opencli.py` — 基于 OpenCLI 的抓取器，复用 Chrome 浏览器登录态，支持 15 个 AI 相关 query，每次抓取约 150-200 条新 posts

> ⚠️ **当前限制：** OpenCLI 依赖本地 Chrome 浏览器，无法在云端自动运行，只能手动在本地跑。后期计划切换到 X 官方 Pay-Per-Use API 实现真正的自动化。

#### ML Pipeline (`ml_pipeline/`)
- `noise_filter.py` — 关键词黑名单过滤（政治/娱乐内容），在 embed 之前运行，避免噪音进入向量空间
- `embedder.py` — 先过 noise filter，再调用 OpenAI `text-embedding-3-small` 批量生成 1536 维向量，存入 Supabase pgvector
- `clusterer.py` — 每日运行 HDBSCAN（`min_cluster_size=2`）聚类，`min_cluster_size=2` 以捕获 early signal
- `summarizer.py` — 调用 GPT-4o 为每个 topic cluster 生成 keywords 和 summary；若 cluster 内容与 AI 无关则返回空，实现第二层噪音过滤
- `linker.py` — cosine similarity（threshold=0.65）跨天连接 topic clusters；加入 coherence check（threshold=0.7），防止不相关 cluster 被合并进同一 trend；无匹配的 cluster 自动成为新 trend 的起点，保留 early signal
- `scorer.py` — 计算 growth_rate、velocity、median engagement，输出 status 标签（emerging/trending/peak/cooling）；`days_tracked < 2` 的 trend 不评分

#### 前端 (`frontend/`)
- Next.js 14 + TypeScript + Tailwind CSS，深色工程监控面板风格
- **Pipeline Visualizer** — 顶部展示完整 pipeline 流程（Scrape → Embed → Cluster → Link → Score），每个节点显示实际数据量，点击弹窗查看详细内容
- **Trend Cards** — 展示 keywords、summary、status badge、metrics、sparkline，点击打开侧边抽屉
- **Trend Detail Drawer** — 完整 metrics、放大 sparkline、Topic Timeline（按天展开，每天显示 keywords、summary、样本 posts）
- 前端 API 层双重过滤：keywords 不为空 + summary 不为空，确保只展示有效 AI trends

#### 已验证的 Pipeline 结果（基于真实数据）
```
1,800+ posts（8天）→ noise filter → embedding → 26 topic clusters → 12 trend chains → scored
有效 trend 输出：8 个（含 keywords + summary）
话题覆盖：LLMs, vibe coding, AI tools, Claude Code, AI trading bots, 
         Gemini, LLM limitations, AI in chip design
政治/娱乐噪音：noise_filter + summarizer 双重过滤，不出现在前端
```

---

## Pipeline 设计决策

| 决策 | 选择 | 原因 |
|------|------|------|
| 向量存储分离 | MongoDB metadata + Supabase pgvector | MongoDB free tier 无法存高维向量 |
| min_cluster_size=2 | 保留 early signal | 宁可噪音多一点，不错过刚出现的话题 |
| 噪音过滤双保险 | 关键词黑名单 + GPT-4o 判断 | 黑名单快速拦截，GPT 处理语义噪音 |
| Coherence check | 0.7 阈值 | 防止主题漂移，让 trend chain 更纯粹 |
| 无匹配 cluster → 新 trend | linker 逻辑 | 不丢弃 early signal，给它机会被后续延续 |
| Median engagement | 抗 outlier | 高互动帖子会严重拉高均值，median 更稳定 |

---

## 数据库结构

### MongoDB Atlas (`trendhunter` database)

**posts collection**
```json
{
  "post_id": "string",
  "text": "string",
  "author": "string",
  "author_followers": "int",
  "likes": "int",
  "retweets": "int",
  "replies": "int",
  "views": "int",
  "created_at": "datetime",
  "scraped_at": "datetime",
  "lang": "string",
  "embedded_at": "datetime",
  "cluster_id": "string | null"
}
```

**topics collection**
```json
{
  "date": "datetime",
  "cluster_label": "int",
  "post_ids": ["string"],
  "size": "int",
  "centroid": "[float x 1536]",
  "keywords": ["string"],
  "summary": "string",
  "summarized_at": "datetime",
  "created_at": "datetime"
}
```

**trends collection**
```json
{
  "topic_ids": ["string"],
  "status": "emerging | trending | peak | cooling",
  "metrics": {
    "daily_sizes": ["int"],
    "daily_engagement": ["float"],
    "growth_rate": "float",
    "velocity": "float",
    "avg_engagement": "float",
    "days_tracked": "int"
  },
  "keywords": ["string"],
  "summary": "string",
  "summarized_at": "datetime",
  "created_at": "datetime",
  "last_updated": "datetime",
  "scored_at": "datetime"
}
```

### Supabase pgvector (`embeddings` table)
```sql
id         bigserial primary key
post_id    text not null unique
embedding  vector(1536) not null
created_at timestamptz default now()
```

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 数据抓取 | OpenCLI + subprocess | 复用 Chrome 浏览器登录态抓取 X |
| 主数据库 | MongoDB Atlas (Free) | posts metadata、topics、trends |
| 向量数据库 | Supabase pgvector | 1536维 embedding 向量存储 |
| Noise 过滤 | 关键词黑名单 + GPT-4o | embedder 前 + summarizer 层双重过滤 |
| Embedding | OpenAI text-embedding-3-small | 语义向量生成 |
| 聚类 | HDBSCAN (min_cluster_size=2) | 自动确定 cluster 数量，保留 early signal |
| Topic linking | Cosine similarity + coherence check | threshold=0.65，coherence=0.7，无匹配自动开新 trend |
| LLM 摘要 | GPT-4o | topic/trend keywords + summary，含噪音检测 |
| 前端 | Next.js 14 + TypeScript + Tailwind | Pipeline visualizer + trend dashboard |

---

## 已知问题 & 待改进

### 🔴 高优先级

**1. 数据采集无法自动化**
- 现象：OpenCLI 依赖本地 Chrome，只能手动运行
- 解决方案：切换到 X 官方 Pay-Per-Use API（约 $0.005/post read）
- 影响：目前需要每天手动跑 scraper

**2. 数据量偏少**
- 现象：每天约 150-200 条新 posts，有效 trend 数量偏少（约 5-8 个）
- 原因：OpenCLI search 有内部上限
- 解决方案：切换官方 API + 增加数据源

### 🟡 中优先级

**3. Summarizer 重复处理噪音 topics**
- 现象：每次运行都会重新处理已知为空的 noise topics，浪费 GPT token
- 解决方案：空 summary 的 topics 也打上 `summarized_at` 标记

**4. Scorer 依赖数据量稳定性**
- 现状：每天抓取数量不均匀导致 velocity 失真
- 解决方案：数据量稳定后重新调参

### 🟢 低优先级（后期功能）

- FastAPI REST endpoints
- 多平台数据源（Reddit、GitHub trending）
- 个性化 trend feed
- Trend 预测（未来 3-7 天走势）

---

## 运行方式

### 每天数据采集（本地，需要 Chrome 开着并登录 x.com）
```bash
python scraper/scraper_opencli.py
python -m ml_pipeline.embedder
```

### 跑完整 ML pipeline
```bash
python -m ml_pipeline.clusterer
python -m ml_pipeline.linker
python -m ml_pipeline.scorer
python -m ml_pipeline.summarizer
```

### 重置 pipeline（保留 posts 和 embeddings）
```bash
python reset_clusters.py        # 清空 topics、清除 posts 的 cluster_id
python reset_summaries.py       # 重置 topics/trends 的 summary

# 清空 trends（在 Python 或 MongoDB Atlas UI 里运行）
python -c "
import asyncio, os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
load_dotenv()
async def main():
    db = AsyncIOMotorClient(os.getenv('MONGO_URI'))[os.getenv('DB_NAME')]
    await db.trends.delete_many({})
    print('Trends cleared')
asyncio.run(main())
"

# 然后重新跑完整 pipeline
```

### 启动前端
```bash
cd frontend
npm run dev
# 访问 http://localhost:3000
```

---

## 本地环境设置

```bash
# 1. Clone 项目
git clone https://github.com/zervalsz/x-trend-analyzer.git
cd x-trend-analyzer

# 2. 安装 Python 依赖
pip install motor python-dotenv openai hdbscan scikit-learn numpy supabase

# 3. 创建 .env
MONGO_URI=mongodb+srv://...
DB_NAME=trendhunter
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=sb_secret_...

# 4. 安装 OpenCLI
npm install -g @jackwener/opencli
# 安装 Chrome 扩展：chrome://extensions → Load unpacked → 选 opencli-extension 文件夹
# 验证：opencli doctor

# 5. 安装前端依赖
cd frontend
npm install

# 6. 创建 frontend/.env.local
MONGO_URI=mongodb+srv://...
DB_NAME=trendhunter
```

---

## 文件结构

```
x-trend-analyzer/
├── scraper/
│   ├── scraper_opencli.py      # OpenCLI 抓取器（当前使用）
│   └── scraper.py              # twscrape 版本（已废弃）
├── ml_pipeline/
│   ├── noise_filter.py         # 关键词黑名单过滤（Layer 1）
│   ├── embedder.py             # Noise filter → OpenAI embedding → Supabase
│   ├── clusterer.py            # HDBSCAN 每日聚类
│   ├── summarizer.py           # GPT-4o keywords + summary，含噪音检测
│   ├── linker.py               # Topic linking + coherence check
│   └── scorer.py               # Trend metrics + status
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # Pipeline visualizer + trend dashboard
│   │   └── api/
│   │       ├── trends/
│   │       │   ├── route.ts    # 获取所有 trends（过滤空 keywords）
│   │       │   └── [id]/
│   │       │       └── route.ts # 获取单个 trend 详情 + topics + posts
│   │       ├── pipeline/
│   │       │   └── [step]/
│   │       │       └── route.ts # 获取各 pipeline 节点详细数据
│   │       └── stats/
│   │           └── route.ts    # 获取整体统计数据
│   └── lib/
│       └── mongodb.ts
├── reset_clusters.py           # 重置 topics 和 cluster_id
├── reset_summaries.py          # 重置 summary 和 keywords
├── cleanup_noise.py            # 一次性：清理 Supabase 噪音向量
├── .env
└── README.md
```
