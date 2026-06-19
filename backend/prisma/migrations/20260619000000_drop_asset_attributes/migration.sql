-- 자산 자유형 메타(attributes) 영구 제거. sourcePresetId(전용 컬럼)로 대체 완료(#7).
ALTER TABLE "assets" DROP COLUMN "attributes";
