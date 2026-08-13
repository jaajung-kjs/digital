-- 직종은 **코드**로 붙든다: 임금실태조사가 주는 코드(통신내선공 1086)는 이름이 바뀌어도
-- 그대로다. 컬럼만 먼저 바꿔 두고, 지금 들어 있는 이름값은 첫 노임단가 임포트가 코드로
-- 승격시킨다(이름이 표와 정확히 맞으면 자동, 아니면 그 화면에서 바꿔치기).
ALTER TABLE "AssetType"      RENAME COLUMN "laborType" TO "laborCode";
ALTER TABLE "Assembly"       RENAME COLUMN "laborType" TO "laborCode";
ALTER TABLE "CableCategory"  RENAME COLUMN "laborType" TO "laborCode";

-- 기준자료 판. 새 판을 올려도 이전 판은 남는다 — 지난 설계서를 그때 값으로 재현해야 한다.
CREATE TABLE "LaborStandard" (
    "id"         TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "effective"  TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "payload"    JSONB NOT NULL,
    "active"     BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaborStandard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LaborStandard_kind_active_idx" ON "LaborStandard"("kind", "active");
