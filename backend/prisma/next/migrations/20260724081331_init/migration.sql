-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "placeable" BOOLEAN NOT NULL DEFAULT false,
    "defaultWidth" DOUBLE PRECISION,
    "defaultHeight" DOUBLE PRECISION,
    "laborType" TEXT,
    "installManDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "removeManDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "relocateManDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fieldDefs" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetContainerSpec" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slotCount" INTEGER,
    "allowSpan" BOOLEAN NOT NULL DEFAULT false,
    "accepts" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetContainerSpec_pkey" PRIMARY KEY ("id")
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
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssetPortTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetLinkRule" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "fromGroup" TEXT NOT NULL,
    "toGroup" TEXT NOT NULL,
    "mapping" TEXT NOT NULL,

    CONSTRAINT "AssetLinkRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CableGroup" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "laborType" TEXT,
    "installManDaysPerM" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "removeManDaysPerM" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "substationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "floorId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "parentAssetId" TEXT,
    "containerKey" TEXT,
    "slotIndex" INTEGER,
    "slotSpan" INTEGER,
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
    "filePath" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

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
CREATE UNIQUE INDEX "AssetContainerSpec_typeId_key_key" ON "AssetContainerSpec"("typeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AssetPortTemplate_typeId_group_key" ON "AssetPortTemplate"("typeId", "group");

-- CreateIndex
CREATE UNIQUE INDEX "AssetLinkRule_typeId_fromGroup_toGroup_key" ON "AssetLinkRule"("typeId", "fromGroup", "toGroup");

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
CREATE INDEX "Port_assetId_idx" ON "Port"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Port_assetId_group_index_key" ON "Port"("assetId", "group", "index");

-- CreateIndex
CREATE INDEX "Cable_substationId_idx" ON "Cable"("substationId");

-- CreateIndex
CREATE INDEX "Cable_aPortId_idx" ON "Cable"("aPortId");

-- CreateIndex
CREATE INDEX "Cable_bPortId_idx" ON "Cable"("bPortId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_headquartersId_fkey" FOREIGN KEY ("headquartersId") REFERENCES "Headquarters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Substation" ADD CONSTRAINT "Substation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetType" ADD CONSTRAINT "AssetType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetContainerSpec" ADD CONSTRAINT "AssetContainerSpec_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPortTemplate" ADD CONSTRAINT "AssetPortTemplate_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLinkRule" ADD CONSTRAINT "AssetLinkRule_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CableCategory" ADD CONSTRAINT "CableCategory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CableGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_parentAssetId_fkey" FOREIGN KEY ("parentAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "InspectionLog" ADD CONSTRAINT "InspectionLog_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
