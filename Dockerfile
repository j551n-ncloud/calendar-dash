# Wolfi (glibc) for both stages; -dev adds npm and a shell for building
FROM cgr.dev/chainguard/node:latest-dev AS base
USER root

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_APP_VERSION=dev
ENV NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── runner ────────────────────────────────────────────────────────────────────
FROM cgr.dev/chainguard/node:latest AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# npm is only needed to build; dropping it removes the CVEs in its bundled dependencies.
# Then drop the nghttp2 client tools and busybox, so the image has no shell and nothing but node
USER root
RUN ["node", "-e", "\
const fs = require('fs'); \
for (const p of ['/usr/lib/node_modules', '/usr/bin/npm', '/usr/bin/npx', '/usr/bin/node-gyp', \
  '/usr/bin/h2load', '/usr/bin/nghttp', '/usr/bin/nghttpd', '/usr/bin/nghttpx']) fs.rmSync(p, { recursive: true, force: true }); \
for (const d of ['/usr/bin', '/usr/sbin']) for (const f of fs.existsSync(d) ? fs.readdirSync(d) : []) { \
  const p = d + '/' + f; if (fs.lstatSync(p).isSymbolicLink() && fs.readlinkSync(p).endsWith('busybox')) fs.unlinkSync(p); } \
fs.unlinkSync('/usr/bin/busybox');"]

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 8080
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# the image entrypoint is node
CMD ["server.js"]
