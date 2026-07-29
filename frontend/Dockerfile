# C-3: build context must be repo root (.) to resolve @twin/core workspace dep

# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package*.json ./

# Copy workspace package.jsons
COPY packages/core/package.json ./packages/core/
COPY frontend/package.json ./frontend/

# Copy core source
COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig*.json ./packages/core/

# Install all workspace dependencies
RUN npm ci --workspaces --if-present

# Build @twin/core first
RUN npm run build -w @twin/core

# Copy frontend source
COPY frontend/src ./frontend/src
COPY frontend/index.html ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/tsconfig*.json ./frontend/

# Build frontend
RUN npm run build -w ict-digital-twin-frontend

# Production stage
FROM nginx:alpine AS production

# Copy nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Create non-root user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    chown -R nginx:nginx /etc/nginx/conf.d && \
    touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid

USER nginx

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
