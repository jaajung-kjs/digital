-- 케이블 변전소 스코프 컬럼 제거(데드 컬럼) — 스코핑은 끝점 자산(substationId)으로 한다.
ALTER TABLE "cables" DROP COLUMN "substation_id";
