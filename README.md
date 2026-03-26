# X Trend Analyzer

> AI领域趋势发现与预测系统 — 从 X (Twitter) 实时抓取 AI 相关内容，自动识别 emerging topics，追踪其演化路径，预测哪些趋势即将爆发。

---

## 产品定位

把 X 上碎片化的 AI 内容 → 结构化 topic → 跨天演化的 trend chain → 趋势预测与情报输出。

**目标用户：** AI 创业者、科技类 Content Creator、早期投资人

---

## 项目现状（2026年3月）

### 已完成 ✅

#### 基础设施
- GitHub Codespaces 开发环境配置完成
- MongoDB Atlas 连接（cluster: `social-media-data`，db: `trendhunter`）
- 本地 VS Code 开发环境（Windows）配置完成

#### 数据采集层 (`scraper/`)
- `scraper.py` — 核心抓取类 `XScraper`，基于 `twscrape`，每小时抓取 AI 相关 posts
- `scheduler.py` — APScheduler 定时任务，每小时触发完整抓取
- `main.py` — 入口文件，启动抓取 + 调度

> ⚠️ **当前限制：** twscrape 在 Codespace 云环境下被 Cloudflare 封锁，本地运行也因新账号问题暂时受阻。X 账号需要继续暖号。scraper 代码已完整写好，等账号问题解决后可直接使用。

#### ML Pipeline (`ml_pipeline/`)
- `embedder.py` — 调用 OpenAI `text-embedding-3-small`，批量生成 1536 维向量，存入 MongoDB
- `clusterer.py` — 每日运行 HDBSCAN 聚类，将当天 posts 分组为 topic clusters，计算 centroid
- `linker.py` — 核心创新点：通过 cosine similarity 比较相邻两天的 topic centroids，将相似 topics 连接成跨天 trend chain
- `scorer.py` — 计算每个 trend 的 growth_rate、velocity、avg_engagement，输出 status 标签（emerging / trending / peak / cooling）

#### 测试工具
- `generate_fake_data.py` — 生成 280 条假 posts（5个AI话题 × 7天），用于测试 ML pipeline
- `remove_fake_data.py` — 精准清除所有 `is_fake: true` 的假数据，不影响真实数据
- `test_scrape.py` — 单次抓取测试脚本

#### 已验证的 Pipeline 结果（基于假数据）
```
280 posts → embedding → 22 topic clusters → 4 trend chains → scored
Trend status 输出：emerging x2, trending x0, peak x1, cooling x1
```

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
  "embedding": "[float x 1536]",
  "cluster_id": "string | null",
  "trend_id": "string | null",
  "is_fake": "bool (仅假数据有此字段)",
  "fake_topic": "string (仅假数据有此字段)"
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
  "created_at": "datetime",
  "last_updated": "datetime",
  "scored_at": "datetime"
}
```

> ⚠️ **待迁移：** embedding 向量目前存在 MongoDB，后期应迁移至 Supabase pgvector，节省 Atlas 存储空间。

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 数据抓取 | twscrape + asyncio | 模拟X网页请求 |
| 主数据库 | MongoDB Atlas (Free) | posts、topics、trends |
| 向量数据库 | Supabase pgvector (待接入) | embedding 向量存储 |
| Embedding | OpenAI text-embedding-3-small | 1536维语义向量 |
| 聚类 | HDBSCAN | 自动确定 cluster 数量 |
| Topic linking | Cosine similarity (numpy) | 跨天 topic 连接 |
| LLM 摘要 | GPT-4o (待接入) | trend summary 生成 |
| 调度 | APScheduler | 每小时触发 pipeline |
| API | FastAPI (待开发) | REST endpoints |
| 缓存 | Redis (待接入) | Top trends TTL缓存 |
| 前端 | Next.js (待开发) | Trend dashboard |

---

## 已知问题 & 待改进

### 🔴 高优先级

**1. X 账号登录问题**
- 现象：twscrape 登录被 Cloudflare 拦截（403）
- 原因：账号太新，X 不信任
- 解决方案：继续暖号（浏览、点赞、关注），等 48-72 小时后再试
- 文件：`setup_account.py`（已加入 .gitignore，需本地手动创建）

**2. Embedding 存在 MongoDB**
- 现象：1536维向量存在 Atlas，占用大量空间
- 解决方案：迁移至 Supabase pgvector
- 影响：约 3-4 个月后 Atlas 存储会接近上限

### 🟡 中优先级

**3. Topic linking threshold 未调优**
- 现状：cosine similarity threshold 固定为 0.7
- 问题：真实数据中同一话题每天讨论角度不同，0.7 可能过高或过低
- 解决方案：真实数据跑通后，根据实际 linking 结果调整

**4. LLM summary 未接入**
- 现状：topics 和 trends 的 `keywords` 和 `summary` 字段为空
- 解决方案：写 `ml_pipeline/summarizer.py`，调用 GPT-4o 填充

**5. Trend scorer 逻辑简单**
- 现状：rule-based，基于 growth_rate 阈值判断 status
- 解决方案：积累真实数据后，引入 LLM 判断或 ML 模型

### 🟢 低优先级（后期功能）

- FastAPI REST endpoints
- Redis 缓存
- Next.js 前端 dashboard
- Supabase pgvector 迁移
- 多平台数据源（Reddit、GitHub trending）
- 个性化 trend feed

---

## 下一步（按优先级）

```
1. 解决 X 账号登录问题，让 scraper 能真正抓到数据
2. 接入 Supabase pgvector，迁移 embedding 存储
3. 写 summarizer.py，给 topics/trends 生成 LLM summary
4. 写 FastAPI 层，暴露 /trends, /topics endpoints
5. 写 Next.js 前端，展示 Top 5 trends dashboard
6. 调优 topic linking threshold（基于真实数据）
```

---

## 本地开发环境设置

```bash
# 1. Clone 项目
git clone https://github.com/zervalsz/x-trend-analyzer.git
cd x-trend-analyzer

# 2. 安装依赖
pip install twscrape motor apscheduler python-dotenv openai hdbscan scikit-learn numpy

# 3. 创建 .env（不会被 commit）
# 填入以下内容：
# MONGO_URI=mongodb+srv://trendhunter_dev:PASSWORD@social-media-data.bvyh7zx.mongodb.net/
# DB_NAME=trendhunter
# OPENAI_API_KEY=sk-xxxxx

# 4. 创建 setup_account.py（不会被 commit，参考下方模板）
# 5. 运行账号设置
python setup_account.py

# 6. 生成测试数据（可选）
python generate_fake_data.py

# 7. 运行 ML pipeline
python ml_pipeline/embedder.py
python ml_pipeline/clusterer.py
python ml_pipeline/linker.py
python ml_pipeline/scorer.py
```

**setup_account.py 模板（本地创建，不要 commit）：**
```python
import asyncio
import twscrape

async def setup():
    api = twscrape.API()
    await api.pool.add_account(
        username='YOUR_USERNAME',
        password='YOUR_PASSWORD',
        email='YOUR_EMAIL',
        email_password='YOUR_APP_PASSWORD'
    )
    await api.pool.login_all()
    print('Done')

asyncio.run(setup())
```

---

## 文件结构

```
x-trend-analyzer/
├── scraper/
│   ├── __init__.py
│   ├── scraper.py          # 核心抓取类
│   ├── scheduler.py        # 定时调度
│   └── main.py             # 入口
├── ml_pipeline/
│   ├── __init__.py
│   ├── embedder.py         # OpenAI embedding 生成
│   ├── clusterer.py        # HDBSCAN 每日聚类
│   ├── linker.py           # Topic linking (核心)
│   └── scorer.py           # Trend metrics + status
├── api/                    # 待开发
│   └── __init__.py
├── generate_fake_data.py   # 测试数据生成
├── remove_fake_data.py     # 测试数据清除
├── test_scrape.py          # 单次抓取测试
├── requirements.txt
├── .env                    # 不会被 commit
├── .gitignore
└── README.md
```

---

## 注意事项

- `.env` 已加入 `.gitignore`，每次新环境需手动创建
- `setup_account.py` 已加入 `.gitignore`，每次新环境需手动创建
- `accounts.db` 已加入 `.gitignore`，twscrape 的账号状态本地存储
- 假数据清除：`python remove_fake_data.py`
- MongoDB 存储监控：定期检查 Atlas dashboard，embedding 迁移前约 3-4 个月到上限
