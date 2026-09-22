import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";

import linkRoutes from "./routes/links";
import analyticsRoutes from "./routes/analytics";
import { redirectHandler } from "./controllers/linkController";
import { errorHandler } from "./middleware/errorHandler";
import { startClickDrainWorker, stopClickDrainWorker } from "./workers/clickDrainWorker";
import { redis } from "./config/redis";
import { prisma } from "./config/db";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);

// Render (and most PaaS providers) sit behind a reverse proxy / load
// balancer. Without this, req.ip resolves to the proxy's IP for every
// request, which breaks per-IP rate limiting (everyone shares one bucket)
// and per-click IP hashing (all clicks hash to the same value).
app.set("trust proxy", 1);

app.use(helmet());

// CORS_ORIGIN is a comma-separated allowlist, e.g.
// "https://tinylink.vercel.app,https://your-custom-domain.com"
// Falls back to allowing all origins only in local development.
const corsOrigins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim());
app.use(
  cors({
    origin: corsOrigins && corsOrigins.length > 0 ? corsOrigins : true,
  })
);

app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// REST API surface
app.use("/api/links", linkRoutes);
app.use("/api/analytics", analyticsRoutes);

// Top-level redirect route — must be registered after /api/* so it doesn't
// shadow them, and it's intentionally NOT rate-limited (redirects need to
// be fast and are the actual product; abuse there is better handled with
// per-code click-rate anomaly detection, not per-request throttling).
app.get("/:code", redirectHandler);

app.use(errorHandler);

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[api] listening on port ${PORT}`);
  startClickDrainWorker();
});

// Graceful shutdown handling for container orchestrators (Docker, PaaS, K8s)
const gracefulShutdown = async (signal: string) => {
  console.log(`[api] received ${signal}, starting graceful shutdown...`);
  stopClickDrainWorker();

  server.close(async () => {
    console.log("[api] HTTP server closed");
    try {
      await redis.quit();
      console.log("[api] Redis connection closed");
      await prisma.$disconnect();
      console.log("[api] Prisma disconnected");
      process.exit(0);
    } catch (err) {
      console.error("[api] Error during shutdown:", err);
      process.exit(1);
    }
  });

  // Force exit if shutdown hangs
  setTimeout(() => {
    console.error("[api] Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
