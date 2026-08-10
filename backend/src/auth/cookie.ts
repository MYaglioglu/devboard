import type { CookieOptions } from 'express';

/** Name des Cookies mit dem Refresh-Token. */
export const REFRESH_COOKIE = 'devboard_refresh';

/**
 * Einstellungen des Refresh-Cookies.
 *
 * ============================================================================
 * httpOnly
 * ============================================================================
 * JavaScript kommt an dieses Cookie NICHT heran - `document.cookie` zeigt es
 * nicht an. Das ist der eigentliche Grund fuer diese Bauweise: Selbst wenn ein
 * Angreifer per XSS Code einschleust, kann er den Refresh-Token nicht
 * auslesen. Laege er in `localStorage`, waere er sofort weg.
 *
 * ============================================================================
 * sameSite: 'lax'
 * ============================================================================
 * Cookies werden vom Browser AUTOMATISCH mitgeschickt - auch bei Anfragen, die
 * eine fremde Seite ausgeloest hat. Genau das ist CSRF.
 *
 * `lax` bedeutet: Von fremden Seiten aus wird das Cookie nur bei normaler
 * Navigation mitgeschickt, nicht bei POST-Anfragen aus dem Hintergrund. Da
 * unser Refresh-Endpoint ein POST ist, ist er damit geschuetzt.
 *
 * `strict` waere strenger, wuerde aber auch beim Klick auf einen Link von
 * aussen kein Cookie senden - bei geteilten Links unpraktisch.
 *
 * ============================================================================
 * secure
 * ============================================================================
 * Nur ueber HTTPS senden. Lokal aus, sonst funktionierte nichts; in Produktion
 * zwingend, sonst laege der Token bei jeder Anfrage im Klartext im Netz.
 *
 * ============================================================================
 * path: '/auth'
 * ============================================================================
 * Das Cookie wird nur an die Endpoints geschickt, die es brauchen (Erneuern,
 * Abmelden). Jede andere Anfrage traegt es gar nicht erst mit sich - weniger
 * Gelegenheiten, es zu verlieren (Logs, Proxys, Weiterleitungen).
 *
 * BEWUSST NICHT VERWENDET: das Praefix `__Host-`. Ein so benanntes Cookie wird
 * vom Browser nur angenommen, wenn es `Secure` gesetzt hat, KEINE `Domain`
 * angibt und `Path=/` verwendet - dann kann keine Unterdomain es
 * ueberschreiben (Cookie Tossing). Die Bedingung `Path=/` widerspricht aber
 * der Pfadbegrenzung oben. Wir haben uns fuer den engeren Pfad entschieden,
 * weil DevBoard keine Unterdomains fremder Herkunft hat. Kaeme das dazu, waere
 * die Abwaegung neu zu treffen.
 */
export function refreshCookieOptions(
  produktion: boolean,
  ablauf: Date,
): CookieOptions {
  return {
    httpOnly: true,
    secure: produktion,
    sameSite: 'lax',
    path: '/auth',
    expires: ablauf,
  };
}
