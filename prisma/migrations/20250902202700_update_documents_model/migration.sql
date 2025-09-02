/*
  Warnings:

  - You are about to drop the column `filePath` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `fileType` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `uploadedAt` on the `Document` table. All the data in the column will be lost.
  - Added the required column `fileName` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileUrl` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `mimeType` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Document` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."DocumentType" AS ENUM ('CONTRACT', 'LICENSE', 'CERTIFICATION', 'POLICY', 'OTHER');

-- DropForeignKey
ALTER TABLE "public"."Document" DROP CONSTRAINT "Document_organizationId_fkey";

-- AlterTable
ALTER TABLE "public"."Document" DROP COLUMN "filePath",
DROP COLUMN "fileType",
DROP COLUMN "name",
DROP COLUMN "uploadedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileUrl" TEXT NOT NULL,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "type" "public"."DocumentType" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "public"."Document"("organizationId");

-- CreateIndex
CREATE INDEX "Document_employeeId_idx" ON "public"."Document"("employeeId");

-- CreateIndex
CREATE INDEX "Document_uploadedById_idx" ON "public"."Document"("uploadedById");

-- CreateIndex
CREATE INDEX "Document_type_idx" ON "public"."Document"("type");

-- CreateIndex
CREATE INDEX "Document_expiresAt_idx" ON "public"."Document"("expiresAt");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "public"."Document"("createdAt");

-- CreateIndex
CREATE INDEX "Document_deletedAt_idx" ON "public"."Document"("deletedAt");

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
