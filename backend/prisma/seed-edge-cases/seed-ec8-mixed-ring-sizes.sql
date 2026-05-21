-- ============================================================================
-- Edge case ec8 (mixed-ring-sizes)
-- Mixed-size rings (3, 5, 7) — star at J1 + bridge to ring3 at J2.
-- nodes: 13, edges: 15
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e8ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e8ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec8-%';
DELETE FROM equipment    WHERE id LIKE 'c8ec%' OR id LIKE 'd8ec%';
DELETE FROM floors       WHERE id LIKE 'b8ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec8-%';

-- Substations (13 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec8-J1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-J1 변전소', 1800, true, NOW(), NOW()),
  ('sub-ec8-J2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-J2 변전소', 1801, true, NOW(), NOW()),
  ('sub-ec8-T1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-T1 변전소', 1802, true, NOW(), NOW()),
  ('sub-ec8-T2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-T2 변전소', 1803, true, NOW(), NOW()),
  ('sub-ec8-P1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-P1 변전소', 1804, true, NOW(), NOW()),
  ('sub-ec8-P2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-P2 변전소', 1805, true, NOW(), NOW()),
  ('sub-ec8-P3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-P3 변전소', 1806, true, NOW(), NOW()),
  ('sub-ec8-P4', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-P4 변전소', 1807, true, NOW(), NOW()),
  ('sub-ec8-O1', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-O1 변전소', 1808, true, NOW(), NOW()),
  ('sub-ec8-O2', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-O2 변전소', 1809, true, NOW(), NOW()),
  ('sub-ec8-O3', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-O3 변전소', 1810, true, NOW(), NOW()),
  ('sub-ec8-O4', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-O4 변전소', 1811, true, NOW(), NOW()),
  ('sub-ec8-O5', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC8-O5 변전소', 1812, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec8_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec8_map VALUES
  ('J1', 'sub-ec8-J1', 'b8ec0000-0000-4000-b000-000000000001', 'c8ec0000-0000-4000-b000-000000000001', 'd8ec0000-0000-4000-b000-000000000001', 'mod-ec8-J1'),
  ('J2', 'sub-ec8-J2', 'b8ec0000-0000-4000-b000-000000000002', 'c8ec0000-0000-4000-b000-000000000002', 'd8ec0000-0000-4000-b000-000000000002', 'mod-ec8-J2'),
  ('T1', 'sub-ec8-T1', 'b8ec0000-0000-4000-b000-000000000003', 'c8ec0000-0000-4000-b000-000000000003', 'd8ec0000-0000-4000-b000-000000000003', 'mod-ec8-T1'),
  ('T2', 'sub-ec8-T2', 'b8ec0000-0000-4000-b000-000000000004', 'c8ec0000-0000-4000-b000-000000000004', 'd8ec0000-0000-4000-b000-000000000004', 'mod-ec8-T2'),
  ('P1', 'sub-ec8-P1', 'b8ec0000-0000-4000-b000-000000000005', 'c8ec0000-0000-4000-b000-000000000005', 'd8ec0000-0000-4000-b000-000000000005', 'mod-ec8-P1'),
  ('P2', 'sub-ec8-P2', 'b8ec0000-0000-4000-b000-000000000006', 'c8ec0000-0000-4000-b000-000000000006', 'd8ec0000-0000-4000-b000-000000000006', 'mod-ec8-P2'),
  ('P3', 'sub-ec8-P3', 'b8ec0000-0000-4000-b000-000000000007', 'c8ec0000-0000-4000-b000-000000000007', 'd8ec0000-0000-4000-b000-000000000007', 'mod-ec8-P3'),
  ('P4', 'sub-ec8-P4', 'b8ec0000-0000-4000-b000-000000000008', 'c8ec0000-0000-4000-b000-000000000008', 'd8ec0000-0000-4000-b000-000000000008', 'mod-ec8-P4'),
  ('O1', 'sub-ec8-O1', 'b8ec0000-0000-4000-b000-000000000009', 'c8ec0000-0000-4000-b000-000000000009', 'd8ec0000-0000-4000-b000-000000000009', 'mod-ec8-O1'),
  ('O2', 'sub-ec8-O2', 'b8ec0000-0000-4000-b000-00000000000a', 'c8ec0000-0000-4000-b000-00000000000a', 'd8ec0000-0000-4000-b000-00000000000a', 'mod-ec8-O2'),
  ('O3', 'sub-ec8-O3', 'b8ec0000-0000-4000-b000-00000000000b', 'c8ec0000-0000-4000-b000-00000000000b', 'd8ec0000-0000-4000-b000-00000000000b', 'mod-ec8-O3'),
  ('O4', 'sub-ec8-O4', 'b8ec0000-0000-4000-b000-00000000000c', 'c8ec0000-0000-4000-b000-00000000000c', 'd8ec0000-0000-4000-b000-00000000000c', 'mod-ec8-O4'),
  ('O5', 'sub-ec8-O5', 'b8ec0000-0000-4000-b000-00000000000d', 'c8ec0000-0000-4000-b000-00000000000d', 'd8ec0000-0000-4000-b000-00000000000d', 'mod-ec8-O5');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec8_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec8_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec8_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec8_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (15 개)
CREATE TEMP TABLE _ec8_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec8_fp VALUES
  ('e8ec0000-0000-4000-b000-000000000001', 'J1', 'T1'),
  ('e8ec0000-0000-4000-b000-000000000002', 'T1', 'T2'),
  ('e8ec0000-0000-4000-b000-000000000003', 'T2', 'J1'),
  ('e8ec0000-0000-4000-b000-000000000004', 'J1', 'P1'),
  ('e8ec0000-0000-4000-b000-000000000005', 'P1', 'P2'),
  ('e8ec0000-0000-4000-b000-000000000006', 'P2', 'P3'),
  ('e8ec0000-0000-4000-b000-000000000007', 'P3', 'P4'),
  ('e8ec0000-0000-4000-b000-000000000008', 'P4', 'J1'),
  ('e8ec0000-0000-4000-b000-000000000009', 'J1', 'J2'),
  ('e8ec0000-0000-4000-b000-00000000000a', 'J2', 'O1'),
  ('e8ec0000-0000-4000-b000-00000000000b', 'O1', 'O2'),
  ('e8ec0000-0000-4000-b000-00000000000c', 'O2', 'O3'),
  ('e8ec0000-0000-4000-b000-00000000000d', 'O3', 'O4'),
  ('e8ec0000-0000-4000-b000-00000000000e', 'O4', 'O5'),
  ('e8ec0000-0000-4000-b000-00000000000f', 'O5', 'J2');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec8 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec8_fp f
JOIN _ec8_map a ON a.node = f.node_a
JOIN _ec8_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec8_fp f JOIN _ec8_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec8_fp f JOIN _ec8_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec8 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec8-%'
UNION ALL SELECT 'ec8 floors', COUNT(*) FROM floors WHERE id LIKE 'b8ec%'
UNION ALL SELECT 'ec8 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c8ec%'
UNION ALL SELECT 'ec8 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e8ec%'
UNION ALL SELECT 'ec8 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e8ec%');

-- Starting cable for trace: cbl-e8ec0000-0000-4000-b000-000000000001-A (변전소 J1 의 OFD-J1 측)
-- Frontend: navigate to /floors/b8ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.