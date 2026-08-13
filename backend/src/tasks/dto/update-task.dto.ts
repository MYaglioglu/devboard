import { z } from 'zod';

/**
 * Eingabe fuer PATCH /organizations/:orgId/projects/:projectId/tasks/:taskId.
 *
 * ============================================================================
 * WAS HIER BEWUSST FEHLT: `status` UND `position`
 * ============================================================================
 * Beide bestimmen, WO die Karte auf dem Board liegt - und beide gehoeren
 * zusammen: Eine Spalte zu wechseln, ohne die Position innerhalb der neuen
 * Spalte zu bestimmen, ergibt keinen sinnvollen Zustand.
 *
 * Dafuer gibt es in Scheibe 3.4 einen eigenen Endpoint (`PATCH .../move`), der
 * beides in einem Schritt macht - mit optimistischem Sperren, weil genau dort
 * zwei Nutzer gleichzeitig zugreifen koennen.
 *
 * Waeren sie hier erlaubt, gaebe es ZWEI Wege, eine Karte zu verschieben: einen
 * mit Konfliktbehandlung und einen ohne. Der ohne wuerde irgendwann benutzt.
 *
 * Merksatz: Wenn zwei Felder nur gemeinsam einen gueltigen Zustand ergeben,
 * brauchen sie einen gemeinsamen Endpoint - nicht zwei einzelne.
 */
export const updateTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, 'Der Titel muss mindestens 2 Zeichen lang sein')
      .max(200, 'Der Titel darf höchstens 200 Zeichen lang sein')
      .optional(),

    // `nullable`, damit eine Beschreibung wieder entfernt werden kann -
    // fehlendes Feld heisst "unveraendert", ausdrueckliches null heisst
    // "loeschen". Siehe update-project.dto.ts.
    description: z
      .string()
      .trim()
      .max(5000, 'Die Beschreibung darf höchstens 5000 Zeichen lang sein')
      .nullable()
      .optional(),

    // `null` entfernt die Zuweisung. Ohne diese Moeglichkeit koennte eine
    // Aufgabe nie wieder herrenlos werden - und "niemand" ist ein voellig
    // normaler Zustand fuer eine Aufgabe.
    assigneeId: z.uuid('Ungültige Nutzer-ID').nullable().optional(),

    dueDate: z.coerce.date().nullable().optional(),
  })
  .refine((daten) => Object.keys(daten).length > 0, {
    message: 'Es muss mindestens ein Feld geändert werden',
  });

export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;
