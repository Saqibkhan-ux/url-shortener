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
import { startClickDrainWorker } from "./workers/clickDrainWorker";

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 4000;

app.use(helmet());
app.use(cors());
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

app.listen(PORT, () => {
  console.log(`[api] listening on port ${PORT}`);
  startClickDrainWorker();
});
