-- 공량·단가를 **한 모양으로** 맞춘다.
--
-- 그전에는 셋이 각자 스키마였다: 케이블에만 이설이 없고, 설비에만 자재단가가 없고,
-- 케이블 필드만 이름에 단위가 박혀 있었다(installManDays). 이름이 다르면 공용 폼도
-- 공용 계산도 만들 수 없어서 세 곳에 손으로 적게 되고, 하나만 고쳐지는 것이 시간 문제다.

-- 케이블: 이름에서 단위를 걷어낸다(단위는 담체가 정한다) + 이설 칸
ALTER TABLE "CableCategory" RENAME COLUMN "installManDays" TO "installManDays";
ALTER TABLE "CableCategory" RENAME COLUMN "removeManDays"  TO "removeManDays";
ALTER TABLE "CableCategory" ADD COLUMN "relocateManDays" DOUBLE PRECISION;

-- 설비: 1식 자재단가
ALTER TABLE "Assembly" ADD COLUMN "unitPrice" INTEGER;

-- 전부 nullable 로 — 뜻을 하나로 맞춘다.
--   null = 「안 적었다」(안에 든 것을 합쳐 센다, 없으면 0)
--   0    = 「품이 안 든다」
-- 기본값 0 은 그 둘을 뭉갠다. 이미 들어 있는 0 은 그대로 두되(현장이 적은 값일 수 있다)
-- 앞으로 만들어지는 행은 비어 있게 한다.
ALTER TABLE "AssetType"     ALTER COLUMN "installManDays"  DROP NOT NULL, ALTER COLUMN "installManDays"  DROP DEFAULT;
ALTER TABLE "AssetType"     ALTER COLUMN "removeManDays"   DROP NOT NULL, ALTER COLUMN "removeManDays"   DROP DEFAULT;
ALTER TABLE "AssetType"     ALTER COLUMN "relocateManDays" DROP NOT NULL, ALTER COLUMN "relocateManDays" DROP DEFAULT;
ALTER TABLE "CableCategory" ALTER COLUMN "installManDays"  DROP NOT NULL, ALTER COLUMN "installManDays"  DROP DEFAULT;
ALTER TABLE "CableCategory" ALTER COLUMN "removeManDays"   DROP NOT NULL, ALTER COLUMN "removeManDays"   DROP DEFAULT;
