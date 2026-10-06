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
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RackType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "laborCode" TEXT,
    "unitPrice" INTEGER,
    "installManDays" DOUBLE PRECISION,
    "removeManDays" DOUBLE PRECISION,
    "relocateManDays" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RackType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentType" (
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

    CONSTRAINT "EquipmentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CableType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "laborCode" TEXT,
    "unitPrice" INTEGER,
    "installManDays" DOUBLE PRECISION,
    "removeManDays" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CableType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rack" (
    "id" TEXT NOT NULL,
    "substationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rackTypeId" TEXT NOT NULL,
    "floorId" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "facing" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "substationId" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "model" TEXT,
    "maker" TEXT,
    "madeOn" TEXT,
    "serial" TEXT,
    "installDate" DATE,
    "manager" TEXT,
    "note" TEXT,
    "circuitCount" INTEGER NOT NULL DEFAULT 0,
    "panelCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Circuit" (
    "equipmentId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "label" TEXT,
    "current" TEXT,
    "voltage" TEXT,
    "capacity" TEXT,
    "phase" TEXT,
    "switch" TEXT,
    "purpose" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Circuit_pkey" PRIMARY KEY ("equipmentId","no")
);

-- CreateTable
CREATE TABLE "FiberLine" (
    "id" TEXT NOT NULL,
    "cableTypeId" TEXT NOT NULL,
    "coreCount" INTEGER NOT NULL,
    "name" TEXT,
    "lengthKm" DOUBLE PRECISION,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "aSubstationId" TEXT NOT NULL,
    "aEquipmentId" TEXT,
    "aPanel" INTEGER,
    "aStartNo" INTEGER NOT NULL DEFAULT 1,
    "bSubstationId" TEXT NOT NULL,
    "bEquipmentId" TEXT,
    "bPanel" INTEGER,
    "bStartNo" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiberLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Core" (
    "lineId" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "role" TEXT,
    "purpose" TEXT,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Core_pkey" PRIMARY KEY ("lineId","no")
);

-- CreateTable
CREATE TABLE "CoreMeasurement" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "coreNo" INTEGER NOT NULL,
    "measuredOn" DATE,
    "side" TEXT NOT NULL,
    "loss1310" DOUBLE PRECISION,
    "dist1310" DOUBLE PRECISION,
    "loss1550" DOUBLE PRECISION,
    "dist1550" DOUBLE PRECISION,
    "measuredBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoreMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "substationId" TEXT NOT NULL,
    "cableTypeId" TEXT,
    "lengthM" DOUBLE PRECISION,
    "spec" TEXT,
    "note" TEXT,
    "pathPoints" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkEnd" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "equipmentId" TEXT,
    "label" TEXT,
    "circuitEquipmentId" TEXT,
    "circuitNo" INTEGER,
    "coreLineId" TEXT,
    "coreNo" INTEGER,
    "coreSide" TEXT,

    CONSTRAINT "LinkEnd_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
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
    "equipmentId" TEXT NOT NULL,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspectionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentPhoto" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentPhoto_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "Category_key_key" ON "Category"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RackType_key_key" ON "RackType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentType_key_key" ON "EquipmentType"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CableType_key_key" ON "CableType"("key");

-- CreateIndex
CREATE INDEX "Rack_floorId_idx" ON "Rack"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "Rack_substationId_name_key" ON "Rack"("substationId", "name");

-- CreateIndex
CREATE INDEX "Equipment_rackId_idx" ON "Equipment"("rackId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_substationId_name_key" ON "Equipment"("substationId", "name");

-- CreateIndex
CREATE INDEX "FiberLine_aSubstationId_idx" ON "FiberLine"("aSubstationId");

-- CreateIndex
CREATE INDEX "FiberLine_bSubstationId_idx" ON "FiberLine"("bSubstationId");

-- CreateIndex
CREATE INDEX "CoreMeasurement_lineId_coreNo_idx" ON "CoreMeasurement"("lineId", "coreNo");

-- CreateIndex
CREATE INDEX "Link_substationId_idx" ON "Link"("substationId");

-- CreateIndex
CREATE INDEX "LinkEnd_equipmentId_idx" ON "LinkEnd"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkEnd_linkId_end_key" ON "LinkEnd"("linkId", "end");

-- CreateIndex
CREATE UNIQUE INDEX "LinkEnd_circuitEquipmentId_circuitNo_key" ON "LinkEnd"("circuitEquipmentId", "circuitNo");

-- CreateIndex
CREATE UNIQUE INDEX "LinkEnd_coreLineId_coreNo_coreSide_key" ON "LinkEnd"("coreLineId", "coreNo", "coreSide");

-- CreateIndex
CREATE INDEX "MaintenanceLog_equipmentId_idx" ON "MaintenanceLog"("equipmentId");

-- CreateIndex
CREATE INDEX "InspectionLog_equipmentId_idx" ON "InspectionLog"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentPhoto_equipmentId_idx" ON "EquipmentPhoto"("equipmentId");

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
ALTER TABLE "EquipmentType" ADD CONSTRAINT "EquipmentType_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_rackTypeId_fkey" FOREIGN KEY ("rackTypeId") REFERENCES "RackType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rack" ADD CONSTRAINT "Rack_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "Rack"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "EquipmentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLine" ADD CONSTRAINT "FiberLine_cableTypeId_fkey" FOREIGN KEY ("cableTypeId") REFERENCES "CableType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLine" ADD CONSTRAINT "FiberLine_aSubstationId_fkey" FOREIGN KEY ("aSubstationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLine" ADD CONSTRAINT "FiberLine_aEquipmentId_fkey" FOREIGN KEY ("aEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLine" ADD CONSTRAINT "FiberLine_bSubstationId_fkey" FOREIGN KEY ("bSubstationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiberLine" ADD CONSTRAINT "FiberLine_bEquipmentId_fkey" FOREIGN KEY ("bEquipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Core" ADD CONSTRAINT "Core_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "FiberLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoreMeasurement" ADD CONSTRAINT "CoreMeasurement_lineId_coreNo_fkey" FOREIGN KEY ("lineId", "coreNo") REFERENCES "Core"("lineId", "no") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_substationId_fkey" FOREIGN KEY ("substationId") REFERENCES "Substation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Link" ADD CONSTRAINT "Link_cableTypeId_fkey" FOREIGN KEY ("cableTypeId") REFERENCES "CableType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "Link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_circuitEquipmentId_circuitNo_fkey" FOREIGN KEY ("circuitEquipmentId", "circuitNo") REFERENCES "Circuit"("equipmentId", "no") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_coreLineId_coreNo_fkey" FOREIGN KEY ("coreLineId", "coreNo") REFERENCES "Core"("lineId", "no") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionLog" ADD CONSTRAINT "InspectionLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentPhoto" ADD CONSTRAINT "EquipmentPhoto_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 연결 끝은 정확히 한 종류다 — 설비 | 회로 | 코어 끝.
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_one_kind" CHECK (
  ((CASE WHEN "equipmentId" IS NOT NULL THEN 1 ELSE 0 END)
 + (CASE WHEN "circuitEquipmentId" IS NOT NULL AND "circuitNo" IS NOT NULL THEN 1 ELSE 0 END)
 + (CASE WHEN "coreLineId" IS NOT NULL AND "coreNo" IS NOT NULL AND "coreSide" IN ('A','B') THEN 1 ELSE 0 END)) = 1
);
-- 표기는 설비 끝에만.
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_label_only_equipment" CHECK ("label" IS NULL OR "equipmentId" IS NOT NULL);
ALTER TABLE "LinkEnd" ADD CONSTRAINT "LinkEnd_end_ab" CHECK ("end" IN ('A','B'));
ALTER TABLE "CoreMeasurement" ADD CONSTRAINT "CoreMeasurement_side_ab" CHECK ("side" IN ('A','B'));
ALTER TABLE "FiberLine" ADD CONSTRAINT "FiberLine_core_count" CHECK ("coreCount" >= 1);
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_circuit_count" CHECK ("circuitCount" >= 0);
