-- DropForeignKey
ALTER TABLE "assets" DROP CONSTRAINT "assets_parent_asset_id_fkey";

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
