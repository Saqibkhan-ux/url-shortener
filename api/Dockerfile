FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 4000

# Apply checked-in migrations before starting the API. This makes a fresh
# `docker compose up` usable without manually creating database tables.
CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]
