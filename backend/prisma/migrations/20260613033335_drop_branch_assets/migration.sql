-- BRANCH 케이블 endpoint 를 부모 FEEDER 로 재연결(분기→피더 흡수)
UPDATE cables c SET source_asset_id = b.parent_asset_id
  FROM assets b JOIN asset_types t ON b.asset_type_id=t.id
  WHERE c.source_asset_id = b.id AND t.code='BRANCH' AND b.parent_asset_id IS NOT NULL;
UPDATE cables c SET target_asset_id = b.parent_asset_id
  FROM assets b JOIN asset_types t ON b.asset_type_id=t.id
  WHERE c.target_asset_id = b.id AND t.code='BRANCH' AND b.parent_asset_id IS NOT NULL;
-- BRANCH 자산 삭제(ON DELETE CASCADE 로 잔여 케이블 정리)
DELETE FROM assets WHERE asset_type_id IN (SELECT id FROM asset_types WHERE code='BRANCH');
-- BRANCH 타입 삭제
DELETE FROM asset_types WHERE code='BRANCH';
