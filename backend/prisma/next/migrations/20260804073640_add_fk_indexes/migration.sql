-- CreateIndex
CREATE INDEX "Asset_typeId_idx" ON "Asset"("typeId");

-- CreateIndex
CREATE INDEX "AssetPhoto_assetId_idx" ON "AssetPhoto"("assetId");

-- CreateIndex
CREATE INDEX "InspectionLog_assetId_idx" ON "InspectionLog"("assetId");

-- CreateIndex
CREATE INDEX "MaintenanceLog_assetId_idx" ON "MaintenanceLog"("assetId");
