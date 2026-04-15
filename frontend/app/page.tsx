"use client";

import { useEffect, useState } from "react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  trending: {
    label: "Trending",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/30",
    dot: "bg-emerald-400",
  },
  emerging: {
    label: "Emerging",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/30",
    dot: "bg-blue-400",
  },
  peak: {
    label: "Peak",
    color: "text-yellow-400",
    bg: "bg-yellow-400/10 border-yellow-400/30",
    dot: "bg-yellow-400",
  },
  cooling: {
    label: "Cooling",
    color: "text-slate-400",
    bg: "bg-slate-400/10 border-slate-400/30",
    dot: "bg-slate-400",
  },
};

interface Trend {
  _id: string;
  status: string;
  keywords: string[];
  summary: string;
  metrics: {
    growth_rate: number;
    avg_engagement: number;
    days_tracked: number;
    daily_sizes: number[];
    velocity: number;
  };
}

interface Stats {
  total: number;
  lastScraped: string | null;
}

function TrendCard({ trend, index }: { trend: Trend; index: number }) {
  const config = STATUS_CONFIG[trend.status] || STATUS_CONFIG.emerging;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs font-mono">#{index + 1}</span>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${config.bg} ${config.color}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.label}
          </span>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Engagement</div>
          <div className="text-sm font-semibold text-slate-200">
            {trend.metrics.avg_engagement.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {trend.keywords.map((kw) => (
          <span key={kw} className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md">
            {kw}
          </span>
        ))}
      </div>

      {/* Summary */}
      {trend.summary && (
        <p className="text-sm text-slate-400 leading-relaxed mb-4">{trend.summary}</p>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800">
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Growth Rate</div>
          <div
            className={`text-sm font-medium ${
              trend.metrics.growth_rate > 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {trend.metrics.growth_rate > 0 ? "+" : ""}
            {(trend.metrics.growth_rate * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Days Tracked</div>
          <div className="text-sm font-medium text-slate-200">{trend.metrics.days_tracked}d</div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-0.5">Velocity</div>
          <div className="text-sm font-medium text-slate-200">
            {trend.metrics.velocity > 0 ? "+" : ""}
            {trend.metrics.velocity}
          </div>
        </div>
      </div>

      {/* Mini bar chart of daily sizes */}
      {trend.metrics.daily_sizes?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-500 mb-2">Daily post volume</div>
          <div className="flex items-end gap-1 h-8">
            {trend.metrics.daily_sizes.map((size, i) => {
              const max = Math.max(...trend.metrics.daily_sizes);
              const height = max > 0 ? (size / max) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-slate-700 rounded-sm transition-all"
                  style={{ height: `${Math.max(height, 8)}%` }}
                  title={`Day ${i + 1}: ${size} posts`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function HowItWorksPanel() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">How TrendRadar works</h3>
      <div className="space-y-4">
        {[
          {
            step: "01",
            title: "Scrape",
            desc: "Automatically collects AI-related posts from X multiple times per day.",
          },
          {
            step: "02",
            title: "Embed",
            desc: "Each post is converted into a semantic vector using OpenAI embeddings.",
          },
          {
            step: "03",
            title: "Cluster",
            desc: "HDBSCAN groups semantically similar posts into topic clusters daily.",
          },
          {
            step: "04",
            title: "Link",
            desc: "Clusters are connected across days using cosine similarity to form trend chains.",
          },
          {
            step: "05",
            title: "Score",
            desc: "Each trend is scored on growth rate, velocity, and engagement to determine its status.",
          },
        ].map(({ step, title, desc }) => (
          <div key={step} className="flex gap-3">
            <span className="text-xs font-mono text-slate-600 mt-0.5 shrink-0">{step}</span>
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-0.5">{title}</div>
              <div className="text-xs text-slate-500 leading-relaxed">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-800">
        <h4 className="text-xs font-semibold text-slate-300 mb-3">Status labels</h4>
        <div className="space-y-2">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-start gap-2">
              <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${config.dot}`} />
              <div>
                <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                <span className="text-xs text-slate-500 ml-1">
                  {key === "trending" && "— strong growth + high engagement"}
                  {key === "emerging" && "— early signal, gaining traction"}
                  {key === "peak" && "— growth slowing, near top"}
                  {key === "cooling" && "— discussion declining"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [trends, setTrends] = useState<Trend[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight">TrendRadar</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              AI trend intelligence — spot what's rising before it breaks
            </p>
          </div>
          {stats && (
            <div className="text-right">
              <div className="text-xs text-slate-500">
                {stats.total.toLocaleString()} posts collected
              </div>
              {stats.lastScraped && (
                <div className="text-xs text-slate-600 mt-0.5">
                  Last scraped {new Date(stats.lastScraped).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-slate-500 text-sm">
            Loading trends...
          </div>
        ) : trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500">
            <div className="text-sm">No trends available yet.</div>
            <div className="text-xs mt-1 text-slate-600">
              Run the ML pipeline after collecting enough data.
            </div>
          </div>
        ) : (
          <div className="flex gap-8">
            {/* Trends grid */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-slate-300">
                  {trends.length} Active Trends
                </h2>
                <div className="flex gap-3 text-xs text-slate-500">
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <span key={key} className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                      {trends.filter((t) => t.status === key).length} {config.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trends.map((trend, i) => (
                  <TrendCard key={trend._id} trend={trend} index={i} />
                ))}
              </div>
            </div>

            {/* Sidebar */}
            <div className="w-72 shrink-0">
              <HowItWorksPanel />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}