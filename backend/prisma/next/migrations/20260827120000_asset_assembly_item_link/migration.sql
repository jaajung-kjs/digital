-- 자산이 **구성의 어느 항목에서 나왔는지** — 자리를 옮겨도 신원이 흔들리지 않게.
ALTER TABLE "Asset" ADD COLUMN "assemblyItemId" TEXT;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assemblyItemId_fkey"
  FOREIGN KEY ("assemblyItemId") REFERENCES "AssemblyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Asset_assemblyItemId_idx" ON "Asset"("assemblyItemId");

-- 이미 놓인 것들 백필 — 같은 부모·같은 종류의 형제를 자리순으로 세워 그 차례의 항목과 잇는다.
-- (지금 화면이 쓰던 규칙 그대로다. 한 번만 하면 그 뒤로는 고리가 신원을 나른다.)
WITH child AS (
  SELECT a.id,
         a."parentAssetId",
         a."typeId",
         row_number() OVER (PARTITION BY a."parentAssetId", a."typeId"
                            ORDER BY COALESCE(a.row, 0), COALESCE(a.col, 0), a."createdAt") AS nth
  FROM "Asset" a
  WHERE a."parentAssetId" IS NOT NULL
),
item AS (
  SELECT i.id,
         p.id AS parent_id,
         i."typeId",
         row_number() OVER (PARTITION BY p.id, i."typeId"
                            ORDER BY COALESCE(i.row, 0), COALESCE(i.col, 0), i.id) AS nth
  FROM "AssemblyItem" i
  JOIN "Asset" p ON p."assemblyId" = i."assemblyId"
)
UPDATE "Asset" a
SET "assemblyItemId" = item.id
FROM child
JOIN item ON item.parent_id = child."parentAssetId"
         AND item."typeId" = child."typeId"
         AND item.nth = child.nth
WHERE a.id = child.id;
