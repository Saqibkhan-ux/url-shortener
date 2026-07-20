import { Router } from "express";
import { getAnalyticsHandler, streamAnalyticsHandler } from "../controllers/analyticsController";

const router = Router();

router.get("/:code", getAnalyticsHandler);
router.get("/:code/stream", streamAnalyticsHandler);

export default router;
