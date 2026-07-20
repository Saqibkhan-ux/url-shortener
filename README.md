# TinyLink — URL Shortener with Real-Time Analytics

A production-style URL shortener built to demonstrate backend system design depth:
Base62 ID generation, Redis-backed caching + rate limiting, Postgres persistence,
and a live analytics dashboard.

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌─────────────┐
│  Next.js    │─────▶│  Express API      │─────▶│  PostgreSQL │
│  Frontend   │      │  (Node/TS)        │      │  (links +   │
│  (SSR/CSR)  │◀─────│                   │◀─────│   clicks)   │
└─────────────┘      └────────┬──────────┘      └─────────────┘
                               │
                               ▼
                        ┌─────────────┐
                        │    Redis    │
                        │ cache + rate│
                        │   limiter   │
                        └─────────────┘
```

## Design decisions worth discussing in interviews

1. **ID generation strategy** — Base62 encoding of an auto-incrementing Postgres
   `BIGSERIAL` id (`utils/base62.ts`), not random-string-then-check-collision.
   Trade-off discussed in code comments: sequential IDs are simpler and
   collision-free but leak growth rate / are guessable. Mitigation options
   noted: XOR/shuffle the id before encoding, or use a Snowflake-style ID for
   multi-node writers (avoids single Postgres sequence becoming a write
   bottleneck at scale).

2. **Caching strategy (cache-aside)** — On redirect, API checks Redis first
   (`shortcode -> longUrl`), falls back to Postgres on miss, then repopulates
   Redis with a TTL. This is the classic cache-aside pattern — discuss
   thundering herd on a hot key expiring, and how request coalescing /
   probabilistic early expiration would fix it at scale.

3. **Rate limiting** — Token bucket implemented in Redis using `INCR` +
   `EXPIRE` (atomic via Lua script), keyed by IP for anonymous creation and by
   API key for authenticated use. Discuss sliding window log vs fixed window
   counter vs token bucket trade-offs (burst tolerance vs memory cost).

4. **Analytics writes are async** — click events are pushed onto a Redis list
   (lightweight queue) and drained by a background worker that batch-inserts
   into Postgres. This decouples the hot redirect path (must be fast, <10ms)
   from the analytics write path (can tolerate seconds of lag). This is the
   "outbox / write-behind" pattern — good discussion hook on consistency
   trade-offs (analytics counts are eventually consistent, not
   transactionally tied to the redirect).

5. **CAP theorem hook** — Redis is used for availability/low-latency reads on
   the hot path; Postgres is the source of truth for consistency. If Redis is
   down, redirects still work (fall through to Postgres, degraded latency);
   if Postgres is down, redirects for cached links still work but new link
   creation fails. This asymmetry is a good talking point on partial
   availability.

6. **Pagination** — the analytics list endpoints use cursor-based pagination
   (`WHERE id > :cursor ORDER BY id LIMIT :n`) rather than `OFFSET`, avoiding
   the O(n) skip cost of deep offset pagination.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind
- **API:** Node.js, Express, TypeScript
- **DB:** PostgreSQL via Prisma ORM
- **Cache/Queue/RateLimit:** Redis
- **Infra:** Docker Compose (local), deployable to Render/Railway

## Running locally

```bash
cp .env.example .env
docker compose up --build
```

- API: http://localhost:4000
- Web: http://localhost:3000
- Postgres: localhost:5432
- Redis: localhost:6379

## Project layout

```
url-shortener/
├── docker-compose.yml
├── .env.example
├── api/                  # Express + TypeScript backend
│   ├── prisma/schema.prisma
│   └── src/
│       ├── config/       # db + redis clients
│       ├── utils/        # base62 encode/decode
│       ├── middleware/   # rate limiter, error handler
│       ├── routes/       # link + analytics routes
│       ├── controllers/  # request handlers
│       ├── services/     # business logic
│       └── workers/      # async click-event drain worker
└── web/                  # Next.js frontend
    ├── app/
    └── components/
```

## API Endpoints

| Method | Path                     | Description                          |
|--------|--------------------------|---------------------------------------|
| POST   | `/api/links`             | Create short link                    |
| GET    | `/:code`                 | Redirect + record click event        |
| GET    | `/api/links/:code`       | Get link metadata                    |
| GET    | `/api/links`             | List links (cursor paginated)        |
| GET    | `/api/analytics/:code`   | Aggregated click analytics           |
| GET    | `/api/analytics/:code/stream` | Server-Sent Events live click feed |
