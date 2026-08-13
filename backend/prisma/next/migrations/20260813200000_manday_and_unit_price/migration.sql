-- 품셈은 **시간이 아니라 인·일**이다. 일위대가가 「0.007 인/M × 444,142원/일」로 셈하므로,
-- 노임단가(원/일)와 곱해 돈이 되려면 품도 인·일이어야 한다. 값의 뜻이 바뀌는 이름이라
-- 컬럼도 함께 고친다(이름이 시간이라고 말하면 다음 사람이 시간을 적는다).
ALTER TABLE "AssetType"     RENAME COLUMN "installHours"  TO "installManDays";
ALTER TABLE "AssetType"     RENAME COLUMN "removeHours"   TO "removeManDays";
ALTER TABLE "AssetType"     RENAME COLUMN "relocateHours" TO "relocateManDays";
ALTER TABLE "Assembly"      RENAME COLUMN "installHours"  TO "installManDays";
ALTER TABLE "Assembly"      RENAME COLUMN "removeHours"   TO "removeManDays";
ALTER TABLE "Assembly"      RENAME COLUMN "relocateHours" TO "relocateManDays";
ALTER TABLE "CableCategory" RENAME COLUMN "installHoursPerM" TO "installManDaysPerM";
ALTER TABLE "CableCategory" RENAME COLUMN "removeHoursPerM"  TO "removeManDaysPerM";

-- 자재단가 — 설계서 재료비의 근거. 비워 두면 재료비 0(「안 적었다」와 「안 든다」를 굳이
-- 가르지 않는다: 자재비 없는 공종은 실제로 0 이다).
ALTER TABLE "AssetType"     ADD COLUMN "unitPrice" INTEGER;
ALTER TABLE "CableCategory" ADD COLUMN "unitPrice" INTEGER;
