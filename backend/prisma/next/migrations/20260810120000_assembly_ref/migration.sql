-- 형판을 **글자가 아니라 참조**로 가리킨다.
--
-- 놓을 때의 형판 이름을 글자로 굳혀 두었는데, 그러면 형판 이름을 고치는 순간 이미 놓인
-- 설비의 분류가 옛 이름으로 남아 **같은 형판인데 집계가 둘로 갈린다**.
--
-- 구성은 스냅샷, 분류는 참조다 — 형판을 고쳐도 이미 놓인 설비의 안쪽 구성은 그대로고,
-- 분류는 계속 그 형판을 가리킨다.
ALTER TABLE "Asset" ADD COLUMN "assemblyId" TEXT;
CREATE INDEX "Asset_assemblyId_idx" ON "Asset"("assemblyId");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assemblyId_fkey"
    FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 이미 놓인 것들은 이름이 같은 형판으로 이어 준다.
UPDATE "Asset" a SET "assemblyId" = s.id
FROM "Assembly" s
WHERE a."assemblyName" = s.name AND a."assemblyName" IS NOT NULL;

ALTER TABLE "Asset" DROP COLUMN "assemblyName";
