# Note: Vercel does NOT use this Dockerfile — it builds Next.js natively
# from package.json. This file is only needed if you deploy the frontend
# somewhere else (e.g. Render, a VPS, another container host).

FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
