"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string; border: string }> = {
  trending: { label: "Trending", color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-500", border: "border-emerald-200" },
  emerging: { label: "Emerging", color: "text-sky-700",     bg: "bg-sky-50",      dot: "bg-sky-500",     border: "border-sky-200"     },
  peak:     { label: "Peak",     color: "text-amber-700",   bg: "bg-amber-50",    dot: "bg-amber-500",   border: "border-amber-200"   },
  cooling:  { label: "Cooling",  color: "text-slate-500",   bg: "bg-slate-100",   dot: "bg-slate-400",   border: "border-slate-300"   },
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
  last_topic_date?: string;
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

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
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
  const PAD_TOP = 24;
  const PAD_BTM = 24;
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

  const labelEvery = sorted.length > 10 ? 3 : sorted.length > 6 ? 2 : 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: "100%", display: "block" }}
        onMouseLeave={() => setHovered(null)}
      >
        {areaPath && (
          <path d={areaPath} fill="rgb(14,165,233)" opacity={0.08} />
        )}

        <polyline
          points={linePoints}
          fill="none"
          stroke="rgb(14,165,233)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {sorted.map((topic, i) => {
          const cx = getX(i);
          const cy = getY(topic.size);
          const isHov = hovered === i;
          const dateStr = new Date(topic.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          });

          const ttW = 72;
          const ttX = Math.max(2, Math.min(cx - ttW / 2, VW - ttW - 2));

          return (
            <g key={topic._id}>
              <rect
                x={cx - (VW / sorted.length) / 2}
                y={PAD_TOP}
                width={VW / sorted.length}
                height={CHART_H}
                fill="transparent"
                style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHovered(i)}
              />

              {isHov && (
                <line
                  x1={cx} y1={PAD_TOP}
                  x2={cx} y2={PAD_TOP + CHART_H}
                  stroke="rgb(14,165,233)"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                  opacity={0.35}
                />
              )}

              <circle
                cx={cx} cy={cy}
                r={isHov ? 5 : 3}
                fill={isHov ? "rgb(14,165,233)" : "#ffffff"}
                stroke="rgb(14,165,233)"
                strokeWidth={isHov ? 2 : 1.5}
              />

              {isHov && (
                <g>
                  <rect
                    x={ttX} y={cy - 42}
                    width={ttW} height={34}
                    rx={4}
                    fill="#f8fafc"
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text x={ttX + ttW / 2} y={cy - 26} textAnchor="middle" fontSize={11} fontFamily="monospace" fill="rgb(14,165,233)">
                    {topic.size} posts
                  </text>
                  <text x={ttX + ttW / 2} y={cy - 13} textAnchor="middle" fontSize={10} fontFamily="monospace" fill="rgb(100,116,139)">
                    {dateStr}
                  </text>
                </g>
              )}

              {i % labelEvery === 0 && (
                <text
                  x={cx} y={PAD_TOP + CHART_H + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="monospace"
                  fill={isHov ? "rgb(71,85,105)" : "rgb(148,163,184)"}
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

// ─── Daily Hot Section ────────────────────────────────────────────────────────

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
                backgroundColor: isToday ? "#f0f9ff" : "#ffffff",
                borderColor: isToday ? "rgba(14,165,233,0.4)" : "#e2e8f0",
              }}
            >
              <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: isToday ? "rgba(14,165,233,0.2)" : "#e2e8f0" }}>
                <span className="text-xs font-mono font-bold" style={{ color: isToday ? "rgb(14,165,233)" : "rgb(71,85,105)" }}>
                  {dateLabel}
                </span>
                {isToday && <span className="text-xs font-mono text-sky-500 opacity-70">today</span>}
              </div>
              <div className="flex flex-col">
                {topics.map((topic, i) => {
                  const cfg = STATUS_CONFIG[topic.trend_status] ?? STATUS_CONFIG.emerging;
                  return (
                    <button
                      key={topic._id}
                      className="flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors w-full border-t"
                      style={{ borderColor: "#f1f5f9" }}
                      onClick={() => topic.trend_id && onTopicClick(topic.trend_id)}
                      disabled={!topic.trend_id}
                    >
                      <span className="text-xs font-mono text-slate-400 mt-0.5 shrink-0">#{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-700 leading-snug line-clamp-2 mb-1.5">{topic.summary}</p>
                        <div className="flex items-center gap-2">
                          {topic.trend_status !== "cooling" && (
                            <span className={`inline-flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                              <span className={`w-1 h-1 rounded-full ${cfg.dot}`} />
                              {cfg.label}
                            </span>
                          )}
                          <span className="text-xs font-mono text-slate-400">{topic.size} posts</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
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
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
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
      className="relative rounded-xl p-5 border transition-all duration-200 hover:translate-y-[-2px] hover:shadow-md hover:border-slate-300 flex flex-col text-left w-full cursor-pointer bg-white"
      style={{ borderColor: "#e2e8f0" }}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs font-mono">#{String(index + 1).padStart(2, "0")}</span>
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
          <span className="text-slate-400 font-mono text-xs">↗</span>
        </div>
      </div>

      {trend.last_topic_date && (
        <div className="text-xs font-mono text-slate-400 mb-2">last seen {fmtDate(trend.last_topic_date)}</div>
      )}

      {/* Summary as title */}
      {trend.summary && (
        <p className="text-sm text-slate-800 leading-snug mb-4 flex-1 line-clamp-3 font-medium">{trend.summary}</p>
      )}

      {/* Metrics */}
      {daysTracked && (
        <div className="grid grid-cols-3 gap-3 pt-3 border-t mb-3" style={{ borderColor: "#e2e8f0" }}>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 font-mono">growth</div>
            <div className={`text-sm font-mono font-bold ${growthRate >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {growthRate >= 0 ? "+" : ""}{(growthRate * 100).toFixed(0)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 font-mono">tracked</div>
            <div className="text-sm font-mono font-bold text-slate-700">{daysTracked}d</div>
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-0.5 font-mono">velocity</div>
            <div className="text-sm font-mono font-bold text-slate-700">{velocity >= 0 ? "+" : ""}{velocity}</div>
          </div>
        </div>
      )}

      {/* Sparkline */}
      {dailySizes.length > 1 && (
        <div>
          <div className="text-xs text-slate-400 font-mono mb-1.5">daily volume</div>
          <div className="flex items-end gap-0.5 h-6 relative">
            {dailySizes.map((size, i) => {
              const height = max > 0 ? (size / max) * 100 : 0;
              const isLast = i === dailySizes.length - 1;
              const isHov = hoveredBar === i;
              return (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${Math.max(height, 8)}%`,
                    backgroundColor: isHov ? "rgb(14,165,233)" : isLast ? "rgb(14,165,233)" : "#e2e8f0",
                    opacity: isHov ? 1 : isLast ? 1 : 0.4 + (i / dailySizes.length) * 0.5,
                  }}
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                />
              );
            })}
            {hoveredBar !== null && (
              <div className="absolute -top-6 left-0 right-0 flex justify-center pointer-events-none">
                <span className="bg-white border border-slate-200 rounded px-1.5 py-0.5 shadow-sm" style={{ fontSize: "10px", fontFamily: "monospace", color: "rgb(71,85,105)" }}>
                  {dailySizes[hoveredBar]} posts
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {!daysTracked && (
        <div className="pt-3 border-t" style={{ borderColor: "#e2e8f0" }}>
          <span className="text-xs font-mono text-slate-500 px-2 py-0.5 rounded" style={{ backgroundColor: "#f1f5f9" }}>
            ◉ early signal · day 1
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const CATEGORIES: { key: string; label: string }[] = [
  { key: "emerging", label: "Emerging" },
  { key: "trending", label: "Trending" },
  { key: "peak",     label: "Peak"     },
];

function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [dailyHot, setDailyHot] = useState<DailyHot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(searchParams.get("filter"));

  const handleFilter = (key: string | null) => {
    setFilter(key);
    const params = new URLSearchParams(searchParams.toString());
    if (key) params.set("filter", key);
    else params.delete("filter");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

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
    <div className="min-h-screen text-slate-800 bg-slate-50">
      <header className="border-b px-8 py-4 sticky top-0 z-10 backdrop-blur-sm bg-white/90" style={{ borderColor: "#e2e8f0" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sky-500 text-xs font-mono">◈</span>
              <h1 className="text-base font-bold tracking-tight font-mono text-slate-800">TrendRadar</h1>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              AI trend intelligence from X and Hacker News
            </p>
          </div>
          {stats && (
            <div className="flex items-center gap-6 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-slate-400">live</span>
              </div>
              <span className="text-slate-400">
                <span className="text-slate-700">{stats.totalPosts.toLocaleString()}</span> posts
              </span>
              {stats.lastScraped && (
                <span className="text-slate-400">
                  scraped <span className="text-slate-700">{new Date(stats.lastScraped).toLocaleDateString()}</span>
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Intro */}
        <div className="mb-8 pb-8 border-b" style={{ borderColor: "#e2e8f0" }}>
          <p className="text-slate-600 text-sm mb-5 max-w-2xl leading-relaxed">
            TrendRadar tracks what the AI community is actually discussing on X and Hacker News —
            clustering daily posts into topics, chaining them across days into trends, and surfacing
            what's gaining momentum before it goes mainstream.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                icon: "◉",
                title: "Daily Hot Topics",
                desc: "See the top AI discussions each day, ranked by post volume. Updated twice daily from Hacker News, and from X whenever a scrape runs.",
              },
              {
                icon: "↗",
                title: "Emerging · Trending · Peak",
                desc: "Topics are chained across days into trend timelines and scored by growth rate. Spot what's just starting, gaining traction, or reaching peak buzz.",
              },
              {
                icon: "→",
                title: "Click any trend",
                desc: "Open the full day-by-day timeline with summaries, sample posts, and engagement metrics. Useful for deciding whether a topic is worth covering.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="rounded-xl border bg-white p-4" style={{ borderColor: "#e2e8f0" }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sky-500 font-mono">{icon}</span>
                  <span className="text-xs font-mono font-bold text-slate-700">{title}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

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
              <div className="flex-1 h-px bg-slate-200" />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleFilter(null)}
                  className={`text-xs font-mono px-3 py-1 rounded-full border transition-colors ${filter === null ? "text-slate-700 border-slate-300 bg-slate-100" : "text-slate-400 border-transparent hover:border-slate-300"}`}
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
                      onClick={() => handleFilter(filter === key ? null : key)}
                      className={`text-xs font-mono px-3 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${filter === key ? `${cfg.bg} ${cfg.color} ${cfg.border}` : "text-slate-400 border-transparent hover:border-slate-300"}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {label.toLowerCase()} {count}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 font-mono text-sm">
                <div>no trends detected</div>
                <div className="text-xs mt-1 text-slate-300">run ml pipeline after collecting data</div>
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
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span className={`text-xs font-mono font-bold ${cfg.color}`}>{label}</span>
                        <span className="text-xs font-mono text-slate-400">{col.length}</span>
                      </div>
                      {col.length === 0 ? (
                        <div className="text-xs font-mono text-slate-400 py-4 text-center">none</div>
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

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm font-mono animate-pulse">loading...</div>}>
      <Dashboard />
    </Suspense>
  );
}
