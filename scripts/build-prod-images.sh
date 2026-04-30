#!/usr/bin/env bash
# Build production images for the air-gapped server (linux/amd64) and pack
# them as base64 .txt files (intranet upload policy blocks .tar.gz / .yml).
#
# Output (in ./dist-deploy/):
#   - postgres.tar.gz.txt
#   - backend.tar.gz.txt
#   - frontend.tar.gz.txt
#   - docker-compose.prod.yml.txt
#   - env.example.txt
#   - decode-and-deploy.sh.txt
#
# Transfer the .txt bundle to the RHEL server, then run the decode script
# (instructions printed at the end of this script).

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
cp "$ROOT/docker-compose.prod.yml" "$TMPDIR/"
cp "$ROOT/.env.prod.example"        "$TMPDIR/env.example"

# Write a server-side decoder + deploy script.
# Designed for both first deploy and incremental updates: only the .txt files
# present in the directory are decoded/loaded, so re-uploading just one of
# {backend,frontend,postgres}.tar.gz.txt and re-running the script will pick
# up only the new image, leaving named volumes (postgres_data / uploads_data)
# and the existing .env untouched.
cat > "$TMPDIR/decode-and-deploy.sh" <<'DECODE'
#!/usr/bin/env bash
# Run on the air-gapped RHEL 9.4 server.
#
# First deploy:
#   1) place all six *.txt files (postgres / backend / frontend tarballs +
#      docker-compose.prod.yml + env.example + this script) in one directory
#   2) base64 -d decode-and-deploy.sh.txt > decode-and-deploy.sh
#      chmod +x decode-and-deploy.sh
#   3) ./decode-and-deploy.sh
#      (first run creates .env from env.example and asks you to edit it)
#   4) edit .env, then ./decode-and-deploy.sh again
#
# Incremental update:
#   only overwrite the .txt files you changed (e.g. backend.tar.gz.txt).
#   Older .txt files left untouched mean the same image stays loaded.
#   `podman load` is idempotent for unchanged tarballs, and
#   `podman-compose up -d` only recreates containers whose image hash
#   actually changed. Named volumes (postgres_data, uploads_data) and the
#   existing .env are never touched.
set -euo pipefail

cd "$(dirname "$0")"

# Decode only when the .txt is newer than the previously-decoded artefact.
# `out -nt txt` returns true if `out` is strictly newer than `txt` — i.e. the
# decoded file is up-to-date and we can skip the work. Re-uploading a single
# .txt overwrites its mtime and makes the .txt newer, triggering a re-decode.
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

decode_if_changed postgres.tar.gz.txt           postgres.tar.gz
decode_if_changed backend.tar.gz.txt            backend.tar.gz
decode_if_changed frontend.tar.gz.txt           frontend.tar.gz
decode_if_changed docker-compose.prod.yml.txt   docker-compose.prod.yml
decode_if_changed env.example.txt               env.example

if [[ ! -f docker-compose.prod.yml ]]; then
  echo "❌ docker-compose.prod.yml is missing. Upload docker-compose.prod.yml.txt at least once."
  exit 1
fi

# `podman load` only when the tarball actually changed since last load.
# We mark a `.{img}.loaded` stamp with the moment of a successful load and
# compare its mtime against the tarball's mtime on subsequent runs.
echo "▶ loading container images (skipping unchanged) …"
load_if_changed() {
  local img="$1" stamp=".${1}.loaded"
  if [[ ! -f "$img" ]]; then return; fi
  if [[ -f "$stamp" && "$stamp" -nt "$img" ]]; then
    echo "  · $img already loaded"
    return
  fi
  echo "  · podman load -i $img"
  podman load -i "$img"
  touch "$stamp"
}
load_if_changed postgres.tar.gz
load_if_changed backend.tar.gz
load_if_changed frontend.tar.gz

if [[ ! -f .env ]]; then
  if [[ ! -f env.example ]]; then
    echo "❌ Neither .env nor env.example present — upload env.example.txt at least once."
    exit 1
  fi
  cp env.example .env
  echo
  echo "⚠️  .env created from env.example — edit it before starting:"
  echo "    nano .env       # set DB_PASSWORD / JWT_*_SECRET / CORS_ORIGIN"
  echo
  echo "Then run this script again:"
  echo "    ./decode-and-deploy.sh"
  exit 0
fi

echo "▶ podman-compose up -d (only changed images recreate their container) …"
podman-compose -f docker-compose.prod.yml up -d

echo
echo "✅ Done. Volumes preserved across deploys."
echo "Health check:"
echo "    podman-compose -f docker-compose.prod.yml ps"
echo "    curl http://localhost/api/health"
DECODE
chmod +x "$TMPDIR/decode-and-deploy.sh"

echo "▶ base64-encoding all artefacts to .txt …"
# clean previous output
rm -f "$OUT"/*.txt

for f in postgres.tar.gz backend.tar.gz frontend.tar.gz docker-compose.prod.yml env.example decode-and-deploy.sh; do
  base64 -i "$TMPDIR/$f" -o "$OUT/${f}.txt"
done

echo
echo "✅ Done. Transfer the .txt files in $OUT to the server:"
ls -lh "$OUT"
echo
echo "On the server (RHEL 9.4 / podman):"
echo "  1) place all .txt files + decode-and-deploy.sh.txt in one directory"
echo "  2) base64 -d decode-and-deploy.sh.txt > decode-and-deploy.sh"
echo "  3) chmod +x decode-and-deploy.sh"
echo "  4) ./decode-and-deploy.sh"
echo "     ↳ first run: edits .env, then re-run to start containers"
