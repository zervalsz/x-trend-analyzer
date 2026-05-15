# TrendRadar

> AI 趋势追踪系统 — 从 X (Twitter) 实时抓取 AI 相关内容，自动聚类识别每日热点，跨天追踪 trend 演化链，以新闻标题形式呈现具体事件，帮助发现正在爆发的 AI 话题。

---

## 产品定位

把 X 上碎片化的 AI 内容，经过聚类 → 链接 → 摘要 → 评分，转化为结构化的 trend 情报：

- **每日热点**：今天 AI 圈在讨论什么，每个话题有多少帖子
- **趋势链**：同一话题连续几天被讨论，是昙花一现还是持续发酵
- **状态判断**：Trending（持续增长）/ Peak（已达峰）/ Emerging（刚出现）/ Cooling（热度下降）

**目标用户**：科技类 Content Creator、AI 研究者，帮助在话题爆发前发现它。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 数据抓取 | OpenCLI + Chrome 浏览器登录态 |
| 主数据库 | MongoDB Atlas（posts / topics / trends） |
| 向量数据库 | Supabase pgvector（1536维 embedding） |
| Embedding | OpenAI `text-embedding-3-small` |
| 降维 + 聚类 | UMAP（1536→20维）+ HDBSCAN |
| LLM 摘要 | GPT-4o（新闻标题风格） |
| 前端 | Next.js + TypeScript + Tailwind CSS |

---

## ML Pipeline

```
X Posts → noise_filter → embedder → clusterer → linker → summarizer → scorer
```

### 各模块说明

**`noise_filter.py`**
关键词黑名单过滤，在 embedding 前移除政治/娱乐内容，避免噪音进入向量空间。

**`embedder.py`**
过滤后的帖子调用 OpenAI `text-embedding-3-small` 生成 1536 维向量，批量写入 Supabase pgvector。

**`clusterer.py`**
每天独立运行：
- UMAP 降维：1536维 → 20维（cosine metric，n_neighbors=15，random_state=42）
- HDBSCAN 聚类：min_cluster_size=8，cluster_selection_method="leaf"
- 软分配（soft assignment）：噪音帖子若与某 cluster centroid 的 cosine 相似度 > 0.6，归入该 cluster
- Centroid 用硬聚类成员计算，保留在原始 1536 维空间（linker 使用）

**`linker.py`**
把每天的 topic clusters 串联成跨天的 trend chain：
- 全局查重（global_threshold=0.80）：新 topic 先与所有现有 trend 的最新 centroid 比较，相似度超阈值直接合并
- 逐日匹配（threshold=0.65）：与前一天 topics 逐一比较，找最近邻
- Coherence check（coherence_threshold=0.70）：与该 trend 最近 3 个 topics 的平均相似度，低于阈值时开新 trend 而非强行合并
- 每个 trend 记录 `last_topic_date`，用于前端过滤活跃 trends

**`summarizer.py`**
调用 GPT-4o，以**新闻编辑**的视角生成摘要：
- Topic 级别：一句话新闻标题，命名具体产品/公司/人物（"Anthropic launches Claude Code CLI"），而非通泛描述
- Trend 级别：以第一天事件为锚点，如有演化则补充说明
- `--force` 参数：强制重跑所有已有 topics/trends 的摘要
- 两次 GPT 调用之间有 1.5 秒延迟，避免触发 rate limit

**`scorer.py`**
计算每个 trend 的指标和状态：
- `growth_rate`：日均增长率
- `velocity`：最新日 vs 首日的帖子数差值
- `avg_engagement`：likes + retweets + replies 的中位数
- 状态判断逻辑：
  - **Cooling**：峰值出现在前 1/3，近期均值 < 峰值 55% 且总体下降
  - **Peak**：有明显中期峰值，近期持续下滑
  - **Trending**：追踪 5 天以上且平均增长率 > 8%
  - **Emerging**：其他（新兴或未明朗）

### 一键运行

```bash
# 快速验证（3天）
python run_pipeline.py --days 3

# 完整运行（22天）
python run_pipeline.py --days 22

# 跳过重置（保留现有 topics/trends）
python run_pipeline.py --days 5 --skip-reset

# 强制重跑所有摘要
python run_pipeline.py --days 5 --force-summarize
```

`run_pipeline.py` 会依次执行：Reset → Cluster → Link → Summarize → Score

---

## 前端

Next.js App Router，深色工程风格界面，访问 `http://localhost:3000`。

### 主页

**Daily Hot Topics（上半部分）**
- 最近 5 天（以有摘要数据的最新日期为锚点）的每日 Top 5 热点话题
- 每个话题显示新闻标题 + 帖子数 + 所属 trend 状态
- 点击直接跳转到对应 trend 详情页

**Trend 列（下半部分）**
- 按状态分列显示：Trending | Peak | Emerging | Cooling
- 每列按 avg_engagement 从高到低排序
- 只显示 `last_topic_date` 在最新数据 3 天内的活跃 trends
- 顶部 Filter 按钮：点选某状态后以 3 列 grid 展示该类全部 trends

**Trend Card**
- 标题：trend 的一句话摘要（新闻标题）
- 指标：growth rate、tracked days、velocity、sparkline

### Trend 详情页

点击任意 Trend Card 跳转独立页面（`/trends/[id]`）：
- 摘要 + 核心关键词（作为标签）
- Metrics 面板：growth rate、avg engagement、velocity、days tracked
- Daily Posts 折线图：悬停显示日期 + 帖子数（tooltip 自动避开图表边缘）
- Topic Timeline：按天展开，每天显示摘要 + 样本帖子（点赞/转发/浏览量）

---

## 数据库结构

### MongoDB (`trendhunter` database)

**posts**
```json
{
  "post_id": "string",
  "text": "string",
  "author": "string",
  "likes": "int", "retweets": "int", "replies": "int", "views": "int",
  "created_at": "datetime",
  "embedded_at": "datetime",
  "cluster_id": "string | null"
}
```

**topics**
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

**trends**
```json
{
  "topic_ids": ["string"],
  "status": "emerging | trending | peak | cooling",
  "last_topic_date": "datetime",
  "keywords": ["string"],
  "summary": "string",
  "metrics": {
    "daily_sizes": ["int"],
    "daily_engagement": ["float"],
    "growth_rate": "float",
    "velocity": "float",
    "avg_engagement": "float",
    "days_tracked": "int"
  },
  "created_at": "datetime",
  "last_updated": "datetime",
  "scored_at": "datetime"
}
```

### Supabase pgvector

```sql
id         bigserial primary key
post_id    text not null unique
embedding  vector(1536) not null
created_at timestamptz default now()
```

---

## 本地环境配置

```bash
# 1. Clone 项目
git clone https://github.com/zervalsz/x-trend-analyzer.git
cd x-trend-analyzer

# 2. Python 依赖（推荐 conda 环境）
pip install -r requirements.txt

# 3. 创建 .env
MONGO_URI=mongodb+srv://...
DB_NAME=trendhunter
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...supabase.co
SUPABASE_KEY=...

# 4. 安装 OpenCLI（用于抓取 X）
npm install -g @jackwener/opencli
# 安装 Chrome 扩展，登录 x.com，验证：opencli doctor

# 5. 前端
cd frontend
npm install
cp .env.example .env.local   # 填入 MONGO_URI、DB_NAME
npm run dev
# 访问 http://localhost:3000（需要 Node.js >= 20）
```

---

## 日常使用流程

```bash
# Step 1：抓取新数据（本地，需要 Chrome 开着并登录 x.com）
python scraper/scraper_opencli.py
python -m ml_pipeline.embedder

# Step 2：跑 ML pipeline（处理最近 N 天数据）
python run_pipeline.py --days 7

# Step 3：启动前端查看结果
cd frontend && npm run dev
```

---

## 文件结构

```
x-trend-analyzer/
├── scraper/
│   └── scraper_opencli.py      # OpenCLI 抓取器（复用 Chrome 登录态）
├── ml_pipeline/
│   ├── noise_filter.py         # 关键词黑名单（embedding 前过滤）
│   ├── embedder.py             # OpenAI embedding → Supabase pgvector
│   ├── clusterer.py            # UMAP + HDBSCAN 每日聚类 + 软分配
│   ├── linker.py               # 全局查重 + 逐日匹配 + coherence check
│   ├── summarizer.py           # GPT-4o 新闻标题风格摘要（--force 参数）
│   └── scorer.py               # 增长指标 + 状态判断
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # 主页：Daily Hot + Trend 分列
│   │   ├── trends/[id]/
│   │   │   └── page.tsx        # Trend 详情页
│   │   └── api/
│   │       ├── trends/route.ts         # 活跃 trends 列表（按 last_topic_date 过滤）
│   │       ├── trends/[id]/route.ts    # 单个 trend 详情 + topics + posts
│   │       ├── daily-hot/route.ts      # 每日 Top N topics
│   │       └── stats/route.ts          # 整体统计
│   └── lib/mongodb.ts
├── run_pipeline.py             # 一键 pipeline（--days、--skip-reset、--force-summarize）
├── requirements.txt
└── .env
```

---

## 已知限制

- **抓取无法自动化**：OpenCLI 依赖本地 Chrome，需手动运行；后期计划切换到 X 官方 API
- **OpenAI 费用**：每次完整 pipeline（22天 × ~20 clusters × GPT-4o）约消耗数百次调用，注意 quota
- **Summarizer quota 保护**：`--force-summarize` 会重跑所有摘要，日常增量更新不需要此参数
