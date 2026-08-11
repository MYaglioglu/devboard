import { z } from 'zod';

import { Role } from '../../generated/prisma/enums';

/**
 * Eingabe fuer POST /organizations/:orgId/invitations.
 *
 * ============================================================================
 * WARUM OWNER HIER FEHLT
 * ============================================================================
 * Einladbar sind nur ADMIN und MEMBER. Die OWNER-Rolle entsteht ausschliesslich
 * durch Ernennen eines BESTEHENDEN Mitglieds (PATCH /members/:userId), und das
 * darf nur ein OWNER.
 *
 * Ohne diese Einschraenkung gaebe es einen Umweg: Ein OWNER koennte per
 * Einladung beliebig viele weitere OWNER erzeugen, ohne dass es in der
 * Mitgliederliste je sichtbar wuerde - und ein ADMIN, dem man das Einladen
 * erlaubt, koennte Rechte vergeben, die er selbst nicht hat.
 *
 * Merksatz aus Scheibe 2.4, hier in anderer Verkleidung: Wer Rechte vergeben
 * darf, hat sie. Eine Einladung IST eine Rechtevergabe.
 *
 * Das Enum wird bewusst nicht neu getippt, sondern aus dem generierten Wert
 * ausgewaehlt - `exclude` bleibt gueltig, wenn spaeter eine Rolle dazukommt,
 * eine handgeschriebene Liste nicht.
 */
export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    // Dieselbe Normalisierung wie bei der Registrierung. Ohne sie passte eine
    // Einladung an "Max@example.com" nicht zum Konto "max@example.com",
    // obwohl es dieselbe Adresse ist - der Vergleich beim Annehmen ist
    // zeichengenau.
    .toLowerCase()
    .pipe(z.email('Bitte eine gueltige E-Mail-Adresse angeben'))
    .pipe(z.string().max(255, 'E-Mail-Adresse ist zu lang')),

  role: z.enum([Role.ADMIN, Role.MEMBER], {
    message: 'Einladbar sind nur die Rollen ADMIN und MEMBER',
  }),
});

export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;

/**
 * Eingabe fuer POST /invitations/accept.
 *
 * Der Token steht im KOERPER, nicht im Pfad. Ein Pfad landet in Server-Logs,
 * im Browserverlauf und im Referer-Header der naechsten Anfrage - fuer ein
 * Geheimnis alles falsche Orte. Derselbe Grund, aus dem Passwoerter nicht in
 * die URL gehoeren.
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token fehlt').max(200, 'Token ist zu lang'),
});

export type AcceptInvitationDto = z.infer<typeof acceptInvitationSchema>;
