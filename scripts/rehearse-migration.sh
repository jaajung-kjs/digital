#!/usr/bin/env bash
# 배포 리허설 — **서버의 진짜 데이터**에 대고 마이그레이션과 시드를 미리 돌려 본다.
#
# 개발 DB 는 대개 비어 있거나 시드뿐이라, 데이터가 있을 때만 터지는 것을 잡지 못한다:
# NULL 이 남은 칸에 NOT NULL 을 걸거나, 이미 중복이 있는데 UNIQUE 를 걸거나, 시드가
# 현장이 고친 값을 되돌리거나. 그런 것은 배포 중에 알면 이미 늦다.
#
#   scripts/rehearse-migration.sh backup-2026-09-02.sql
#
# 서버 백업 뜨는 법 (docs/배포.md 1단계):
#   podman exec ict-twin-postgres pg_dump -U postgres -d digital_next > backup-$(date +%F).sql
#
# 개발 DB 는 건드리지 않는다 — 따로 띄운 컨테이너(포트 5433)에서 돌리고 끝나면 지운다.

set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "사용법: scripts/rehearse-migration.sh <서버에서 뜬 백업.sql>"
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME=twin-rehearsal
PORT=5433
URL="postgresql://postgres:rehearsal@localhost:$PORT/digital_next"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "▶ 리허설용 DB 를 띄웁니다 (포트 $PORT — 개발 DB 는 건드리지 않습니다)"
cleanup
docker run -d --name "$NAME" \
  -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_DB=digital_next \
  -p "$PORT:5432" postgres:15-alpine >/dev/null

printf '  기다리는 중'
for _ in $(seq 30); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  printf '.'; sleep 1
done
echo ' 떴습니다'

echo "▶ 서버 백업을 붓습니다 ($DUMP)"
docker exec -i "$NAME" psql -q -U postgres -d digital_next < "$DUMP" > /dev/null

before=$(docker exec "$NAME" psql -tAU postgres -d digital_next -c \
  'select count(*) from "Substation"' 2>/dev/null || echo '?')
echo "  변전소 $before 개가 실렸습니다"

echo
echo "▶ 마이그레이션 (서버가 기동할 때 도는 것과 같은 명령)"
if ! (cd "$ROOT/backend" && DATABASE_URL_NEXT="$URL" npx prisma migrate deploy --schema prisma/next/schema.prisma); then
  echo
  echo "❌ 마이그레이션이 **실제 데이터에서** 실패했습니다 — 배포하면 서버가 이 자리에서 멈춥니다."
  echo "   값을 옮기는 마이그레이션을 먼저 넣으세요(칸 추가 → 백필 → 옛 칸 삭제)."
  exit 2
fi

echo
echo "▶ 시드 (쌓인 데이터를 덮지 않는지 본다)"
if ! (cd "$ROOT/backend" && DATABASE_URL_NEXT="$URL" npm run db:next:seed); then
  echo "❌ 시드가 실패했습니다."
  exit 3
fi

after=$(docker exec "$NAME" psql -tAU postgres -d digital_next -c \
  'select count(*) from "Substation"' 2>/dev/null || echo '?')

echo
echo "── 결과 ──────────────────────────────────────────"
echo "  변전소   $before → $after   (줄어들었으면 시드가 지운 것이다)"
docker exec "$NAME" psql -tAU postgres -d digital_next -c \
  'select ''자산 ''||count(*) from "Asset" union all
   select ''케이블 ''||count(*) from "Cable" union all
   select ''장비 품목 ''||count(*) from "AssetType" union all
   select ''설비 품목 ''||count(*) from "Assembly"' 2>/dev/null | sed 's/^ */  /'
echo "──────────────────────────────────────────────────"
echo
echo "✅ 리허설 통과. 이 백업과 같은 상태의 서버라면 배포가 지나갑니다."
echo "   수가 줄어든 것이 있으면 배포하지 말고 원인을 먼저 찾으세요."
