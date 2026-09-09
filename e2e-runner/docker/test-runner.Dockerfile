# Base image for the disposable per-run container. Rebuild manually via
# scripts/build-test-image.sh only when this file changes — day-to-day
# dependency changes in the app repo are picked up live at run time (see
# test-entrypoint.sh), not baked into this image.
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    xvfb \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libasound2 \
    libgtk-3-0 libgdk-pixbuf-2.0-0 libpango-1.0-0 libcairo2 libglib2.0-0 \
    libx11-xcb1 libxcb-dri3-0 libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

COPY test-entrypoint.sh /usr/local/bin/test-entrypoint.sh
RUN chmod +x /usr/local/bin/test-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/test-entrypoint.sh"]
