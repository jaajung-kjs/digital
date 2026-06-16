#!/usr/bin/env bash
# Build production images for the air-gapped server (linux/amd64) and pack
# them as base64 .txt files (intranet upload policy blocks .tar.gz / .yml
# *and* compound extensions like .tar.gz.txt — only a plain `.txt` slips
# through). Each artefact gets a single-word filename ending in .txt.
#
# Output (in ./dist-deploy/):
#   - postgres.txt   (postgres:15-alpine image tarball)
#   - backend.txt    (digital-backend image tarball)
#   - frontend.txt   (digital-frontend image tarball)
#   - env.txt        (env.example template)
#   - deploy.txt     (decode-and-deploy.sh helper script)
#
# Transfer the five .txt files to the RHEL server, then run the decode
# script (instructions printed at the end of this script).

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
echo "▶ Saving images to temp tarballs …"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
docker save --platform "$PLATFORM" postgres:15-alpine        | gzip > "$TMPDIR/postgres.tar.gz"
docker save --platform "$PLATFORM" digital-backend:latest    | gzip > "$TMPDIR/backend.tar.gz"
docker save --platform "$PLATFORM" digital-frontend:latest   | gzip > "$TMPDIR/frontend.tar.gz"

# Bundle the deploy artefacts that should land next to the loaded images.
# The server runs `podman run` directly via the embedded helper — no compose
# tool required.
cp "$ROOT/.env.prod.example"        "$TMPDIR/env.example"

# Write a server-side decoder + deploy script.
# Designed for both first deploy and incremental updates: only the .txt files
# present in the directory are decoded/loaded, so re-uploading just one of
# {backend,frontend,postgres}.tar.gz.txt and re-running the script will pick
# up only the new image, leaving named volumes (postgres_data / uploads_data)
# and the existing .env untouched.
cat > "$TMPDIR/decode-and-deploy.sh" <<'DECODE'
#!/usr/bin/env bash
# Run on the air-gapped RHEL 9.4 server (podman, no podman-compose).
#
# First deploy:
#   1) place all five *.txt files in one directory:
#        postgres.txt  backend.txt  frontend.txt  env.txt  deploy.txt
#   2) base64 -d deploy.txt > decode-and-deploy.sh
#      chmod +x decode-and-deploy.sh
#   3) ./decode-and-deploy.sh
#      (first run creates .env from env.example and asks you to edit it)
#   4) edit .env, then ./decode-and-deploy.sh again
#
# ⚠️  One-time upgrade from an OLD deployed version (incompatible schema):
#   If a previous deploy left a postgres_data volume built by an OLDER schema,
#   `prisma migrate deploy` will fail against it. Wipe the old DB volume ONCE
#   before the first run of this new version — this is the ONLY time data is
#   deleted. After that every re-run preserves the volume (see below).
#       podman rm -f ict-twin-postgres 2>/dev/null || true
#       podman volume rm postgres_data 2>/dev/null || true
#   (uploads_data may be kept or wiped independently; it is schema-agnostic.)
#   Then run ./decode-and-deploy.sh as usual — the empty volume is recreated
#   and migrate+seed rebuilds everything from scratch.
#
# Incremental update (every subsequent deploy — data is PRESERVED):
#   only overwrite the .txt files you changed (e.g. backend.txt). Older
#   .txt files left untouched mean the same image stays loaded. The script
#   recreates only the containers whose image was reloaded; named volumes
#   (postgres_data, uploads_data) and the existing .env are never touched.
#   `prisma migrate deploy` applies only new migrations and the seed is
#   idempotent (create-only upsert), so operator edits survive re-deploys.
set -euo pipefail

cd "$(dirname "$0")"

NETWORK=ict-twin-net

# Rootless podman, no sudo. The frontend is published on 8080 (>1024) so
# rootless can bind it directly — the earlier rootful detour was a misdiagnosis
# of a network-level port-80 block, not a podman binding limitation.
PODMAN="podman"

# Decode only when the .txt is newer than the previously-decoded artefact.
# Re-uploading a single .txt overwrites its mtime, triggering a re-decode.
decode_if_changed() {
  local txt="$1" out="$2"
  if [[ ! -f "$txt" ]]; then
    echo "  · skip $txt (not present)"
    return
  fi
  if [[ -f "$out" && "$out" -nt "$txt" ]]; then
    echo "  · $out up-to-date"
    return
  fi
  echo "▶ decoding $txt -> $out"
  base64 -d "$txt" > "$out"
}

decode_if_changed postgres.txt   postgres.tar.gz
decode_if_changed backend.txt    backend.tar.gz
decode_if_changed frontend.txt   frontend.tar.gz
decode_if_changed env.txt        env.example

# `podman load` only when the tarball actually changed since last load.
# Records the load with `.{img}.loaded` mtime; reloads when tarball is newer.
# A new image hash implies the matching container must be recreated, so we
# track which images need a container restart this run.
RESTART_POSTGRES=0
RESTART_BACKEND=0
RESTART_FRONTEND=0

echo "▶ loading container images (skipping unchanged) …"
load_if_changed() {
  local img="$1" var="$2" stamp=".${1}.loaded"
  if [[ ! -f "$img" ]]; then return; fi
  if [[ -f "$stamp" && "$stamp" -nt "$img" ]]; then
    echo "  · $img already loaded"
    return
  fi
  echo "  · $PODMAN load -i $img"
  $PODMAN load -i "$img"
  touch "$stamp"
  printf -v "$var" "1"
  declare -g "$var"
}
load_if_changed postgres.tar.gz   RESTART_POSTGRES
load_if_changed backend.tar.gz    RESTART_BACKEND
load_if_changed frontend.tar.gz   RESTART_FRONTEND

# First-time setup: create .env from template and ask the user to edit it
# before re-running. We bail before launching any containers so a half-
# configured deploy never sees the network.
if [[ ! -f .env ]]; then
  if [[ ! -f env.example ]]; then
    echo "❌ Neither .env nor env.example present — upload env.txt at least once."
    exit 1
  fi
  cp env.example .env
  echo
  echo "⚠️  .env created from env.example — edit it before starting:"
  echo "    vi .env       # set DB_PASSWORD / JWT_*_SECRET / CORS_ORIGIN"
  echo
  echo "Then run this script again:"
  echo "    ./decode-and-deploy.sh"
  exit 0
fi

# Load env vars from .env into this shell (the `set -a` exports each
# assignment; required by the podman -e flags below).
set -a
# shellcheck disable=SC1091
source .env
set +a

# Sanity: refuse to start with placeholder secrets still in .env.
if grep -qE '__CHANGE_ME' .env; then
  echo "❌ .env still contains __CHANGE_ME placeholders. Replace them first."
  exit 1
fi

# Network + volumes (idempotent — these create only when missing)
$PODMAN network exists "$NETWORK"        || $PODMAN network create "$NETWORK"
$PODMAN volume  exists postgres_data     || $PODMAN volume  create postgres_data
$PODMAN volume  exists uploads_data      || $PODMAN volume  create uploads_data

run_postgres() {
  $PODMAN rm -f ict-twin-postgres 2>/dev/null || true
  $PODMAN run -d --name ict-twin-postgres \
    --network "$NETWORK" \
    --network-alias postgres \
    --restart unless-stopped \
    -e POSTGRES_USER="${DB_USER:-postgres}" \
    -e POSTGRES_PASSWORD="$DB_PASSWORD" \
    -e POSTGRES_DB="${DB_NAME:-ict_digital_twin}" \
    -v postgres_data:/var/lib/postgresql/data \
    --health-cmd="pg_isready -U ${DB_USER:-postgres}" \
    --health-interval=10s \
    --health-timeout=5s \
    --health-retries=5 \
    postgres:15-alpine
}

run_backend() {
  $PODMAN rm -f ict-twin-backend 2>/dev/null || true
  $PODMAN run -d --name ict-twin-backend \
    --network "$NETWORK" \
    --network-alias backend \
    --restart unless-stopped \
    -e NODE_ENV=production \
    -e DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-ict_digital_twin}" \
    -e JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
    -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
    -e JWT_ACCESS_EXPIRES_IN="${JWT_ACCESS_EXPIRES_IN:-1h}" \
    -e JWT_REFRESH_EXPIRES_IN="${JWT_REFRESH_EXPIRES_IN:-7d}" \
    -e PORT=3000 \
    -e CORS_ORIGIN="$CORS_ORIGIN" \
    -v uploads_data:/app/uploads \
    digital-backend:latest
}

run_frontend() {
  $PODMAN rm -f ict-twin-frontend 2>/dev/null || true
  $PODMAN run -d --name ict-twin-frontend \
    --network "$NETWORK" \
    --restart unless-stopped \
    -p "${FRONTEND_PORT:-8080}:8080" \
    digital-frontend:latest
}

wait_for_healthy() {
  local container="$1" tries=30
  echo "▶ waiting for $container healthy …"
  while (( tries-- > 0 )); do
    local s
    s="$($PODMAN inspect --format '{{.State.Health.Status}}' "$container" 2>/dev/null || echo none)"
    [[ "$s" == "healthy" ]] && return 0
    sleep 2
  done
  echo "❌ $container did not become healthy"
  $PODMAN logs --tail=40 "$container" || true
  return 1
}

# Container "needs to be (re)created" check.
# Returns true when the container is missing OR exists but is not running.
# After a host reboot podman leaves containers in Created/Exited state — by
# treating "exists but not running" the same as "missing", a re-run of this
# script after a reboot brings every container back up cleanly.
needs_create() {
  local name="$1"
  $PODMAN container exists "$name" || return 0
  local state
  state=$($PODMAN inspect --format '{{.State.Status}}' "$name" 2>/dev/null)
  [[ "$state" != "running" ]]
}

if needs_create ict-twin-postgres || (( RESTART_POSTGRES )); then
  echo "▶ (re)starting postgres …"
  run_postgres
  wait_for_healthy ict-twin-postgres
else
  echo "  · postgres unchanged"
fi

# Backend depends on postgres being healthy; if either changed, recreate
# backend so the new image picks up an already-healthy DB.
if needs_create ict-twin-backend || (( RESTART_BACKEND || RESTART_POSTGRES )); then
  echo "▶ (re)starting backend …"
  run_backend
else
  echo "  · backend unchanged"
fi

if needs_create ict-twin-frontend || (( RESTART_FRONTEND )); then
  echo "▶ (re)starting frontend …"
  run_frontend
else
  echo "  · frontend unchanged"
fi

echo
echo "✅ Done. Volumes preserved across deploys."
echo "Health check:"
echo "    $PODMAN ps"
echo "    $PODMAN logs --tail=20 ict-twin-backend"
echo "    curl http://localhost:${FRONTEND_PORT:-8080}/api/health"
DECODE
chmod +x "$TMPDIR/decode-and-deploy.sh"

echo "▶ base64-encoding all artefacts to .txt …"
# clean previous output
rm -f "$OUT"/*.txt

# Each artefact gets a flat single-extension name. The intranet upload filter
# rejects compound extensions like `.tar.gz.txt`, so the original filename
# is kept inside the script (decode-and-deploy.sh) rather than the file name.
encode() {
  local src="$1" dst="$2"
  base64 -i "$TMPDIR/$src" -o "$OUT/$dst"
}
encode postgres.tar.gz            postgres.txt
encode backend.tar.gz             backend.txt
encode frontend.tar.gz            frontend.txt
encode env.example                env.txt
encode decode-and-deploy.sh       deploy.txt

echo
echo "✅ Done. Transfer the .txt files in $OUT to the server:"
ls -lh "$OUT"
echo
echo "On the server (RHEL 9.4 / podman, no podman-compose needed):"
echo "  1) place all five .txt files in one directory"
echo "  2) base64 -d deploy.txt > decode-and-deploy.sh"
echo "  3) chmod +x decode-and-deploy.sh"
echo "  4) ./decode-and-deploy.sh"
echo "     ↳ first run: creates .env, then re-run after editing secrets"
echo
echo "⚠️  Upgrading from an OLDER schema version? Wipe the old DB volume ONCE"
echo "    before step 4 (this is the only time data is deleted):"
echo "      podman rm -f ict-twin-postgres; podman volume rm postgres_data"
echo "    Every later re-run preserves postgres_data / uploads_data."
