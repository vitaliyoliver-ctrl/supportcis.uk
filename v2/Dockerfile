# Один образ: Node-процесс отдаёт собранный фронт (app/dist) и API (/api/*).
# Контекст сборки — каталог v2/ (см. docker-compose.yml / .dockerignore).
# syntax=docker/dockerfile:1

# ── 1. Сборка фронта (Vite → app/dist) ───────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /build/app
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

# ── 2. Сборка сервера (esbuild → worker/dist/server.js) ───────────────────────
FROM node:20-alpine AS backend
WORKDIR /build/worker
COPY worker/package.json worker/package-lock.json ./
RUN npm ci
COPY worker/ ./
RUN npm run build

# ── 3. Только прод-зависимости сервера (hono, @hono/node-server, pg) ──────────
FROM node:20-alpine AS deps
WORKDIR /srv
COPY worker/package.json worker/package-lock.json ./
RUN npm ci --omit=dev

# ── 4. Рантайм ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /srv
ENV NODE_ENV=production \
    PORT=8787 \
    STATIC_DIR=./public
COPY --from=deps     /srv/node_modules  ./node_modules
COPY --from=backend  /build/worker/dist ./dist
COPY --from=frontend /build/app/dist    ./public
COPY worker/package.json ./package.json
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8787/api/health >/dev/null 2>&1 || exit 1
CMD ["node", "dist/server.js"]
