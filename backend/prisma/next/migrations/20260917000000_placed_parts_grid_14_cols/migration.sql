-- **이미 놓인 설비의 부품**도 열넷 도화지를 채운다.
--
-- `20260915000000_assembly_grid_14_cols` 는 설비 **품목**(구성 항목)만 넓혔다. 그런데 도면에
-- 이미 놓인 설비는 놓던 순간의 자리를 **부품 자산마다 복사해** 들고 있어서 안 따라왔다 —
-- 강원 직할 12국의 OFD 판이 전부 열넷 중 열만 차지한 채로 남았다.
--
-- 규칙은 품목 쪽과 같다: 부모 설비 단위로, 오른쪽 끝이 옛 도화지 끝(10)에 닿아 있던 부품만
-- 넉 칸 늘린다. 그 설비 안에 10 을 넘는 부품이 하나라도 있으면 이미 새 도화지로 그려진
-- 것이므로(KepCIT, 또는 넓힌 뒤 현장이 오른쪽에 더 놓은 설비) 통째로 뺀다.
UPDATE "Asset" c
   SET "colSpan" = c."colSpan" + 4
 WHERE c."parentAssetId" IS NOT NULL
   AND c."col" IS NOT NULL
   AND c."col" + c."colSpan" = 10
   AND NOT EXISTS (
     SELECT 1 FROM "Asset" o
      WHERE o."parentAssetId" = c."parentAssetId"
        AND o."col" + o."colSpan" > 10
   );

-- 분전반 — 계통 셋이 옛 폭(3)으로 놓여 있으면 품목의 새 자리(0·5·10, 폭 4)를 따른다.
-- 현장이 폭을 고쳐 둔 것은 건드리지 않는다.
UPDATE "Asset" c
   SET "col" = i."col",
       "colSpan" = i."colSpan"
  FROM "AssemblyItem" i
  JOIN "Assembly" a ON a."id" = i."assemblyId"
 WHERE c."assemblyItemId" = i."id"
   AND a."key" = 'PWR-DIST-SET'
   AND c."colSpan" = 3
   AND i."colSpan" = 4;
