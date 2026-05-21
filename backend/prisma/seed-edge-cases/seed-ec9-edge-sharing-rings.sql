-- ============================================================================
-- Edge case ec9 (edge-sharing-rings)
-- Level-1 composite — 두 ring 이 1개 edge 공유 (SPQR S-S 케이스).
-- nodes: 7, edges: 9
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e9ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e9ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec9-%';
DELETE FROM equipment    WHERE id LIKE 'c9ec%' OR id LIKE 'd9ec%';
DELETE FROM floors       WHERE id LIKE 'b9ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec9-%';

-- Substations (7 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec9-A', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-A 변전소', 1900, true, NOW(), NOW()),
  ('sub-ec9-B', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-B 변전소', 1901, true, NOW(), NOW()),
  ('sub-ec9-C', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-C 변전소', 1902, true, NOW(), NOW()),
  ('sub-ec9-D', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-D 변전소', 1903, true, NOW(), NOW()),
  ('sub-ec9-E', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-E 변전소', 1904, true, NOW(), NOW()),
  ('sub-ec9-F', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-F 변전소', 1905, true, NOW(), NOW()),
  ('sub-ec9-G', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC9-G 변전소', 1906, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec9_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec9_map VALUES
  ('A', 'sub-ec9-A', 'b9ec0000-0000-4000-b000-000000000001', 'c9ec0000-0000-4000-b000-000000000001', 'd9ec0000-0000-4000-b000-000000000001', 'mod-ec9-A'),
  ('B', 'sub-ec9-B', 'b9ec0000-0000-4000-b000-000000000002', 'c9ec0000-0000-4000-b000-000000000002', 'd9ec0000-0000-4000-b000-000000000002', 'mod-ec9-B'),
  ('C', 'sub-ec9-C', 'b9ec0000-0000-4000-b000-000000000003', 'c9ec0000-0000-4000-b000-000000000003', 'd9ec0000-0000-4000-b000-000000000003', 'mod-ec9-C'),
  ('D', 'sub-ec9-D', 'b9ec0000-0000-4000-b000-000000000004', 'c9ec0000-0000-4000-b000-000000000004', 'd9ec0000-0000-4000-b000-000000000004', 'mod-ec9-D'),
  ('E', 'sub-ec9-E', 'b9ec0000-0000-4000-b000-000000000005', 'c9ec0000-0000-4000-b000-000000000005', 'd9ec0000-0000-4000-b000-000000000005', 'mod-ec9-E'),
  ('F', 'sub-ec9-F', 'b9ec0000-0000-4000-b000-000000000006', 'c9ec0000-0000-4000-b000-000000000006', 'd9ec0000-0000-4000-b000-000000000006', 'mod-ec9-F'),
  ('G', 'sub-ec9-G', 'b9ec0000-0000-4000-b000-000000000007', 'c9ec0000-0000-4000-b000-000000000007', 'd9ec0000-0000-4000-b000-000000000007', 'mod-ec9-G');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec9_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec9_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec9_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec9_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (9 개)
CREATE TEMP TABLE _ec9_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec9_fp VALUES
  ('e9ec0000-0000-4000-b000-000000000001', 'A', 'B'),
  ('e9ec0000-0000-4000-b000-000000000002', 'B', 'C'),
  ('e9ec0000-0000-4000-b000-000000000003', 'C', 'D'),
  ('e9ec0000-0000-4000-b000-000000000004', 'D', 'A'),
  ('e9ec0000-0000-4000-b000-000000000005', 'A', 'C'),
  ('e9ec0000-0000-4000-b000-000000000006', 'A', 'E'),
  ('e9ec0000-0000-4000-b000-000000000007', 'E', 'F'),
  ('e9ec0000-0000-4000-b000-000000000008', 'F', 'G'),
  ('e9ec0000-0000-4000-b000-000000000009', 'G', 'A');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec9 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec9_fp f
JOIN _ec9_map a ON a.node = f.node_a
JOIN _ec9_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec9_fp f JOIN _ec9_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec9_fp f JOIN _ec9_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec9 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec9-%'
UNION ALL SELECT 'ec9 floors', COUNT(*) FROM floors WHERE id LIKE 'b9ec%'
UNION ALL SELECT 'ec9 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c9ec%'
UNION ALL SELECT 'ec9 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e9ec%'
UNION ALL SELECT 'ec9 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e9ec%');

-- Starting cable for trace: cbl-e9ec0000-0000-4000-b000-000000000001-A (변전소 A 의 OFD-A 측)
-- Frontend: navigate to /floors/b9ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.