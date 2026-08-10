-- 「단종」(새 자산 만들 때 목록에서 숨김)을 걷는다.
--
-- 지울 수 없는 종류(그 종류로 만든 자산이 있으면 삭제가 거부된다)를 목록에서 감추는 길이었다.
-- 그런데 실제로 단종된 것이 하나도 없었고, 정작 불편한 것은 스무 개 넘는 목록을 스크롤로
-- 훑는 일이었다 — 목록에 **검색**을 넣으면 둘 다 해결된다.
ALTER TABLE "AssetType" DROP COLUMN "isActive";
ALTER TABLE "Assembly" DROP COLUMN "isActive";
