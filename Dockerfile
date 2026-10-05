FROM oven/bun:1.3.12 AS frontend
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM golang:1.27.1-bookworm AS backend
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY backend ./backend
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /inav ./backend

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && groupadd -g 1000 inav && useradd -u 1000 -g inav -M inav && mkdir data backups && chown inav:inav data backups
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data BACKUP_DIR=/app/backups GOMEMLIMIT=64MiB
COPY --from=backend /inav /usr/local/bin/inav
COPY --from=frontend /app/dist ./dist
COPY --from=frontend /app/runtime ./runtime
COPY package.json ./
COPY migrations ./migrations
COPY src/data/sites.json ./src/data/sites.json
USER inav
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["inav", "health"]
ENTRYPOINT ["inav"]
CMD ["serve"]
