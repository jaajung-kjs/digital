-- 통과 링크 규칙과 타입별 필드 정의를 걷는다.
--
-- **링크 규칙**: 실제로 적혀 있던 다섯 개가 전부 포트 선언에서 유도되는 것이었고
-- (전원 입력↔출력, 다심 인입↔앞면), 그 되풀이 탓에 축전지 하나가 빠져 있어도 아무도
-- 몰랐다. 적을 곳을 없애니 빠질 곳도 없어졌다 — 이제 `derivedLinks` 가 유일한 출처다.
--
-- **필드 정의**: 실제로 쓰인 것은 피더의 `차단기 번호`(자산 이름과 겹쳤다)와
-- `개폐 상태` 둘뿐이었다. 개폐는 자산이 아니라 **그 회로의 상태**이므로 전원 출력
-- 포트로 옮긴다. 남는 속성(설치일·담당자)은 어느 자산에나 같으므로 선언이 필요 없다.

-- ① 개폐 상태를 전원 출력 포트로 옮긴다. 값을 지우기 **전에** 해야 한다.
UPDATE "Port" p
SET "fieldValues" = p."fieldValues" || jsonb_build_object('closed', a."fieldValues"->>'switchState' = 'ON')
FROM "Asset" a
WHERE p."assetId" = a.id
  AND p.medium = 'power'
  AND p.direction = 'OUT'
  AND a."fieldValues" ? 'switchState';

-- ② 자산에서 옛 필드 값을 걷는다. 남는 것은 공통 속성(설치일·담당자)뿐이다.
UPDATE "Asset"
SET "fieldValues" = "fieldValues" - 'breakerNo' - 'switchState'
WHERE "fieldValues" ?| array['breakerNo', 'switchState'];

-- ③ 선언을 걷는다.
ALTER TABLE "AssetType" DROP COLUMN "fieldDefs";
DROP TABLE "AssetLinkRule";
