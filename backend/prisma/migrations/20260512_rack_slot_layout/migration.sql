BEGIN;

-- 1) 랙 관련 케이블 제거 (랙 ↔ 비-랙, 랙 모듈 endpoint 전부)
DELETE FROM cables
WHERE source_module_id IS NOT NULL
   OR target_module_id IS NOT NULL
   OR source_equipment_id IN (SELECT id FROM equipment WHERE kind = 'RACK')
   OR target_equipment_id IN (SELECT id FROM equipment WHERE kind = 'RACK');

-- 2) 랙 모듈 / 랙 설비 / 프리셋 전체 삭제
DELETE FROM rack_modules;
DELETE FROM equipment WHERE kind = 'RACK';
DELETE FROM rack_presets;

-- 3) rack_modules: U 컬럼 DROP, slot 컬럼 ADD
ALTER TABLE rack_modules
  DROP COLUMN start_u,
  DROP COLUMN height_u,
  ADD COLUMN slot_index INT NOT NULL,
  ADD COLUMN slot_span  INT NOT NULL,
  ADD CONSTRAINT rack_module_slot_range
    CHECK (slot_index >= 0 AND slot_span >= 1 AND slot_index + slot_span <= 12);

CREATE INDEX idx_rack_modules_slot ON rack_modules (rack_equipment_id, slot_index);

-- 4) rack_module_categories: default_slot_span 컬럼 추가 (기본 1)
ALTER TABLE rack_module_categories
  ADD COLUMN default_slot_span INT NOT NULL DEFAULT 1
    CHECK (default_slot_span >= 1 AND default_slot_span <= 12);

COMMIT;
