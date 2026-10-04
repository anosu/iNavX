FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm install -g bun@1.3.12
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build && bun install --production --frozen-lockfile

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data BACKUP_DIR=/app/backups
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/src/data/sites.json ./src/data/sites.json
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["node", "dist-server/server/entry.js"]
CMD ["serve"]
