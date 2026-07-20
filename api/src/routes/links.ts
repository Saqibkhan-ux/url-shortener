import { Router } from "express";
import {
  createLinkHandler,
  getLinkHandler,
  listLinksHandler,
} from "../controllers/linkController";
import { rateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/", rateLimiter, createLinkHandler);
router.get("/", listLinksHandler);
router.get("/:code", getLinkHandler);

export default router;
