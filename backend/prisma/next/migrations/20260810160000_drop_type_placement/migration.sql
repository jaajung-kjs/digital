-- 도면에 놓이는 것은 **설비 하나뿐**이 됐다.
--
-- 예전에는 자산 종류에 「평면도에 배치 가능」 딱지를 달아 단품(접지함체·공조설비)도 따로
-- 놓았다. 그러면 놓는 길이 둘로 갈리고, 현황의 「종류」 열이 때로는 자산 종류·때로는 설비
-- 종류를 가리켰다. 단품도 1칸짜리 설비 종류로 만들어 놓는다.
--
-- 기본 W/H 는 저장·편집만 되고 **읽는 곳이 한 군데도 없었다** — 도면 배치는 드래그한
-- 사각형을 쓴다.
ALTER TABLE "AssetType" DROP COLUMN "placeable";
ALTER TABLE "AssetType" DROP COLUMN "defaultWidth";
ALTER TABLE "AssetType" DROP COLUMN "defaultHeight";
