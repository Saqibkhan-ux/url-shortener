import { prisma } from "../config/db";
import { redis, REDIS_KEYS } from "../config/redis";
import { ApiError } from "../middleware/errorHandler";
import crypto from "crypto";

interface ClickEvent {
  code: string;
  referrer?: string;
  userAgent?: string;
  ip?: string;
  timestamp: string;
}

/**
 * Fire-and-forget enqueue onto a Redis list. Called from the redirect
 * handler on the hot path — must be fast and must never block the redirect
 * on a slow Postgres write. The background worker (workers/clickDrainWorker.ts)
 * drains this list and batch-inserts into the `clicks` table, and also
 * publishes to a PUB/SUB channel for the live SSE dashboard feed.
 */
export async function recordClickAsync(event: ClickEvent) {
  const ipHash = event.ip
    ? crypto.createHash("sha256").update(event.ip).digest("hex").slice(0, 16)
    : undefined;

  const payload = JSON.stringify({ ...event, ip: undefined, ipHash });

  // RPUSH is O(1); this is what keeps the redirect path sub-10ms even
  // under heavy click volume. The worker's batch insert into `clicks` (and
  // its increment of Link.clickCount) is the durable source of truth for
  // counts — the frontend's "live" number is derived purely from counting
  // SSE events received since page load, not from a separate Redis counter,
  // so there's nothing else to keep in sync here.

  await redis.rpush(REDIS_KEYS.clicksQueue, payload);

  // Publish for live dashboard subscribers (SSE).
  await redis.publish(REDIS_KEYS.liveChannel(event.code), payload);
}

export async function getAnalyticsSummary(code: string) {
  const link = await prisma.link.findUnique({ where: { code } });
  if (!link) throw new ApiError(404, "Short link not found");

  const totalClicks = await prisma.click.count({ where: { linkId: link.id } });

  const clicksByDay = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT date_trunc('day', clicked_at) AS day, COUNT(*) AS count
    FROM clicks
    WHERE link_id = ${link.id}
    GROUP BY day
    ORDER BY day ASC
    LIMIT 30
  `;

  const topReferrers = await prisma.click.groupBy({
    by: ["referrer"],
    where: { linkId: link.id, referrer: { not: null } },
    _count: { referrer: true },
    orderBy: { _count: { referrer: "desc" } },
    take: 5,
  });

  return {
    code: link.code,
    longUrl: link.longUrl,
    totalClicks,
    clicksByDay: clicksByDay.map((row) => ({
      day: row.day,
      count: Number(row.count),
    })),
    topReferrers: topReferrers.map((r) => ({
      referrer: r.referrer,
      count: r._count.referrer,
    })),
  };
}
