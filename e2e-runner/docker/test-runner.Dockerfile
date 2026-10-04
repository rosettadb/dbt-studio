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
    # dbus/gnome-keyring: the app's secure-storage service loads `keytar`,
    # which hangs indefinitely (no error) waiting for a D-Bus Secret Service
    # that doesn't exist in a bare container, blocking window creation.
    dbus dbus-x11 gnome-keyring \
    && rm -rf /var/lib/apt/lists/*

# Chromium system deps baked in so the per-run `playwright install --with-deps`
# finds them already installed instead of unpacking them on every run. Keep the
# version in line with the app's package-lock; the entrypoint's --with-deps
# still covers anything a future Playwright upgrade adds.
RUN npx -y playwright@1.57.0 install-deps chromium \
    && rm -rf /var/lib/apt/lists/* /root/.npm

COPY test-entrypoint.sh /usr/local/bin/test-entrypoint.sh
RUN chmod +x /usr/local/bin/test-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/test-entrypoint.sh"]
