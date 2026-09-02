-- Der Index fuer die Kalenderabfrage: Aufgaben eines Zeitraums nach
-- Faelligkeit. Begruendung (und warum er nur EINE Spalte hat, obwohl der
-- Mandant mitgefiltert wird) steht bei `Task` in schema.prisma.

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");
