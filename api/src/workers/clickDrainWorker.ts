import { redis, REDIS_KEYS } from "../config/redis";
import { prisma } from "../config/db";

interface QueuedClick {
  code: string;
  referrer?: string;
  userAgent?: string;
  ipHash?: string;
  timestamp: string;
}

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 1000;

/**
 * Write-behind worker: pops up to BATCH_SIZE click events off the Redis
 * list per tick and batch-inserts them into Postgres with a single
 * `createMany`. This is what lets the redirect endpoint stay fast (just an
 * RPUSH) while still durably persisting every click for analytics.
 *
 * Trade-off to discuss: if the process dies after popping from Redis but
 * before the Postgres insert commits, those events are lost. A more robust
 * version would use a Redis Stream with consumer groups (XREADGROUP +
 * XACK) instead of a plain LIST + LPOP, so unacknowledged events can be
 * re-claimed by another worker after a crash.
 */
export async function startClickDrainWorker() {
  console.log("[clickDrainWorker] started");

  setInterval(async () => {
    try {
      await drainBatch();
    } catch (err) {
      console.error("[clickDrainWorker] batch failed:", err);
    }
  }, POLL_INTERVAL_MS);
}

async function drainBatch() {
  const pipeline = redis.pipeline();
  for (let i = 0; i < BATCH_SIZE; i++) {
    pipeline.lpop(REDIS_KEYS.clicksQueue);
  }
  const results = await pipeline.exec();
  if (!results) return;

  const rawEvents = results
    .map(([err, value]) => (err ? null : (value as string | null)))
    .filter((v): v is string => Boolean(v));

  if (rawEvents.length === 0) return;

  const events: QueuedClick[] = rawEvents.map((raw) => JSON.parse(raw));

  // Resolve codes -> link ids in one query, then batch insert clicks.
  const codes = [...new Set(events.map((e) => e.code))];
  const links = await prisma.link.findMany({
    where: { code: { in: codes } },
    select: { id: true, code: true },
  });
  const codeToId = new Map(links.map((l) => [l.code, l.id]));

  const clickRows = events
    .filter((e) => codeToId.has(e.code))
    .map((e) => ({
      linkId: codeToId.get(e.code)!,
      clickedAt: new Date(e.timestamp),
      referrer: e.referrer,
      userAgent: e.userAgent,
      ipHash: e.ipHash,
    }));

  if (clickRows.length > 0) {
    await prisma.click.createMany({ data: clickRows });

    // Sync the denormalized counter on the link row with the durable count.
    for (const code of codes) {
      const linkId = codeToId.get(code);
      if (!linkId) continue;
      const count = events.filter((e) => e.code === code).length;
      await prisma.link.update({
        where: { id: linkId },
        data: { clickCount: { increment: count } },
      });
    }
  }

  console.log(`[clickDrainWorker] persisted ${clickRows.length} click(s)`);
}
