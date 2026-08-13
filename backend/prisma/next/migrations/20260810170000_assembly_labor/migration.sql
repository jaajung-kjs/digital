-- 「1식」 공량 — 설비를 **통째로** 놓거나 걷을 때의 품.
--
-- 예전에는 공량이 자산 종류에만 있어서, 송광치 한 대를 1식으로 설치해도 설계서에는 안에 든
-- 부품 공량의 합만 올라왔다. 실제 견적은 1식 단위로 잡는다.
--
-- 부품 하나만 걷어낼 때(완성된 1식에서 L3 스위치만 철거)는 그 부품의 공량을 쓴다 —
-- 어느 쪽인지는 **변경 집합**이 말한다(뿌리 설비가 같이 왔는가).
--
-- null = 안 적었다(부품 합으로 센다), 0 = 품이 안 든다. 둘을 구별해야 하므로 nullable.
ALTER TABLE "Assembly" ADD COLUMN "laborType" TEXT;
ALTER TABLE "Assembly" ADD COLUMN "installManDays" DOUBLE PRECISION;
ALTER TABLE "Assembly" ADD COLUMN "removeManDays" DOUBLE PRECISION;
ALTER TABLE "Assembly" ADD COLUMN "relocateManDays" DOUBLE PRECISION;
