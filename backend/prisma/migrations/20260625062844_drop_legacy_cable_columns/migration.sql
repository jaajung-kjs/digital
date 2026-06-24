-- C5 Phase B: 레거시 케이블 컬럼/enum 드롭
-- CableCategory: code(@unique), description, display_color, display_group, icon_name, unit, spec_template
-- Cable: cable_type(NOT NULL enum), label, color
-- enum CableType

-- CableCategory 레거시 컬럼 드롭 (code 는 @unique → 인덱스 먼저 드롭)
DROP INDEX IF EXISTS "cable_categories_code_key";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "code";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "description";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "display_color";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "display_group";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "icon_name";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "unit";
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "spec_template";

-- Cable 레거시 컬럼 드롭
ALTER TABLE "cables" DROP COLUMN IF EXISTS "cable_type";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "label";
ALTER TABLE "cables" DROP COLUMN IF EXISTS "color";

-- CableType enum 드롭
DROP TYPE IF EXISTS "CableType";
