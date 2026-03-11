-- DropForeignKey
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_source_port_id_fkey";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_target_port_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "cables_source_port_id_target_port_id_key";

-- AlterTable: cables - port 기반 → equipment 직접 연결
ALTER TABLE "cables" DROP COLUMN IF EXISTS "source_port_id",
DROP COLUMN IF EXISTS "target_port_id",
ADD COLUMN "source_equipment_id" TEXT,
ADD COLUMN "target_equipment_id" TEXT;

-- 기존 cables 데이터가 있으면 삭제 (port 기반이라 equipment ID 매핑 불가)
DELETE FROM "cables" WHERE "source_equipment_id" IS NULL OR "target_equipment_id" IS NULL;

-- NOT NULL 제약 추가
ALTER TABLE "cables" ALTER COLUMN "source_equipment_id" SET NOT NULL;
ALTER TABLE "cables" ALTER COLUMN "target_equipment_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cables_source_equipment_id_target_equipment_id_cable_type_key" ON "cables"("source_equipment_id", "target_equipment_id", "cable_type");

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_source_equipment_id_fkey" FOREIGN KEY ("source_equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cables" ADD CONSTRAINT "cables_target_equipment_id_fkey" FOREIGN KEY ("target_equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Equipment: room_id FK 재설정 (SET NULL on delete)
ALTER TABLE "equipment" DROP CONSTRAINT IF EXISTS "equipment_room_id_fkey";
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Equipment Photos: CASCADE on delete
ALTER TABLE "equipment_photos" DROP CONSTRAINT IF EXISTS "equipment_photos_equipment_id_fkey";
ALTER TABLE "equipment_photos" ADD CONSTRAINT "equipment_photos_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Maintenance Logs: fix column name and CASCADE
ALTER TABLE "maintenance_logs" DROP CONSTRAINT IF EXISTS "maintenance_logs_equipment_id_fkey";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'maintenance_logs' AND column_name = 'log_type') THEN
    ALTER TABLE "maintenance_logs" RENAME COLUMN "log_type" TO "logType";
  END IF;
END $$;
ALTER TABLE "maintenance_logs" ADD CONSTRAINT "maintenance_logs_equipment_id_fkey" FOREIGN KEY ("equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
