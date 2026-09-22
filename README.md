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

## Deploying (Render + Vercel + managed Postgres/Redis)

This assumes: **Render** for the API (+ Postgres if you want it in one place),
**Vercel** for the Next.js frontend, and either **Render Postgres** or
**Neon/Supabase** for the database, plus **Upstash** or **Render Redis** for
caching/queueing.

### 1. Provision Postgres

- Render Postgres, Neon, or Supabase all work — grab the connection string.
- Managed Postgres almost always requires SSL. If the string doesn't already
  include it, append `?sslmode=require`.

### 2. Provision Redis

- Upstash's free tier works well for a portfolio project and gives you a
  `rediss://` (TLS) URL — use that as-is for `REDIS_URL`.
- If you use Render Redis instead, same idea: copy the connection string it
  gives you.

### 3. Deploy the API to Render

- New **Web Service** → connect your repo → root directory `api/`.
- Render will detect the `Dockerfile` and build it (multi-stage: builds
  TypeScript, then runs `prisma migrate deploy` before starting the server).
- Environment variables to set:
  - `DATABASE_URL` — from step 1
  - `REDIS_URL` — from step 2
  - `BASE_URL` — your Render service URL, e.g. `https://tinylink-api.onrender.com`
  - `CORS_ORIGIN` — your Vercel URL, e.g. `https://tinylink.vercel.app`
    (add it after step 4, once you know the URL — redeploy or restart after)
  - `NODE_ENV=production`
  - `RATE_LIMIT_WINDOW_SECONDS`, `RATE_LIMIT_MAX_REQUESTS` — optional, defaults are fine
- **Free/starter Render web services spin down on idle.** The live SSE
  analytics feed will drop when that happens and reconnect on the next
  request — acceptable for a demo, not for anything real. Upgrade the plan
  if you need it always-on.
- **Scaling note:** the background click-drain worker currently runs inside
  the same process as the API (`startClickDrainWorker()` in `index.ts`).
  This is fine at a single instance. If you ever scale the API to 2+
  instances on Render, split the worker into its own Background Worker
  service pointed at the same `dist/workers/clickDrainWorker.js`, so you
  don't end up with multiple workers draining the same Redis queue at once.

### 4. Deploy the frontend to Vercel

- Import the repo → set the **root directory to `web/`** (Vercel builds
  Next.js natively; it ignores `web/Dockerfile`).
- Environment variable: `NEXT_PUBLIC_API_URL` = your Render API URL from
  step 3 (e.g. `https://tinylink-api.onrender.com`).
- Deploy. Then go back to Render and set `CORS_ORIGIN` to this Vercel URL,
  and restart the API service so it picks up the change.

### 5. Run the first migration

The API Dockerfile's start command already runs `prisma migrate deploy`
automatically on every deploy, so the `links` and `clicks` tables will exist
before the server starts accepting requests. No manual step needed — just
confirm it in the Render deploy logs the first time.

### Before you call it production-ready

This project was built to demonstrate backend system-design patterns for
interviews, not hardened for public traffic. Worth knowing before you share
the URL widely:

- **No auth** — anyone can create links (rate-limited only) and view any
  link's analytics if they know its code.
- **No error monitoring** — add Sentry or similar if you want visibility
  into production failures beyond console logs.
- **Free-tier cold starts** — see the Render note above.

## API Endpoints

| Method | Path                     | Description                          |
|--------|--------------------------|---------------------------------------|
| POST   | `/api/links`             | Create short link                    |
| GET    | `/:code`                 | Redirect + record click event        |
| GET    | `/api/links/:code`       | Get link metadata                    |
| GET    | `/api/links`             | List links (cursor paginated)        |
| GET    | `/api/analytics/:code`   | Aggregated click analytics           |
| GET    | `/api/analytics/:code/stream` | Server-Sent Events live click feed |
