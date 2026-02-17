FROM node:20-slim

RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --include=dev

COPY . .

RUN mkdir -p /data /data/uploads && chown -R node:node /data /app

ENV DB_PATH=/data/blite.db
ENV UPLOAD_DIR=/data/uploads
ENV CORS_ORIGIN=*

USER node

EXPOSE 3001

CMD ["npm", "run", "start"]
