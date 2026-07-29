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

# Copy prisma schema first — generate 가 참조 (F-3: generate 이전에 COPY 필요)
COPY backend/prisma ./backend/prisma/

# Generate Prisma client (next schema only)
# F-2: 루트 lockfile 이 prisma CLI 를 backend/node_modules 에 중첩 배치하므로
#      루트 cwd 의 npx 는 레지스트리 fetch 로 폴백(폐쇄망 K-Cloud 실패) —
#      npm exec -w 로 워크스페이스 스코프에서 해석한다.
# F-3: npm exec -w 는 cwd 를 워크스페이스 디렉토리(backend/)로 전환하므로
#      --schema 는 워크스페이스 상대 경로여야 한다.
RUN npm exec -w ict-digital-twin-backend -- prisma generate --schema prisma/next/schema.prisma

# Copy backend source
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/

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

# F-2: 빌더의 workspace 레이아웃을 평탄화하지 않고 그대로 유지한다.
#  - 루트 lockfile 이 prisma/@prisma/client 를 backend/node_modules 에 중첩 배치하므로
#    루트로 평탄화하면 CMD 의 npx prisma 가 레지스트리 fetch 로 폴백(폐쇄망 실패).
#  - WORKDIR /app/backend 에서는 npx(./node_modules/.bin/prisma), tsx(루트 호이스트,
#    npm run 이 상위 node_modules/.bin 을 PATH 에 추가), @twin/core 심링크
#    (/app/node_modules/@twin/core → ../../packages/core), seed.ts 의
#    ../../src/generated 상대경로가 전부 자연 해석된다.
COPY --from=builder --chown=nodejs:nodejs /app/package*.json /app/
COPY --from=builder --chown=nodejs:nodejs /app/node_modules /app/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages /app/packages
COPY --from=builder --chown=nodejs:nodejs /app/backend/package*.json /app/backend/
COPY --from=builder --chown=nodejs:nodejs /app/backend/node_modules /app/backend/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/backend/dist /app/backend/dist
COPY --from=builder --chown=nodejs:nodejs /app/backend/prisma /app/backend/prisma
# C-2: seed.ts imports ../../src/generated/next-client — copy so seed can run in prod image
COPY --from=builder --chown=nodejs:nodejs /app/backend/src/generated /app/backend/src/generated

WORKDIR /app/backend

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/next/schema.prisma && npm run db:next:seed && node dist/index.js"]
