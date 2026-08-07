-- 다심 포트 — 포트 하나가 나르는 심선 수.
--
-- OPGW 한 가닥은 케이블 1본인데 그 안에 24심이 들어 있다. 예전에는 그 24심을 포트 24개 +
-- 케이블 24본으로 펴서, (a) 설계서 공량이 심선 수만큼 부풀었고(40m 한 가닥 → 960m),
-- (b) 대국이 슬롯에서 끊겨 그 너머 장비를 추적할 수 없었다. 이제 인입은 포트 하나이고
-- 그 안의 코어는 `positions` 으로 센다 — NetBox 의 RearPort(positions)/FrontPort 와 같다.
ALTER TABLE "AssetPortTemplate" ADD COLUMN "positions" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Port" ADD COLUMN "positions" INTEGER NOT NULL DEFAULT 1;

-- `lineSide` 는 "이 그룹만 선번장 대상" 이라는 예외 표시였다. 그 예외가 이제 어휘로
-- 표현된다 — 선번장 값은 `광 인입`(다심) 종류의 포트에만 선언되어 있다.
ALTER TABLE "AssetPortTemplate" DROP COLUMN "lineSide";
