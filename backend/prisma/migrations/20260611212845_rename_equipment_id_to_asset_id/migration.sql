-- equipmentId → assetId rename (data-preserving). FK 컬럼명만 변경, 데이터/제약/인덱스 보존.
-- Prisma 기본은 DROP+ADD(데이터 손실)이므로 수동 RENAME 으로 작성.

-- ports
ALTER TABLE "ports" RENAME COLUMN "equipment_id" TO "asset_id";
ALTER TABLE "ports" RENAME CONSTRAINT "ports_equipment_id_fkey" TO "ports_asset_id_fkey";
ALTER INDEX "ports_equipment_id_name_key" RENAME TO "ports_asset_id_name_key";

-- equipment_photos
ALTER TABLE "equipment_photos" RENAME COLUMN "equipment_id" TO "asset_id";
ALTER TABLE "equipment_photos" RENAME CONSTRAINT "equipment_photos_equipment_id_fkey" TO "equipment_photos_asset_id_fkey";

-- maintenance_logs
ALTER TABLE "maintenance_logs" RENAME COLUMN "equipment_id" TO "asset_id";
ALTER TABLE "maintenance_logs" RENAME CONSTRAINT "maintenance_logs_equipment_id_fkey" TO "maintenance_logs_asset_id_fkey";
