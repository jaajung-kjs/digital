-- 코어패치 방향 규약 통일: 슬롯=source(role OUT), 설비=target. UI 생성분이 반대(설비=source,
-- target_role=OUT)로 저장돼 있던 것을 한 규약으로 정렬한다. (무방향이라 동작엔 영향 없는 정합성 정리.)
-- 단일 UPDATE 의 SET 우변은 모두 갱신 전 값으로 평가되므로 swap 이 안전하다.
UPDATE "cables"
SET "source_asset_id" = "target_asset_id",
    "target_asset_id" = "source_asset_id",
    "source_role"      = "target_role",
    "target_role"      = "source_role"
WHERE "cable_type" = 'FIBER'
  AND "target_role" = 'OUT'
  AND "source_role" IS NULL;
