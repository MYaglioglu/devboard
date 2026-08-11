import { z } from 'zod';

import { Role } from '../../generated/prisma/enums';

/**
 * Eingabe fuer PATCH /organizations/:orgId/members/:userId.
 *
 * ============================================================================
 * WARUM DIE ROLLE AUS DEM ENUM ABGELEITET WIRD
 * ============================================================================
 * `z.enum(['OWNER', 'ADMIN', 'MEMBER'])` waere eine handgeschriebene Kopie der
 * Wahrheit aus dem Prisma-Schema. Kaeme spaeter eine Rolle dazu, wuerde die
 * Datenbank sie kennen und diese Validierung nicht - der Endpoint lehnte einen
 * gueltigen Wert mit 400 ab, und niemand wuesste warum.
 *
 * `z.enum(Role)` liest die Werte aus dem generierten Objekt. Eine Quelle statt
 * zwei.
 *
 * ============================================================================
 * DIE FRAGE, DIE HIER NICHT BEANTWORTET WIRD
 * ============================================================================
 * Ob der Anfragende diese Rolle vergeben DARF, steht nicht hier. Ein
 * Zod-Schema prueft die FORM der Eingabe, nicht die Berechtigung - es kennt
 * weder den Anfragenden noch den aktuellen Zustand der Organisation.
 *
 * "Nur OWNER darf Rollen aendern" steht am Controller (@Rollen), "der letzte
 * OWNER darf nicht herabgestuft werden" im Service. Drei Schichten, drei
 * verschiedene Fragen - und jede an der Stelle, an der sie beantwortbar ist.
 */
export const updateMemberRoleSchema = z.object({
  role: z.enum(Role),
});

export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
