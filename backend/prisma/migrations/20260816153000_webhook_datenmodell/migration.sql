-- CreateEnum
CREATE TYPE "webhook_delivery_status" AS ENUM ('ACCEPTED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "activity_source" AS ENUM ('APP', 'GITHUB');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "activity_type" ADD VALUE 'GITHUB_PUSH';
ALTER TYPE "activity_type" ADD VALUE 'GITHUB_PULL_REQUEST_OPENED';
ALTER TYPE "activity_type" ADD VALUE 'GITHUB_PULL_REQUEST_MERGED';
ALTER TYPE "activity_type" ADD VALUE 'GITHUB_PULL_REQUEST_CLOSED';

-- AlterTable
ALTER TABLE "activities" ADD COLUMN     "source" "activity_source" NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE "repository_connections" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "repositoryFullName" TEXT NOT NULL,
    "secretCiphertext" BYTEA NOT NULL,
    "secretIv" BYTEA NOT NULL,
    "secretAuthTag" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repository_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "webhook_delivery_status" NOT NULL DEFAULT 'ACCEPTED',
    "fehlermeldung" TEXT,
    "versuche" INTEGER NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "repository_connections_projectId_key" ON "repository_connections"("projectId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_receivedAt_idx" ON "webhook_deliveries"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_connectionId_deliveryId_key" ON "webhook_deliveries"("connectionId", "deliveryId");

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_connections" ADD CONSTRAINT "repository_connections_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "repository_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
