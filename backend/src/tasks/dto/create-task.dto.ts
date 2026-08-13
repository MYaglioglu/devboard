import { z } from 'zod';

import { TaskStatus } from '../../generated/prisma/enums';

/**
 * Eingabe fuer POST /organizations/:orgId/projects/:projectId/tasks.
 *
 * Wie bei den Projekten stehen weder `organizationId` noch `projectId` im
 * Koerper - beide kommen aus dem Pfad, und der Pfad ist geprueft.
 */
export const createTaskSchema = z.object({
  // Erst `trim()`, dann `min()` - sonst kaeme "  " durch und landete als
  // leerer Titel in der Datenbank.
  title: z
    .string()
    .trim()
    .min(2, 'Der Titel muss mindestens 2 Zeichen lang sein')
    .max(200, 'Der Titel darf höchstens 200 Zeichen lang sein'),

  description: z
    .string()
    .trim()
    .max(5000, 'Die Beschreibung darf höchstens 5000 Zeichen lang sein')
    .optional(),

  /**
   * Die Spalte, in der die Karte entstehen soll.
   *
   * `z.enum` bekommt hier das PRISMA-Enum, keine eigene Werteliste. Eine
   * abgeschriebene Liste waere eine zweite Wahrheit: Kommt spaeter ein Status
   * dazu, muesste man an zwei Stellen daran denken - und die vergessene
   * Stelle faellt erst zur Laufzeit auf.
   *
   * Voreinstellung `TODO`: Eine neue Aufgabe ist noch nicht begonnen. Wer sie
   * gleich in einer anderen Spalte anlegen will, sagt es ausdruecklich.
   */
  status: z.enum(TaskStatus).default(TaskStatus.TODO),

  /**
   * Die NUTZER-ID des Zustaendigen - nicht die ID seiner Mitgliedschaft.
   *
   * ==========================================================================
   * WARUM DIE API NACH DER NUTZER-ID FRAGT, OBWOHL DIE SPALTE AUF DIE
   * MITGLIEDSCHAFT ZEIGT
   * ==========================================================================
   * Das Frontend kennt aus `GET /organizations/:orgId/members` Nutzer-IDs.
   * Muesste es Mitgliedschafts-IDs mitschicken, waere die interne Struktur
   * unserer Tabellen Teil der oeffentlichen Schnittstelle - und ein spaeterer
   * Umbau (etwa die Ablösung der Mitgliedschaft durch etwas anderes) waere
   * eine brechende Aenderung fuer jeden Client.
   *
   * Der Service uebersetzt: Er sucht die Mitgliedschaft dieses Nutzers IN
   * DIESER Organisation. Findet er keine, ist der Nutzer kein Mitglied - und
   * die Zuweisung wird abgelehnt. Die Regel "nur an Mitglieder derselben
   * Organisation" ergibt sich damit aus dem Datenmodell statt aus einer
   * zusaetzlichen Pruefung, die man vergessen kann.
   */
  assigneeId: z.uuid('Ungültige Nutzer-ID').optional(),

  /**
   * `z.coerce.date()` nimmt den ISO-String aus dem JSON entgegen und macht
   * daraus ein `Date`. JSON kennt keinen Datumstyp - ohne Umwandlung kaeme
   * eine Zeichenkette bei Prisma an, und der Fehler faellt erst in der
   * Datenbankschicht auf.
   *
   * Ungueltige Angaben wie "2026-13-45" ergeben ein ungueltiges Datum und
   * werden von Zod abgewiesen - also 400 statt 500.
   */
  dueDate: z.coerce.date().optional(),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
