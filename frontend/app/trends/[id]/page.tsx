"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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
  post_url?: string | null;
  source?: string;
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
  description?: string;
  metrics?: {
    growth_rate?: number;
    avg_engagement?: number;
    days_tracked?: number;
    daily_sizes?: number[];
    velocity?: number;
  };
  topics?: Topic[];
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function DailyPostChart({ topics, height = 140 }: { topics: Topic[]; height?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);

  // Aggregate by date so same-day clusters appear as one point
  const byDate = new Map<string, { date: string; size: number }>();
  [...topics]
    .filter((t) => t.size > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((t) => {
      const dk = new Date(t.date).toISOString().slice(0, 10);
      if (!byDate.has(dk)) byDate.set(dk, { date: t.date, size: 0 });
      byDate.get(dk)!.size += t.size;
    });
  const sorted = [...byDate.values()];

  if (sorted.length === 0) return null;

  const maxSize = Math.max(...sorted.map((t) => t.size));
  const minSize = Math.min(...sorted.map((t) => t.size));

  const VW = 600;
  const PAD_X = 20;
  const PAD_TOP = 28;
  const PAD_BTM = 28;
  const CHART_H = height;
  const VH = PAD_TOP + CHART_H + PAD_BTM;

  const getX = (i: number) =>
    sorted.length === 1 ? VW / 2 : PAD_X + (i / (sorted.length - 1)) * (VW - PAD_X * 2);

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

  const labelEvery = sorted.length > 12 ? 3 : sorted.length > 7 ? 2 : 1;

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      style={{ width: "100%", display: "block" }}
      onMouseLeave={() => setHovered(null)}
    >
      {areaPath && <path d={areaPath} fill="rgb(14,165,233)" opacity={0.08} />}
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
        const dateStr = new Date(topic.date).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
        const ttW = 90;
        const ttX = Math.max(2, Math.min(cx - ttW / 2, VW - ttW - 2));
        const nearTop = cy < PAD_TOP + 55;
        const ttY = nearTop ? cy + 10 : cy - 50;

        return (
          <g key={topic.date}>
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
                x1={cx} y1={PAD_TOP} x2={cx} y2={PAD_TOP + CHART_H}
                stroke="rgb(14,165,233)" strokeWidth={1} strokeDasharray="3 2" opacity={0.35}
              />
            )}
            <circle
              cx={cx} cy={cy}
              r={isHov ? 6 : 4}
              fill={isHov ? "rgb(14,165,233)" : "#ffffff"}
              stroke="rgb(14,165,233)"
              strokeWidth={isHov ? 2 : 1.5}
            />
            {isHov && (
              <g>
                <rect x={ttX} y={ttY} width={ttW} height={38} rx={4}
                  fill="#f8fafc" stroke="#e2e8f0" strokeWidth={1} />
                <text x={ttX + ttW / 2} y={ttY + 15} textAnchor="middle" fontSize={11}
                  fontFamily="monospace" fill="rgb(100,116,139)">{dateStr}</text>
                <text x={ttX + ttW / 2} y={ttY + 30} textAnchor="middle" fontSize={13}
                  fontFamily="monospace" fill="rgb(14,165,233)" fontWeight="bold">{topic.size} posts</text>
              </g>
            )}
            {i % labelEvery === 0 && (
              <text x={cx} y={PAD_TOP + CHART_H + 18} textAnchor="middle" fontSize={10}
                fontFamily="monospace" fill={isHov ? "rgb(71,85,105)" : "rgb(148,163,184)"}>
                {dateStr}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Day Group (one row per date, merges multiple same-day topics) ────────────

function PostCard({ post }: { post: Post }) {
  return (
    <div className="rounded-lg p-4 border bg-white" style={{ borderColor: "#e2e8f0" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-mono text-slate-500">
          {post.source === "hn" ? "HN/" : "@"}{post.author}
        </span>
        {post.post_url && (
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-sky-600 hover:text-sky-500 transition-colors"
          >
            {post.source === "hn" ? "view on HN ↗" : "view on X ↗"}
          </a>
        )}
      </div>
      <div className="text-sm text-slate-700 leading-relaxed mb-2.5">{post.text}</div>
      <div className="flex gap-4 text-xs font-mono text-slate-400">
        <span>♥ {post.likes}</span>
        <span>↺ {post.retweets}</span>
        <span>💬 {post.replies}</span>
        {post.views > 0 && <span>👁 {post.views.toLocaleString()}</span>}
      </div>
    </div>
  );
}

function DayGroup({ topics }: { topics: Topic[] }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(topics[0].date).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const totalPosts = topics.reduce((s, t) => s + t.size, 0);

  // Deduplicate summaries for display
  const uniqueSummaries = topics
    .map((t) => t.summary)
    .filter(Boolean)
    .filter((s, i, arr) => arr.indexOf(s) === i);

  return (
    <div className="rounded-xl border overflow-hidden bg-white" style={{ borderColor: "#e2e8f0" }}>
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <span className="text-xs font-mono text-slate-400 shrink-0 w-12">{dateStr}</span>
          <div className="min-w-0 flex-1">
            {uniqueSummaries.length === 1 ? (
              <span className="text-sm text-slate-700 leading-snug truncate block">
                {uniqueSummaries[0]}
              </span>
            ) : (
              <div className="space-y-1">
                {uniqueSummaries.map((s) => (
                  <p key={s} className="text-sm text-slate-700 leading-snug truncate">
                    · {s}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs font-mono text-slate-400">{totalPosts} posts · up to 5 shown</span>
          <span className="text-slate-400 font-mono text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: "#e2e8f0", backgroundColor: "#f8fafc" }}>
          {topics.map((topic, i) => (
            <div key={topic._id}>
              {topics.length > 1 && topic.summary && (
                <p className="text-sm font-medium text-slate-700 mb-2">{topic.summary}</p>
              )}
              {topics.length === 1 && topic.summary && (
                <p className="text-sm text-slate-600 leading-relaxed mb-3">{topic.summary}</p>
              )}
              {(topic.posts?.length > 0) && (
                <div className="space-y-2">
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sample posts</div>
                  {topic.posts.map((post) => <PostCard key={post.post_id} post={post} />)}
                </div>
              )}
              {topics.length > 1 && i < topics.length - 1 && (
                <div className="border-b my-3" style={{ borderColor: "#e2e8f0" }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrendPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [trend, setTrend] = useState<Trend | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/trends/${id}`)
      .then((r) => r.json())
      .then((d) => { setTrend(d); setLoading(false); });
  }, [id]);

  const config = trend ? (STATUS_CONFIG[trend.status] || STATUS_CONFIG.emerging) : STATUS_CONFIG.emerging;
  const metrics = trend?.metrics ?? {};
  const growthRate = metrics.growth_rate ?? 0;

  const topicTimes = (trend?.topics ?? []).map(t => new Date(t.date).getTime());
  const dateRange = topicTimes.length > 0 ? (() => {
    const first = new Date(Math.min(...topicTimes));
    const last  = new Date(Math.max(...topicTimes));
    return first.getTime() === last.getTime()
      ? fmtDate(first)
      : `${fmtDate(first)} – ${fmtDate(last)}`;
  })() : null;

  return (
    <div className="min-h-screen text-slate-800 bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b backdrop-blur-sm bg-white/90" style={{ borderColor: "#e2e8f0" }}>
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-mono text-slate-500 hover:text-slate-800 transition-colors"
          >
            <span>←</span>
            <span>Back</span>
          </button>

          {trend && (
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.color} ${config.border}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                {config.label}
              </span>
              {dateRange && (
                <span className="text-xs font-mono text-slate-500">{dateRange}</span>
              )}
              {metrics.days_tracked && (
                <span className="text-xs font-mono text-slate-500">{metrics.days_tracked}d tracked</span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-400 font-mono text-sm animate-pulse">
            loading...
          </div>
        ) : !trend ? (
          <div className="flex items-center justify-center h-64 text-slate-400 font-mono text-sm">
            trend not found
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top section: summary + metrics */}
            <div className="grid grid-cols-5 gap-6">
              {/* Summary */}
              <div className="col-span-3 rounded-xl p-6 border bg-white space-y-3" style={{ borderColor: "#e2e8f0" }}>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">Summary</div>
                <p className="text-sm font-medium text-slate-800 leading-snug">{trend.summary}</p>
                {trend.description && (
                  <p className="text-sm text-slate-500 leading-relaxed border-t pt-3" style={{ borderColor: "#e2e8f0" }}>
                    {trend.description}
                  </p>
                )}
              </div>

              {/* Metrics */}
              <div className="col-span-2 grid grid-cols-2 gap-3 content-start">
                {[
                  { label: "growth rate", value: `${growthRate >= 0 ? "+" : ""}${(growthRate * 100).toFixed(0)}%`, positive: growthRate >= 0 },
                  { label: "avg engagement", value: metrics.avg_engagement?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? "—", positive: true },
                  { label: "velocity", value: `${(metrics.velocity ?? 0) >= 0 ? "+" : ""}${metrics.velocity ?? "—"}`, positive: (metrics.velocity ?? 0) >= 0 },
                  { label: "days tracked", value: `${metrics.days_tracked ?? "—"}d`, positive: true },
                ].map((m) => (
                  <div key={m.label} className="rounded-xl p-4 border bg-white" style={{ borderColor: "#e2e8f0" }}>
                    <div className="text-xs font-mono text-slate-400 mb-2">{m.label}</div>
                    <div className={`text-2xl font-bold font-mono ${m.positive ? config.color : "text-red-500"}`}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart */}
            {trend.topics && trend.topics.length > 0 && (
              <div className="rounded-xl p-6 border bg-white" style={{ borderColor: "#e2e8f0" }}>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-4">Daily Posts</div>
                <DailyPostChart topics={trend.topics} height={160} />
              </div>
            )}

            {/* Topic Timeline */}
            {trend.topics && trend.topics.length > 0 && (() => {
              // Group topics by UTC date so same-day clusters appear as one row
              const byDate = new Map<string, Topic[]>();
              [...trend.topics]
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .forEach((t) => {
                  const dk = new Date(t.date).toISOString().slice(0, 10);
                  if (!byDate.has(dk)) byDate.set(dk, []);
                  byDate.get(dk)!.push(t);
                });
              const days = [...byDate.entries()];
              return (
                <div>
                  <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-4">
                    Topic Timeline · {days.length} days
                  </div>
                  <div className="space-y-2">
                    {days.map(([dk, dayTopics]) => (
                      <DayGroup key={dk} topics={dayTopics} />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </div>
  );
}
