-- CreateTable
CREATE TABLE "fiber_paths" (
    "id" TEXT NOT NULL,
    "ofd_a_id" TEXT NOT NULL,
    "ofd_b_id" TEXT NOT NULL,
    "port_count" INTEGER NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "fiber_paths_pkey" PRIMARY KEY ("id")
);

-- Add fiber columns to cable
ALTER TABLE "cables" ADD COLUMN "fiber_path_id" TEXT;
ALTER TABLE "cables" ADD COLUMN "fiber_port_number" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "fiber_paths_ofd_a_id_ofd_b_id_key" ON "fiber_paths"("ofd_a_id", "ofd_b_id");

-- AddForeignKey
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_ofd_a_id_fkey" FOREIGN KEY ("ofd_a_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_ofd_b_id_fkey" FOREIGN KEY ("ofd_b_id") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiber_paths" ADD CONSTRAINT "fiber_paths_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cables" ADD CONSTRAINT "cables_fiber_path_id_fkey" FOREIGN KEY ("fiber_path_id") REFERENCES "fiber_paths"("id") ON DELETE SET NULL ON UPDATE CASCADE;
