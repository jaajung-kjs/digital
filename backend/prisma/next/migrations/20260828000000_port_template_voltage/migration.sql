-- 전압은 포트 선언이 갖는다 — 「이 장비의 전원 입력은 DC 48V」는 품목의 성질이다.
-- 놓인 포트는 만들 때 이 값을 물려받아 Port.fieldValues.voltage 로 들고 있다.
ALTER TABLE "AssetPortTemplate" ADD COLUMN "voltage" TEXT;
