import { Request, Response } from "express";
import { getAnalyticsSummary } from "../services/analyticsService";
import { redis, REDIS_KEYS } from "../config/redis";

export async function getAnalyticsHandler(req: Request, res: Response) {
  const summary = await getAnalyticsSummary(req.params.code);
  res.json(summary);
}

/**
 * Server-Sent Events endpoint for the live-updating dashboard. Subscribes
 * to the per-code Redis PUB/SUB channel that recordClickAsync publishes to,
 * and streams each click event down to the browser as it happens.
 *
 * Why SSE over WebSockets here: click events are one-directional
 * (server -> client), so SSE gives us the real-time behavior without the
 * bidirectional complexity/overhead of a full WS connection, and it works
 * over plain HTTP (simpler through proxies/load balancers).
 */
export async function streamAnalyticsHandler(req: Request, res: Response) {
  const { code } = req.params;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const subscriber = redis.duplicate();
  await subscriber.subscribe(REDIS_KEYS.liveChannel(code));

  subscriber.on("message", (_channel, message) => {
    res.write(`data: ${message}\n\n`);
  });

  // Heartbeat to keep the connection alive through proxies that time out
  // idle connections.
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    subscriber.unsubscribe();
    subscriber.quit();
  });
}
