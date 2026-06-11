-- 단계4c: 통합 노드 모델 마무리 — 케이블 레거시 polymorphic endpoint + distribution_circuits 드롭.
-- endpoint = 단일 source_asset_id/target_asset_id(NOT NULL). 데이터는 단계1에서 asset_id 로 백필 완료.

-- 1. 레거시 컬럼에 의존하는 CHECK 제약 선제거(아니면 컬럼 드롭이 실패)
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cable_source_one_of";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cable_target_one_of";

-- 2. 레거시 endpoint FK 제거
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_source_equipment_id_fkey";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_source_module_id_fkey";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_source_circuit_id_fkey";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_target_equipment_id_fkey";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_target_module_id_fkey";
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cables_target_circuit_id_fkey";

-- 3. 레거시 endpoint 컬럼 드롭
ALTER TABLE "cables" DROP COLUMN IF EXISTS "source_equipment_id";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "source_module_id";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "source_circuit_id";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "target_equipment_id";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "target_module_id";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "target_circuit_id";

-- 4. distribution_circuits 테이블 드롭(회로는 이제 FEEDER/BRANCH Asset)
DROP TABLE IF EXISTS "distribution_circuits";

-- 5. endpoint 단일 asset_id 를 NOT NULL 로 최종(전 케이블 백필 완료 → 안전)
ALTER TABLE "cables" ALTER COLUMN "source_asset_id" SET NOT NULL;
ALTER TABLE "cables" ALTER COLUMN "target_asset_id" SET NOT NULL;
