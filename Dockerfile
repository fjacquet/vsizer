# vsizer container image — see ADR-0013.
# Two stages: node:24-alpine builder produces dist/ with base='/',
# nginxinc/nginx-unprivileged:1.27-alpine serves it under a hardened config.

# syntax=docker/dockerfile:1.9

# ── Stage 1: builder ────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

# Install dependencies first for layer caching.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build with container-flavoured base path.
COPY . .
RUN npm run build:container

# ── Stage 2: runtime ────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# OCI annotations — values are overridden at build time by metadata-action.
LABEL org.opencontainers.image.title="vsizer" \
      org.opencontainers.image.description="Factual VMware cluster utilization deck from RVTools / Live Optics — 100% client-side." \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/fjacquet/vsizer" \
      org.opencontainers.image.vendor="Frédéric Jacquet" \
      org.opencontainers.image.url="https://github.com/fjacquet/vsizer"

# Replace the default nginx-unprivileged server block with vsizer's
# hardened version. security-headers.conf is included from every location
# block in default.conf (see nginx.conf for why).
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf

# Static SPA — owned by the non-root nginx user (uid 101).
COPY --from=builder --chown=101:101 /app/dist/ /usr/share/nginx/html/

USER 101
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
