-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "replace_due" DATE,
ADD COLUMN     "warranty_until" DATE;

-- CreateIndex
CREATE INDEX "assets_warranty_until_idx" ON "assets"("warranty_until");

-- CreateIndex
CREATE INDEX "assets_replace_due_idx" ON "assets"("replace_due");
