-- 함체 안의 자리를 **격자**로.
--
-- 예전에는 1차원 슬롯 번호(`slotCount` + `slotIndex`)뿐이었다. 그런데 도면 위는 이미
-- 2차원 자유 배치(`x·y·width·height`)라, 같은 "어디에 놓였나" 가 안팎에서 다른 모델로
-- 표현되고 있었다. 그리고 실제 설비는 1차원이 아니다 — 분전반 조서는 좌우 2열이고,
-- 랙에는 하프-랙 장비가 나란히 들어간다.
--
-- **자리 번호는 저장하지 않는다.** 격자에서 행 우선으로 유도한다(`row * cols + col + 1`).
-- 번호를 따로 들고 있으면 위치와 어긋날 수 있고, 실제로 그런 전례가 있었다(피더의
-- `차단기 번호` 가 자리 번호와 따로 놀아 같은 값을 두 번 적는 꼴이었다).

-- ── 컨테이너 명세: slotCount → cols × rows ──────────────────────────────────
ALTER TABLE "AssetContainerSpec" ADD COLUMN "cols" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AssetContainerSpec" ADD COLUMN "rows" INTEGER;
UPDATE "AssetContainerSpec" SET "rows" = "slotCount";
ALTER TABLE "AssetContainerSpec" DROP COLUMN "slotCount";

-- ── 자산의 자리: slotIndex → (col, row) ─────────────────────────────────────
ALTER TABLE "Asset" ADD COLUMN "col" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "row" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "colSpan" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "rowSpan" INTEGER;

-- 열이 여럿인 격자로 옮겨도 **자리 번호가 그대로**여야 한다:
--   옛 번호 = slotIndex + 1,  새 번호 = row * cols + col + 1
-- 이 되도록 col = slotIndex % cols, row = slotIndex / cols 로 편다.
UPDATE "Asset" a
SET "col"     = a."slotIndex" % GREATEST(cs."cols", 1),
    "row"     = a."slotIndex" / GREATEST(cs."cols", 1),
    "colSpan" = 1,
    "rowSpan" = COALESCE(a."slotSpan", 1)
FROM "Asset" p, "AssetContainerSpec" cs
WHERE a."parentAssetId" = p.id
  AND cs."typeId" = p."typeId"
  AND cs.key = a."containerKey"
  AND a."slotIndex" IS NOT NULL;

-- 함체에 들었지만 명세를 못 찾은 자산(자유형 등)은 한 줄로 세워 둔다.
UPDATE "Asset"
SET "col" = 0, "row" = "slotIndex", "colSpan" = 1, "rowSpan" = COALESCE("slotSpan", 1)
WHERE "slotIndex" IS NOT NULL AND "row" IS NULL;

ALTER TABLE "Asset" DROP COLUMN "slotIndex";
ALTER TABLE "Asset" DROP COLUMN "slotSpan";
