import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 100, 2000),
});

redis.on("error", (err) => {
  console.error("[redis] connection error:", err.message);
});

redis.on("connect", () => {
  console.log("[redis] connected");
});

/**
 * Key naming conventions used across the app (documented here so it's
 * easy to explain the caching model in one place):
 *
 *   link:cache:{code}      -> JSON { longUrl, isActive } — cache-aside, TTL 1h
 *   ratelimit:{ip}         -> integer counter, TTL = RATE_LIMIT_WINDOW_SECONDS
 *   clicks:queue           -> Redis LIST used as a lightweight write-behind
 *                             queue; click events are RPUSHed here on the
 *                             hot redirect path and drained in batches by
 *                             the background worker (src/workers/clickDrainWorker.ts)
 *   analytics:live:{code}  -> Redis PUB/SUB channel for the SSE live feed
 */
export const REDIS_KEYS = {
  linkCache: (code: string) => `link:cache:${code}`,
  rateLimit: (ip: string) => `ratelimit:${ip}`,
  clicksQueue: "clicks:queue",
  liveChannel: (code: string) => `analytics:live:${code}`,
};

export const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
