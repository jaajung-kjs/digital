-- 연결도 단일함수 검증용 시드 (P1~P5). 멱등(ON CONFLICT DO NOTHING).
BEGIN;

INSERT INTO substations (id, name, sort_order, updated_at) VALUES
  ('sub-conn', '연결테스트변전소', 900, NOW()),
  ('sub-conn-remote', '대국변전소', 901, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO floors (id, substation_id, name, floor_number, sort_order, updated_at) VALUES
  ('flr-conn-1', 'sub-conn', '1층', '1', 0, NOW()),
  ('flr-conn-b1', 'sub-conn', 'B1층', 'B1', 1, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO assets (id, substation_id, asset_type_id, name, parent_asset_id, floor_id, position_x_2d, position_y_2d, width_2d, height_2d, updated_at)
VALUES
  ('a-chg',  'sub-conn', (SELECT id FROM asset_types WHERE code='CHARGER'), '충전기',  NULL,        'flr-conn-1', 100, 100, 60, 40, NOW()),
  ('a-ups',  'sub-conn', (SELECT id FROM asset_types WHERE code='UPS'),     'UPS',     NULL,        'flr-conn-1', 200, 100, 60, 40, NOW()),
  ('a-dist', 'sub-conn', (SELECT id FROM asset_types WHERE code='DIST'),    '분전반',  NULL,        'flr-conn-1', 300, 100, 80, 60, NOW()),
  ('a-fA',   'sub-conn', (SELECT id FROM asset_types WHERE code='FEEDER'),  '피더A',   'a-dist',    NULL, NULL, NULL, NULL, NULL, NOW()),
  ('a-fB',   'sub-conn', (SELECT id FROM asset_types WHERE code='FEEDER'),  '피더B',   'a-dist',    NULL, NULL, NULL, NULL, NULL, NOW()),
  ('a-t1',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-PWR-DC'), '단말1', NULL,       'flr-conn-1', 400,  80, 50, 30, NOW()),
  ('a-t2',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-PWR-DC'), '단말2', NULL,       'flr-conn-1', 400, 140, 50, 30, NOW()),
  ('a-t3',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-PWR-DC'), '단말3', NULL,       'flr-conn-1', 400, 200, 50, 30, NOW()),
  ('a-chg2', 'sub-conn', (SELECT id FROM asset_types WHERE code='CHARGER'), '충전기B1', NULL,       'flr-conn-b1', 100, 100, 60, 40, NOW()),
  ('a-fC',   'sub-conn', (SELECT id FROM asset_types WHERE code='FEEDER'),  '피더C',   'a-dist',    NULL, NULL, NULL, NULL, NULL, NOW()),
  ('a-t4',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-PWR-DC'), '단말4', NULL,       'flr-conn-1', 500, 100, 50, 30, NOW()),
  ('a-ofd',  'sub-conn', (SELECT id FROM asset_types WHERE code='OFD'),      'OFD',    NULL,        'flr-conn-1', 600, 100, 80, 80, NOW()),
  ('a-slot', 'sub-conn', (SELECT id FROM asset_types WHERE code='OFD-SLOT'), '남춘천', 'a-ofd',     NULL, NULL, NULL, NULL, NULL, NOW()),
  ('a-rofd', 'sub-conn-remote', (SELECT id FROM asset_types WHERE code='OFD'),      '원격OFD', NULL, NULL, NULL, NULL, NULL, NULL, NOW()),
  ('a-rslot','sub-conn-remote', (SELECT id FROM asset_types WHERE code='OFD-SLOT'), '춘천',    'a-rofd', NULL, NULL, NULL, NULL, NULL, NOW()),
  ('a-o1',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-OPT-TERM'), '단말광1', NULL,   'flr-conn-1', 700,  80, 50, 30, NOW()),
  ('a-o2',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-OPT-TERM'), '단말광2', NULL,   'flr-conn-1', 700, 140, 50, 30, NOW()),
  ('a-n1',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-NET-SW'), '설비N1', NULL,      'flr-conn-1', 100, 300, 50, 30, NOW()),
  ('a-n2',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-NET-SW'), '설비N2', NULL,      'flr-conn-1', 200, 300, 50, 30, NOW()),
  ('a-n3',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-NET-SW'), '설비N3', NULL,      'flr-conn-1', 300, 300, 50, 30, NOW()),
  ('a-n4',   'sub-conn', (SELECT id FROM asset_types WHERE code='EQP-NET-SW'), '설비N4', NULL,      'flr-conn-1', 400, 300, 50, 30, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO cables (id, cable_type, source_asset_id, target_asset_id, source_role, target_role, number, category_id, updated_at) VALUES
  ('c-chg-ups', 'AC', 'a-chg', 'a-ups', 'OUT', 'IN', NULL, NULL, NOW()),
  ('c-ups-fA',  'AC', 'a-ups', 'a-fA',  'OUT', 'IN', NULL, NULL, NOW()),
  ('c-ups-fB',  'AC', 'a-ups', 'a-fB',  'OUT', 'IN', NULL, NULL, NOW()),
  ('c-fA-t1',   'AC', 'a-fA',  'a-t1',  'OUT', NULL, 1, NULL, NOW()),
  ('c-fA-t2',   'AC', 'a-fA',  'a-t2',  'OUT', NULL, 2, NULL, NOW()),
  ('c-fB-t3',   'AC', 'a-fB',  'a-t3',  'OUT', NULL, 1, NULL, NOW()),
  ('c-chg2-fC', 'AC', 'a-chg2','a-fC',  'OUT', 'IN', NULL, NULL, NOW()),
  ('c-fC-t4',   'AC', 'a-fC',  'a-t4',  'OUT', NULL, 1, NULL, NOW()),
  ('c-s-o1',    'FIBER', 'a-slot', 'a-o1', 'OUT', NULL, 1, (SELECT id FROM cable_categories WHERE code='CBL-OPT'), NOW()),
  ('c-s-o2',    'FIBER', 'a-slot', 'a-o2', 'OUT', NULL, 2, (SELECT id FROM cable_categories WHERE code='CBL-OPT'), NOW()),
  ('c-opgw',    'FIBER', 'a-slot', 'a-rslot', 'IN', 'IN', NULL, (SELECT id FROM cable_categories WHERE code='CBL-OPGW'), NOW()),
  ('c-n1-n2',   'LAN', 'a-n1', 'a-n2', NULL, NULL, NULL, NULL, NOW()),
  ('c-n2-n3',   'LAN', 'a-n2', 'a-n3', NULL, NULL, NULL, NULL, NOW()),
  ('c-n3-n4',   'LAN', 'a-n3', 'a-n4', NULL, NULL, NULL, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;

SELECT 'assets(sub-conn)' AS metric, COUNT(*) FROM assets WHERE substation_id IN ('sub-conn','sub-conn-remote')
UNION ALL SELECT 'cables(P1~P4)', COUNT(*) FROM cables WHERE id LIKE 'c-%';
