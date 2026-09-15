-- 계통에 서는 **반(盤)**을 종류가 선언한다 — 출력 수로 알아맞히지 않는다.
--
-- 지금까지 반은 「함체 밖으로 나가는 전원 출력이 둘 이상」으로 셌다. 그 규칙이 KepCIT 랙
-- 안의 −48V 분배반(PDP-C3)을 변전소 계통 표에 끌어들였다 — 분기가 일곱이라 요건에 맞는다.
-- 그러나 나누는 판인지 아닌지는 **물건의 성질**이지 포트 수의 성질이 아니다. 세는 눈은
-- 랙 안의 분배반과 변전소 분전반을 영영 구별하지 못한다.
--
-- 그래서 케이블 종류의 `managesFiberLine` 과 같은 길로 간다: **선언이 정한다.** 장비 종류를
-- 만들 때 「계통에 서는 반」을 켜면 계통 탭이 그 자산을 한 장으로 세우고 출력을 회로로 편다.
ALTER TABLE "AssetType" ADD COLUMN "managesPowerCircuits" BOOLEAN NOT NULL DEFAULT false;

-- 이미 돌고 있는 DB 에서 **지금 반으로 서 있던 것**을 그대로 옮긴다. 개발 DB 를 재 보니
-- 반 여섯 가운데 넷이 이 둘이었고(AC 전원 ×3 · DC 전원 ×1), 나머지 둘이 PDP-C3 였다 —
-- 곧 이 두 종류만 켜면 원치 않던 둘만 빠진다.
UPDATE "AssetType" SET "managesPowerCircuits" = true WHERE "key" IN ('AC-FEEDER', 'DC-FEEDER');

-- 이름도 현장이 부르는 대로 — 「정보통신용 전원분전반」은 길고, 도면에는 「통신용 분전반」이다.
UPDATE "Assembly" SET "name" = '통신용 분전반' WHERE "key" = 'PWR-DIST-SET' AND "name" = '정보통신용 전원분전반';
