-- 경로슬롯 성단 포트 이름: 「장비 N」 → 「광 포트 N」.
--
-- 이름이 실물과 어긋났다. 그 자리는 장비가 아니라 **포트**다(장비는 그 포트에 점퍼로
-- 이어지는 광단말이다). 판의 구획 이름도 그 이름에서 나오므로 「광 장비」로 읽혔다.
--
-- 포트 이름은 만들 때 지어 저장한다(생성 규칙을 나중에 다시 돌리지 않는다). 그래서
-- 이미 놓인 포트는 여기서 한 번 고쳐 준다.
UPDATE "Port"
   SET name = replace(name, '장비 ', '광 포트 ')
 WHERE medium = 'fiber' AND positions = 1 AND name LIKE '장비 %';

UPDATE "AssetPortTemplate"
   SET "namePattern" = '광 포트 {n}'
 WHERE medium = 'fiber' AND "namePattern" = '장비 {n}';
