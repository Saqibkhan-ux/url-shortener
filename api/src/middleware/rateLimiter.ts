import { Request, Response, NextFunction } from "express";
import { redis, REDIS_KEYS } from "../config/redis";

const WINDOW_SECONDS = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 30);

/**
 * Fixed-window counter rate limiter, implemented with a single Redis INCR +
 * conditional EXPIRE. This is NOT atomic across the two commands as written
 * naively (a crash between INCR and EXPIRE would leave a key with no TTL),
 * so we use a Lua script to make both operations atomic in one round trip.
 *
 * Interview discussion hook: fixed window allows a burst of up to
 * 2x MAX_REQUESTS at window boundaries (e.g. 30 requests at 0:59 and 30 more
 * at 1:00). A sliding-window-log or sliding-window-counter fixes this at the
 * cost of more memory / a slightly more expensive Lua script. Token bucket
 * (via Redis with a refill timestamp stored per key) is the standard
 * production choice because it tolerates bursts smoothly.
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local window = tonumber(ARGV[1])
local current = redis.call("INCR", key)
if current == 1 then
  redis.call("EXPIRE", key, window)
end
return current
`;

export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = REDIS_KEYS.rateLimit(ip);

  try {
    const count = (await redis.eval(
      RATE_LIMIT_LUA,
      1,
      key,
      String(WINDOW_SECONDS)
    )) as number;

    res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - count));

    if (count > MAX_REQUESTS) {
      const ttl = await redis.ttl(key);
      res.setHeader("Retry-After", ttl > 0 ? ttl : WINDOW_SECONDS);
      res.status(429).json({
        error: "Too many requests",
        retryAfterSeconds: ttl > 0 ? ttl : WINDOW_SECONDS,
      });
      return;
    }

    next();
    return;
  } catch (err) {
    // Fail open: if Redis is down, don't block legitimate traffic on the
    // rate limiter itself. Log so it's visible in observability, but let
    // the request through. Discuss trade-off: fail-open vs fail-closed
    // depending on whether abuse-prevention or availability matters more.
    console.error("[rateLimiter] Redis error, failing open:", err);
    next();
    return;
  }
}
