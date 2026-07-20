import { prisma } from "../config/db";
import { redis, REDIS_KEYS, CACHE_TTL_SECONDS } from "../config/redis";
import { encode } from "../utils/base62";
import { ApiError } from "../middleware/errorHandler";
import { randomUUID } from "crypto";

interface CreateLinkInput {
  longUrl: string;
  ownerIp?: string;
  expiresAt?: Date;
}

interface CachedLink {
  longUrl: string;
  isActive: boolean;
  expiresAt?: string | null;
}

export async function createLink({ longUrl, ownerIp, expiresAt }: CreateLinkInput) {
  // Two-step create: insert a row to get the auto-incrementing id, then
  // derive the code from that id and patch it in. This costs one extra
  // UPDATE per creation but keeps id generation trivially collision-free.
  // Alternative: pre-allocate id ranges per app instance to cut this to one
  // write, at the cost of extra bookkeeping.
  const created = await prisma.link.create({
    data: {
      longUrl,
      ownerIp,
      expiresAt,
      // `code` is unique, so a shared empty-string placeholder would make
      // every creation after the first fail. This value cannot collide with a
      // Base62 final code because it contains hyphens.
      code: `pending-${randomUUID()}`,
    },
  });

  const code = encode(created.id);

  const finalized = await prisma.link.update({
    where: { id: created.id },
    data: { code },
  });

  // Warm the cache immediately so the first redirect is already a hit.
  await redis.setex(
    REDIS_KEYS.linkCache(code),
    CACHE_TTL_SECONDS,
    JSON.stringify({
      longUrl: finalized.longUrl,
      isActive: finalized.isActive,
      expiresAt: finalized.expiresAt?.toISOString() ?? null,
    } satisfies CachedLink)
  );

  return finalized;
}

export async function resolveLink(code: string): Promise<CachedLink> {
  const cacheKey = REDIS_KEYS.linkCache(code);

  // 1. Cache-aside read
  const cached = await redis.get(cacheKey);
  if (cached) {
    const link = JSON.parse(cached) as CachedLink;
    if (!link.isActive) throw new ApiError(404, "Short link not found");
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      throw new ApiError(410, "Short link has expired");
    }
    return link;
  }

  // 2. Cache miss -> source of truth
  const link = await prisma.link.findUnique({ where: { code } });
  if (!link || !link.isActive) {
    throw new ApiError(404, "Short link not found");
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    throw new ApiError(410, "Short link has expired");
  }

  const payload: CachedLink = {
    longUrl: link.longUrl,
    isActive: link.isActive,
    expiresAt: link.expiresAt?.toISOString() ?? null,
  };

  // 3. Repopulate cache for next read
  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(payload));

  return payload;
}

export async function getLinkByCode(code: string) {
  const link = await prisma.link.findUnique({ where: { code } });
  if (!link) throw new ApiError(404, "Short link not found");
  return link;
}

interface ListLinksParams {
  cursor?: string; // stringified bigint id
  limit?: number;
}

/**
 * Cursor-based pagination: WHERE id < cursor ORDER BY id DESC LIMIT n.
 * Avoids the O(n) cost of OFFSET-based pagination on large tables, and is
 * stable under concurrent inserts (no skipped/duplicated rows across pages
 * the way OFFSET pagination can produce).
 */
export async function listLinks({ cursor, limit = 20 }: ListLinksParams) {
  const links = await prisma.link.findMany({
    where: cursor ? { id: { lt: BigInt(cursor) } } : undefined,
    orderBy: { id: "desc" },
    take: limit + 1, // fetch one extra to know if there's a next page
  });

  const hasMore = links.length > limit;
  const page = hasMore ? links.slice(0, limit) : links;
  const nextCursor = hasMore ? page[page.length - 1].id.toString() : null;

  return {
    items: page.map(serializeLink),
    nextCursor,
  };
}

function serializeLink(link: {
  id: bigint;
  code: string;
  longUrl: string;
  createdAt: Date;
  clickCount: number;
  isActive: boolean;
}) {
  return {
    id: link.id.toString(),
    code: link.code,
    longUrl: link.longUrl,
    createdAt: link.createdAt,
    clickCount: link.clickCount,
    isActive: link.isActive,
  };
}
