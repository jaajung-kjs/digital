-- 통합 노드 모델(단계1 보완): 케이블 endpoint 가 단일 source_asset_id 로 표현될 수 있으므로
-- 기존 "레거시 3컬럼 중 정확히 하나" CHECK 를 "asset_id 가 있거나 OR 레거시 정확히 하나" 로 완화.
-- (단계4 에서 레거시 컬럼 드롭 + asset_id NOT NULL 로 최종 단순화.)
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cable_source_one_of";
ALTER TABLE "cables" ADD CONSTRAINT "cable_source_one_of" CHECK (
  source_asset_id IS NOT NULL OR
  ((CASE WHEN source_equipment_id IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN source_module_id IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN source_circuit_id IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cable_target_one_of";
ALTER TABLE "cables" ADD CONSTRAINT "cable_target_one_of" CHECK (
  target_asset_id IS NOT NULL OR
  ((CASE WHEN target_equipment_id IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN target_module_id IS NOT NULL THEN 1 ELSE 0 END
  + CASE WHEN target_circuit_id IS NOT NULL THEN 1 ELSE 0 END) = 1)
);
