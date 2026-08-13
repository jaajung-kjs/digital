-- 케이블 품셈을 **그룹 → 종류**로 내린다.
--
-- 자산 종류·설비 종류는 각자 품셈을 갖는데 케이블만 상위(그룹)가 갖고 있어 층이 어긋났다.
-- 실제로도 같은 광 안에서 OPGW 가공(외선)과 실내 점퍼 결선은 품이 다르다.

ALTER TABLE "CableCategory" ADD COLUMN "laborType" TEXT;
ALTER TABLE "CableCategory" ADD COLUMN "installManDaysPerM" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "CableCategory" ADD COLUMN "removeManDaysPerM" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- 1) 지금 값을 그대로 물려받는다 — 설계서 숫자가 조용히 바뀌지 않게.
UPDATE "CableCategory" c
   SET "laborType"        = g."laborType",
       "installManDaysPerM" = g."installManDaysPerM",
       "removeManDaysPerM"  = g."removeManDaysPerM"
  FROM "CableGroup" g
 WHERE g.id = c."groupId";

-- 2) 다심 광 3종은 합병 전 값(0.06/0.03)으로 되돌린다.
--    광 그룹과 OPGW 그룹을 하나로 합칠 때 남는 광 그룹의 값(0.04/0.02)을 쓰기로 했었는데,
--    그때 낮아진 것이 이것들이다. 이제 종류별로 적을 수 있으므로 제 값으로 돌린다.
--    현장에서 이미 고친 값은 건드리지 않는다(광 그룹 값과 같을 때만).
UPDATE "CableCategory" c
   SET "installManDaysPerM" = 0.06,
       "removeManDaysPerM"  = 0.03
  FROM "CableGroup" g
 WHERE g.id = c."groupId"
   AND g.key = 'fiber'
   AND c.name IN ('OPGW(광복합가공지선)', '광케이블', '브레이크아웃케이블')
   AND c."installManDaysPerM" = g."installManDaysPerM"
   AND c."removeManDaysPerM"  = g."removeManDaysPerM";

ALTER TABLE "CableGroup" DROP COLUMN "laborType";
ALTER TABLE "CableGroup" DROP COLUMN "installManDaysPerM";
ALTER TABLE "CableGroup" DROP COLUMN "removeManDaysPerM";
