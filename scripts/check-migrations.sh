#!/usr/bin/env bash
# 배포 전 마이그레이션 점검 — **되돌릴 수 없는 것**을 배포 전에 눈에 띄게 한다.
#
# 서버에는 현장이 쌓은 데이터가 있다. 그런데 `prisma migrate dev` 는 개발 DB(대개 비어
# 있다)에서 통과하면 그만이라, 데이터가 있을 때만 터지는 것을 잡아 주지 않는다:
#
#   · DROP COLUMN / DROP TABLE      → 그 칸의 값이 사라진다(되돌릴 수 없다)
#   · NOT NULL 을 기본값 없이 추가   → 기존 줄이 전부 걸려 마이그레이션이 **실패**한다
#   · UNIQUE 추가                    → 이미 중복이 있으면 실패한다
#   · 타입 변경                      → 변환할 수 없는 값이 있으면 실패한다
#   · enum 값 제거                   → 그 값을 쓰는 줄이 있으면 실패한다
#
# 실패는 그나마 낫다(배포가 멈출 뿐이다). 사라지는 것이 더 나쁘다 — 그래서 둘 다 세운다.
#
#   scripts/check-migrations.sh                  # 배포 태그 이후 새 마이그레이션만
#   scripts/check-migrations.sh deployed-20260902
#
# 이 스크립트는 **막지 않는다.** 무엇을 봐야 하는지 알려 줄 뿐이다 — 판단은 사람이 한다.
# 걸린 것이 있으면 리허설(`scripts/rehearse-migration.sh`)로 실제 데이터에 대고 확인한다.

set -uo pipefail
# 배열이 비었을 때 `${arr[@]}` 가 터지지 않게 — bash 3.2 의 `set -u` 는 그것도 미정의로 본다.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/backend/prisma/next/migrations"
BASE="${1:-$(git -C "$ROOT" describe --tags --match 'deployed-*' --abbrev=0 2>/dev/null || echo '')}"

if [[ -z "$BASE" ]]; then
  echo "❌ 배포 기준을 못 찾았습니다. 배포할 때마다 태그를 답니다:"
  echo "     git tag -a deployed-\$(date +%Y%m%d) -m '사내망 배포'"
  echo "   기준을 직접 주려면: scripts/check-migrations.sh <태그|커밋>"
  exit 1
fi

echo "▶ 기준: $BASE — 그 뒤에 생긴 마이그레이션만 봅니다"
echo

# 기준 시점에 없던 마이그레이션 디렉터리 = 서버가 아직 안 돌린 것.
# `mapfile` 을 쓰지 않는다 — macOS 기본 bash 는 3.2 라 그 명령이 없다(빌드 머신이 mac 이다).
NEW=()
while IFS= read -r line; do
  [[ -n "$line" ]] && NEW+=("$line")
done < <(
  comm -13 \
    <(git -C "$ROOT" ls-tree -d --name-only "$BASE" -- backend/prisma/next/migrations/ 2>/dev/null \
        | xargs -n1 basename 2>/dev/null | sort) \
    <(find "$DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
)

if (( ${#NEW[@]} == 0 )); then
  echo "✅ 새 마이그레이션이 없습니다 — 스키마는 서버와 같습니다."
  exit 0
fi

echo "새 마이그레이션 ${#NEW[@]}개:"
printf '  · %s\n' "${NEW[@]}"
echo

# 각 위험 신호: 정규식 → 사람이 읽을 설명. 값이 사라지는 것과 실패하는 것을 나눈다.
#
# 짝은 `::` 로 가른다 — `|` 로 가르면 정규식의 갈래(`(A|B)`)가 잘려 grep 이 깨진다
# (실제로 「parentheses not balanced」 로 조용히 한 줄을 건너뛰었다).
PATTERNS=(
  'DROP[[:space:]]+COLUMN::값이 사라진다 — 옮길 곳이 있는지, 백필이 먼저인지 본다'
  'DROP[[:space:]]+TABLE::표가 통째로 사라진다'
  'DROP[[:space:]]+(CONSTRAINT|INDEX)::제약이 풀린다 — 무엇을 지키던 것인지 본다'
  'SET[[:space:]]+NOT[[:space:]]+NULL::기존 줄에 NULL 이 하나라도 있으면 실패한다'
  'ADD[[:space:]]+COLUMN.*NOT[[:space:]]+NULL::기본값이 없으면 기존 줄에서 실패한다'
  'ADD[[:space:]]+CONSTRAINT.*UNIQUE::이미 중복이 있으면 실패한다'
  'CREATE[[:space:]]+UNIQUE::이미 중복이 있으면 실패한다'
  'ALTER[[:space:]]+COLUMN.*TYPE::변환할 수 없는 값이 있으면 실패한다'
  'RENAME::이름이 바뀐다 — 옛 이름을 읽는 코드가 남아 있지 않은지 본다'
  'DROP[[:space:]]+VALUE::그 값을 쓰는 줄이 있으면 실패한다'
)

RISKY=0
for m in "${NEW[@]}"; do
  sql="$DIR/$m/migration.sql"
  [[ -f "$sql" ]] || continue
  shown=0
  for entry in "${PATTERNS[@]}"; do
    re="${entry%%::*}"
    why="${entry#*::}"
    if grep -qiE "$re" "$sql"; then
      (( shown == 0 )) && { echo "⚠️  $m"; shown=1; }
      RISKY=1
      echo "     $why"
      grep -inE "$re" "$sql" | head -3 | sed 's/^/       /'
    fi
  done
done

echo
if (( RISKY )); then
  cat <<'MSG'
❌ 위험 신호가 있습니다. 배포 전에 반드시:

  1) 서버 백업을 뜬다 (docs/배포.md 1단계)
  2) 그 백업으로 리허설한다 — 실제 데이터에 대고 돌려 본다:
       scripts/rehearse-migration.sh <백업.sql>
  3) 값이 사라지는 것이면, 옮기는 마이그레이션을 **먼저** 넣는다
     (칸 추가 → 백필 → 옛 칸 삭제, 세 번에 나눠서)

리허설이 통과해야 배포합니다.
MSG
  exit 2
fi

echo "✅ 눈에 띄는 위험 신호는 없습니다."
echo "   그래도 데이터가 쌓인 서버라면 리허설을 권합니다:"
echo "     scripts/rehearse-migration.sh <백업.sql>"
