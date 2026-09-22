# ---- deps + build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- production stage ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Reuse the full node_modules from the builder stage rather than a fresh
# --omit=dev install: `prisma migrate deploy` below needs the Prisma CLI
# (a devDependency), so we keep it available in the runtime image.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

# Applies any pending migrations, then starts the server. On Render this
# can alternatively be split out into a "Pre-Deploy Command" — see the
# README's Deploying section for both options.
CMD npx prisma migrate deploy && node dist/index.js
