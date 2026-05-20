-- ============================================================================
-- OFD Ring Topology Test Seed (UUID-safe — zod 검증 통과형)
--
-- Topology
--   Ring 1: 춘천 → 남춘천 → 화천 → 인제 → 양구 → 홍천 → 춘천
--   Ring 2: 인제 → 속초 → 고성 → 양양 → 강릉 → 평창 → 인제
--   Junction: 인제 (두 링 공유)
--
-- 주의: PUT /api/floors/:id/plan zod 가 equipment.id 와 deletedFiberPathIds[]
--      를 UUID 형식으로 강제 → equipment / fiberPath id 를 진짜 UUID 로 사용해야
--      도면 저장이 통과한다. (이전 seed 의 'ofd-춘천' 등 비-UUID id 는 INSERT 는
--      되지만 저장 시 400 Bad Request.)
--      Substation / Floor / RackModule / Cable id 는 zod 가 free string 으로
--      허용하므로 가독성 prefix 형태 유지.
--
-- 멱등: 이전 비-UUID 시드 행을 먼저 DELETE 후 UUID 로 재삽입. 다시 실행해도
--      안전 (DELETE on empty = no-op, INSERT ... ON CONFLICT DO NOTHING).
-- 강남/수원 변전소는 미관여.
-- ============================================================================

BEGIN;

-- ─── 0. Cleanup: 이전(비-UUID) 시드 행 제거 ─────────────────────────────────
--   순서: 자식 → 부모 (FK cascade 없는 경로 대비)
DELETE FROM cables       WHERE id LIKE 'cbl-fp-%';
DELETE FROM fiber_paths  WHERE id LIKE 'fp-r%';
DELETE FROM rack_modules WHERE id LIKE 'mod-opt-%';
DELETE FROM equipment    WHERE id LIKE 'ofd-%' OR id LIKE 'rack-%';
DELETE FROM floors       WHERE id LIKE 'floor-%';

-- ─── 1. Substations (10개 신규, 춘천 기존 재사용) ─────────────────────────
--   branch_id = 강원본부/직할 (a40c0e6d-063b-4a3f-bd39-7062abbeb230)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-남춘천변전소', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '남춘천변전소', 10, true, NOW(), NOW()),
  ('sub-화천변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '화천변전소',   11, true, NOW(), NOW()),
  ('sub-인제변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '인제변전소',   12, true, NOW(), NOW()),
  ('sub-양구변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '양구변전소',   13, true, NOW(), NOW()),
  ('sub-홍천변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '홍천변전소',   14, true, NOW(), NOW()),
  ('sub-속초변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '속초변전소',   15, true, NOW(), NOW()),
  ('sub-고성변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '고성변전소',   16, true, NOW(), NOW()),
  ('sub-양양변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '양양변전소',   17, true, NOW(), NOW()),
  ('sub-강릉변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '강릉변전소',   18, true, NOW(), NOW()),
  ('sub-평창변전소',   'a40c0e6d-063b-4a3f-bd39-7062abbeb230', '평창변전소',   19, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── 2. City → UUID 매핑 (single source of truth) ─────────────────────────
--   UUID 패턴 (deterministic, v4 형태):
--     floor:  b0000000-0000-4000-b000-00000000000N  (N=1~b, 춘천만 기존 UUID)
--     ofd:    c0000000-0000-4000-b000-00000000000N
--     rack:   d0000000-0000-4000-b000-00000000000N
CREATE TEMP TABLE _city_map (
  city          text PRIMARY KEY,
  substation_id text NOT NULL,
  floor_id      text NOT NULL,
  ofd_id        text NOT NULL,
  rack_id       text NOT NULL,
  module_id     text NOT NULL   -- 가독성 prefix (자유 string 허용)
) ON COMMIT DROP;

INSERT INTO _city_map VALUES
  -- 춘천은 기존 floor UUID 재사용
  ('춘천',   'sub-춘천변전소',
     'b39f52cb-b39a-4ee6-8390-0c9a0a70f9e8',
     'c0000000-0000-4000-b000-000000000001',
     'd0000000-0000-4000-b000-000000000001',
     'mod-opt-춘천'),
  ('남춘천', 'sub-남춘천변전소',
     'b0000000-0000-4000-b000-000000000002',
     'c0000000-0000-4000-b000-000000000002',
     'd0000000-0000-4000-b000-000000000002',
     'mod-opt-남춘천'),
  ('화천',   'sub-화천변전소',
     'b0000000-0000-4000-b000-000000000003',
     'c0000000-0000-4000-b000-000000000003',
     'd0000000-0000-4000-b000-000000000003',
     'mod-opt-화천'),
  ('인제',   'sub-인제변전소',
     'b0000000-0000-4000-b000-000000000004',
     'c0000000-0000-4000-b000-000000000004',
     'd0000000-0000-4000-b000-000000000004',
     'mod-opt-인제'),
  ('양구',   'sub-양구변전소',
     'b0000000-0000-4000-b000-000000000005',
     'c0000000-0000-4000-b000-000000000005',
     'd0000000-0000-4000-b000-000000000005',
     'mod-opt-양구'),
  ('홍천',   'sub-홍천변전소',
     'b0000000-0000-4000-b000-000000000006',
     'c0000000-0000-4000-b000-000000000006',
     'd0000000-0000-4000-b000-000000000006',
     'mod-opt-홍천'),
  ('속초',   'sub-속초변전소',
     'b0000000-0000-4000-b000-000000000007',
     'c0000000-0000-4000-b000-000000000007',
     'd0000000-0000-4000-b000-000000000007',
     'mod-opt-속초'),
  ('고성',   'sub-고성변전소',
     'b0000000-0000-4000-b000-000000000008',
     'c0000000-0000-4000-b000-000000000008',
     'd0000000-0000-4000-b000-000000000008',
     'mod-opt-고성'),
  ('양양',   'sub-양양변전소',
     'b0000000-0000-4000-b000-000000000009',
     'c0000000-0000-4000-b000-000000000009',
     'd0000000-0000-4000-b000-000000000009',
     'mod-opt-양양'),
  ('강릉',   'sub-강릉변전소',
     'b0000000-0000-4000-b000-00000000000a',
     'c0000000-0000-4000-b000-00000000000a',
     'd0000000-0000-4000-b000-00000000000a',
     'mod-opt-강릉'),
  ('평창',   'sub-평창변전소',
     'b0000000-0000-4000-b000-00000000000b',
     'c0000000-0000-4000-b000-00000000000b',
     'd0000000-0000-4000-b000-00000000000b',
     'mod-opt-평창');

-- ─── 3. Floors (10개 신규, 춘천 1F 기존 floor 재사용) ─────────────────────
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW()
FROM _city_map
WHERE city <> '춘천'
ON CONFLICT (id) DO NOTHING;

-- ─── 4. OFD Equipment (UUID id 필수) ───────────────────────────────────────
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || city, 400, 300, 100, 60, 0, 0, NOW(), NOW()
FROM _city_map
ON CONFLICT (id) DO NOTHING;

-- ─── 5. RACK Equipment (UUID id 필수, totalU=12) ───────────────────────────
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || city, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW()
FROM _city_map
ON CONFLICT (id) DO NOTHING;

-- ─── 6. RackModule (송변전광단말장치, slot 0) ──────────────────────────────
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT
  module_id,
  rack_id,
  (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'),
  '송변전광단말장치',
  0, 1, 0, NOW(), NOW()
FROM _city_map
ON CONFLICT (id) DO NOTHING;

-- ─── 7. FiberPath (12개, UUID id 필수 — deletedFiberPathIds 검증 통과) ─────
CREATE TEMP TABLE _fp_map (
  fp_id    text PRIMARY KEY,
  ring     int  NOT NULL,
  city_a   text NOT NULL,
  city_b   text NOT NULL,
  descr    text NOT NULL
) ON COMMIT DROP;

INSERT INTO _fp_map VALUES
  -- Ring 1
  ('f1000000-0000-4000-b000-000000000001', 1, '춘천',   '남춘천', 'Ring1 segment'),
  ('f1000000-0000-4000-b000-000000000002', 1, '남춘천', '화천',   'Ring1 segment'),
  ('f1000000-0000-4000-b000-000000000003', 1, '화천',   '인제',   'Ring1 segment (인제 분기점)'),
  ('f1000000-0000-4000-b000-000000000004', 1, '인제',   '양구',   'Ring1 segment (인제 분기점)'),
  ('f1000000-0000-4000-b000-000000000005', 1, '양구',   '홍천',   'Ring1 segment'),
  ('f1000000-0000-4000-b000-000000000006', 1, '홍천',   '춘천',   'Ring1 closing'),
  -- Ring 2
  ('f1000000-0000-4000-b000-000000000007', 2, '인제',   '속초',   'Ring2 segment (인제 분기점)'),
  ('f1000000-0000-4000-b000-000000000008', 2, '속초',   '고성',   'Ring2 segment'),
  ('f1000000-0000-4000-b000-000000000009', 2, '고성',   '양양',   'Ring2 segment'),
  ('f1000000-0000-4000-b000-00000000000a', 2, '양양',   '강릉',   'Ring2 segment'),
  ('f1000000-0000-4000-b000-00000000000b', 2, '강릉',   '평창',   'Ring2 segment'),
  ('f1000000-0000-4000-b000-00000000000c', 2, '평창',   '인제',   'Ring2 closing (인제 분기점)');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, f.descr, NOW(), NOW()
FROM _fp_map f
JOIN _city_map a ON a.city = f.city_a
JOIN _city_map b ON b.city = f.city_b
ON CONFLICT (id) DO NOTHING;

-- ─── 8. Cables (24개 = 12 FP × 2측면) ──────────────────────────────────────
--   각 cable: 로컬 송변전광단말장치 ↔ 로컬 OFD 의 해당 FP 포트1
INSERT INTO cables (
  id, source_module_id, target_equipment_id,
  cable_type, category_id, fiber_path_id, fiber_port_number,
  label, buffer_length, created_at, updated_at
)
SELECT
  'cbl-' || f.fp_id || '-A',
  a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1,
  '송변전광단말장치-OFD P1 (' || f.city_a || ')',
  4, NOW(), NOW()
FROM _fp_map f
JOIN _city_map a ON a.city = f.city_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (
  id, source_module_id, target_equipment_id,
  cable_type, category_id, fiber_path_id, fiber_port_number,
  label, buffer_length, created_at, updated_at
)
SELECT
  'cbl-' || f.fp_id || '-B',
  b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1,
  '송변전광단말장치-OFD P1 (' || f.city_b || ')',
  4, NOW(), NOW()
FROM _fp_map f
JOIN _city_map b ON b.city = f.city_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ─── 검증 카운트 ───────────────────────────────────────────────────────────
SELECT 'substations (ring 11)'  AS metric, COUNT(*) FROM substations
  WHERE id IN ('sub-춘천변전소','sub-남춘천변전소','sub-화천변전소','sub-인제변전소','sub-양구변전소','sub-홍천변전소',
               'sub-속초변전소','sub-고성변전소','sub-양양변전소','sub-강릉변전소','sub-평창변전소')
UNION ALL SELECT 'OFD equipment', COUNT(*) FROM equipment WHERE kind='OFD'
UNION ALL SELECT 'OFD uuid-shaped', COUNT(*) FROM equipment
  WHERE kind='OFD' AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
UNION ALL SELECT 'RACK equipment (ring)', COUNT(*) FROM equipment WHERE kind='RACK' AND name LIKE 'RACK-%'
UNION ALL SELECT 'RACK uuid-shaped', COUNT(*) FROM equipment
  WHERE kind='RACK' AND name LIKE 'RACK-%' AND id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
UNION ALL SELECT 'RackModule (OPT-TERM)', COUNT(*) FROM rack_modules WHERE name='송변전광단말장치'
UNION ALL SELECT 'FiberPath', COUNT(*) FROM fiber_paths
UNION ALL SELECT 'FiberPath uuid-shaped', COUNT(*) FROM fiber_paths
  WHERE id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
UNION ALL SELECT 'Cable (FIBER ring)', COUNT(*) FROM cables WHERE id LIKE 'cbl-f1%';

-- 인제 모듈 연결 cable (4개여야 함 — 4 FP × 1측 = 분기점)
SELECT '인제 모듈 cable count' AS check, COUNT(*) AS count
FROM cables WHERE source_module_id = 'mod-opt-인제';
