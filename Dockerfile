# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist        ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Create directories the app writes to at runtime and hand them to the node user.
# Must be done as root (before USER node) — the node user has no write access to /app.
RUN mkdir -p temp-uploads && chown -R node:node /app

# Run as non-root user — principle of least privilege
USER node

EXPOSE 9000

CMD ["node", "dist/index.js"]
