FROM node:20-bookworm-slim

# `git` for branch listing, ca-certificates for HTTPS git operations.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

ENV PORT=4300
EXPOSE 4300

CMD ["node", "src/server.js"]
