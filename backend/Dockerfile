# C-3: build context must be repo root (.) to resolve @twin/core workspace dep

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy root workspace files
COPY package*.json ./

# Copy workspace package.jsons
COPY packages/core/package.json ./packages/core/
COPY backend/package.json ./backend/

# Copy core source
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig*.json ./packages/core/

# Install all workspace dependencies
RUN npm ci --workspaces --if-present

# Build @twin/core first
RUN npm run build -w @twin/core

# Generate Prisma client (next schema only)
RUN npx prisma generate --schema backend/prisma/next/schema.prisma

# Copy backend source
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/
COPY backend/prisma ./backend/prisma/

# Build backend
RUN npm run build -w ict-digital-twin-backend

# Prune dev dependencies
RUN npm prune --omit=dev

# Production stage
FROM node:20-alpine AS production

# Install OpenSSL for Prisma and create user in single layer
RUN apk add --no-cache openssl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    mkdir -p /app/uploads && \
    chown -R nodejs:nodejs /app

WORKDIR /app

# Copy only necessary files from builder with correct ownership
COPY --from=builder --chown=nodejs:nodejs /app/backend/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/backend/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/prisma ./prisma
# C-2: seed.ts imports ../../src/generated/next-client — copy so seed can run in prod image
COPY --from=builder --chown=nodejs:nodejs /app/backend/src/generated ./src/generated
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/next/schema.prisma && npm run db:next:seed && node dist/index.js"]
