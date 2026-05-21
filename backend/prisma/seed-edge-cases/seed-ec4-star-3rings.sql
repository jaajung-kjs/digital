-- ============================================================================
-- Edge case ec4 (star-3rings)
-- 3 rings sharing 1 central junction H (star).
-- nodes: 13, edges: 15
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e4ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e4ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec4-%';
DELETE FROM equipment    WHERE id LIKE 'c4ec%' OR id LIKE 'd4ec%';
DELETE FROM floors       WHERE id LIKE 'b4ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec4-%';

-- Substations (13 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec4-H', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-H 변전소', 1400, true, NOW(), NOW()),
  ('sub-ec4-A1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-A1 변전소', 1401, true, NOW(), NOW()),
  ('sub-ec4-B1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-B1 변전소', 1402, true, NOW(), NOW()),
  ('sub-ec4-C1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-C1 변전소', 1403, true, NOW(), NOW()),
  ('sub-ec4-D1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-D1 변전소', 1404, true, NOW(), NOW()),
  ('sub-ec4-A2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-A2 변전소', 1405, true, NOW(), NOW()),
  ('sub-ec4-B2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-B2 변전소', 1406, true, NOW(), NOW()),
  ('sub-ec4-C2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-C2 변전소', 1407, true, NOW(), NOW()),
  ('sub-ec4-D2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-D2 변전소', 1408, true, NOW(), NOW()),
  ('sub-ec4-A3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-A3 변전소', 1409, true, NOW(), NOW()),
  ('sub-ec4-B3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-B3 변전소', 1410, true, NOW(), NOW()),
  ('sub-ec4-C3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-C3 변전소', 1411, true, NOW(), NOW()),
  ('sub-ec4-D3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC4-D3 변전소', 1412, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec4_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec4_map VALUES
  ('H', 'sub-ec4-H', 'b4ec0000-0000-4000-b000-000000000001', 'c4ec0000-0000-4000-b000-000000000001', 'd4ec0000-0000-4000-b000-000000000001', 'mod-ec4-H'),
  ('A1', 'sub-ec4-A1', 'b4ec0000-0000-4000-b000-000000000002', 'c4ec0000-0000-4000-b000-000000000002', 'd4ec0000-0000-4000-b000-000000000002', 'mod-ec4-A1'),
  ('B1', 'sub-ec4-B1', 'b4ec0000-0000-4000-b000-000000000003', 'c4ec0000-0000-4000-b000-000000000003', 'd4ec0000-0000-4000-b000-000000000003', 'mod-ec4-B1'),
  ('C1', 'sub-ec4-C1', 'b4ec0000-0000-4000-b000-000000000004', 'c4ec0000-0000-4000-b000-000000000004', 'd4ec0000-0000-4000-b000-000000000004', 'mod-ec4-C1'),
  ('D1', 'sub-ec4-D1', 'b4ec0000-0000-4000-b000-000000000005', 'c4ec0000-0000-4000-b000-000000000005', 'd4ec0000-0000-4000-b000-000000000005', 'mod-ec4-D1'),
  ('A2', 'sub-ec4-A2', 'b4ec0000-0000-4000-b000-000000000006', 'c4ec0000-0000-4000-b000-000000000006', 'd4ec0000-0000-4000-b000-000000000006', 'mod-ec4-A2'),
  ('B2', 'sub-ec4-B2', 'b4ec0000-0000-4000-b000-000000000007', 'c4ec0000-0000-4000-b000-000000000007', 'd4ec0000-0000-4000-b000-000000000007', 'mod-ec4-B2'),
  ('C2', 'sub-ec4-C2', 'b4ec0000-0000-4000-b000-000000000008', 'c4ec0000-0000-4000-b000-000000000008', 'd4ec0000-0000-4000-b000-000000000008', 'mod-ec4-C2'),
  ('D2', 'sub-ec4-D2', 'b4ec0000-0000-4000-b000-000000000009', 'c4ec0000-0000-4000-b000-000000000009', 'd4ec0000-0000-4000-b000-000000000009', 'mod-ec4-D2'),
  ('A3', 'sub-ec4-A3', 'b4ec0000-0000-4000-b000-00000000000a', 'c4ec0000-0000-4000-b000-00000000000a', 'd4ec0000-0000-4000-b000-00000000000a', 'mod-ec4-A3'),
  ('B3', 'sub-ec4-B3', 'b4ec0000-0000-4000-b000-00000000000b', 'c4ec0000-0000-4000-b000-00000000000b', 'd4ec0000-0000-4000-b000-00000000000b', 'mod-ec4-B3'),
  ('C3', 'sub-ec4-C3', 'b4ec0000-0000-4000-b000-00000000000c', 'c4ec0000-0000-4000-b000-00000000000c', 'd4ec0000-0000-4000-b000-00000000000c', 'mod-ec4-C3'),
  ('D3', 'sub-ec4-D3', 'b4ec0000-0000-4000-b000-00000000000d', 'c4ec0000-0000-4000-b000-00000000000d', 'd4ec0000-0000-4000-b000-00000000000d', 'mod-ec4-D3');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec4_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec4_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec4_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec4_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (15 개)
CREATE TEMP TABLE _ec4_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec4_fp VALUES
  ('e4ec0000-0000-4000-b000-000000000001', 'H', 'A1'),
  ('e4ec0000-0000-4000-b000-000000000002', 'A1', 'B1'),
  ('e4ec0000-0000-4000-b000-000000000003', 'B1', 'C1'),
  ('e4ec0000-0000-4000-b000-000000000004', 'C1', 'D1'),
  ('e4ec0000-0000-4000-b000-000000000005', 'D1', 'H'),
  ('e4ec0000-0000-4000-b000-000000000006', 'H', 'A2'),
  ('e4ec0000-0000-4000-b000-000000000007', 'A2', 'B2'),
  ('e4ec0000-0000-4000-b000-000000000008', 'B2', 'C2'),
  ('e4ec0000-0000-4000-b000-000000000009', 'C2', 'D2'),
  ('e4ec0000-0000-4000-b000-00000000000a', 'D2', 'H'),
  ('e4ec0000-0000-4000-b000-00000000000b', 'H', 'A3'),
  ('e4ec0000-0000-4000-b000-00000000000c', 'A3', 'B3'),
  ('e4ec0000-0000-4000-b000-00000000000d', 'B3', 'C3'),
  ('e4ec0000-0000-4000-b000-00000000000e', 'C3', 'D3'),
  ('e4ec0000-0000-4000-b000-00000000000f', 'D3', 'H');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec4 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec4_fp f
JOIN _ec4_map a ON a.node = f.node_a
JOIN _ec4_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec4_fp f JOIN _ec4_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec4_fp f JOIN _ec4_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec4 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec4-%'
UNION ALL SELECT 'ec4 floors', COUNT(*) FROM floors WHERE id LIKE 'b4ec%'
UNION ALL SELECT 'ec4 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c4ec%'
UNION ALL SELECT 'ec4 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e4ec%'
UNION ALL SELECT 'ec4 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e4ec%');

-- Starting cable for trace: cbl-e4ec0000-0000-4000-b000-000000000001-A (변전소 H 의 OFD-H 측)
-- Frontend: navigate to /floors/b4ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.