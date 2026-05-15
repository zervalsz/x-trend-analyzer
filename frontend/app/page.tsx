"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

interface HotTopic {
  _id: string;
  keywords: string[];
  summary: string;
  size: number;
  trend_id: string | null;
  trend_status: string;
}

interface DailyHot {
  date: string;
  topics: HotTopic[];
}

// ─── Shared keyword tag ───────────────────────────────────────────────────────

function KwTag({ kw }: { kw: string }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded font-mono text-slate-200" style={{ backgroundColor: "rgb(25,38,62)", border: "1px solid rgb(45,60,85)" }}>
      {kw}
    </span>
  );
}

// ─── Daily Post Chart ─────────────────────────────────────────────────────────

function DailyPostChart({ topics }: { topics: Topic[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!topics || topics.length === 0) return null;

  const sorted = [...topics]
    .filter((t) => t.size > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) return null;

  const maxSize = Math.max(...sorted.map((t) => t.size));
  const minSize = Math.min(...sorted.map((t) => t.size));

  const VW = 400;
  const PAD_X = 16;
  const PAD_TOP = 24;   // room for tooltip above top dot
  const PAD_BTM = 24;   // room for date labels
  const CHART_H = 90;
  const VH = PAD_TOP + CHART_H + PAD_BTM;

  const getX = (i: number) =>
    sorted.length === 1
      ? VW / 2
      : PAD_X + (i / (sorted.length - 1)) * (VW - PAD_X * 2);

  const getY = (size: number) => {
    if (maxSize === minSize) return PAD_TOP + CHART_H / 2;
    return PAD_TOP + CHART_H - ((size - minSize) / (maxSize - minSize)) * CHART_H;
  };

  const linePoints = sorted.map((t, i) => `${getX(i)},${getY(t.size)}`).join(" ");

  const areaPath =
    sorted.length > 1
      ? `M ${getX(0)},${PAD_TOP + CHART_H} ` +
        sorted.map((t, i) => `L ${getX(i)},${getY(t.size)}`).join(" ") +
        ` L ${getX(sorted.length - 1)},${PAD_TOP + CHART_H} Z`
      : "";

  // Only label every Nth date to avoid crowding
  const labelEvery = sorted.length > 10 ? 3 : sorted.length > 6 ? 2 : 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", display: "block" }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Area fill under line */}
        {areaPath && (
          <path d={areaPath} fill="rgb(56,189,248)" opacity={0.07} />
        )}

        {/* Line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke="rgb(56,189,248)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Per-point hover targets + dots + labels */}
        {sorted.map((topic, i) => {
          const cx = getX(i);
          const cy = getY(topic.size);
          const isHov = hovered === i;
          const dateStr = new Date(topic.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });

          // Clamp tooltip box so it doesn't overflow left/right
          const ttW = 72;
          const ttX = Math.max(2, Math.min(cx - ttW / 2, VW - ttW - 2));

          return (
            <g key={topic._id}>
              {/* Wide invisible hover band */}
              <rect
                x={cx - (VW / sorted.length) / 2}
                y={PAD_TOP}
                width={VW / sorted.length}
                height={CHART_H}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHovered(i)}
              />

              {/* Vertical guide */}
              {isHov && (
                <line
                  x1={cx} y1={PAD_TOP}
                  x2={cx} y2={PAD_TOP + CHART_H}
                  stroke="rgb(56,189,248)"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                  opacity={0.35}
                />
              )}

              {/* Dot */}
              <circle
                cx={cx} cy={cy}
                r={isHov ? 5 : 3}
                fill={isHov ? "rgb(56,189,248)" : "rgb(15,25,45)"}
                stroke="rgb(56,189,248)"
                strokeWidth={isHov ? 2 : 1.5}
              />

              {/* Tooltip */}
              {isHov && (
                <g>
                  <rect
                    x={ttX} y={cy - 42}
                    width={ttW} height={34}
                    rx={4}
                    fill="rgb(20,32,52)"
                    stroke="rgb(45,62,88)"
                    strokeWidth={1}
                  />
                  <text x={ttX + ttW / 2} y={cy - 26} textAnchor="middle" fontSize={11} fontFamily="monospace" fill="rgb(56,189,248)">
                    {topic.size} posts
                  </text>
                  <text x={ttX + ttW / 2} y={cy - 13} textAnchor="middle" fontSize={10} fontFamily="monospace" fill="rgb(100,116,139)">
                    {dateStr}
                  </text>
                </g>
              )}

              {/* Date label on X axis */}
              {i % labelEvery === 0 && (
                <text
                  x={cx} y={PAD_TOP + CHART_H + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="monospace"
                  fill={isHov ? "rgb(148,163,184)" : "rgb(71,85,105)"}
                >
                  {dateStr}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Trend Modal ──────────────────────────────────────────────────────────────

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
  const growthRate = metrics.growth_rate ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-4xl max-h-[88vh] rounded-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 font-mono text-sm animate-pulse">
            loading trend data...
          </div>
        ) : trend ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0" style={{ borderColor: "rgb(30,45,65)" }}>
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                  {config.label}
                </span>
                {metrics.days_tracked && (
                  <span className="text-xs font-mono text-slate-400">{metrics.days_tracked}d tracked</span>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {(trend.keywords ?? []).map((kw) => <KwTag key={kw} kw={kw} />)}
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-200 font-mono text-lg shrink-0 ml-4">✕</button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1">
              {/* Two-column layout: left = summary + chart, right = timeline */}
              <div className="grid grid-cols-5 divide-x" style={{ borderColor: "rgb(30,45,65)" }}>

                {/* Left column */}
                <div className="col-span-3 px-6 py-5 space-y-6">
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

                  {/* Daily post chart */}
                  {trend.topics && trend.topics.length > 0 && (
                    <div>
                      <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Daily Posts</div>
                      <div className="rounded-lg p-4 border" style={{ backgroundColor: "rgb(8,14,26)", borderColor: "rgb(30,45,65)" }}>
                        <DailyPostChart topics={trend.topics} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column: topic timeline */}
                <div className="col-span-2 px-5 py-5 border-l" style={{ borderColor: "rgb(30,45,65)" }}>
                  {trend.topics && trend.topics.length > 0 ? (
                    <>
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
                                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                                style={{ backgroundColor: "rgb(10,18,30)" }}
                                onClick={() => setExpandedTopic(isExpanded ? null : topic._id)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-xs font-mono text-slate-400 shrink-0">{dateStr}</span>
                                  <div className="flex gap-1 flex-wrap">
                                    {topic.keywords?.length > 0
                                      ? topic.keywords.slice(0, 2).map((kw) => <KwTag key={kw} kw={kw} />)
                                      : <span className="text-xs text-slate-500 font-mono">no keywords</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                  <span className="text-xs font-mono text-slate-400">{topic.size}</span>
                                  <span className="text-slate-400 font-mono text-xs">{isExpanded ? "▲" : "▼"}</span>
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="border-t px-3 py-3 space-y-2" style={{ borderColor: "rgb(30,45,65)", backgroundColor: "rgb(8,14,26)" }}>
                                  {topic.summary && (
                                    <p className="text-xs text-slate-300 leading-relaxed">{topic.summary}</p>
                                  )}
                                  {topic.posts?.length > 0 && (
                                    <div className="space-y-2 mt-2">
                                      <div className="text-xs font-mono text-slate-400">sample posts</div>
                                      {topic.posts.map((post) => (
                                        <div key={post.post_id} className="rounded-lg p-2.5 border" style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}>
                                          <div className="text-xs font-mono text-slate-400 mb-1">@{post.author}</div>
                                          <div className="text-xs text-slate-200 leading-relaxed mb-1.5">{post.text}</div>
                                          <div className="flex gap-3 text-xs font-mono text-slate-400">
                                            <span>♥ {post.likes}</span>
                                            <span>↺ {post.retweets}</span>
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
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 font-mono text-xs">
                      no topic data
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-slate-400 font-mono text-sm">trend not found</div>
        )}
      </div>
    </div>
  );
}

// ─── Daily Hot Section ────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  trending: "bg-emerald-400",
  emerging: "bg-sky-400",
  peak:     "bg-amber-400",
  cooling:  "bg-slate-400",
};

function DailyHotSection({ days, onTopicClick }: { days: DailyHot[]; onTopicClick: (trendId: string) => void }) {
  if (!days.length) return null;
  const shown = days.slice(0, 5);

  return (
    <div className="mb-8">
      <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-3">Daily Hot Topics</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
        {shown.map(({ date, topics }) => {
          const dateLabel = new Date(date + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
          const isToday = date === new Date().toISOString().slice(0, 10);
          return (
            <div
              key={date}
              className="rounded-xl border flex flex-col"
              style={{
                backgroundColor: isToday ? "rgb(12,22,38)" : "rgb(10,18,30)",
                borderColor: isToday ? "rgba(56,189,248,0.3)" : "rgb(30,45,65)",
              }}
            >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: "rgb(30,45,65)" }}>
                <span className="text-xs font-mono font-bold" style={{ color: isToday ? "rgb(56,189,248)" : "rgb(148,163,184)" }}>
                  {dateLabel}
                </span>
                {isToday && <span className="text-xs font-mono text-sky-400 opacity-60">today</span>}
              </div>
              <div className="flex flex-col">
                {topics.map((topic, i) => (
                  <button
                    key={topic._id}
                    className="flex items-start gap-2 px-3 py-2.5 text-left hover:bg-white/5 transition-colors w-full border-t"
                    style={{ borderColor: "rgb(20,32,52)" }}
                    onClick={() => topic.trend_id && onTopicClick(topic.trend_id)}
                    disabled={!topic.trend_id}
                  >
                    <span className="text-xs font-mono text-slate-500 mt-0.5 shrink-0">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-200 leading-snug line-clamp-2">{topic.summary}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[topic.trend_status] ?? STATUS_DOT.emerging}`} />
                        <span className="text-xs font-mono text-slate-500">{topic.size} posts</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
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

      {/* Summary as title */}
      {trend.summary && (
        <p className="text-sm text-slate-100 leading-snug mb-4 flex-1 line-clamp-3 font-medium">{trend.summary}</p>
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

const CATEGORIES: { key: string; label: string }[] = [
  { key: "trending", label: "Trending" },
  { key: "peak",     label: "Peak"     },
  { key: "emerging", label: "Emerging" },
  { key: "cooling",  label: "Cooling"  },
];

export default function Dashboard() {
  const router = useRouter();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyHot, setDailyHot] = useState<DailyHot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/trends").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/daily-hot?days=5&top=5").then((r) => r.json()),
    ]).then(([trendsData, statsData, hotData]) => {
      setTrends(Array.isArray(trendsData) ? trendsData : []);
      setStats(statsData);
      setDailyHot(Array.isArray(hotData) ? hotData : []);
      setLoading(false);
    });
  }, []);

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
            loading...
          </div>
        ) : (
          <>
            {dailyHot.length > 0 && (
              <DailyHotSection
                days={dailyHot}
                onTopicClick={(trendId) => router.push(`/trends/${trendId}`)}
              />
            )}

            {/* Filter bar */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1 h-px" style={{ backgroundColor: "rgb(25,38,60)" }} />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFilter(null)}
                  className={`text-xs font-mono px-3 py-1 rounded-full border transition-colors ${filter === null ? "text-slate-100 border-slate-500 bg-white/10" : "text-slate-400 border-transparent hover:border-slate-600"}`}
                >
                  all
                </button>
                {CATEGORIES.map(({ key, label }) => {
                  const cfg = STATUS_CONFIG[key];
                  const count = trends.filter((t) => t.status === key).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setFilter(filter === key ? null : key)}
                      className={`text-xs font-mono px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${filter === key ? `${cfg.bg} ${cfg.color} ${cfg.border}` : "text-slate-400 border-transparent hover:border-slate-600"}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {label.toLowerCase()} {count}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 h-px" style={{ backgroundColor: "rgb(25,38,60)" }} />
            </div>

            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 font-mono text-sm">
                <div>no trends detected</div>
                <div className="text-xs mt-1 text-slate-500">run ml pipeline after collecting data</div>
              </div>
            ) : filter ? (
              /* Filtered: 3-col grid of one category */
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {trends.filter((t) => t.status === filter).map((trend, i) => (
                  <TrendCard key={trend._id} trend={trend} index={i} onClick={() => router.push(`/trends/${trend._id}`)} />
                ))}
              </div>
            ) : (
              /* Default: one column per category */
              <div className="grid gap-6" style={{ gridTemplateColumns: `repeat(${CATEGORIES.filter(c => trends.some(t => t.status === c.key)).length}, 1fr)` }}>
                {CATEGORIES.map(({ key, label }) => {
                  const cfg = STATUS_CONFIG[key];
                  const col = trends.filter((t) => t.status === key);
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: "rgb(25,38,60)" }}>
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span className={`text-xs font-mono font-bold ${cfg.color}`}>{label}</span>
                        <span className="text-xs font-mono text-slate-500">{col.length}</span>
                      </div>
                      {col.length === 0 ? (
                        <div className="text-xs font-mono text-slate-500 py-4 text-center">none</div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          {col.map((trend, i) => (
                            <TrendCard key={trend._id} trend={trend} index={i} onClick={() => router.push(`/trends/${trend._id}`)} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

    </div>
  );
}
