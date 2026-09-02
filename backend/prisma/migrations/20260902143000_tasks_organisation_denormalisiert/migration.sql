-- ============================================================================
-- DER MANDANT WANDERT AUF `tasks`
-- ============================================================================
-- Warum, steht bei `Task.organizationId` in schema.prisma; die Messung, die
-- den Vorgaenger dieser Migration widerlegt hat, in 12_TESTING.md.
--
-- WICHTIG: `prisma migrate diff` erzeugt fuer diesen Schemastand ein
-- ALTER TABLE ... ADD COLUMN "organizationId" UUID NOT NULL in einem Schritt.
-- Das laeuft nur auf einer LEEREN Tabelle. Auf jeder Datenbank mit Bestand -
-- also auch auf der Produktion - schlaegt es fehl, weil die vorhandenen Zeilen
-- keinen Wert haetten. Die generierte Fassung ist deshalb hier von Hand in
-- drei Schritte zerlegt: hinzufuegen, fuellen, erst dann verpflichtend machen.
--
-- Das ist das Standardmuster fuer eine NOT-NULL-Spalte auf Bestandsdaten und
-- der haeufigste Weg, wie ein Deployment an einer Migration stirbt, die lokal
-- funktioniert hat.

-- 1. Spalte anlegen, zunaechst nullbar.
ALTER TABLE "tasks" ADD COLUMN "organizationId" UUID;

-- 2. Aus dem Projekt fuellen - dort war der Mandant bisher die einzige
--    Wahrheit, also ist er hier auch die Quelle.
UPDATE "tasks" t
   SET "organizationId" = p."organizationId"
  FROM "projects" p
 WHERE p."id" = t."projectId";

-- 3. Jetzt, wo jede Zeile einen Wert hat, verpflichtend machen.
ALTER TABLE "tasks" ALTER COLUMN "organizationId" SET NOT NULL;

-- Das Ziel des zusammengesetzten Fremdschluessels. `id` ist bereits
-- Primaerschluessel; dieses UNIQUE fuegt fachlich nichts hinzu, sondern
-- erfuellt nur die Anforderung von PostgreSQL, dass ein Fremdschluessel auf
-- eine als eindeutig deklarierte Spaltenkombination zeigen muss.
-- CreateIndex
CREATE UNIQUE INDEX "projects_id_organizationId_key" ON "projects"("id", "organizationId");

-- Der einspaltige Fremdschluessel weicht dem zusammengesetzten. Erst dieser
-- macht es UNMOEGLICH, eine Aufgabe mit einer Mandanten-ID zu speichern, die
-- nicht zu ihrem Projekt gehoert - statt sich darauf zu verlassen, dass jede
-- kuenftige Schreibstelle daran denkt.
-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_projectId_fkey";

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_projectId_organizationId_fkey" FOREIGN KEY ("projectId", "organizationId") REFERENCES "projects"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Der Index aus der vorigen Migration stand auf `dueDate` allein. Er wird
-- nicht korrigiert, sondern ersetzt - die Fehlentscheidung bleibt in der
-- Migrationshistorie sichtbar, so wie eine abgeloeste ADR stehen bleibt.
-- DropIndex
DROP INDEX "tasks_dueDate_idx";

-- CreateIndex
CREATE INDEX "tasks_organizationId_dueDate_idx" ON "tasks"("organizationId", "dueDate");
