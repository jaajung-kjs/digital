-- S5: Drop legacy columns from AssetType, CableGroup.kind, and isActive from all models
-- AssetType: drop code(@unique), isContainer, defaultSlotSpan, requiredToCreate, iconName, displayColor, fieldTemplate, isActive
DROP INDEX IF EXISTS "asset_types_code_key";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "code";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "is_container";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "default_slot_span";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "required_to_create";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "icon_name";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "display_color";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "field_template";
ALTER TABLE "asset_types" DROP COLUMN IF EXISTS "is_active";

-- CableGroup: drop kind(@unique), isActive
DROP INDEX IF EXISTS "cable_groups_kind_key";
ALTER TABLE "cable_groups" DROP COLUMN IF EXISTS "kind";
ALTER TABLE "cable_groups" DROP COLUMN IF EXISTS "is_active";

-- User: drop isActive
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_active";

-- Headquarters: drop isActive
ALTER TABLE "headquarters" DROP COLUMN IF EXISTS "is_active";

-- Branch: drop isActive
ALTER TABLE "branches" DROP COLUMN IF EXISTS "is_active";

-- Substation: drop isActive
ALTER TABLE "substations" DROP COLUMN IF EXISTS "is_active";

-- Floor: drop isActive
ALTER TABLE "floors" DROP COLUMN IF EXISTS "is_active";

-- RackPreset: drop isActive
ALTER TABLE "rack_presets" DROP COLUMN IF EXISTS "is_active";

-- CableCategory: drop isActive
ALTER TABLE "cable_categories" DROP COLUMN IF EXISTS "is_active";

-- AssetCategory: drop isActive
ALTER TABLE "asset_categories" DROP COLUMN IF EXISTS "is_active";
