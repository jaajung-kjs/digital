-- CreateTable
CREATE TABLE "distribution_circuits" (
    "id" TEXT NOT NULL,
    "distribution_equipment_id" TEXT NOT NULL,
    "feeder_name" VARCHAR(100) NOT NULL,
    "branch_name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "distribution_circuits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "distribution_circuits_distribution_equipment_id_idx" ON "distribution_circuits"("distribution_equipment_id");

-- AddForeignKey
ALTER TABLE "distribution_circuits" ADD CONSTRAINT "distribution_circuits_distribution_equipment_id_fkey" FOREIGN KEY ("distribution_equipment_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_circuits" ADD CONSTRAINT "distribution_circuits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_circuits" ADD CONSTRAINT "distribution_circuits_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "idx_rack_modules_slot" RENAME TO "rack_modules_rack_equipment_id_slot_index_idx";
