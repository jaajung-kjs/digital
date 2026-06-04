-- CreateTable
CREATE TABLE "asset_types" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "group" VARCHAR(20),
    "is_container" BOOLEAN NOT NULL DEFAULT false,
    "field_template" JSONB,
    "required_to_create" JSONB,
    "icon_name" VARCHAR(30),
    "display_color" VARCHAR(7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "substation_id" TEXT NOT NULL,
    "asset_type_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parent_asset_id" TEXT,
    "room_text" VARCHAR(100),
    "floor_id" TEXT,
    "position_x" DOUBLE PRECISION,
    "position_y" DOUBLE PRECISION,
    "width_2d" DOUBLE PRECISION,
    "height_2d" DOUBLE PRECISION,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "slot_index" INTEGER,
    "slot_span" INTEGER,
    "total_u" INTEGER,
    "attributes" JSONB,
    "install_date" DATE,
    "manager" VARCHAR(100),
    "description" TEXT,
    "status" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_types_code_key" ON "asset_types"("code");

-- CreateIndex
CREATE INDEX "assets_substation_id_idx" ON "assets"("substation_id");

-- CreateIndex
CREATE INDEX "assets_parent_asset_id_idx" ON "assets"("parent_asset_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_substation_id_fkey" FOREIGN KEY ("substation_id") REFERENCES "substations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_id_fkey" FOREIGN KEY ("asset_type_id") REFERENCES "asset_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_parent_asset_id_fkey" FOREIGN KEY ("parent_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
