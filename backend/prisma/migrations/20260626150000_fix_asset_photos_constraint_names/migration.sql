-- equipment_photos→asset_photos 테이블 개명 시 PK/FK 제약 이름이 구명으로 남아 schema.prisma 와 드리프트.
-- 제약 이름만 정렬(데이터/동작 무관). fresh reset·기존 DB 양쪽에서 1회 적용.
ALTER TABLE "asset_photos" RENAME CONSTRAINT "equipment_photos_pkey" TO "asset_photos_pkey";
ALTER TABLE "asset_photos" RENAME CONSTRAINT "equipment_photos_asset_id_fkey" TO "asset_photos_asset_id_fkey";
