FROM node:20-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN node scripts/docs-bundle.mjs

FROM node:20-slim
RUN apt-get update && apt-get install -y python3 make g++ chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG BUILD_SHA=unknown
ARG GITHUB_SHA=unknown
ARG GH_SHA=$GITHUB_SHA
LABEL GITHUB_SHA=$GITHUB_SHA
LABEL GH_SHA=$GH_SHA
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/docs ./docs
COPY --from=build /app/spec ./public/spec
COPY scripts/operations ./scripts/operations
COPY start.cjs ./start.cjs
COPY verified-identity-reconciliation-bootstrap.cjs ./verified-identity-reconciliation-bootstrap.cjs
COPY oauth-authorize-recovery-bootstrap.cjs ./oauth-authorize-recovery-bootstrap.cjs
COPY account-recovery-bootstrap.cjs ./account-recovery-bootstrap.cjs
COPY admin-recovery-bootstrap.cjs ./admin-recovery-bootstrap.cjs
COPY commlink-feed-projection-bootstrap.cjs ./commlink-feed-projection-bootstrap.cjs
COPY commlink-rich-chat-bootstrap.cjs ./commlink-rich-chat-bootstrap.cjs
COPY commlink-source-controls-bootstrap.cjs ./commlink-source-controls-bootstrap.cjs
COPY commlink-identity-routing-bootstrap.cjs ./commlink-identity-routing-bootstrap.cjs
COPY commlink-production-bootstrap.cjs ./commlink-production-bootstrap.cjs
COPY commlink-diagnostic-bootstrap.cjs ./commlink-diagnostic-bootstrap.cjs
COPY cloud-xbox-bootstrap.cjs ./cloud-xbox-bootstrap.cjs
COPY tenant-overlay-events-bootstrap.cjs ./tenant-overlay-events-bootstrap.cjs
COPY tenant-overlay-bootstrap.cjs ./tenant-overlay-bootstrap.cjs
COPY xbox-worker.cjs ./xbox-worker.cjs
COPY xbox-worker-guard.cjs ./xbox-worker-guard.cjs
COPY athena-command-bootstrap.cjs ./athena-command-bootstrap.cjs
COPY easter-egg-entitlement-bootstrap.cjs ./easter-egg-entitlement-bootstrap.cjs
COPY presence-bootstrap.cjs ./presence-bootstrap.cjs
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/spmt.db
ENV BUILD_SHA=$BUILD_SHA
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV CLOUD_XBOX_PROFILE_ROOT=/var/lib/spmt-xbox/profiles
EXPOSE 3000 3003
CMD ["node", "start.cjs"]
