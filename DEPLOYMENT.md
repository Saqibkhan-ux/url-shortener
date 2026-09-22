# TinyLink Production Deployment Guide

This guide covers how to deploy the TinyLink URL shortener to production.

---

## 1. Environment Variables Reference

| Variable | Scope | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | API | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `REDIS_URL` | API | Redis connection string | `redis://default:pass@host:6379` or `rediss://...` (TLS) |
| `BASE_URL` | API | The public domain used for short link URLs | `https://api.yourdomain.com` |
| `PORT` | API | HTTP port Express listens on (auto-assigned by PaaS) | `4000` |
| `NODE_ENV` | API & Web | Node environment | `production` |
| `CORS_ORIGIN` | API | Allowed frontend origin (optional, defaults to `*`) | `https://yourdomain.com` |
| `RATE_LIMIT_WINDOW_SECONDS` | API | Window size for rate limiting in seconds | `60` |
| `RATE_LIMIT_MAX_REQUESTS` | API | Max link creations per window per IP | `30` |
| `NEXT_PUBLIC_API_URL` | Web | The public URL of the API used by the frontend | `https://api.yourdomain.com` |

---

## 2. Option A: Deploy on Render (Recommended Blueprint)

Render allows you to spin up all 4 components (Postgres, Redis, API, and Next.js frontend) with a single click using the included `render.yaml` Blueprint.

### Steps:
1. Push this repository to your GitHub account.
2. Sign in to [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** > **Blueprint**.
4. Connect your GitHub repository `url-shortener`.
5. Render will detect `render.yaml` and prompt you to create:
   - `tinylink-db` (PostgreSQL)
   - `tinylink-redis` (Redis)
   - `tinylink-api` (Docker Web Service)
   - `tinylink-web` (Docker Web Service)
6. Once deployed, copy your `tinylink-api` URL (e.g. `https://tinylink-api.onrender.com`):
   - Set `BASE_URL` on `tinylink-api` to `https://tinylink-api.onrender.com`.
   - Set `NEXT_PUBLIC_API_URL` on `tinylink-web` to `https://tinylink-api.onrender.com`.
7. Trigger a redeploy for the web frontend to bake in `NEXT_PUBLIC_API_URL`.

---

## 3. Option B: Deploy on Railway

Railway is a developer-friendly PaaS with built-in private networking and managed databases.

### Steps:
1. Create a new project in [Railway](https://railway.app/).
2. Add **PostgreSQL** (`+ New` > `Database` > `PostgreSQL`).
3. Add **Redis** (`+ New` > `Database` > `Redis`).
4. Add **API Service**:
   - `+ New` > `GitHub Repo` > select `url-shortener`.
   - In Settings, set **Root Directory** to `/api`.
   - Under Variables, add:
     - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
     - `REDIS_URL` = `${{Redis.REDIS_URL}}`
     - `NODE_ENV` = `production`
     - `PORT` = `4000`
     - `BASE_URL` = `https://${{RAILWAY_PUBLIC_DOMAIN}}` (or your custom domain)
   - Generate a domain under **Settings** > **Networking**.
5. Add **Web Service**:
   - `+ New` > `GitHub Repo` > select `url-shortener`.
   - In Settings, set **Root Directory** to `/web`.
   - Under Variables, add:
     - `NEXT_PUBLIC_API_URL` = `https://<your-api-domain>`
     - `NODE_ENV` = `production`
   - Generate a domain under **Settings** > **Networking**.

---

## 4. Option C: Deploy on a Single VPS with Docker & Caddy (Cost: $4–$6/mo)

For complete control and low cost on any Linux VPS (Ubuntu/Debian on Hetzner, DigitalOcean, Linode, AWS EC2):

### 1. Install Docker & Docker Compose on your VPS:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
```

### 2. Clone repository & configure environment:
```bash
git clone https://github.com/Saqibkhan-ux/url-shortener.git /opt/url-shortener
cd /opt/url-shortener
cp .env.example .env
```
Edit `.env` with strong production credentials:
```env
POSTGRES_USER=tinylink
POSTGRES_PASSWORD=your_super_secret_db_password
POSTGRES_DB=tinylink
DATABASE_URL=postgresql://tinylink:your_super_secret_db_password@postgres:5432/tinylink
REDIS_URL=redis://redis:6379
BASE_URL=https://api.yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NODE_ENV=production
```

### 3. Setup Caddy for Automatic SSL:
Create `/opt/url-shortener/Caddyfile`:
```caddy
yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:4000
}
```

### 4. Start services:
```bash
# Start TinyLink stack
docker compose -f docker-compose.prod.yml up -d --build

# Run Caddy reverse proxy with automatic HTTPS
docker run -d \
  --name caddy \
  --restart always \
  --network host \
  -v /opt/url-shortener/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  caddy:2-alpine
```

---

## 5. Option D: Next.js on Vercel + Backend on PaaS

1. **Deploy API & Databases**: Follow Option A (Render) or Option B (Railway) for the backend.
2. **Deploy Frontend on Vercel**:
   - Go to [Vercel](https://vercel.com/) > **Add New Project**.
   - Import your GitHub repository.
   - Set **Root Directory** to `web`.
   - Add Environment Variable:
     - `NEXT_PUBLIC_API_URL` = `https://<your-api-domain>`
   - Deploy.

---

## 6. Post-Deployment Smoke Test

Once deployed, verify the full flow:

1. **Health Check**:
   ```bash
   curl https://<api-domain>/health
   # Expected response: {"status":"ok"}
   ```

2. **Create Short Link**:
   ```bash
   curl -X POST https://<api-domain>/api/links \
     -H "Content-Type: application/json" \
     -d '{"longUrl":"https://github.com"}'
   # Expected response: {"code":"...","shortUrl":"https://<api-domain>/...","longUrl":"https://github.com"}
   ```

3. **Test Redirection**:
   Open the generated `shortUrl` in your browser. It should immediately redirect to `https://github.com` and log an asynchronous click event.

4. **Verify Analytics**:
   Visit `https://<web-domain>/dashboard/<code>` to view real-time click metrics and referrers.
