import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * ============================================================================
 * DIE SIGNATURPRUEFUNG - REINE RECHNUNG, OHNE NEST UND OHNE DB
 * ============================================================================
 * Dieselbe Trennung wie bei `krypto.ts`: Hier lassen sich die Faelle pruefen,
 * die im E2E teuer waeren - fehlender Kopf, falsches Verfahren, richtige
 * Laenge mit falschem Inhalt, veraenderter Rumpf um ein einziges Byte.
 *
 * ============================================================================
 * WAS EINE SIGNATUR HIER BEWEIST - UND WAS NICHT
 * ============================================================================
 * Sie beweist: Der Absender kennt das Geheimnis, und der Rumpf ist auf dem Weg
 * nicht veraendert worden.
 *
 * Sie beweist NICHT, WER der Absender ist. Ein HMAC ist ein SYMMETRISCHES
 * Verfahren - beide Seiten haben denselben Schluessel, also kann jede Seite
 * erzeugen, was die andere erzeugen koennte. Fuer "nur GitHub kann das
 * geschickt haben" braeuchte es eine digitale Signatur mit getrennten
 * Schluesseln.
 *
 * Praktisch genuegt das hier: Das Geheimnis kennen nur wir und GitHub. Aber
 * der Unterschied gehoert benannt, weil "signiert" umgangssprachlich nach
 * Urheberschaft klingt und es hier keine ist.
 */

/** GitHub schickt `sha256=<64 Hex-Zeichen>` in `X-Hub-Signature-256`. */
const PRAEFIX = 'sha256=';

/**
 * Prueft die Signatur eines Webhook-Aufrufs.
 *
 * @param rohrumpf Die EMPFANGENEN BYTES, nicht ein neu serialisiertes Objekt.
 * @param kopfwert Inhalt von `X-Hub-Signature-256`, oder `undefined`.
 * @param geheimnis Das Geheimnis dieser Verbindung, im Klartext.
 *
 * ============================================================================
 * WARUM DER ROHRUMPF UND NICHT DAS GEPARSTE OBJEKT
 * ============================================================================
 * Das ist die Falle dieser Scheibe, und sie ist tueckisch, weil alles andere
 * funktioniert. NestJS parst den Rumpf zu JSON, bevor der Controller ihn
 * sieht - die urspruenglichen Bytes sind danach weg.
 *
 * Wer die Signatur ueber `JSON.stringify(body)` nachrechnet, bekommt NIE
 * dasselbe Ergebnis:
 *
 *   - Die REIHENFOLGE der Schluessel muss nicht erhalten bleiben.
 *   - LEERZEICHEN und Zeilenumbrueche sind weg.
 *   - Unicode wird anders GESCHRIEBEN: GitHub schickt "ü" als Zeichen,
 *     `JSON.stringify` liesse es stehen - aber schon ein Server dazwischen,
 *     der "ü" schreibt, ergibt andere Bytes bei gleicher Bedeutung.
 *
 * Ein HMAC ist eine Aussage ueber BYTES, nicht ueber Bedeutung. Deshalb muss
 * der unveraenderte Rumpf bis hierher durchgereicht werden.
 */
export function pruefeSignatur(
  rohrumpf: Buffer,
  kopfwert: string | undefined,
  geheimnis: string,
): boolean {
  // Ein fehlender Kopf ist kein Sonderfall, sondern der haeufigste Angriff:
  // jemand ruft die URL einfach auf. Deshalb hier und nicht im Controller -
  // wer die Funktion benutzt, kann den Fall nicht vergessen.
  if (!kopfwert || !kopfwert.startsWith(PRAEFIX)) {
    return false;
  }

  const erwartet = createHmac('sha256', geheimnis)
    .update(rohrumpf)
    .digest('hex');

  const geliefert = kopfwert.slice(PRAEFIX.length);

  /**
   * ==========================================================================
   * WARUM `timingSafeEqual` UND NICHT `===`
   * ==========================================================================
   * Ein normaler Zeichenkettenvergleich bricht beim ERSTEN Unterschied ab. Wie
   * lange er braucht, verraet damit, wie viele Zeichen am Anfang gestimmt
   * haben. Wer denselben Rumpf millionenfach mit variierender Signatur
   * schickt und die Antwortzeiten misst, kann die richtige Signatur Zeichen
   * fuer Zeichen erraten - statt 2^256 Versuche braucht es dann einige
   * Tausend.
   *
   * `timingSafeEqual` vergleicht immer alle Bytes und braucht dafuer immer
   * gleich lang. Dasselbe Verfahren wie beim Passwortvergleich in Sprint 1,
   * nur dort von argon2 uebernommen.
   *
   * Ehrlich dazu: Ueber ein Netzwerk ist so ein Angriff schwer, weil die
   * Laufzeitschwankungen groesser sind als der gemessene Unterschied. "Schwer"
   * ist aber kein Sicherheitsargument, und der zeitkonstante Vergleich kostet
   * nichts.
   *
   * Die LAENGE wird vorher geprueft, weil `timingSafeEqual` bei
   * unterschiedlich langen Puffern WIRFT. Das ist kein Leck: Die erwartete
   * Laenge ist mit SHA-256 ohnehin bekannt und oeffentlich.
   */
  const a = Buffer.from(erwartet, 'hex');
  const b = Buffer.from(geliefert, 'hex');

  // `Buffer.from(..., 'hex')` bricht bei ungueltigen Zeichen still ab, statt
  // zu werfen. Ohne diesen Vergleich waeren "sha256=zz…" und ein leerer Puffer
  // gleich lang wie... nichts - und der Vergleich liefe ins Leere.
  if (a.length !== b.length || b.length === 0) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Erzeugt eine Signatur - fuer Tests und fuer die Dokumentation.
 *
 * Steht bewusst NEBEN der Pruefung und nicht in der Testdatei: Ein Test, der
 * die Signatur mit seiner eigenen Rechnung erzeugt, prueft am Ende nur, dass
 * zwei Kopien derselben Formel uebereinstimmen. Hier ist wenigstens sichtbar,
 * dass beide Seiten dieselbe Funktion benutzen - und der Aufruf zeigt genau
 * die Form, die GitHub schickt.
 */
export function erzeugeSignatur(rohrumpf: Buffer, geheimnis: string): string {
  return `${PRAEFIX}${createHmac('sha256', geheimnis).update(rohrumpf).digest('hex')}`;
}
