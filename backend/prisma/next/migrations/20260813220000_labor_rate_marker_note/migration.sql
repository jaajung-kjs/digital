-- 각주를 **행에 붙인다**. 옛 회차 값을 보여 줄 때 각주도 그 회차의 것이어야 하는데,
-- 판(LaborStandard)에서 읽으면 최신 판의 문장이 옛 값에 붙는다.
ALTER TABLE "LaborRate" ADD COLUMN "markerNote" TEXT;
