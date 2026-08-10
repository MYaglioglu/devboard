import { SetMetadata } from '@nestjs/common';

export const IST_OEFFENTLICH = 'istOeffentlich';

/**
 * Markiert einen Endpoint als oeffentlich - er braucht keinen Access-Token.
 *
 * ============================================================================
 * WARUM DIESER WEG HERUM?
 * ============================================================================
 * Es gibt zwei Moeglichkeiten, Endpoints zu schuetzen:
 *
 *   a) Guard pro Route setzen (@UseGuards) - jeder ungeschuetzte Endpoint ist
 *      standardmaessig OFFEN.
 *   b) Guard global setzen und einzelne Endpoints ausdruecklich freigeben -
 *      jeder neue Endpoint ist standardmaessig GESCHUETZT.
 *
 * Wir nehmen (b). Der Unterschied zeigt sich beim FEHLER: Vergisst man bei (a)
 * den Guard, ist ein Endpoint versehentlich oeffentlich - und niemand merkt
 * es, weil alles funktioniert. Vergisst man bei (b) das @Oeffentlich(),
 * antwortet der Endpoint mit 401 - der Fehler faellt sofort auf.
 *
 * Das Prinzip heisst SECURE BY DEFAULT oder FAIL CLOSED: Ein Versehen muss zur
 * sicheren Seite hin ausschlagen. Vergessene Guards sind eine der haeufigsten
 * Ursachen echter Datenlecks.
 */
export const Oeffentlich = () => SetMetadata(IST_OEFFENTLICH, true);
