-- 회로(DistributionCircuit) endpoint 를 polymorphic CHECK 제약에 반영.
-- 기존 cable_source_one_of/cable_target_one_of 는 equipment XOR module 만 허용하여
-- source_circuit_id/target_circuit_id 로 회로 endpoint 케이블을 저장할 수 없었다.
-- 세 컬럼(equipment/module/circuit) 중 정확히 하나만 채워지도록 갱신한다.

ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cable_source_one_of";
ALTER TABLE "cables" ADD CONSTRAINT "cable_source_one_of" CHECK (
  (CASE WHEN source_equipment_id IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN source_module_id    IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN source_circuit_id   IS NOT NULL THEN 1 ELSE 0 END) = 1
);

ALTER TABLE "cables" DROP CONSTRAINT IF EXISTS "cable_target_one_of";
ALTER TABLE "cables" ADD CONSTRAINT "cable_target_one_of" CHECK (
  (CASE WHEN target_equipment_id IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN target_module_id    IS NOT NULL THEN 1 ELSE 0 END) +
  (CASE WHEN target_circuit_id   IS NOT NULL THEN 1 ELSE 0 END) = 1
);
