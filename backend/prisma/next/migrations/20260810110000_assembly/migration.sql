-- 설비 형판 — 부품을 조립해 만든 「송변전광단말장치 1식」 같은 표준 구성.
--
-- 자산 타입이 곧 도면에 놓이는 것이면, 랙을 만들고 자리를 세고 장비를 넣는 일을 매번
-- 손으로 해야 하고 현황에도 그 부산물(랙·광슬롯·피더)이 다 올라온다. 형판은 그 조립을
-- 한 번 해 두고 계속 쓰기 위한 것이다.

CREATE TABLE "Assembly" (
    "id"         TEXT NOT NULL,
    "key"        TEXT NOT NULL,
    "name"       TEXT NOT NULL,
    "categoryId" TEXT,
    "sortOrder"  INTEGER NOT NULL DEFAULT 0,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Assembly_key_key" ON "Assembly"("key");
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AssemblyItem" (
    "id"            TEXT NOT NULL,
    "assemblyId"    TEXT NOT NULL,
    -- null = 뿌리(도면에 놓이는 것). 형판마다 뿌리는 하나다.
    "parentItemId"  TEXT,
    "typeId"        TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "containerKey"  TEXT,
    "col"           INTEGER,
    "row"           INTEGER,
    "colSpan"       INTEGER,
    "rowSpan"       INTEGER,
    "portCounts"    JSONB NOT NULL DEFAULT '{}',
    "portPositions" JSONB NOT NULL DEFAULT '{}',
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AssemblyItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssemblyItem_assemblyId_idx" ON "AssemblyItem"("assemblyId");
CREATE INDEX "AssemblyItem_parentItemId_idx" ON "AssemblyItem"("parentItemId");
CREATE INDEX "AssemblyItem_typeId_idx" ON "AssemblyItem"("typeId");
ALTER TABLE "AssemblyItem" ADD CONSTRAINT "AssemblyItem_assemblyId_fkey"
    FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssemblyItem" ADD CONSTRAINT "AssemblyItem_parentItemId_fkey"
    FOREIGN KEY ("parentItemId") REFERENCES "AssemblyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AssemblyItem" ADD CONSTRAINT "AssemblyItem_typeId_fkey"
    FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 놓을 때의 형판 이름을 자산에 굳힌다(스냅샷) — 형판을 고쳐도 이미 놓인 설비는 그대로다.
ALTER TABLE "Asset" ADD COLUMN "assemblyName" TEXT;
