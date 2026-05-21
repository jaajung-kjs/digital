-- ============================================================================
-- Edge case ec3 (two-rings-two-junctions)
-- 2 rings sharing 2 junction nodes (SPQR — BC-tree 한계 케이스).
-- nodes: 6, edges: 8
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e3ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e3ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec3-%';
DELETE FROM equipment    WHERE id LIKE 'c3ec%' OR id LIKE 'd3ec%';
DELETE FROM floors       WHERE id LIKE 'b3ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec3-%';

-- Substations (6 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec3-J1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC3-J1 변전소', 1300, true, NOW(), NOW()),
  ('sub-ec3-J2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC3-J2 변전소', 1301, true, NOW(), NOW()),
  ('sub-ec3-A', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC3-A 변전소', 1302, true, NOW(), NOW()),
  ('sub-ec3-B', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC3-B 변전소', 1303, true, NOW(), NOW()),
  ('sub-ec3-C', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC3-C 변전소', 1304, true, NOW(), NOW()),
  ('sub-ec3-D', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC3-D 변전소', 1305, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec3_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec3_map VALUES
  ('J1', 'sub-ec3-J1', 'b3ec0000-0000-4000-b000-000000000001', 'c3ec0000-0000-4000-b000-000000000001', 'd3ec0000-0000-4000-b000-000000000001', 'mod-ec3-J1'),
  ('J2', 'sub-ec3-J2', 'b3ec0000-0000-4000-b000-000000000002', 'c3ec0000-0000-4000-b000-000000000002', 'd3ec0000-0000-4000-b000-000000000002', 'mod-ec3-J2'),
  ('A', 'sub-ec3-A', 'b3ec0000-0000-4000-b000-000000000003', 'c3ec0000-0000-4000-b000-000000000003', 'd3ec0000-0000-4000-b000-000000000003', 'mod-ec3-A'),
  ('B', 'sub-ec3-B', 'b3ec0000-0000-4000-b000-000000000004', 'c3ec0000-0000-4000-b000-000000000004', 'd3ec0000-0000-4000-b000-000000000004', 'mod-ec3-B'),
  ('C', 'sub-ec3-C', 'b3ec0000-0000-4000-b000-000000000005', 'c3ec0000-0000-4000-b000-000000000005', 'd3ec0000-0000-4000-b000-000000000005', 'mod-ec3-C'),
  ('D', 'sub-ec3-D', 'b3ec0000-0000-4000-b000-000000000006', 'c3ec0000-0000-4000-b000-000000000006', 'd3ec0000-0000-4000-b000-000000000006', 'mod-ec3-D');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec3_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec3_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec3_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec3_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (8 개)
CREATE TEMP TABLE _ec3_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec3_fp VALUES
  ('e3ec0000-0000-4000-b000-000000000001', 'J1', 'A'),
  ('e3ec0000-0000-4000-b000-000000000002', 'A', 'J2'),
  ('e3ec0000-0000-4000-b000-000000000003', 'J2', 'B'),
  ('e3ec0000-0000-4000-b000-000000000004', 'B', 'J1'),
  ('e3ec0000-0000-4000-b000-000000000005', 'J1', 'C'),
  ('e3ec0000-0000-4000-b000-000000000006', 'C', 'J2'),
  ('e3ec0000-0000-4000-b000-000000000007', 'J2', 'D'),
  ('e3ec0000-0000-4000-b000-000000000008', 'D', 'J1');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec3 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec3_fp f
JOIN _ec3_map a ON a.node = f.node_a
JOIN _ec3_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec3_fp f JOIN _ec3_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec3_fp f JOIN _ec3_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec3 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec3-%'
UNION ALL SELECT 'ec3 floors', COUNT(*) FROM floors WHERE id LIKE 'b3ec%'
UNION ALL SELECT 'ec3 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c3ec%'
UNION ALL SELECT 'ec3 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e3ec%'
UNION ALL SELECT 'ec3 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e3ec%');

-- Starting cable for trace: cbl-e3ec0000-0000-4000-b000-000000000001-A (변전소 J1 의 OFD-J1 측)
-- Frontend: navigate to /floors/b3ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.