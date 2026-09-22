import { Request, Response } from "express";
import { z } from "zod";
import { createLink, resolveLink, getLinkByCode, listLinks } from "../services/linkService";
import { recordClickAsync } from "../services/analyticsService";

const createLinkSchema = z.object({
  longUrl: z.string().url("Must be a valid URL"),
  expiresAt: z.string().datetime().optional(),
});

export async function createLinkHandler(req: Request, res: Response) {
  const { longUrl, expiresAt } = createLinkSchema.parse(req.body);

  const link = await createLink({
    longUrl,
    ownerIp: req.ip,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
  });

  const baseUrl = process.env.BASE_URL || "http://localhost:4000";

  res.status(201).json({
    code: link.code,
    shortUrl: `${baseUrl}/${link.code}`,
    longUrl: link.longUrl,
    createdAt: link.createdAt,
  });
}

export async function redirectHandler(req: Request, res: Response) {
  const { code } = req.params;

  const link = await resolveLink(code);

  // Async, non-blocking — do not await the queue write on the critical path
  // beyond what's needed to guarantee delivery to Redis itself.
  recordClickAsync({
    code,
    referrer: req.get("referer"),
    userAgent: req.get("user-agent"),
    ip: req.ip,
    timestamp: new Date().toISOString(),
  }).catch((err) => console.error("[recordClickAsync] failed:", err));

  res.redirect(302, link.longUrl);
}

export async function getLinkHandler(req: Request, res: Response) {
  const link = await getLinkByCode(req.params.code);
  res.json({
    code: link.code,
    longUrl: link.longUrl,
    createdAt: link.createdAt,
    clickCount: link.clickCount,
    isActive: link.isActive,
    expiresAt: link.expiresAt,
  });
}

export async function listLinksHandler(req: Request, res: Response) {
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  const result = await listLinks({ cursor, limit });
  res.json(result);
}
