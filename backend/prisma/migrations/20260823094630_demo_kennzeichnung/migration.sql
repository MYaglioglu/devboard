-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;
