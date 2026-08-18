-- 격자는 설비 종류마다 다른 값이 아니라 **상수 하나**다(`ASSEMBLY_GRID`, 10×20).
--
-- 화면은 이미 상수를 그리는데 서버는 이 컬럼으로 판정해서, 눈으로 놓은 자리가 저장할 때만
-- `배치할 수 없습니다: out-of-range` 로 튕겼다(OFD 는 4×6, 접지함체는 1×1 로 남아 있었다).
-- 읽는 곳이 없어진 컬럼을 남겨 두면 다음 사람이 그것을 규칙으로 읽는다.
ALTER TABLE "Assembly" DROP COLUMN "gridCols";
ALTER TABLE "Assembly" DROP COLUMN "gridRows";
