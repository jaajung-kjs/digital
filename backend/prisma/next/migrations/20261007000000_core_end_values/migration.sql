-- 코어 용도·비고를 끝별(A·B)로 — 기존 값은 A 끝으로 옮긴다(상태·주/예비는 공유 그대로).
ALTER TABLE "Core" RENAME COLUMN "purpose" TO "aPurpose";
ALTER TABLE "Core" RENAME COLUMN "note" TO "aNote";
ALTER TABLE "Core" ADD COLUMN "bPurpose" TEXT;
ALTER TABLE "Core" ADD COLUMN "bNote" TEXT;
