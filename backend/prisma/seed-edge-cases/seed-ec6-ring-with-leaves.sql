-- ============================================================================
-- Edge case ec6 (ring-with-leaves)
-- 5-node ring with leaf branches off two nodes.
-- nodes: 8, edges: 8
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e6ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e6ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec6-%';
DELETE FROM equipment    WHERE id LIKE 'c6ec%' OR id LIKE 'd6ec%';
DELETE FROM floors       WHERE id LIKE 'b6ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec6-%';

-- Substations (8 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec6-A', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-A 변전소', 1600, true, NOW(), NOW()),
  ('sub-ec6-B', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-B 변전소', 1601, true, NOW(), NOW()),
  ('sub-ec6-C', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-C 변전소', 1602, true, NOW(), NOW()),
  ('sub-ec6-D', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-D 변전소', 1603, true, NOW(), NOW()),
  ('sub-ec6-E', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-E 변전소', 1604, true, NOW(), NOW()),
  ('sub-ec6-L1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-L1 변전소', 1605, true, NOW(), NOW()),
  ('sub-ec6-L2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-L2 변전소', 1606, true, NOW(), NOW()),
  ('sub-ec6-L3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC6-L3 변전소', 1607, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec6_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec6_map VALUES
  ('A', 'sub-ec6-A', 'b6ec0000-0000-4000-b000-000000000001', 'c6ec0000-0000-4000-b000-000000000001', 'd6ec0000-0000-4000-b000-000000000001', 'mod-ec6-A'),
  ('B', 'sub-ec6-B', 'b6ec0000-0000-4000-b000-000000000002', 'c6ec0000-0000-4000-b000-000000000002', 'd6ec0000-0000-4000-b000-000000000002', 'mod-ec6-B'),
  ('C', 'sub-ec6-C', 'b6ec0000-0000-4000-b000-000000000003', 'c6ec0000-0000-4000-b000-000000000003', 'd6ec0000-0000-4000-b000-000000000003', 'mod-ec6-C'),
  ('D', 'sub-ec6-D', 'b6ec0000-0000-4000-b000-000000000004', 'c6ec0000-0000-4000-b000-000000000004', 'd6ec0000-0000-4000-b000-000000000004', 'mod-ec6-D'),
  ('E', 'sub-ec6-E', 'b6ec0000-0000-4000-b000-000000000005', 'c6ec0000-0000-4000-b000-000000000005', 'd6ec0000-0000-4000-b000-000000000005', 'mod-ec6-E'),
  ('L1', 'sub-ec6-L1', 'b6ec0000-0000-4000-b000-000000000006', 'c6ec0000-0000-4000-b000-000000000006', 'd6ec0000-0000-4000-b000-000000000006', 'mod-ec6-L1'),
  ('L2', 'sub-ec6-L2', 'b6ec0000-0000-4000-b000-000000000007', 'c6ec0000-0000-4000-b000-000000000007', 'd6ec0000-0000-4000-b000-000000000007', 'mod-ec6-L2'),
  ('L3', 'sub-ec6-L3', 'b6ec0000-0000-4000-b000-000000000008', 'c6ec0000-0000-4000-b000-000000000008', 'd6ec0000-0000-4000-b000-000000000008', 'mod-ec6-L3');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec6_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec6_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec6_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec6_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (8 개)
CREATE TEMP TABLE _ec6_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec6_fp VALUES
  ('e6ec0000-0000-4000-b000-000000000001', 'A', 'B'),
  ('e6ec0000-0000-4000-b000-000000000002', 'B', 'C'),
  ('e6ec0000-0000-4000-b000-000000000003', 'C', 'D'),
  ('e6ec0000-0000-4000-b000-000000000004', 'D', 'E'),
  ('e6ec0000-0000-4000-b000-000000000005', 'E', 'A'),
  ('e6ec0000-0000-4000-b000-000000000006', 'A', 'L1'),
  ('e6ec0000-0000-4000-b000-000000000007', 'C', 'L2'),
  ('e6ec0000-0000-4000-b000-000000000008', 'L2', 'L3');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec6 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec6_fp f
JOIN _ec6_map a ON a.node = f.node_a
JOIN _ec6_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec6_fp f JOIN _ec6_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec6_fp f JOIN _ec6_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec6 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec6-%'
UNION ALL SELECT 'ec6 floors', COUNT(*) FROM floors WHERE id LIKE 'b6ec%'
UNION ALL SELECT 'ec6 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c6ec%'
UNION ALL SELECT 'ec6 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e6ec%'
UNION ALL SELECT 'ec6 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e6ec%');

-- Starting cable for trace: cbl-e6ec0000-0000-4000-b000-000000000001-A (변전소 A 의 OFD-A 측)
-- Frontend: navigate to /floors/b6ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.