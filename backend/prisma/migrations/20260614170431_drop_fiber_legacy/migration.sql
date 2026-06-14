/*
  Warnings:

  - You are about to drop the column `fiber_path_id` on the `cables` table. All the data in the column will be lost.
  - You are about to drop the column `fiber_port_number` on the `cables` table. All the data in the column will be lost.
  - You are about to drop the `fiber_cores` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `fiber_paths` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "cables" DROP CONSTRAINT "cables_fiber_path_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_cores" DROP CONSTRAINT "fiber_cores_created_by_fkey";

-- DropForeignKey
ALTER TABLE "fiber_cores" DROP CONSTRAINT "fiber_cores_fiber_path_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_cores" DROP CONSTRAINT "fiber_cores_updated_by_fkey";

-- DropForeignKey
ALTER TABLE "fiber_paths" DROP CONSTRAINT "fiber_paths_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_paths" DROP CONSTRAINT "fiber_paths_ofd_a_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_paths" DROP CONSTRAINT "fiber_paths_ofd_b_id_fkey";

-- DropForeignKey
ALTER TABLE "fiber_paths" DROP CONSTRAINT "fiber_paths_updated_by_id_fkey";

-- AlterTable
ALTER TABLE "cables" DROP COLUMN "fiber_path_id",
DROP COLUMN "fiber_port_number";

-- DropTable
DROP TABLE "fiber_cores";

-- DropTable
DROP TABLE "fiber_paths";
