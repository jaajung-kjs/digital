-- 노임은 **직종별 시계열**이다. 보고서가 한 번에 네 회차를 주고 그중 일부 칸은 비어 있는데,
-- 최신 열만 스냅샷으로 담으면 「비었으면 이전 걸 쓰자」는 판단을 코드가 해야 한다.
-- 있는 값만 행으로 넣으면 「현재 단가」는 그 직종의 가장 최근 행일 뿐이라 판단할 것이 없다.
CREATE TABLE "LaborRate" (
    "code"           TEXT NOT NULL,
    "effectiveOn"    TIMESTAMP(3) NOT NULL,
    "effectiveLabel" TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "sector"         TEXT NOT NULL,
    "wage"           INTEGER NOT NULL,
    "marker"         TEXT NOT NULL DEFAULT '',
    "sourceId"       TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborRate_pkey" PRIMARY KEY ("code","effectiveOn")
);

CREATE INDEX "LaborRate_code_effectiveOn_idx" ON "LaborRate"("code", "effectiveOn");
