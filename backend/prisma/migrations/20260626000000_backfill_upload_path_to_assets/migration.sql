-- Data-only backfill: 사진 업로드 경로 uploads/equipment → uploads/assets (스키마 변경 없음)
-- 물리 파일 이동은 배포 단계 수동: mv backend/uploads/equipment/* backend/uploads/assets/ (아래 보고서 참조)
UPDATE "asset_photos"
SET "image_url" = replace("image_url", '/uploads/equipment/', '/uploads/assets/')
WHERE "image_url" LIKE '/uploads/equipment/%';
