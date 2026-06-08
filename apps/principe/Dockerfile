# Principe web app — Next.js 16 + Prisma 7.
# Built from project root: `docker build -f apps/principe/Dockerfile .`

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat curl bash openssl \
    && npm install -g pnpm@11.2.2
WORKDIR /workspace

# ── Deps layer ────────────────────────────────────────────────────────
# Copy only the manifests needed to resolve the workspace, so dep
# changes don't invalidate the layer when only source changes.
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/principe/package.json ./apps/principe/
COPY packages/rbac/package.json ./packages/rbac/
COPY packages/theme/package.json ./packages/theme/
COPY packages/telemetry/package.json ./packages/telemetry/
RUN pnpm install --frozen-lockfile

# ── Build layer ───────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/principe/node_modules ./apps/principe/node_modules
COPY --from=deps /workspace/packages ./packages
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd apps/principe && pnpm exec prisma generate
RUN pnpm --filter principe build

# ── Runtime layer ─────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Run as the unprivileged `node` user (uid 1000, ships in node:alpine). The
# `--chown` on COPY sets ownership during the copy (no extra fat layer), so the
# app dir — including .next/cache that `next start` writes for image
# optimization — is writable by node. Reduces the blast radius of any RCE.
COPY --chown=node:node --from=builder /workspace ./
COPY --chown=node:node apps/principe/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3000/ -o /dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
