-- DropForeignKey
ALTER TABLE "floor_plan_elements" DROP CONSTRAINT "floor_plan_elements_floor_id_fkey";

-- DropForeignKey
ALTER TABLE "floor_plan_elements" DROP CONSTRAINT "floor_plan_elements_material_category_id_fkey";

-- DropForeignKey
ALTER TABLE "floor_plan_elements" DROP CONSTRAINT "floor_plan_elements_material_id_fkey";

-- DropTable
DROP TABLE "floor_plan_elements";

