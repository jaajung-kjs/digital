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

# `--provenance=false`: Docker Desktop 27+ attaches an attestation manifest by
# default which `docker save` cannot serialise into a single-arch archive
# ("unable to create manifests file"). Disabling provenance keeps the output
# a plain image manifest that `docker load` / `podman load` accept anywhere.
echo "▶ Building digital-backend:latest …"
docker buildx build --platform "$PLATFORM" \
  --provenance=false \
  -t digital-backend:latest \
  -f backend/Dockerfile backend/ \
  --load

echo "▶ Building digital-frontend:latest …"
docker buildx build --platform "$PLATFORM" \
  --provenance=false \
  -t digital-frontend:latest \
  -f frontend/Dockerfile frontend/ \
  --load

# `--platform`: the host is arm64 (Apple Silicon) but the cached image is a
# multi-arch index, so docker save defaults to the host arch's variant. We
# explicitly pin amd64 since the deploy target is RHEL 9.4 / amd64.
echo "▶ Saving images to $OUT …"
docker save --platform "$PLATFORM" postgres:15-alpine        | gzip > "$OUT/postgres.tar.gz"
docker save --platform "$PLATFORM" digital-backend:latest    | gzip > "$OUT/backend.tar.gz"
docker save --platform "$PLATFORM" digital-frontend:latest   | gzip > "$OUT/frontend.tar.gz"

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
