-- AlterTable
ALTER TABLE "cables" ADD COLUMN     "source_asset_id" TEXT,
ADD COLUMN     "target_asset_id" TEXT;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_source_asset_id_fkey" FOREIGN KEY ("source_asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cables" ADD CONSTRAINT "cables_target_asset_id_fkey" FOREIGN KEY ("target_asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
