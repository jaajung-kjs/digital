-- Migration: P0 FK hardening
-- (a) sourcePresetId: add real FK from assets to rack_presets (ON DELETE SET NULL)
-- (b) asset_types.category_id: change ON DELETE SET NULL → RESTRICT
-- (c) cable_categories.group_id: change ON DELETE SET NULL → RESTRICT

-- (a) Add FK: assets.source_preset_id → rack_presets.id
ALTER TABLE "assets" ADD CONSTRAINT "assets_source_preset_id_fkey"
  FOREIGN KEY ("source_preset_id") REFERENCES "rack_presets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- (b) asset_types.category_id: DROP old SET NULL, ADD RESTRICT
ALTER TABLE "asset_types" DROP CONSTRAINT "asset_types_category_id_fkey";
ALTER TABLE "asset_types" ADD CONSTRAINT "asset_types_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "asset_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- (c) cable_categories.group_id: DROP old SET NULL, ADD RESTRICT
ALTER TABLE "cable_categories" DROP CONSTRAINT "cable_categories_group_id_fkey";
ALTER TABLE "cable_categories" ADD CONSTRAINT "cable_categories_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "cable_groups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
