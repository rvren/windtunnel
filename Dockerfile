# syntax=docker/dockerfile:1

# Windtunnel as one image: the Next.js standalone server on Node 24.
#   docker compose up --build

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# Dependencies, in their own layer so a code change does not reinstall them.
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# The image that runs: only the standalone output, as a user that is not root.
FROM node:24-alpine AS run
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3300
ENV HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S windtunnel && adduser -S windtunnel -G windtunnel
COPY --from=build --chown=windtunnel:windtunnel /app/.next/standalone ./
COPY --from=build --chown=windtunnel:windtunnel /app/.next/static ./.next/static
# The SQL migrations. The server applies them when it starts.
COPY --from=build --chown=windtunnel:windtunnel /app/drizzle ./drizzle
USER windtunnel
EXPOSE 3300
CMD ["node", "server.js"]
