"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { listLinks, LinkListItem } from "@/lib/api";

export default function LinkList({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<LinkListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLinks();
      setItems(res.items);
      setCursor(res.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial, refreshKey]);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    try {
      const res = await listLinks(cursor);
      setItems((prev) => [...prev, ...res.items]);
      setCursor(res.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0 && !loading) {
    return <p className="text-sm text-slate-500">No links yet — create one above.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/dashboard/${item.code}`}
          className="flex items-center justify-between rounded-lg border border-slate-800
                     bg-slate-900/40 px-4 py-3 text-sm hover:border-indigo-600 transition-colors"
        >
          <div className="min-w-0">
            <p className="font-medium text-indigo-400">/{item.code}</p>
            <p className="truncate text-slate-500">{item.longUrl}</p>
          </div>
          <span className="ml-4 shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
            {item.clickCount} clicks
          </span>
        </Link>
      ))}

      {cursor && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="w-full rounded-lg border border-slate-800 py-2 text-sm text-slate-400
                     hover:bg-slate-900 disabled:opacity-50"
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
