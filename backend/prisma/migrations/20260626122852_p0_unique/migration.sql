-- AlterTable: asset_types — name unique
CREATE UNIQUE INDEX "asset_types_name_key" ON "asset_types"("name");

-- AlterTable: cable_categories — (name, group_id) composite unique
CREATE UNIQUE INDEX "cable_categories_name_group_id_key" ON "cable_categories"("name", "group_id");

-- AlterTable: headquarters — name unique
CREATE UNIQUE INDEX "headquarters_name_key" ON "headquarters"("name");

-- AlterTable: substations — name unique
CREATE UNIQUE INDEX "substations_name_key" ON "substations"("name");
