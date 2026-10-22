# Kodim — server (API + o'qituvchi paneli) va web (Caddy + landing) image'lari.
#   docker compose build   (docker-compose.yml target'larni tanlaydi)
FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH ELECTRON_SKIP_BINARY_DOWNLOAD=1 CI=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app
COPY . .
# Desktop (Electron) kerak emas — faqat server, panel, landing va shared.
RUN pnpm install --frozen-lockfile --filter "@exam-ide/server..." --filter "@exam-ide/panel..." --filter "@exam-ide/landing..."
RUN pnpm --filter @exam-ide/shared build \
  && pnpm --filter @exam-ide/panel build \
  && pnpm --filter @exam-ide/server build \
  && pnpm --filter @exam-ide/landing build

# ---- Server: Node + Prisma (SQLite /data da)
FROM node:24-bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 kodim && mkdir -p /data && chown kodim /data
WORKDIR /app
COPY --from=build --chown=kodim /app /app
RUN chmod +x /app/deploy/server-entrypoint.sh
USER kodim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 DATABASE_URL=file:/data/kodim.db
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "/app/deploy/server-entrypoint.sh"]

# ---- Web: Caddy (avtomatik HTTPS) + statik landing
FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/landing/dist /srv/landing
