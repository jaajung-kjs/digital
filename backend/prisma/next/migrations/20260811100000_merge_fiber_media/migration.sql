-- 광과 OPGW 를 한 종류로 합친다.
--
-- 둘을 가르던 것은 결국 **심선 수**였고, 심선 수는 이미 포트가 `positions` 로 들고 있다
-- (케이블에는 심선 수 필드가 아예 없다). 같은 사실을 매체 키가 한 번 더 나르고 있었던
-- 셈이라, 화면에는 뜻이 겹치는 「광」과 「OPGW」 두 그룹이 나란히 섰다.
--
-- 이제 붙을 상대는 `positions` 로 가른다(다심↔다심). 케이블 종류는 무엇을 깔았는지를
-- 적는 이름일 뿐이다.
--
-- 품셈은 남는 「광」 그룹의 값(0.04/0.02)을 그대로 쓴다 — 필요하면 설비관리대장에서 고친다.

-- 1) 포트·템플릿의 매체를 옮긴다. 심선 수(positions)는 그대로 둔다 — 그게 이제 구분자다.
UPDATE "Port" SET medium = 'fiber' WHERE medium = 'fiber-trunk';
UPDATE "AssetPortTemplate" SET medium = 'fiber' WHERE medium = 'fiber-trunk';

-- 2) OPGW 그룹의 케이블 종류를 광 그룹으로 옮긴다.
--    같은 이름이 양쪽에 있으면 (groupId, name) 유일 제약에 걸리므로 먼저 지운다
--    (실제로는 겹치는 이름이 없지만, 손으로 만든 데이터가 있을 수 있다).
DELETE FROM "CableCategory" dup
 WHERE dup."groupId" = (SELECT id FROM "CableGroup" WHERE key = 'fiber-trunk')
   AND EXISTS (
     SELECT 1 FROM "CableCategory" keep
      WHERE keep."groupId" = (SELECT id FROM "CableGroup" WHERE key = 'fiber')
        AND keep.name = dup.name
   );

UPDATE "CableCategory"
   SET "groupId" = (SELECT id FROM "CableGroup" WHERE key = 'fiber')
 WHERE "groupId" = (SELECT id FROM "CableGroup" WHERE key = 'fiber-trunk');

-- 3) 빈 OPGW 그룹을 지운다.
DELETE FROM "CableGroup" WHERE key = 'fiber-trunk';
