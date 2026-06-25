/*
  Warnings:

  - You are about to drop the column `replace_due` on the `assets` table. All the data in the column will be lost.
  - You are about to drop the column `warranty_until` on the `assets` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "assets_replace_due_idx";

-- DropIndex
DROP INDEX "assets_warranty_until_idx";

-- AlterTable
ALTER TABLE "assets" DROP COLUMN "replace_due",
DROP COLUMN "warranty_until";
