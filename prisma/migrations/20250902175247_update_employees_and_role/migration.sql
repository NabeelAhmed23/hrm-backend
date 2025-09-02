-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'HR';

-- AlterTable
ALTER TABLE "public"."Employee" ADD COLUMN     "deletedAt" TIMESTAMP(3);
