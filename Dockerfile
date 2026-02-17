## Stage 1: Build everything (sequential to avoid memory issues)
FROM node:20 AS build

# Install build tools required by mediasoup native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# --- Build web frontend ---
WORKDIR /frontend

COPY package.json package-lock.json* ./

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm ci --ignore-scripts

COPY src/renderer src/renderer
COPY shared shared
COPY tailwind.config.js vite.config.web.ts tsconfig.json tsconfig.node.json ./
COPY .env.production .env.production
COPY src/env.d.ts src/env.d.ts

RUN npx vite build --config vite.config.web.ts

# --- Install server dependencies ---
WORKDIR /server

COPY server/package.json server/package-lock.json* ./
RUN npm ci --include=dev

## Stage 2: Slim runtime image
FROM node:20-slim

WORKDIR /app

# Copy server node_modules (with compiled better-sqlite3)
COPY --from=build /server/node_modules node_modules/
COPY --from=build /server/package.json ./

# Copy server source
COPY server/ .
COPY shared/ shared/

# Copy built web frontend
COPY --from=build /frontend/dist-web public/

# Download artifacts directory (place Electron builds in downloads/ before building)
RUN mkdir -p public/downloads

RUN mkdir -p /data /data/uploads && chown -R node:node /data /app

ENV DB_PATH=/data/blite.db
ENV UPLOAD_DIR=/data/uploads
ENV CORS_ORIGIN=*

USER node

EXPOSE 3001
# mediasoup WebRTC port range (UDP+TCP for media transport)
EXPOSE 40000-40100/udp
EXPOSE 40000-40100/tcp

CMD ["npm", "run", "start"]
