-- CreateTable
CREATE TABLE "AssemblyLink" (
    "id" TEXT NOT NULL,
    "assemblyId" TEXT NOT NULL,
    "aItemId" TEXT NOT NULL,
    "aGroup" TEXT NOT NULL,
    "aIndex" INTEGER NOT NULL,
    "bItemId" TEXT NOT NULL,
    "bGroup" TEXT NOT NULL,
    "bIndex" INTEGER NOT NULL,
    "categoryId" TEXT,
    "specParams" JSONB NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssemblyLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssemblyLink_assemblyId_idx" ON "AssemblyLink"("assemblyId");

-- AddForeignKey
ALTER TABLE "AssemblyLink" ADD CONSTRAINT "AssemblyLink_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLink" ADD CONSTRAINT "AssemblyLink_aItemId_fkey" FOREIGN KEY ("aItemId") REFERENCES "AssemblyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLink" ADD CONSTRAINT "AssemblyLink_bItemId_fkey" FOREIGN KEY ("bItemId") REFERENCES "AssemblyItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssemblyLink" ADD CONSTRAINT "AssemblyLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CableCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
