-- AlterTable: Add new columns to material_categories
ALTER TABLE "material_categories" ADD COLUMN "display_color" VARCHAR(7);
ALTER TABLE "material_categories" ADD COLUMN "icon_name" VARCHAR(30);
ALTER TABLE "material_categories" ADD COLUMN "unit" VARCHAR(20);
ALTER TABLE "material_categories" ADD COLUMN "spec_template" JSONB;

-- CreateTable: material_aliases
CREATE TABLE "material_aliases" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "alias_name" VARCHAR(200) NOT NULL,
    "source" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_aliases_alias_name_key" ON "material_aliases"("alias_name");

-- AddForeignKey
ALTER TABLE "material_aliases" ADD CONSTRAINT "material_aliases_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
