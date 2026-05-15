-- AlterTable
ALTER TABLE "cables" ADD COLUMN     "source_circuit_id" TEXT,
ADD COLUMN     "target_circuit_id" TEXT;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_source_circuit_id_fkey" FOREIGN KEY ("source_circuit_id") REFERENCES "distribution_circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_target_circuit_id_fkey" FOREIGN KEY ("target_circuit_id") REFERENCES "distribution_circuits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
