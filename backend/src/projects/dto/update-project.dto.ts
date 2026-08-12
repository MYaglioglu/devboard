import { z } from 'zod';

/**
 * Eingabe fuer PATCH /organizations/:orgId/projects/:projectId.
 *
 * ============================================================================
 * WARUM NICHT EINFACH createProjectSchema.partial()
 * ============================================================================
 * `.partial()` waere kuerzer und hier trotzdem falsch. Beim Anlegen ist
 * `description` nur OPTIONAL (darf fehlen), beim Aendern muss zusaetzlich
 * `null` erlaubt sein - sonst gaebe es keinen Weg, eine bereits gesetzte
 * Beschreibung wieder zu entfernen. Weglassen hiesse dann "nicht aendern" und
 * es gaebe keine Schreibweise fuer "loeschen".
 *
 * Die beiden Faelle bedeuten also GENAU DAS GEGENTEIL voneinander:
 *
 *     description fehlt   -> unveraendert lassen
 *     description = null  -> vorhandene Beschreibung entfernen
 *
 * Das ist der Unterschied zwischen `undefined` und `null`, den Prisma bei
 * einem Update ausdruecklich beachtet: `undefined` laesst die Spalte in Ruhe,
 * `null` schreibt NULL hinein. Genau deshalb geben wir das Feld unveraendert
 * an Prisma weiter, statt es vorher "aufzuraeumen".
 */
export const updateProjectSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Der Name muss mindestens 2 Zeichen lang sein')
      .max(100, 'Der Name darf höchstens 100 Zeichen lang sein')
      .optional(),

    description: z
      .string()
      .trim()
      .max(2000, 'Die Beschreibung darf höchstens 2000 Zeichen lang sein')
      .nullable()
      .optional(),
  })
  /**
   * Ohne diese Pruefung waere `{}` eine gueltige Eingabe: ein PATCH, der
   * nichts aendert, aber 200 antwortet. Der Client haelt das fuer einen
   * Erfolg, obwohl in Wahrheit seine Absicht verlorengegangen ist - etwa weil
   * er das Feld falsch benannt hat und es still verworfen wurde.
   *
   * Eine leere Aenderung ist fast immer ein Fehler beim Aufrufer. Ihn zu
   * melden ist hilfreicher, als ihn zu verschlucken.
   */
  .refine((daten) => Object.keys(daten).length > 0, {
    message: 'Es muss mindestens ein Feld geändert werden',
  });

export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
