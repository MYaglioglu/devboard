-- CreateEnum
CREATE TYPE "activity_type" AS ENUM ('PROJECT_CREATED', 'PROJECT_UPDATED', 'PROJECT_ARCHIVED', 'TASK_CREATED', 'TASK_UPDATED', 'TASK_MOVED', 'TASK_DELETED');

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "activity_type" NOT NULL,
    "actorId" UUID,
    "projectId" UUID,
    "taskId" UUID,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_organizationId_createdAt_id_idx" ON "activities"("organizationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "activities_projectId_createdAt_id_idx" ON "activities"("projectId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
