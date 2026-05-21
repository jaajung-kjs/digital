-- ============================================================================
-- Edge case ec7 (disconnected-2rings)
-- 2 separate rings, no junction between them.
-- nodes: 8, edges: 8
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e7ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e7ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec7-%';
DELETE FROM equipment    WHERE id LIKE 'c7ec%' OR id LIKE 'd7ec%';
DELETE FROM floors       WHERE id LIKE 'b7ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec7-%';

-- Substations (8 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec7-A', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-A 변전소', 1700, true, NOW(), NOW()),
  ('sub-ec7-B', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-B 변전소', 1701, true, NOW(), NOW()),
  ('sub-ec7-C', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-C 변전소', 1702, true, NOW(), NOW()),
  ('sub-ec7-D', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-D 변전소', 1703, true, NOW(), NOW()),
  ('sub-ec7-X', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-X 변전소', 1704, true, NOW(), NOW()),
  ('sub-ec7-Y', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-Y 변전소', 1705, true, NOW(), NOW()),
  ('sub-ec7-Z', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-Z 변전소', 1706, true, NOW(), NOW()),
  ('sub-ec7-W', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC7-W 변전소', 1707, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec7_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec7_map VALUES
  ('A', 'sub-ec7-A', 'b7ec0000-0000-4000-b000-000000000001', 'c7ec0000-0000-4000-b000-000000000001', 'd7ec0000-0000-4000-b000-000000000001', 'mod-ec7-A'),
  ('B', 'sub-ec7-B', 'b7ec0000-0000-4000-b000-000000000002', 'c7ec0000-0000-4000-b000-000000000002', 'd7ec0000-0000-4000-b000-000000000002', 'mod-ec7-B'),
  ('C', 'sub-ec7-C', 'b7ec0000-0000-4000-b000-000000000003', 'c7ec0000-0000-4000-b000-000000000003', 'd7ec0000-0000-4000-b000-000000000003', 'mod-ec7-C'),
  ('D', 'sub-ec7-D', 'b7ec0000-0000-4000-b000-000000000004', 'c7ec0000-0000-4000-b000-000000000004', 'd7ec0000-0000-4000-b000-000000000004', 'mod-ec7-D'),
  ('X', 'sub-ec7-X', 'b7ec0000-0000-4000-b000-000000000005', 'c7ec0000-0000-4000-b000-000000000005', 'd7ec0000-0000-4000-b000-000000000005', 'mod-ec7-X'),
  ('Y', 'sub-ec7-Y', 'b7ec0000-0000-4000-b000-000000000006', 'c7ec0000-0000-4000-b000-000000000006', 'd7ec0000-0000-4000-b000-000000000006', 'mod-ec7-Y'),
  ('Z', 'sub-ec7-Z', 'b7ec0000-0000-4000-b000-000000000007', 'c7ec0000-0000-4000-b000-000000000007', 'd7ec0000-0000-4000-b000-000000000007', 'mod-ec7-Z'),
  ('W', 'sub-ec7-W', 'b7ec0000-0000-4000-b000-000000000008', 'c7ec0000-0000-4000-b000-000000000008', 'd7ec0000-0000-4000-b000-000000000008', 'mod-ec7-W');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec7_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec7_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec7_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec7_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (8 개)
CREATE TEMP TABLE _ec7_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec7_fp VALUES
  ('e7ec0000-0000-4000-b000-000000000001', 'A', 'B'),
  ('e7ec0000-0000-4000-b000-000000000002', 'B', 'C'),
  ('e7ec0000-0000-4000-b000-000000000003', 'C', 'D'),
  ('e7ec0000-0000-4000-b000-000000000004', 'D', 'A'),
  ('e7ec0000-0000-4000-b000-000000000005', 'X', 'Y'),
  ('e7ec0000-0000-4000-b000-000000000006', 'Y', 'Z'),
  ('e7ec0000-0000-4000-b000-000000000007', 'Z', 'W'),
  ('e7ec0000-0000-4000-b000-000000000008', 'W', 'X');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec7 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec7_fp f
JOIN _ec7_map a ON a.node = f.node_a
JOIN _ec7_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec7_fp f JOIN _ec7_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec7_fp f JOIN _ec7_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec7 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec7-%'
UNION ALL SELECT 'ec7 floors', COUNT(*) FROM floors WHERE id LIKE 'b7ec%'
UNION ALL SELECT 'ec7 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c7ec%'
UNION ALL SELECT 'ec7 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e7ec%'
UNION ALL SELECT 'ec7 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e7ec%');

-- Starting cable for trace: cbl-e7ec0000-0000-4000-b000-000000000001-A (변전소 A 의 OFD-A 측)
-- Frontend: navigate to /floors/b7ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.