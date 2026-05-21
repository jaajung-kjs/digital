-- ============================================================================
-- Edge case ec5 (chain-3rings)
-- 3 rings in chain via 2 junctions J1, J2.
-- nodes: 13, edges: 15
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e5ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e5ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec5-%';
DELETE FROM equipment    WHERE id LIKE 'c5ec%' OR id LIKE 'd5ec%';
DELETE FROM floors       WHERE id LIKE 'b5ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec5-%';

-- Substations (13 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec5-J1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-J1 변전소', 1500, true, NOW(), NOW()),
  ('sub-ec5-J2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-J2 변전소', 1501, true, NOW(), NOW()),
  ('sub-ec5-A', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-A 변전소', 1502, true, NOW(), NOW()),
  ('sub-ec5-B', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-B 변전소', 1503, true, NOW(), NOW()),
  ('sub-ec5-C', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-C 변전소', 1504, true, NOW(), NOW()),
  ('sub-ec5-D', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-D 변전소', 1505, true, NOW(), NOW()),
  ('sub-ec5-E', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-E 변전소', 1506, true, NOW(), NOW()),
  ('sub-ec5-F', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-F 변전소', 1507, true, NOW(), NOW()),
  ('sub-ec5-G', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-G 변전소', 1508, true, NOW(), NOW()),
  ('sub-ec5-H', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-H 변전소', 1509, true, NOW(), NOW()),
  ('sub-ec5-I', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-I 변전소', 1510, true, NOW(), NOW()),
  ('sub-ec5-K', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-K 변전소', 1511, true, NOW(), NOW()),
  ('sub-ec5-L', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC5-L 변전소', 1512, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec5_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec5_map VALUES
  ('J1', 'sub-ec5-J1', 'b5ec0000-0000-4000-b000-000000000001', 'c5ec0000-0000-4000-b000-000000000001', 'd5ec0000-0000-4000-b000-000000000001', 'mod-ec5-J1'),
  ('J2', 'sub-ec5-J2', 'b5ec0000-0000-4000-b000-000000000002', 'c5ec0000-0000-4000-b000-000000000002', 'd5ec0000-0000-4000-b000-000000000002', 'mod-ec5-J2'),
  ('A', 'sub-ec5-A', 'b5ec0000-0000-4000-b000-000000000003', 'c5ec0000-0000-4000-b000-000000000003', 'd5ec0000-0000-4000-b000-000000000003', 'mod-ec5-A'),
  ('B', 'sub-ec5-B', 'b5ec0000-0000-4000-b000-000000000004', 'c5ec0000-0000-4000-b000-000000000004', 'd5ec0000-0000-4000-b000-000000000004', 'mod-ec5-B'),
  ('C', 'sub-ec5-C', 'b5ec0000-0000-4000-b000-000000000005', 'c5ec0000-0000-4000-b000-000000000005', 'd5ec0000-0000-4000-b000-000000000005', 'mod-ec5-C'),
  ('D', 'sub-ec5-D', 'b5ec0000-0000-4000-b000-000000000006', 'c5ec0000-0000-4000-b000-000000000006', 'd5ec0000-0000-4000-b000-000000000006', 'mod-ec5-D'),
  ('E', 'sub-ec5-E', 'b5ec0000-0000-4000-b000-000000000007', 'c5ec0000-0000-4000-b000-000000000007', 'd5ec0000-0000-4000-b000-000000000007', 'mod-ec5-E'),
  ('F', 'sub-ec5-F', 'b5ec0000-0000-4000-b000-000000000008', 'c5ec0000-0000-4000-b000-000000000008', 'd5ec0000-0000-4000-b000-000000000008', 'mod-ec5-F'),
  ('G', 'sub-ec5-G', 'b5ec0000-0000-4000-b000-000000000009', 'c5ec0000-0000-4000-b000-000000000009', 'd5ec0000-0000-4000-b000-000000000009', 'mod-ec5-G'),
  ('H', 'sub-ec5-H', 'b5ec0000-0000-4000-b000-00000000000a', 'c5ec0000-0000-4000-b000-00000000000a', 'd5ec0000-0000-4000-b000-00000000000a', 'mod-ec5-H'),
  ('I', 'sub-ec5-I', 'b5ec0000-0000-4000-b000-00000000000b', 'c5ec0000-0000-4000-b000-00000000000b', 'd5ec0000-0000-4000-b000-00000000000b', 'mod-ec5-I'),
  ('K', 'sub-ec5-K', 'b5ec0000-0000-4000-b000-00000000000c', 'c5ec0000-0000-4000-b000-00000000000c', 'd5ec0000-0000-4000-b000-00000000000c', 'mod-ec5-K'),
  ('L', 'sub-ec5-L', 'b5ec0000-0000-4000-b000-00000000000d', 'c5ec0000-0000-4000-b000-00000000000d', 'd5ec0000-0000-4000-b000-00000000000d', 'mod-ec5-L');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec5_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec5_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec5_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec5_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (15 개)
CREATE TEMP TABLE _ec5_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec5_fp VALUES
  ('e5ec0000-0000-4000-b000-000000000001', 'J1', 'A'),
  ('e5ec0000-0000-4000-b000-000000000002', 'A', 'B'),
  ('e5ec0000-0000-4000-b000-000000000003', 'B', 'C'),
  ('e5ec0000-0000-4000-b000-000000000004', 'C', 'D'),
  ('e5ec0000-0000-4000-b000-000000000005', 'D', 'J1'),
  ('e5ec0000-0000-4000-b000-000000000006', 'J1', 'E'),
  ('e5ec0000-0000-4000-b000-000000000007', 'E', 'J2'),
  ('e5ec0000-0000-4000-b000-000000000008', 'J2', 'F'),
  ('e5ec0000-0000-4000-b000-000000000009', 'F', 'G'),
  ('e5ec0000-0000-4000-b000-00000000000a', 'G', 'J1'),
  ('e5ec0000-0000-4000-b000-00000000000b', 'J2', 'H'),
  ('e5ec0000-0000-4000-b000-00000000000c', 'H', 'I'),
  ('e5ec0000-0000-4000-b000-00000000000d', 'I', 'K'),
  ('e5ec0000-0000-4000-b000-00000000000e', 'K', 'L'),
  ('e5ec0000-0000-4000-b000-00000000000f', 'L', 'J2');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec5 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec5_fp f
JOIN _ec5_map a ON a.node = f.node_a
JOIN _ec5_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec5_fp f JOIN _ec5_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec5_fp f JOIN _ec5_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec5 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec5-%'
UNION ALL SELECT 'ec5 floors', COUNT(*) FROM floors WHERE id LIKE 'b5ec%'
UNION ALL SELECT 'ec5 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c5ec%'
UNION ALL SELECT 'ec5 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e5ec%'
UNION ALL SELECT 'ec5 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e5ec%');

-- Starting cable for trace: cbl-e5ec0000-0000-4000-b000-000000000001-A (변전소 J1 의 OFD-J1 측)
-- Frontend: navigate to /floors/b5ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.