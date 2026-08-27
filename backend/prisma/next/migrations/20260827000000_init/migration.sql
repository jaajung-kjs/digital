-- ─────────────────────────────────────────────────────────────────────────────
-- 기준선(baseline) — 이 파일 하나가 빈 DB 를 지금 스키마로 세운다.
--
-- 전면 재구축(capability rebuild)을 지나며 마이그레이션이 서른한 개가 되었는데, 그중
-- 하나가 **빈 DB 에서는 돌지 못했다**: `init` 이 이미 `installManDays` 로 컬럼을 만드는데
-- 뒤의 마이그레이션이 `installHours → installManDays` 이름 바꾸기를 하고 있었다(옛 이름을
-- 만드는 마이그레이션이 어디에도 없다 — 지난 어느 날 init 을 손본 흔적이다). 이미 적용된
-- DB 는 멀쩡했지만 **새 DB 는 서버가 뜨지 못한다** — 사내망 새 배포가 정확히 그 경우다.
--
-- 운영 DB 를 비우고 새로 세우는 지금이 이력을 접는 가장 싼 때라, 서른한 개를 이 하나로
-- 접었다(지운 파일들은 git 이력에 남아 있다). 앞으로의 변경은 여느 때처럼 이 뒤에 쌓인다.
-- ─────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Headquarters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Headquarters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "headquartersId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Substation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Substation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "substationId" TEXT NOT NULL,
    "backgroundDrawing" JSONB,
    "backgroundOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "laborCode" TEXT,
    "unitPrice" INTEGER,
    "installManDays" DOUBLE PRECISION,
    "removeManDays" DOUBLE PRECISION,
    "relocateManDays" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPortTemplate" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "namePattern" TEXT NOT NULL,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetPortTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "laborCode" TEXT,
    "unitPrice" INTEGER,
    "installManDays" DOUBLE PRECISION,
    "removeManDays" DOUBLE PRECISION,
    "relocateManDays" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssemblyItem" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "col" INTEGER,
    "row" INTEGER,
    "colSpan" INTEGER,
    "rowSpan" INTEGER,
    "portCounts" JSONB NOT NULL DEFAULT '{}',
    "portPositions" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssemblyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CableGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CableCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "laborCode" TEXT,
    "unitPrice" INTEGER,
    "installManDays" DOUBLE PRECISION,
    "removeManDays" DOUBLE PRECISION,
    "relocateManDays" DOUBLE PRECISION,
    "managesFiberLine" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assemblyItemId" TEXT,
    "typeId" TEXT,
    "substationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "floorId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "parentAssetId" TEXT,
    "assemblyId" TEXT,
    "col" INTEGER,
    "row" INTEGER,
    "colSpan" INTEGER,
    "rowSpan" INTEGER,
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Port" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "positions" INTEGER NOT NULL DEFAULT 1,
    "fieldValues" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Port_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cable" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "substationId" TEXT NOT NULL,
    "aPortId" TEXT NOT NULL,
    "bPortId" TEXT NOT NULL,
    "categoryId" TEXT,
    "pathPoints" JSONB NOT NULL DEFAULT '[]',
    "specParams" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "partAssetId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "action" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionLog" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "partAssetId" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetPhoto" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "partAssetId" TEXT,
    "filePath" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborStandard" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "effective" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaborRate" (
    "code" TEXT NOT NULL,
    "effectiveOn" TIMESTAMP(3) NOT NULL,
    "effectiveLabel" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "wage" INTEGER NOT NULL,
    "marker" TEXT NOT NULL DEFAULT '',
    "markerNote" TEXT,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("code","effectiveOn")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Headquarters_name_key" ON "Headquarters"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_headquartersId_name_key" ON "Branch"("headquartersId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Substation_name_key" ON "Substation"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Floor_substationId_name_key" ON "Floor"("substationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_key_key" ON "AssetCategory"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AssetType_key_key" ON "AssetType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPortTemplate_typeId_group_key" ON "AssetPortTemplate"("typeId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "Assembly_key_key" ON "Assembly"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CableGroup_key_key" ON "CableGroup"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CableCategory_groupId_name_key" ON "CableCategory"("groupId", "name");

-- CreateIndex
CREATE INDEX "Asset_substationId_idx" ON "Asset"("substationId");

-- CreateIndex
CREATE INDEX "Asset_parentAssetId_idx" ON "Asset"("parentAssetId");

-- CreateIndex
CREATE INDEX "Asset_floorId_idx" ON "Asset"("floorId");

-- CreateIndex
CREATE INDEX "Asset_typeId_idx" ON "Asset"("typeId");

-- CreateIndex
CREATE INDEX "Port_assetId_idx" ON "Port"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Port_assetId_group_index_key" ON "Port"("assetId", "group", "index");

-- CreateIndex
CREATE INDEX "Cable_substationId_idx" ON "Cable"("substationId");

-- CreateIndex
CREATE INDEX "Cable_aPortId_idx" ON "Cable"("aPortId");

-- CreateIndex
CREATE INDEX "Cable_bPortId_idx" ON "Cable"("bPortId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_assetId_idx" ON "MaintenanceLog"("assetId");

-- CreateIndex
CREATE INDEX "InspectionLog_assetId_idx" ON "InspectionLog"("assetId");

-- CreateIndex
CREATE INDEX "AssetPhoto_assetId_idx" ON "AssetPhoto"("assetId");

-- CreateIndex
CREATE INDEX "LaborStandard_kind_active_idx" ON "LaborStandard"("kind", "active");

-- CreateIndex
CREATE INDEX "LaborRate_code_effectiveOn_idx" ON "LaborRate"("code", "effectiveOn");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_headquartersId_fkey" FOREIGN KEY ("headquartersId") REFERENCES "Headquarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substation" ADD CONSTRAINT "Substation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetType" ADD CONSTRAINT "AssetType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPortTemplate" ADD CONSTRAINT "AssetPortTemplate_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyItem" ADD CONSTRAINT "AssemblyItem_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyItem" ADD CONSTRAINT "AssemblyItem_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableCategory" ADD CONSTRAINT "CableCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CableGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assemblyItemId_fkey" FOREIGN KEY ("assemblyItemId") REFERENCES "AssemblyItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Port" ADD CONSTRAINT "Port_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cable" ADD CONSTRAINT "Cable_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cable" ADD CONSTRAINT "Cable_aPortId_fkey" FOREIGN KEY ("aPortId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cable" ADD CONSTRAINT "Cable_bPortId_fkey" FOREIGN KEY ("bPortId") REFERENCES "Port"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cable" ADD CONSTRAINT "Cable_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CableCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_partAssetId_fkey" FOREIGN KEY ("partAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionLog" ADD CONSTRAINT "InspectionLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionLog" ADD CONSTRAINT "InspectionLog_partAssetId_fkey" FOREIGN KEY ("partAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_partAssetId_fkey" FOREIGN KEY ("partAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

