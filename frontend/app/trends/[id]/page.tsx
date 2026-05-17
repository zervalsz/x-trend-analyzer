"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

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

function KwTag({ kw, large }: { kw: string; large?: boolean }) {
  return (
    <span
      className={`rounded font-mono text-slate-200 ${large ? "text-sm px-3 py-1" : "text-xs px-2 py-0.5"}`}
      style={{ backgroundColor: "rgb(25,38,62)", border: "1px solid rgb(45,60,85)" }}
    >
      {kw}
    </span>
  );
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

function DailyPostChart({ topics, height = 140 }: { topics: Topic[]; height?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const sorted = [...topics]
    .filter((t) => t.size > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      {areaPath && <path d={areaPath} fill="rgb(56,189,248)" opacity={0.07} />}
      <polyline
        points={linePoints}
        fill="none"
        stroke="rgb(56,189,248)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {sorted.map((topic, i) => {
        const cx = getX(i);
        const cy = getY(topic.size);
        const isHov = hovered === i;
        const dateStr = new Date(topic.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
        const ttW = 90;
        const ttX = Math.max(2, Math.min(cx - ttW / 2, VW - ttW - 2));
        // flip tooltip below the point if near the top of the chart
        const nearTop = cy < PAD_TOP + 55;
        const ttY = nearTop ? cy + 10 : cy - 50;

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
                x1={cx} y1={PAD_TOP} x2={cx} y2={PAD_TOP + CHART_H}
                stroke="rgb(56,189,248)" strokeWidth={1} strokeDasharray="3 2" opacity={0.35}
              />
            )}
            <circle
              cx={cx} cy={cy}
              r={isHov ? 6 : 4}
              fill={isHov ? "rgb(56,189,248)" : "rgb(15,25,45)"}
              stroke="rgb(56,189,248)"
              strokeWidth={isHov ? 2 : 1.5}
            />
            {isHov && (
              <g>
                <rect x={ttX} y={ttY} width={ttW} height={38} rx={4}
                  fill="rgb(20,32,52)" stroke="rgb(45,62,88)" strokeWidth={1} />
                <text x={ttX + ttW / 2} y={ttY + 15} textAnchor="middle" fontSize={11}
                  fontFamily="monospace" fill="rgb(100,116,139)">{dateStr}</text>
                <text x={ttX + ttW / 2} y={ttY + 30} textAnchor="middle" fontSize={13}
                  fontFamily="monospace" fill="rgb(56,189,248)" fontWeight="bold">{topic.size} posts</text>
              </g>
            )}
            {i % labelEvery === 0 && (
              <text x={cx} y={PAD_TOP + CHART_H + 18} textAnchor="middle" fontSize={10}
                fontFamily="monospace" fill={isHov ? "rgb(148,163,184)" : "rgb(71,85,105)"}>
                {dateStr}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Topic Row ────────────────────────────────────────────────────────────────

function TopicRow({ topic }: { topic: Topic }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(topic.date).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: "rgb(30,45,65)" }}>
      <button
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-white/5 transition-colors"
        style={{ backgroundColor: "rgb(10,18,30)" }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-xs font-mono text-slate-400 shrink-0 w-12">{dateStr}</span>
          <div className="flex gap-1.5 flex-wrap">
            {topic.keywords?.length > 0
              ? topic.keywords.map((kw) => <KwTag key={kw} kw={kw} />)
              : <span className="text-xs text-slate-500 font-mono">no keywords</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-xs font-mono text-slate-400">{topic.size} posts</span>
          <span className="text-slate-400 font-mono text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-4 space-y-4" style={{ borderColor: "rgb(30,45,65)", backgroundColor: "rgb(8,14,26)" }}>
          {topic.summary && (
            <p className="text-sm text-slate-300 leading-relaxed">{topic.summary}</p>
          )}
          {topic.posts?.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">Sample posts</div>
              {topic.posts.map((post) => (
                <div key={post.post_id} className="rounded-lg p-4 border" style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-slate-400">
                      {post.source === "hn" ? "HN/" : "@"}{post.author}
                    </span>
                    {post.post_url && (
                      <a
                        href={post.post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-sky-400 hover:text-sky-300 transition-colors"
                      >
                        {post.source === "hn" ? "view on HN ↗" : "view on X ↗"}
                      </a>
                    )}
                  </div>
                  <div className="text-sm text-slate-200 leading-relaxed mb-2.5">{post.text}</div>
                  <div className="flex gap-4 text-xs font-mono text-slate-400">
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

  return (
    <div className="min-h-screen text-slate-100" style={{ backgroundColor: "rgb(8,14,26)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 border-b backdrop-blur-sm" style={{ borderColor: "rgb(25,38,60)", backgroundColor: "rgba(8,14,26,0.95)" }}>
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-mono text-slate-400 hover:text-slate-200 transition-colors"
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
              {metrics.days_tracked && (
                <span className="text-xs font-mono text-slate-400">{metrics.days_tracked}d tracked</span>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {(trend.keywords ?? []).map((kw) => <KwTag key={kw} kw={kw} />)}
              </div>
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
              <div className="col-span-3 rounded-xl p-6 border space-y-3" style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-widest">Summary</div>
                <p className="text-sm font-medium text-slate-200 leading-snug">{trend.summary}</p>
                {trend.description && (
                  <p className="text-sm text-slate-400 leading-relaxed border-t pt-3" style={{ borderColor: "rgb(30,45,65)" }}>
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
                  <div key={m.label} className="rounded-xl p-4 border" style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}>
                    <div className="text-xs font-mono text-slate-400 mb-2">{m.label}</div>
                    <div className={`text-2xl font-bold font-mono ${m.positive ? config.color : "text-red-400"}`}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart */}
            {trend.topics && trend.topics.length > 0 && (
              <div className="rounded-xl p-6 border" style={{ backgroundColor: "rgb(10,18,30)", borderColor: "rgb(30,45,65)" }}>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-4">Daily Posts</div>
                <DailyPostChart topics={trend.topics} height={160} />
              </div>
            )}

            {/* Topic Timeline */}
            {trend.topics && trend.topics.length > 0 && (
              <div>
                <div className="text-xs font-mono text-slate-400 uppercase tracking-widest mb-4">
                  Topic Timeline · {trend.topics.length} days
                </div>
                <div className="space-y-2">
                  {[...trend.topics]
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((topic) => (
                      <TopicRow key={topic._id} topic={topic} />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
