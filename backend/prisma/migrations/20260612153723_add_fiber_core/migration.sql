-- CreateTable
CREATE TABLE "fiber_cores" (
    "id" TEXT NOT NULL,
    "fiber_path_id" TEXT NOT NULL,
    "core_number" INTEGER NOT NULL,
    "purpose" VARCHAR(50),
    "circuit_text" VARCHAR(200),
    "splice_type" VARCHAR(10),
    "usage_override" VARCHAR(10),
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "fiber_cores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fiber_cores_fiber_path_id_idx" ON "fiber_cores"("fiber_path_id");

-- CreateIndex
CREATE UNIQUE INDEX "fiber_cores_fiber_path_id_core_number_key" ON "fiber_cores"("fiber_path_id", "core_number");

-- AddForeignKey
ALTER TABLE "fiber_cores" ADD CONSTRAINT "fiber_cores_fiber_path_id_fkey" FOREIGN KEY ("fiber_path_id") REFERENCES "fiber_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_cores" ADD CONSTRAINT "fiber_cores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiber_cores" ADD CONSTRAINT "fiber_cores_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
