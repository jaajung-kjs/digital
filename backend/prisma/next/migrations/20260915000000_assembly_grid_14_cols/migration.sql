-- 도화지가 열넷으로 넓어졌다 — **옛 도화지를 꽉 채우던 것은 새 도화지도 꽉 채운다.**
--
-- `ASSEMBLY_GRID` 가 10×20 에서 14×20 이 됐다(KepCIT 섀시의 한 줄이 열넷이라). 시드 코드는
-- 대부분 폭을 `ASSEMBLY_GRID.cols` 로 적어 두어 저절로 따라갔지만, **이미 돌고 있는 DB 는
-- 안 따라온다** — 시드는 「있는 키는 안 건드린다」이기 때문이다. 그대로 두면 OFD 슬롯도
-- 소내전원반도 열넷 중 열만 차지해, 오른쪽 넉 줄이 「뭘 더 놓을 수 있는 자리」처럼 보인다.
-- 그림이 거짓말을 한다.
--
-- 늘리는 것은 **오른쪽 끝이 옛 도화지 끝(10)에 닿아 있던 항목**뿐이다. 그것이 「한 줄 통째」의
-- 뜻이었다. 폭이 좁아 가운데에 놓였던 것은 뜻이 다르므로 그대로 둔다.
--
-- 단, 이미 새 도화지를 쓰는 설비(KepCIT)는 통째로 뺀다. 거기서 「col 9 + 폭 1」(`S.6`)은
-- 도화지 끝이 아니라 그냥 열째 슬롯이다 — 설비 하나라도 10 을 넘는 항목이 있으면 그 설비는
-- 새 도화지로 그려진 것이므로 손대지 않는다.
UPDATE "AssemblyItem" i
   SET "colSpan" = i."colSpan" + 4
 WHERE i."col" + i."colSpan" = 10
   AND NOT EXISTS (
     SELECT 1 FROM "AssemblyItem" o
      WHERE o."assemblyId" = i."assemblyId"
        AND o."col" + o."colSpan" > 10
   );

-- 분전반은 꽉 채운 적이 없다 — 계통 셋이 3칸씩(0·3·6), 오른쪽 한 칸이 남았다. 넓어진 만큼
-- 고르게 펴서 새 시드와 같은 자리에 둔다(0·5·10, 폭 4). 사이 빈 칸은 실물의 칸막이다.
-- 손으로 고쳐 둔 분전반은 건드리지 않는다 — 옛 폭(3) 그대로인 것만.
UPDATE "AssemblyItem" i
   SET "col" = CASE i."name" WHEN '상용전원' THEN 0 WHEN 'UPS 전원' THEN 5 ELSE 10 END,
       "colSpan" = 4
  FROM "Assembly" a
 WHERE a."id" = i."assemblyId"
   AND a."key" = 'PWR-DIST-SET'
   AND i."name" IN ('상용전원', 'UPS 전원', '직류전원')
   AND i."colSpan" = 3;
