FROM node:20-slim AS build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

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
COPY public ./public
COPY docs ./docs
COPY scripts/operations ./scripts/operations
COPY start.cjs ./start.cjs
COPY oauth-authorize-recovery-bootstrap.cjs ./oauth-authorize-recovery-bootstrap.cjs
COPY cloud-xbox-bootstrap.cjs ./cloud-xbox-bootstrap.cjs
COPY tenant-overlay-events-bootstrap.cjs ./tenant-overlay-events-bootstrap.cjs
COPY tenant-overlay-bootstrap.cjs ./tenant-overlay-bootstrap.cjs
COPY xbox-worker.cjs ./xbox-worker.cjs
COPY xbox-worker-guard.cjs ./xbox-worker-guard.cjs
COPY athena-command-bootstrap.cjs ./athena-command-bootstrap.cjs
ENV NODE_ENV=production
ENV DATABASE_PATH=/data/spmt.db
ENV BUILD_SHA=$BUILD_SHA
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV CLOUD_XBOX_PROFILE_ROOT=/var/lib/spmt-xbox/profiles
EXPOSE 3000 3003
CMD ["node", "start.cjs"]