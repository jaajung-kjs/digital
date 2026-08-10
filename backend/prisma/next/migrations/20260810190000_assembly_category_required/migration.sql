-- 설비 종류의 분류를 **필수**로 — 자산 종류와 같은 체계이므로 필수도 같아야 한다.
--
-- 둘 다 `AssetCategory`(구조·통신·전원·공조)를 가리키는데 한쪽만 선택이라, 설비 종류에만
-- 「분류 없음」 묶음이 생길 수 있었다. 같은 체계를 쓴다면 화면도 같아야 한다.
--
-- 비어 있는 것은 첫 분류로 잇는다(시드는 전부 분류를 갖고 있으므로 보통 0건이다).
UPDATE "Assembly" SET "categoryId" = (SELECT id FROM "AssetCategory" ORDER BY "sortOrder" LIMIT 1)
WHERE "categoryId" IS NULL;
ALTER TABLE "Assembly" ALTER COLUMN "categoryId" SET NOT NULL;
