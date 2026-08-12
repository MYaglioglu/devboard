import { z } from 'zod';

/**
 * Eingabe fuer POST /organizations/:orgId/projects.
 *
 * ============================================================================
 * WARUM HIER KEINE organizationId STEHT
 * ============================================================================
 * Die Organisation kommt aus dem PFAD, nicht aus dem Koerper - und zwar aus
 * dem Pfad, den der MitgliedschaftsGuard bereits geprueft hat.
 *
 * Stuende sie im Koerper, gaebe es zwei Angaben, die sich widersprechen
 * koennen: der Pfad, gegen den geprueft wurde, und der Koerper, aus dem
 * geschrieben wird. Wer dann versehentlich den Koerper nimmt, hat den
 * Mandantenschutz umgangen, ohne eine Zeile Sicherheitscode anzufassen.
 *
 * Merksatz: Was der Guard geprueft hat, darf der Client nicht noch einmal
 * mitschicken.
 */
export const createProjectSchema = z.object({
  // Dieselbe Reihenfolge wie beim Organisationsnamen: erst `trim()`, dann
  // `min()`. Andersherum kaeme "  " durch die Pruefung und landete als leerer
  // Name in der Datenbank.
  name: z
    .string()
    .trim()
    .min(2, 'Der Name muss mindestens 2 Zeichen lang sein')
    .max(100, 'Der Name darf höchstens 100 Zeichen lang sein'),

  /**
   * Die Beschreibung ist optional.
   *
   * `.optional()` heisst: Das Feld darf FEHLEN. Nicht zu verwechseln mit
   * `.nullable()` - das hiesse, es darf ausdruecklich `null` sein. Beim
   * Anlegen ist Weglassen der natuerliche Fall, deshalb hier nur `optional`.
   * Beim Aendern (update-project.dto.ts) ist es umgekehrt: Dort muss `null`
   * erlaubt sein, weil man eine vorhandene Beschreibung wieder entfernen darf.
   *
   * 2000 Zeichen, weil `text` in PostgreSQL sonst ein Gigabyte annimmt - siehe
   * dieselbe Begruendung beim Organisationsnamen.
   */
  description: z
    .string()
    .trim()
    .max(2000, 'Die Beschreibung darf höchstens 2000 Zeichen lang sein')
    .optional(),
});

/** Abgeleitet statt danebengepflegt - Schema und Typ koennen nicht auseinanderlaufen. */
export type CreateProjectDto = z.infer<typeof createProjectSchema>;
