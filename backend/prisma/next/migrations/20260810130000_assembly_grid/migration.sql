-- 자리를 **형판 격자**로 옮기고, 담기 위한 자산과 컨테이너 개념을 걷는다.
--
-- 자리를 자산 타입이 선언하니(랙의 「슬롯 12칸」) 담기 위한 랙이라는 자산이 따로 있어야
-- 했고, 그 랙이 현황에 올라왔다. 슬롯은 사실 폭이 격자 전체인 1열짜리 격자였을 뿐이라,
-- 격자를 형판이 직접 가지면 그 층이 통째로 사라진다 —
--
--   before  도면 → 랙(자산) → 컨테이너(슬롯) → 장비(자산)
--   after   도면 → 설비(형판 격자)            → 장비(자산)

-- ── ① 형판이 격자를 갖는다 ──────────────────────────────────────────────────
ALTER TABLE "Assembly" ADD COLUMN "gridCols" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Assembly" ADD COLUMN "gridRows" INTEGER NOT NULL DEFAULT 12;

-- 뿌리가 쓰던 타입의 컨테이너 격자를 형판이 물려받는다.
UPDATE "Assembly" s
SET "gridCols" = cs."cols", "gridRows" = COALESCE(cs."rows", 12)
FROM "AssemblyItem" root
JOIN "AssetContainerSpec" cs ON cs."typeId" = root."typeId"
WHERE root."assemblyId" = s.id AND root."parentItemId" IS NULL;

-- ── ② 형판 부품이 평평해진다 — 담는 일은 격자가 한다 ───────────────────────
-- 뿌리(담기만 하던 것)는 사라지고, 그 안에 있던 것들이 형판 격자에 직접 놓인다.
-- 손자(OFD 안 경로슬롯)는 부모가 놓였던 행 아래로 이어 붙인다.
UPDATE "AssemblyItem" i
SET "row" = COALESCE(parent."row", 0) + COALESCE(i."row", 0),
    "col" = COALESCE(parent."col", 0)
FROM "AssemblyItem" parent
WHERE i."parentItemId" = parent.id AND parent."parentItemId" IS NOT NULL;

-- 자기참조 FK 가 CASCADE 라, 뿌리를 먼저 지우면 그 아래가 통째로 딸려 나간다(실제로 그랬다).
-- 관계를 먼저 끊고 지운다.
ALTER TABLE "AssemblyItem" DROP CONSTRAINT "AssemblyItem_parentItemId_fkey";
DELETE FROM "AssemblyItem" WHERE "parentItemId" IS NULL;
ALTER TABLE "AssemblyItem" DROP COLUMN "parentItemId";
ALTER TABLE "AssemblyItem" DROP COLUMN "containerKey";

-- ── ③ 설비는 타입이 없다 — 분류는 형판이다.
-- **먼저** 열어 둔다: 아래에서 타입을 비우기 때문이다.
ALTER TABLE "Asset" ALTER COLUMN "typeId" DROP NOT NULL;

-- ── ④ 손으로 만든 함체도 형판으로 이사한다 ─────────────────────────────────
-- 컨테이너를 선언한 타입(랙·OFD·분전반)마다 형판을 하나 만들고, 그 타입으로 놓여 있던
-- 자산을 그 형판의 인스턴스로 바꾼다. **구성은 인스턴스마다 다르다** — 형판은 분류이자
-- 초기 구성일 뿐이므로 통신랙 A 와 전원랙 A 가 같은 형판을 가리키면서 내용이 달라도 된다.
-- 그래서 여기서 만드는 형판의 부품 목록은 비워 둔다(기존 내용은 인스턴스에 이미 있다).
INSERT INTO "Assembly" ("id", "key", "name", "categoryId", "gridCols", "gridRows", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."key" || '-SET', t."name", t."categoryId",
       cs."cols", COALESCE(cs."rows", 12), t."sortOrder", true, NOW(), NOW()
FROM "AssetType" t
JOIN "AssetContainerSpec" cs ON cs."typeId" = t.id
WHERE EXISTS (SELECT 1 FROM "Asset" a WHERE a."typeId" = t.id);

UPDATE "Asset" a
SET "assemblyId" = s.id, "typeId" = NULL
FROM "AssetType" t
JOIN "Assembly" s ON s."key" = t."key" || '-SET'
WHERE a."typeId" = t.id AND a."assemblyId" IS NULL;

UPDATE "Asset" SET "typeId" = NULL WHERE "assemblyId" IS NOT NULL;

-- ── ⑤ 컨테이너 개념 폐기 ───────────────────────────────────────────────────
ALTER TABLE "Asset" DROP COLUMN "containerKey";
DROP TABLE "AssetContainerSpec";
