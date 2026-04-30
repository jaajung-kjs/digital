#!/usr/bin/env bash
# Build production images for the air-gapped server (linux/amd64) and pack
# them into tar.gz archives ready for transfer.
#
# Output (in ./dist-deploy/):
#   - postgres.tar.gz
#   - backend.tar.gz
#   - frontend.tar.gz
#
# After running this script, transfer the three archives + ./docker-compose.prod.yml
# + ./.env (made from ./.env.prod.example) to the server.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/dist-deploy"
PLATFORM="linux/amd64"

mkdir -p "$OUT"
cd "$ROOT"

echo "▶ Pulling postgres:15-alpine for $PLATFORM …"
docker pull --platform "$PLATFORM" postgres:15-alpine

echo "▶ Building digital-backend:latest …"
docker buildx build --platform "$PLATFORM" \
  -t digital-backend:latest \
  -f backend/Dockerfile backend/ \
  --load

echo "▶ Building digital-frontend:latest …"
docker buildx build --platform "$PLATFORM" \
  -t digital-frontend:latest \
  -f frontend/Dockerfile frontend/ \
  --load

echo "▶ Saving images to $OUT …"
docker save postgres:15-alpine        | gzip > "$OUT/postgres.tar.gz"
docker save digital-backend:latest    | gzip > "$OUT/backend.tar.gz"
docker save digital-frontend:latest   | gzip > "$OUT/frontend.tar.gz"

cp "$ROOT/docker-compose.prod.yml" "$OUT/"
cp "$ROOT/.env.prod.example"      "$OUT/.env.example"

echo
echo "✅ Done. Transfer these to the server:"
ls -lh "$OUT"
echo
echo "On the server:"
echo "  1) podman load -i postgres.tar.gz"
echo "  2) podman load -i backend.tar.gz"
echo "  3) podman load -i frontend.tar.gz"
echo "  4) cp .env.example .env  &&  edit secrets"
echo "  5) podman-compose -f docker-compose.prod.yml up -d"
