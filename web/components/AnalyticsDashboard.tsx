"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getAnalytics, analyticsStreamUrl, AnalyticsSummary } from "@/lib/api";

export default function AnalyticsDashboard({ code }: { code: string }) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAnalytics(code)
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, [code]);

  // Subscribe to the live click feed via Server-Sent Events. Each event
  // published by the API's recordClickAsync bumps the live counter
  // instantly, ahead of the next full summary refresh.
  useEffect(() => {
    const source = new EventSource(analyticsStreamUrl(code));
    source.onmessage = () => {
      setLiveCount((c) => c + 1);
    };
    source.onerror = () => {
      // EventSource auto-reconnects; nothing to do here beyond logging.
      console.warn("[analytics-stream] connection issue, will retry");
    };
    return () => source.close();
  }, [code]);

  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!summary) return <p className="text-sm text-slate-500">Loading analytics…</p>;

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <StatCard label="Total clicks" value={summary.totalClicks + liveCount} />
        <StatCard label="Live since page load" value={liveCount} highlight />
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-4 text-sm font-medium text-slate-300">Clicks over time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={summary.clicksByDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="day"
              tickFormatter={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              stroke="#64748b"
              fontSize={12}
            />
            <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }}
              labelFormatter={(d) => new Date(d).toLocaleDateString()}
            />
            <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="mb-3 text-sm font-medium text-slate-300">Top referrers</h3>
        {summary.topReferrers.length === 0 ? (
          <p className="text-sm text-slate-500">No referrer data yet</p>
        ) : (
          <ul className="space-y-2">
            {summary.topReferrers.map((r, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-slate-400">{r.referrer || "(direct)"}</span>
                <span className="text-slate-200">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${highlight ? "text-emerald-400" : "text-slate-100"}`}>
        {value}
      </p>
    </div>
  );
}
