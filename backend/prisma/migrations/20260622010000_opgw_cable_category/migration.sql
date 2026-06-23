-- OPGW(경로슬롯↔경로슬롯, IN-IN twin) 케이블을 광케이블(CBL-OPT) → OPGW(CBL-OPGW) 카테고리로 정정.
-- 식별: FIBER + 양끝 역할 IN-IN(= isOpgwTwin). 코어패치(OUT)는 영향 없음.
UPDATE "cables" c
SET "category_id" = cc."id"
FROM "cable_categories" cc
WHERE cc."code" = 'CBL-OPGW'
  AND c."cable_type" = 'FIBER'
  AND c."source_role" = 'IN'
  AND c."target_role" = 'IN';
