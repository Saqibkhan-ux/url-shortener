const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface LinkResponse {
  code: string;
  shortUrl: string;
  longUrl: string;
  createdAt: string;
}

export interface LinkListItem {
  id: string;
  code: string;
  longUrl: string;
  createdAt: string;
  clickCount: number;
  isActive: boolean;
}

export interface AnalyticsSummary {
  code: string;
  longUrl: string;
  totalClicks: number;
  clicksByDay: { day: string; count: number }[];
  topReferrers: { referrer: string | null; count: number }[];
}

export async function createShortLink(longUrl: string): Promise<LinkResponse> {
  const res = await fetch(`${API_URL}/api/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ longUrl }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create short link");
  }
  return res.json();
}

export async function listLinks(cursor?: string): Promise<{
  items: LinkListItem[];
  nextCursor: string | null;
}> {
  const url = new URL(`${API_URL}/api/links`);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch links");
  return res.json();
}

export async function getAnalytics(code: string): Promise<AnalyticsSummary> {
  const res = await fetch(`${API_URL}/api/analytics/${code}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

export function analyticsStreamUrl(code: string): string {
  return `${API_URL}/api/analytics/${code}/stream`;
}
