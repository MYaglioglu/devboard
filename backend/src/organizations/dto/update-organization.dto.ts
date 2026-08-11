import { createOrganizationSchema } from './create-organization.dto';
import type { z } from 'zod';

/**
 * Eingabe fuer PATCH /organizations/:orgId.
 *
 * ============================================================================
 * WARUM PATCH UND NICHT PUT
 * ============================================================================
 *   PUT   ersetzt die Ressource VOLLSTAENDIG. Was im Koerper fehlt, gilt als
 *         geloescht. Wer nur den Namen aendern will, muesste alle uebrigen
 *         Felder mitschicken - und wer eines vergisst, loescht es.
 *   PATCH aendert TEILWEISE. Nur was dasteht, wird geaendert.
 *
 * Bei einem Formular, das ein einzelnes Feld aendert, ist PATCH das richtige
 * Verb. PUT waere hier nicht nur unbequem, sondern gefaehrlich.
 *
 * ============================================================================
 * WARUM DAS SCHEMA VOM ANLEGEN ABGELEITET IST
 * ============================================================================
 * Die Regeln fuer einen Namen sind dieselben, egal ob er neu vergeben oder
 * geaendert wird. Kopierte Validierung laeuft frueher oder spaeter
 * auseinander - und dann akzeptiert das Aendern etwas, das das Anlegen
 * ablehnt. Ein zweistelliges Minimum, das nur an einer von zwei Stellen
 * nachgezogen wird, ist genau die Art Luecke, die niemand sucht.
 *
 * `pick` waehlt aus dem bestehenden Schema aus. Kaeme spaeter ein Feld dazu,
 * das sich nur beim Anlegen setzen laesst, bliebe es hier automatisch aussen
 * vor.
 *
 * ============================================================================
 * WARUM `name` TROTZ PATCH PFLICHT IST
 * ============================================================================
 * PATCH heisst "teilweise", nicht "beliebig leer". Ein Aufruf mit `{}` waere
 * eine Aenderung, die nichts aendert - eine sinnlose Anfrage, die trotzdem
 * eine Datenbankrunde und einen neuen `updatedAt` kostet. Aktuell gibt es
 * genau ein aenderbares Feld; kaeme ein zweites dazu, wuerden beide optional
 * und eine Verfeinerung wuerde verlangen, dass mindestens eines gesetzt ist.
 */
export const updateOrganizationSchema = createOrganizationSchema.pick({
  name: true,
});

export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;
