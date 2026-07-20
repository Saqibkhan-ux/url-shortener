"use client";

import { useState } from "react";
import { createShortLink, LinkResponse } from "@/lib/api";

export default function CreateLinkForm({
  onCreated,
}: {
  onCreated?: (link: LinkResponse) => void;
}) {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<LinkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const link = await createShortLink(url);
      setResult(link);
      setUrl("");
      onCreated?.(link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="url"
          required
          placeholder="https://example.com/very/long/path"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium
                     hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Shortening…" : "Shorten"}
        </button>
      </form>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {result && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4 text-sm">
          <p className="text-slate-400">Your short link:</p>
          <a
            href={result.shortUrl}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-400 hover:underline break-all"
          >
            {result.shortUrl}
          </a>
        </div>
      )}
    </div>
  );
}
