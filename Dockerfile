# Test images for Lazarus 1-2-3. The app itself is static files (bun run build -> dist/); these
# images only run the checks.
#
#   bun run docker:test   typecheck and the Vitest suite (target "test")
#   bun run docker:e2e    the Playwright suite in Chromium with CI=1 (target "e2e")
#
# Both run as a non-root user: the CLI and MCP tests make a file unreadable with chmod 000 and
# expect an error, which root would not get.

ARG BUN_VERSION=1.4.2
ARG NODE_VERSION=24
ARG PLAYWRIGHT_VERSION=1.65.1

FROM oven/bun:${BUN_VERSION} AS bun

# Dependencies exactly as bun.lock pins them. Vitest and Playwright start under node, and the tests
# spawn bun, so every stage has both.
FROM node:${NODE_VERSION}-bookworm-slim AS deps
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:${NODE_VERSION}-bookworm-slim AS test
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV CI=1
RUN install -d -o node -g node /app
WORKDIR /app
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .
USER node
CMD ["sh", "-c", "bun run typecheck && bun run test"]

# Microsoft's Playwright image of the same version as @playwright/test, so Chromium and its
# system libraries are already in /ms-playwright. pwuser is its non-root user.
FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS e2e
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
ENV CI=1
RUN install -d -o pwuser -g pwuser /app
WORKDIR /app
COPY --chown=pwuser:pwuser --from=deps /app/node_modules ./node_modules
COPY --chown=pwuser:pwuser . .
USER pwuser
CMD ["bun", "run", "e2e"]
