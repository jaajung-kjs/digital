-- ============================================================================
-- Edge case ec1 (single-ring)
-- Single 5-node ring, no junction.
-- nodes: 5, edges: 5
-- ============================================================================
BEGIN;

-- Cleanup
DELETE FROM cables       WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e1ec%');
DELETE FROM fiber_paths  WHERE id LIKE 'e1ec%';
DELETE FROM rack_modules WHERE id LIKE 'mod-ec1-%';
DELETE FROM equipment    WHERE id LIKE 'c1ec%' OR id LIKE 'd1ec%';
DELETE FROM floors       WHERE id LIKE 'b1ec%';
DELETE FROM substations  WHERE id LIKE 'sub-ec1-%';

-- Substations (5 개)
INSERT INTO substations (id, branch_id, name, sort_order, is_active, created_at, updated_at) VALUES
  ('sub-ec1-A', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC1-A 변전소', 1100, true, NOW(), NOW()),
  ('sub-ec1-B', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC1-B 변전소', 1101, true, NOW(), NOW()),
  ('sub-ec1-C', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC1-C 변전소', 1102, true, NOW(), NOW()),
  ('sub-ec1-D', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC1-D 변전소', 1103, true, NOW(), NOW()),
  ('sub-ec1-E', 'a40c0e6d-063b-4a3f-bd39-7062abbeb230', 'EC1-E 변전소', 1104, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 노드 → ID 매핑
CREATE TEMP TABLE _ec1_map (
  node           text PRIMARY KEY,
  substation_id  text NOT NULL,
  floor_id       text NOT NULL,
  ofd_id         text NOT NULL,
  rack_id        text NOT NULL,
  module_id      text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec1_map VALUES
  ('A', 'sub-ec1-A', 'b1ec0000-0000-4000-b000-000000000001', 'c1ec0000-0000-4000-b000-000000000001', 'd1ec0000-0000-4000-b000-000000000001', 'mod-ec1-A'),
  ('B', 'sub-ec1-B', 'b1ec0000-0000-4000-b000-000000000002', 'c1ec0000-0000-4000-b000-000000000002', 'd1ec0000-0000-4000-b000-000000000002', 'mod-ec1-B'),
  ('C', 'sub-ec1-C', 'b1ec0000-0000-4000-b000-000000000003', 'c1ec0000-0000-4000-b000-000000000003', 'd1ec0000-0000-4000-b000-000000000003', 'mod-ec1-C'),
  ('D', 'sub-ec1-D', 'b1ec0000-0000-4000-b000-000000000004', 'c1ec0000-0000-4000-b000-000000000004', 'd1ec0000-0000-4000-b000-000000000004', 'mod-ec1-D'),
  ('E', 'sub-ec1-E', 'b1ec0000-0000-4000-b000-000000000005', 'c1ec0000-0000-4000-b000-000000000005', 'd1ec0000-0000-4000-b000-000000000005', 'mod-ec1-E');

-- Floors
INSERT INTO floors (id, substation_id, name, floor_number, sort_order, is_active, created_at, updated_at)
SELECT floor_id, substation_id, '1F', '1F', 0, true, NOW(), NOW() FROM _ec1_map
ON CONFLICT (id) DO NOTHING;

-- OFD equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, sort_order, created_at, updated_at)
SELECT ofd_id, floor_id, 'OFD'::"EquipmentKind", 'OFD-' || node, 400, 300, 100, 60, 0, 0, NOW(), NOW() FROM _ec1_map
ON CONFLICT (id) DO NOTHING;

-- RACK equipment
INSERT INTO equipment (id, floor_id, kind, name, position_x_2d, position_y_2d, width_2d, height_2d, rotation, total_u, sort_order, created_at, updated_at)
SELECT rack_id, floor_id, 'RACK'::"EquipmentKind", 'RACK-' || node, 700, 300, 120, 80, 0, 12, 1, NOW(), NOW() FROM _ec1_map
ON CONFLICT (id) DO NOTHING;

-- Rack module (송변전광단말장치, slot 0)
INSERT INTO rack_modules (id, rack_equipment_id, category_id, name, slot_index, slot_span, sort_order, created_at, updated_at)
SELECT module_id, rack_id, (SELECT id FROM rack_module_categories WHERE code='EQP-OPT-TERM'), '송변전광단말장치', 0, 1, 0, NOW(), NOW() FROM _ec1_map
ON CONFLICT (id) DO NOTHING;

-- Fiber paths (5 개)
CREATE TEMP TABLE _ec1_fp (
  fp_id   text PRIMARY KEY,
  node_a  text NOT NULL,
  node_b  text NOT NULL
) ON COMMIT DROP;

INSERT INTO _ec1_fp VALUES
  ('e1ec0000-0000-4000-b000-000000000001', 'A', 'B'),
  ('e1ec0000-0000-4000-b000-000000000002', 'B', 'C'),
  ('e1ec0000-0000-4000-b000-000000000003', 'C', 'D'),
  ('e1ec0000-0000-4000-b000-000000000004', 'D', 'E'),
  ('e1ec0000-0000-4000-b000-000000000005', 'E', 'A');

INSERT INTO fiber_paths (id, ofd_a_id, ofd_b_id, port_count, description, created_at, updated_at)
SELECT f.fp_id, a.ofd_id, b.ofd_id, 24, 'ec1 ' || f.node_a || '-' || f.node_b, NOW(), NOW()
FROM _ec1_fp f
JOIN _ec1_map a ON a.node = f.node_a
JOIN _ec1_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

-- Cables (2 per fiber path)
INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-A', a.module_id, a.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_a || ')', 4, NOW(), NOW()
FROM _ec1_fp f JOIN _ec1_map a ON a.node = f.node_a
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, source_module_id, target_equipment_id, cable_type, category_id, fiber_path_id, fiber_port_number, label, buffer_length, created_at, updated_at)
SELECT 'cbl-' || f.fp_id || '-B', b.module_id, b.ofd_id,
  'FIBER'::"CableType",
  (SELECT id FROM cable_categories WHERE code='CBL-OPT'),
  f.fp_id, 1, '송변전광단말장치-OFD P1 (' || f.node_b || ')', 4, NOW(), NOW()
FROM _ec1_fp f JOIN _ec1_map b ON b.node = f.node_b
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verification
SELECT 'ec1 substations' AS metric, COUNT(*) FROM substations WHERE id LIKE 'sub-ec1-%'
UNION ALL SELECT 'ec1 floors', COUNT(*) FROM floors WHERE id LIKE 'b1ec%'
UNION ALL SELECT 'ec1 OFD', COUNT(*) FROM equipment WHERE id LIKE 'c1ec%'
UNION ALL SELECT 'ec1 fiber_paths', COUNT(*) FROM fiber_paths WHERE id LIKE 'e1ec%'
UNION ALL SELECT 'ec1 cables', COUNT(*) FROM cables WHERE fiber_path_id IN (SELECT id FROM fiber_paths WHERE id LIKE 'e1ec%');

-- Starting cable for trace: cbl-e1ec0000-0000-4000-b000-000000000001-A (변전소 A 의 OFD-A 측)
-- Frontend: navigate to /floors/b1ec0000-0000-4000-b000-000000000001/plan, click the cable, '상세' button.