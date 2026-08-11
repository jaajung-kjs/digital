-- 기록의 주인은 **설비**다 — 가리키는 부품은 따로 적는다.
--
-- 예전에는 점검·고장이력·사진이 자산 하나에 정확히 매여 있었고(assetId ===), 부품에도 남길
-- 수 있었다. 그래서 「송변전광단말장치 A」 이력을 열면 **안의 부품에 남긴 기록이 보이지
-- 않았다** — 중복이 아니라 갈라짐이라 「어디에 남겼더라」가 생겼다.
--
-- 설비 이력을 훑으면 안의 부품 일까지 한 줄로 읽혀야 한다. 「L3 스위치 고장」처럼 무엇에
-- 대한 것인지는 `partAssetId` 가 말한다. 비우면 설비 전체에 대한 기록이다.
--
-- 부품이 지워져도 기록은 남는다(SetNull) — 그 설비에서 무슨 일이 있었는지는 부품을 걷어낸
-- 뒤에도 이력이다.
ALTER TABLE "MaintenanceLog" ADD COLUMN "partAssetId" TEXT;
ALTER TABLE "InspectionLog"  ADD COLUMN "partAssetId" TEXT;
ALTER TABLE "AssetPhoto"     ADD COLUMN "partAssetId" TEXT;

ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_partAssetId_fkey"
  FOREIGN KEY ("partAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InspectionLog" ADD CONSTRAINT "InspectionLog_partAssetId_fkey"
  FOREIGN KEY ("partAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AssetPhoto" ADD CONSTRAINT "AssetPhoto_partAssetId_fkey"
  FOREIGN KEY ("partAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MaintenanceLog_partAssetId_idx" ON "MaintenanceLog"("partAssetId");
CREATE INDEX "InspectionLog_partAssetId_idx" ON "InspectionLog"("partAssetId");
CREATE INDEX "AssetPhoto_partAssetId_idx" ON "AssetPhoto"("partAssetId");

-- 부품에 남아 있던 기록을 그 설비로 옮기고, 가리키던 부품을 적는다.
UPDATE "MaintenanceLog" r SET "partAssetId" = r."assetId", "assetId" = a."parentAssetId"
  FROM "Asset" a WHERE a.id = r."assetId" AND a."parentAssetId" IS NOT NULL;
UPDATE "InspectionLog" r SET "partAssetId" = r."assetId", "assetId" = a."parentAssetId"
  FROM "Asset" a WHERE a.id = r."assetId" AND a."parentAssetId" IS NOT NULL;
UPDATE "AssetPhoto" r SET "partAssetId" = r."assetId", "assetId" = a."parentAssetId"
  FROM "Asset" a WHERE a.id = r."assetId" AND a."parentAssetId" IS NOT NULL;
