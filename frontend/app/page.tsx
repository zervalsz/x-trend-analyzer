"use client";

import { useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  trending: { label: "Trending", color: "text-emerald-400", bg: "bg-emerald-400/10", dot: "bg-emerald-400", border: "border-emerald-400/40" },
  emerging: { label: "Emerging", color: "text-sky-400",     bg: "bg-sky-400/10",     dot: "bg-sky-400",     border: "border-sky-400/40" },
  peak:     { label: "Peak",     color: "text-amber-400",   bg: "bg-amber-400/10",   dot: "bg-amber-400",   border: "border-amber-400/40" },
  cooling:  { label: "Cooling",  color: "text-slate-300",   bg: "bg-slate-400/10",   dot: "bg-slate-400",   border: "border-slate-500" },
};

interface Post {
  post_id: string;
  text: string;
  author: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
}

interface Topic {
  _id: string;
  date: string;
  keywords: string[];
  summary: string;
  size: number;
  posts: Post[];
}

interface Trend {
  _id: string;
  status: string;
  keywords: string[];
  summary: string;
  metrics?: {
    growth_rate?: number;
    avg_engagement?: number;
    days_tracked?: number;
    daily_sizes?: number[];
    velocity?: number;
  };
  topics?: Topic[];
}

interface Stats {
  totalPosts: number;
  embeddedPosts: number;
  totalTopics: number;
  totalTrends: number;
  activeTrends: number;
  lastScraped: string | null;
}

// ─── Pipeline config ──────────────────────────────────────────────────────────

const PIPELINE_STEPS = [
  { id: "scrape",  label: "Scrape",  sublabel: "OpenCLI + X",                   icon: "⬇", description: "Collects AI-related posts from X via browser session. 15 search queries, runs daily.", color: "#38bdf8" },
  { id: "embed",   label: "Embed",   sublabel: "text-embedding-3-small",         icon: "⬡", description: "Converts each post into a 1536-dim semantic vector via OpenAI. Stored in Supabase pgvector.", color: "#818cf8" },
  { id: "cluster", label: "Cluster", sublabel: "HDBSCAN",                        icon: "◎", description: "Groups semantically similar posts into topic clusters daily. min_cluster_size=2 to catch early signals.", color: "#fb923c" },
  { id: "link",    label: "Link",    sublabel: "cosine sim > 0.65",              icon: "⟶", description: "Connects topic clusters across days into trend chains. Coherence check (0.7) prevents topic drift.", color: "#34d399" },
  { id: "score",   label: "Score",   sublabel: "growth · velocity · engagement", icon: "▲", description: "Assigns status based on growth rate, velocity, and median engagement.", color: "#f472b6" },
];

// ─── Shared keyword tag ───────────────────────────────────────────────────────

function KwTag({ kw }: { kw: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded font-mono text-slate-200" style={{ backgroundColor: "rgb(25,38,62)", border: "1px solid rgb(45,60,85)" }}>
      {kw}
    </span>
  );
}

// ─── Pipeline Modal ───────────────────────────────────────────────────────────

function PipelineModal({ step, onClose }: { step: typeof PIPELINE_STEPS[0]; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/pipeline/${step.id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [step.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[80vh] rounded-2xl border overflow-hidden flex flex-col"
        style={{ backgroundColor: "rgb(10,18,30)", borderColor: step.color }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgb(30,45,65)" }}>
          <div className="flex items-center gap-3">
            <span className="text-xl" style={{ color: step.color }}>{step.icon}</span>
            <div>
              <div className="font-bold font-mono text-slate-100">{step.label}</div>
              <div className="text-xs font-mono text-slate-400">{step.sublabel}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xl font-mono">✕</button>
        </div>

        <div className="px-6 py-3 text-xs font-mono border-b text-slate-300" style={{ borderColor: "rgb(30,45,65)", backgroundColor: `${step.color}10` }}>
          {step.description}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {loading ? (
            <div className="text-slate-400 font-mono text-sm animate-pulse">loading data...</div>
          ) : (
            <PipelineModalContent step={step} data={data} />
          )}
        </div>
      </div>
    </div>
  );
}

function PipelineModalContent({ step, data }: { step: typeof PIPELINE_STEPS[0]; data: any }) {
  if (step.id === "scrape") {
    return (
      <div className="space-y-3">
        <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Recent posts</div>
        {data.recentPosts?.map((p: Post) => (
          <div key={p.post_id} className="rounded-lg p-3 border" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
            <div className="text-xs font-mono text-slate-400 mb-1">@{p.author}</div>
            <div className="text-sm text-slate-200 leading-relaxed mb-2">{p.text}</div>
            <div className="flex gap-4 text-xs font-mono text-slate-400">
              <span>♥ {p.likes}</span><span>↺ {p.retweets}</span>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (step.id === "embed") {
    const pct = data.total > 0 ? Math.round((data.embedded / data.total) * 100) : 0;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "total posts", value: data.total?.toLocaleString() },
            { label: "embedded", value: data.embedded?.toLocaleString() },
            { label: "pending", value: data.pending?.toLocaleString() },
          ].map((item) => (
            <div key={item.label} className="rounded-lg p-4 border text-center" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
              <div className="text-2xl font-bold font-mono" style={{ color: step.color }}>{item.value}</div>
              <div className="text-xs font-mono text-slate-400 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between text-xs font-mono text-slate-400 mb-2">
            <span>embedding progress</span><span>{pct}%</span>
          </div>
          <div className="h-2 rounded-full" style={{ backgroundColor: "rgb(30,45,65)" }}>
            <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: step.color }} />
          </div>
        </div>
        <div className="text-xs font-mono text-slate-300 p-3 rounded-lg border" style={{ borderColor: "rgb(30,45,65)", backgroundColor: "rgb(8,14,26)" }}>
          model: text-embedding-3-small · dims: 1536 · storage: Supabase pgvector
        </div>
      </div>
    );
  }

  if (step.id === "cluster") {
    const byDate: Record<string, any[]> = {};
    data.topics?.forEach((t: any) => {
      const d = new Date(t.date).toLocaleDateString();
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(t);
    });
    return (
      <div className="space-y-4">
        <div className="text-xs font-mono text-slate-400 mb-2">{data.topics?.length} clusters · grouped by day</div>
        {Object.entries(byDate).reverse().map(([date, topics]) => (
          <div key={date}>
            <div className="text-xs font-mono mb-2" style={{ color: step.color }}>{date}</div>
            <div className="space-y-2">
              {topics.map((t: any) => (
                <div key={t._id} className="rounded-lg p-3 border" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex gap-1.5 flex-wrap">
                      {t.keywords?.length > 0
                        ? t.keywords.map((kw: string) => <KwTag key={kw} kw={kw} />)
                        : <span className="text-xs text-slate-500 font-mono">noise cluster</span>}
                    </div>
                    <span className="text-xs font-mono text-slate-400 shrink-0 ml-2">{t.size} posts</span>
                  </div>
                  {t.summary && <div className="text-xs text-slate-300 mt-1 leading-relaxed">{t.summary}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (step.id === "link") {
    return (
      <div className="space-y-3">
        <div className="text-xs font-mono text-slate-400 mb-2">{data.trends?.length} trend chains</div>
        {data.trends?.map((t: any) => (
          <div key={t._id} className="rounded-lg p-3 border flex items-center justify-between" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
            <div>
              <div className="flex gap-1.5 flex-wrap mb-1">
                {t.keywords?.length > 0
                  ? t.keywords.map((kw: string) => <KwTag key={kw} kw={kw} />)
                  : <span className="text-xs text-slate-500 font-mono">no keywords yet</span>}
              </div>
              <div className="text-xs font-mono text-slate-400">{t.topic_count} topics linked</div>
            </div>
            <div className={`text-xs font-mono px-2 py-0.5 rounded-full border ${STATUS_CONFIG[t.status]?.bg} ${STATUS_CONFIG[t.status]?.color} ${STATUS_CONFIG[t.status]?.border}`}>
              {t.status}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (step.id === "score") {
    return (
      <div className="space-y-3">
        <div className="text-xs font-mono text-slate-400 mb-2">scoring: growth rate · velocity · median engagement</div>
        {data.trends?.map((t: any) => (
          <div key={t._id} className="rounded-lg p-3 border" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-1.5 flex-wrap">
                {t.keywords?.slice(0, 3).map((kw: string) => <KwTag key={kw} kw={kw} />)}
              </div>
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full border ${STATUS_CONFIG[t.status]?.bg} ${STATUS_CONFIG[t.status]?.color} ${STATUS_CONFIG[t.status]?.border}`}>
                {t.status}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div><span className="text-slate-400">growth </span><span style={{ color: step.color }}>{t.metrics?.growth_rate != null ? `${(t.metrics.growth_rate * 100).toFixed(0)}%` : "—"}</span></div>
              <div><span className="text-slate-400">velocity </span><span style={{ color: step.color }}>{t.metrics?.velocity ?? "—"}</span></div>
              <div><span className="text-slate-400">engagement </span><span style={{ color: step.color }}>{t.metrics?.avg_engagement?.toFixed(0) ?? "—"}</span></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

// ─── Trend Drawer ─────────────────────────────────────────────────────────────

function TrendDrawer({ trendId, onClose }: { trendId: string; onClose: () => void }) {
  const [trend, setTrend] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/trends/${trendId}`)
      .then((r) => r.json())
      .then((d) => { setTrend(d); setLoading(false); });
  }, [trendId]);

  const config = trend ? (STATUS_CONFIG[trend.status] || STATUS_CONFIG.emerging) : STATUS_CONFIG.emerging;
  const metrics = trend?.metrics ?? {};
  const dailySizes = metrics.daily_sizes ?? [];
  const max = dailySizes.length > 0 ? Math.max(...dailySizes) : 1;
  const growthRate = metrics.growth_rate ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl h-full border-l overflow-y-auto"
        style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm animate-pulse">
            loading trend data...
          </div>
        ) : trend ? (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: "rgb(30,45,65)", backgroundColor: "rgba(10,18,30,0.97)" }}>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                  {config.label}
                </span>
                {metrics.days_tracked && (
                  <span className="text-xs font-mono text-slate-400">{metrics.days_tracked}d tracked</span>
                )}
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-200 font-mono text-lg">✕</button>
            </div>

            <div className="px-6 py-5 space-y-6">
              {/* Keywords */}
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">Keywords</div>
                <div className="flex flex-wrap gap-2">
                  {(trend.keywords ?? []).map((kw) => (
                    <span key={kw} className="text-sm px-3 py-1 rounded-lg font-mono text-slate-200" style={{ backgroundColor: "rgb(20,32,52)", border: "1px solid rgb(40,58,85)" }}>
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              {trend.summary && (
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">Summary</div>
                  <p className="text-sm text-slate-200 leading-relaxed">{trend.summary}</p>
                </div>
              )}

              {/* Metrics */}
              {metrics.days_tracked && (
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Metrics</div>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "growth rate", value: `${growthRate >= 0 ? "+" : ""}${(growthRate * 100).toFixed(0)}%`, positive: growthRate >= 0 },
                      { label: "avg engagement", value: metrics.avg_engagement?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—", positive: true },
                      { label: "velocity", value: `${(metrics.velocity ?? 0) >= 0 ? "+" : ""}${metrics.velocity ?? "—"}`, positive: (metrics.velocity ?? 0) >= 0 },
                      { label: "days tracked", value: `${metrics.days_tracked}d`, positive: true },
                    ].map((m) => (
                      <div key={m.label} className="rounded-lg p-3 border" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
                        <div className="text-xs font-mono text-slate-400 mb-1">{m.label}</div>
                        <div className={`text-lg font-bold font-mono ${m.positive ? config.color : "text-red-400"}`}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Sparkline */}
              {dailySizes.length > 1 && (
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Daily Volume</div>
                  <div className="flex items-end gap-1 h-16 rounded-lg p-3 border" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
                    {dailySizes.map((size, i) => {
                      const height = max > 0 ? (size / max) * 100 : 0;
                      const isLast = i === dailySizes.length - 1;
                      return (
                        <div key={i} className="flex-1 rounded-sm" style={{
                          height: `${Math.max(height, 6)}%`,
                          backgroundColor: isLast ? "rgb(56,189,248)" : "rgb(30,48,75)",
                          opacity: isLast ? 1 : 0.4 + (i / dailySizes.length) * 0.4,
                        }} title={`Day ${i + 1}: ${size} posts`} />
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs font-mono text-slate-400 mt-1 px-1">
                    <span>day 1</span><span>today</span>
                  </div>
                </div>
              )}

              {/* Topic timeline */}
              {trend.topics && trend.topics.length > 0 && (
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">
                    Topic Timeline · {trend.topics.length} days
                  </div>
                  <div className="space-y-2">
                    {trend.topics.map((topic) => {
                      const isExpanded = expandedTopic === topic._id;
                      const dateStr = new Date(topic.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
                      return (
                        <div key={topic._id} className="rounded-lg border overflow-hidden" style={{ borderColor: "rgb(30,45,65)" }}>
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
                            style={{ backgroundColor: "rgb(10,18,30)" }}
                            onClick={() => setExpandedTopic(isExpanded ? null : topic._id)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-slate-400 shrink-0">{dateStr}</span>
                              <div className="flex gap-1.5 flex-wrap">
                                {topic.keywords?.length > 0
                                  ? topic.keywords.map((kw) => <KwTag key={kw} kw={kw} />)
                                  : <span className="text-xs text-slate-500 font-mono">no keywords</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-xs font-mono text-slate-400">{topic.size} posts</span>
                              <span className="text-slate-400 font-mono text-xs">{isExpanded ? "▲" : "▼"}</span>
                            </div>
                          </button>

                          {isExpanded && (
                            <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "rgb(30,45,65)", backgroundColor: "rgb(8,14,26)" }}>
                              {topic.summary && (
                                <p className="text-xs text-slate-300 leading-relaxed">{topic.summary}</p>
                              )}
                              {topic.posts?.length > 0 && (
                                <div className="space-y-2">
                                  <div className="text-xs font-mono text-slate-400">sample posts</div>
                                  {topic.posts.map((post) => (
                                    <div key={post.post_id} className="rounded-lg p-3 border" style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}>
                                      <div className="text-xs font-mono text-slate-400 mb-1">@{post.author}</div>
                                      <div className="text-xs text-slate-200 leading-relaxed mb-2">{post.text}</div>
                                      <div className="flex gap-3 text-xs font-mono text-slate-400">
                                        <span>♥ {post.likes}</span>
                                        <span>↺ {post.retweets}</span>
                                        <span>💬 {post.replies}</span>
                                        {post.views > 0 && <span>👁 {post.views.toLocaleString()}</span>}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 font-mono text-sm">trend not found</div>
        )}
      </div>
    </div>
  );
}

// ─── Pipeline Visualizer ──────────────────────────────────────────────────────

function PipelineVisualizer({ stats, onStepClick }: { stats: Stats; onStepClick: (step: typeof PIPELINE_STEPS[0]) => void }) {
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);

  const stepValues: Record<string, { value: string; unit: string }> = {
    scrape:  { value: stats.totalPosts.toLocaleString(),    unit: "posts collected" },
    embed:   { value: stats.embeddedPosts.toLocaleString(), unit: "vectors stored" },
    cluster: { value: stats.totalTopics.toLocaleString(),   unit: "topic clusters" },
    link:    { value: stats.totalTrends.toLocaleString(),   unit: "trend chains" },
    score:   { value: stats.activeTrends.toLocaleString(),  unit: "active trends" },
  };

  return (
    <div className="relative mb-10">
      <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-5">▶ Pipeline · click to explore</div>
      <div className="flex items-stretch gap-0">
        {PIPELINE_STEPS.map((step, i) => {
          const isHovered = hoveredStep === step.id;
          const val = stepValues[step.id];
          return (
            <div key={step.id} className="flex items-center flex-1">
              <button
                className="flex-1 text-left cursor-pointer"
                onMouseEnter={() => setHoveredStep(step.id)}
                onMouseLeave={() => setHoveredStep(null)}
                onClick={() => onStepClick(step)}
              >
                <div
                  className="relative border rounded-lg p-4 transition-all duration-200 w-full h-full"
                  style={{
                    borderColor: isHovered ? step.color : "rgb(30,45,65)",
                    backgroundColor: isHovered ? `${step.color}14` : "rgb(10,18,30)",
                    boxShadow: isHovered ? `0 0 24px ${step.color}20` : "none",
                  }}
                >
                  <div className="text-xs font-mono mb-2" style={{ color: step.color, opacity: 0.6 }}>0{i + 1}</div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base" style={{ color: step.color }}>{step.icon}</span>
                    <span className="text-sm font-semibold text-slate-100">{step.label}</span>
                  </div>
                  <div className="text-xs text-slate-400 font-mono mb-3">{step.sublabel}</div>
                  <div className="text-lg font-bold font-mono" style={{ color: step.color }}>{val.value}</div>
                  <div className="text-xs text-slate-400">{val.unit}</div>
                  {isHovered && (
                    <div className="absolute bottom-2 right-2 text-xs font-mono" style={{ color: step.color, opacity: 0.6 }}>click ↗</div>
                  )}
                </div>
              </button>
              {i < PIPELINE_STEPS.length - 1 && (
                <div className="flex items-center px-1 shrink-0">
                  <svg width="24" height="12" viewBox="0 0 24 12">
                    <line x1="0" y1="6" x2="18" y2="6" stroke="rgb(55,75,100)" strokeWidth="1.5" strokeDasharray="3 2" />
                    <polygon points="18,2 24,6 18,10" fill="rgb(55,75,100)" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Trend Card ───────────────────────────────────────────────────────────────

function TrendCard({ trend, index, onClick }: { trend: Trend; index: number; onClick: () => void }) {
  const config = STATUS_CONFIG[trend.status] || STATUS_CONFIG.emerging;
  const metrics = trend.metrics ?? {};
  const avgEngagement = metrics.avg_engagement ?? 0;
  const growthRate = metrics.growth_rate ?? 0;
  const daysTracked = metrics.days_tracked ?? null;
  const velocity = metrics.velocity ?? 0;
  const dailySizes = metrics.daily_sizes ?? [];
  const max = dailySizes.length > 0 ? Math.max(...dailySizes) : 1;

  return (
    <button
      className="relative rounded-xl p-5 border transition-all duration-200 hover:translate-y-[-2px] hover:border-slate-500 flex flex-col text-left w-full cursor-pointer"
      style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs font-mono">#{String(index + 1).padStart(2, "0")}</span>
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {avgEngagement > 0 && (
            <div className="text-right">
              <div className="text-xs text-slate-400 font-mono">engagement</div>
              <div className={`text-sm font-mono font-bold ${config.color}`}>
                {avgEngagement.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          )}
          <span className="text-slate-500 font-mono text-xs">↗</span>
        </div>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(trend.keywords ?? []).map((kw) => <KwTag key={kw} kw={kw} />)}
      </div>

      {/* Summary */}
      {trend.summary && (
        <p className="text-xs text-slate-300 leading-relaxed mb-4 flex-1 line-clamp-2">{trend.summary}</p>
      )}

      {/* Metrics */}
      {daysTracked && (
        <div className="grid grid-cols-3 gap-3 pt-3 border-t mb-3" style={{ borderColor: "rgb(30,45,65)" }}>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 font-mono">growth</div>
            <div className={`text-sm font-mono font-bold ${growthRate >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {growthRate >= 0 ? "+" : ""}{(growthRate * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 font-mono">tracked</div>
            <div className="text-sm font-mono font-bold text-slate-200">{daysTracked}d</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 font-mono">velocity</div>
            <div className="text-sm font-mono font-bold text-slate-200">{velocity >= 0 ? "+" : ""}{velocity}</div>
          </div>
        </div>
      )}

      {/* Sparkline */}
      {dailySizes.length > 1 && (
        <div>
          <div className="text-xs text-slate-400 font-mono mb-1.5">daily volume</div>
          <div className="flex items-end gap-0.5 h-6">
            {dailySizes.map((size, i) => {
              const height = max > 0 ? (size / max) * 100 : 0;
              const isLast = i === dailySizes.length - 1;
              return (
                <div key={i} className="flex-1 rounded-sm" style={{
                  height: `${Math.max(height, 8)}%`,
                  backgroundColor: isLast ? "rgb(56,189,248)" : "rgb(30,48,75)",
                  opacity: isLast ? 1 : 0.35 + (i / dailySizes.length) * 0.45,
                }} />
              );
            })}
          </div>
        </div>
      )}

      {!daysTracked && (
        <div className="pt-3 border-t" style={{ borderColor: "rgb(30,45,65)" }}>
          <span className="text-xs font-mono text-slate-400 px-2 py-0.5 rounded" style={{ backgroundColor: "rgb(20,32,52)" }}>
            ◉ early signal · day 1
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePipelineStep, setActivePipelineStep] = useState<typeof PIPELINE_STEPS[0] | null>(null);
  const [activeTrendId, setActiveTrendId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/trends").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ]).then(([trendsData, statsData]) => {
      setTrends(Array.isArray(trendsData) ? trendsData : []);
      setStats(statsData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setActivePipelineStep(null); setActiveTrendId(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const statusCounts = Object.keys(STATUS_CONFIG).reduce((acc, key) => {
    acc[key] = trends.filter((t) => t.status === key).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: "rgb(8,14,26)" }}>
      <header className="border-b px-8 py-4 sticky top-0 z-10 backdrop-blur-sm" style={{ borderColor: "rgb(25,38,60)", backgroundColor: "rgba(8,14,26,0.95)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sky-400 text-xs font-mono">◈</span>
              <h1 className="text-base font-bold tracking-tight font-mono text-slate-100">TrendRadar</h1>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              X → noise filter → embedding → HDBSCAN → trend chains → scoring
            </p>
          </div>
          {stats && (
            <div className="flex items-center gap-6 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400">live</span>
              </div>
              <span className="text-slate-400">
                <span className="text-slate-200">{stats.totalPosts.toLocaleString()}</span> posts
              </span>
              {stats.lastScraped && (
                <span className="text-slate-400">
                  scraped <span className="text-slate-200">{new Date(stats.lastScraped).toLocaleDateString()}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm font-mono animate-pulse">
            loading pipeline data...
          </div>
        ) : (
          <>
            {stats && <PipelineVisualizer stats={stats} onStepClick={setActivePipelineStep} />}

            <div className="flex items-center gap-4 mb-7">
              <div className="flex-1 h-px" style={{ backgroundColor: "rgb(25,38,60)" }} />
              <div className="text-xs font-mono text-slate-400 flex items-center gap-3">
                <span>trends output</span>
                {Object.entries(STATUS_CONFIG).map(([key, config]) =>
                  statusCounts[key] > 0 ? (
                    <span key={key} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      <span className="text-slate-400">{statusCounts[key]} {config.label.toLowerCase()}</span>
                    </span>
                  ) : null
                )}
              </div>
              <div className="flex-1 h-px" style={{ backgroundColor: "rgb(25,38,60)" }} />
            </div>

            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 font-mono text-sm">
                <div>no trends detected</div>
                <div className="text-xs mt-1 text-slate-500">run ml pipeline after collecting data</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {trends.map((trend, i) => (
                  <TrendCard key={trend._id} trend={trend} index={i} onClick={() => setActiveTrendId(trend._id)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {activePipelineStep && <PipelineModal step={activePipelineStep} onClose={() => setActivePipelineStep(null)} />}
      {activeTrendId && <TrendDrawer trendId={activeTrendId} onClose={() => setActiveTrendId(null)} />}
    </div>
  );
}
