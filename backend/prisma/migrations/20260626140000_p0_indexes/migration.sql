-- CreateIndex
CREATE INDEX "cables_source_asset_id_idx" ON "cables"("source_asset_id");

-- CreateIndex
CREATE INDEX "cables_target_asset_id_idx" ON "cables"("target_asset_id");

-- CreateIndex
CREATE INDEX "cables_category_id_idx" ON "cables"("category_id");

-- CreateIndex
CREATE INDEX "asset_photos_asset_id_idx" ON "asset_photos"("asset_id");

-- CreateIndex
CREATE INDEX "maintenance_logs_asset_id_idx" ON "maintenance_logs"("asset_id");
