-- 상세패널 오버홀 S3: source_preset_id 전용 컬럼 + attributes 드롭 + inspection_logs 신규.
--
-- attributes(jsonb) 는 모든 행이 비어있음(검증: 0 non-empty) → 무손실 드롭.
-- sourcePresetId 는 과거 attributes JSON 에 보관됐으나 보유 행 없음 → 백필 no-op.

-- (1) source_preset_id 전용 컬럼 추가
ALTER TABLE "assets" ADD COLUMN "source_preset_id" TEXT;

-- (2) attributes(JSON) 컬럼 드롭 (빈 컬럼, 무손실)
ALTER TABLE "assets" DROP COLUMN "attributes";

-- (3) inspection_logs (점검 전용 — 최근 inspection_date 가 lastMaintenanceDate 로 파생)
CREATE TABLE "inspection_logs" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "inspection_date" DATE NOT NULL,
    "inspector" VARCHAR(100) NOT NULL,
    "content" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "inspection_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inspection_logs_asset_id_idx" ON "inspection_logs"("asset_id");

ALTER TABLE "inspection_logs" ADD CONSTRAINT "inspection_logs_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inspection_logs" ADD CONSTRAINT "inspection_logs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inspection_logs" ADD CONSTRAINT "inspection_logs_updated_by_fkey"
    FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
