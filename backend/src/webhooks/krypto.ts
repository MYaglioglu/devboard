import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * ============================================================================
 * VERSCHLUESSELN UND ENTSCHLUESSELN - REINE RECHNUNG, OHNE NEST UND OHNE DB
 * ============================================================================
 * Dieselbe Trennung wie bei `positionen.ts` (Sprint 3) und `feed-satz.ts`
 * (Sprint 4): keine Abhaengigkeit zu NestJS, kein Prisma, kein Request. Der
 * Grund ist nicht Architekturlehre, sondern der Testpreis - jeder Grenzfall
 * laesst sich hier ohne ein einziges Modul pruefen.
 *
 * ============================================================================
 * WARUM UEBERHAUPT VERSCHLUESSELN UND NICHT HASHEN (ADR-014)
 * ============================================================================
 * Passwoerter (argon2id) und Einladungs-Token (SHA-256) liegen in diesem
 * Projekt gehasht. Hier geht das nicht, und der Grund ist strukturell:
 *
 * GitHub legt das Geheimnis NIE vor. Es schickt eine HMAC-Signatur ueber den
 * Nachrichtenrumpf. Um sie zu pruefen, muessen wir dieselbe Signatur
 * NACHRECHNEN - und dafuer brauchen wir das Geheimnis selbst.
 *
 *   Wiedererkennen  => hashen.
 *   Nachrechnen     => verschluesseln.
 *
 * Und der ehrliche Teil, der in ADR-014 genauso steht: Das schuetzt DEUTLICH
 * weniger als ein Hash. Wer die Datenbank UND den Schluessel hat, hat die
 * Geheimnisse. Es schuetzt gegen ein geleaktes Backup, nicht gegen einen
 * uebernommenen Anwendungsserver.
 */

/** AES-256 im GCM-Modus. */
const VERFAHREN = 'aes-256-gcm';

/**
 * 32 Byte - die "256" im Namen des Verfahrens.
 *
 * Node wirft bei jeder anderen Laenge `Invalid key length`. Deshalb prueft das
 * Env-Schema die Laenge schon beim Start: Der Fehler soll beim Hochfahren
 * auftreten, nicht beim ersten Verbinden eines Repositories.
 */
export const SCHLUESSEL_LAENGE = 32;

/**
 * 12 Byte Initialisierungsvektor.
 *
 * ============================================================================
 * DIE GEFAEHRLICHSTE ZAHL IN DIESER DATEI
 * ============================================================================
 * 12 Byte (96 Bit) ist die von NIST fuer GCM empfohlene Laenge. Andere Laengen
 * sind erlaubt, werden intern aber erst gehasht - langsamer, ohne Gewinn.
 *
 * Viel wichtiger als die Laenge ist die EINMALIGKEIT. Ein IV muss mit
 * demselben Schluessel NIE zweimal verwendet werden. Bei GCM ist das kein
 * kleiner Makel, sondern ein Totalschaden:
 *
 *   - Zwei Klartexte unter demselben Schluessel und IV verraten ihr XOR.
 *     Wer einen kennt, kennt den anderen.
 *   - Schlimmer noch: Aus zwei Nachrichten laesst sich der Authentifizierungs-
 *     Schluessel herleiten. Danach kann ein Angreifer BELIEBIGE Nachrichten
 *     mit gueltigem Tag faelschen.
 *
 * Deshalb kommt der IV aus `randomBytes` und wird bei JEDEM Verschluesseln neu
 * gezogen - nie aus einem Zaehler, nie aus der Zeit, nie wiederverwendet. Er
 * ist kein Geheimnis und wird offen neben dem Schluesseltext gespeichert; er
 * muss nur einmalig sein.
 */
const IV_LAENGE = 12;

/**
 * Ein verschluesseltes Geheimnis, so wie es in der Datenbank liegt.
 *
 * Drei Teile statt einem: Der Schluesseltext allein ist ohne den IV nicht zu
 * entschluesseln und ohne den Authentifizierungs-Tag nicht auf Unversehrtheit
 * pruefbar.
 */
export interface VerschluesseltesGeheimnis {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
}

/**
 * ============================================================================
 * WARUM HIER `Uint8Array<ArrayBuffer>` STEHT UND NICHT `Buffer`
 * ============================================================================
 * Naheliegend waere `Buffer` - Node-Krypto liefert genau den. Prisma 7
 * erwartet fuer eine `Bytes`-Spalte aber `Uint8Array<ArrayBuffer>`, und
 * `Buffer` ist in den Node-Typen ein `Uint8Array<ArrayBufferLike>`.
 *
 * `ArrayBufferLike` schliesst `SharedArrayBuffer` mit ein, und den will
 * Prisma ausdruecklich nicht: Ein geteilter Puffer kann sich zwischen dem
 * Lesen und dem Schreiben unter der Hand aendern. Der Compilerfehler ist also
 * keine Typ-Schikane, sondern eine sinnvolle Zusage - und er faellt beim
 * Bauen auf, nicht beim ersten Verbinden.
 *
 * `Uint8Array.from` kopiert in einen frischen, nicht geteilten Puffer. Die
 * Alternative waere eine Typ-Zusicherung mit `as` gewesen - die haette den
 * Fehler stummgeschaltet, ohne die Zusage zu erfuellen.
 */
const alsBytes = (puffer: Uint8Array): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(puffer);

/**
 * Liest den Schluessel aus seiner Hex-Darstellung.
 *
 * Die Laengenpruefung steht hier ZUSAETZLICH zum Env-Schema. Das ist keine
 * Dopplung aus Versehen: Das Schema schuetzt den Startvorgang, diese Funktion
 * schuetzt jeden anderen Aufrufer - etwa einen Test, der einen eigenen
 * Schluessel mitbringt. Eine Zusicherung, die nur an einer Stelle geprueft
 * wird, gilt nur an dieser Stelle.
 */
export function leseSchluessel(hex: string): Buffer {
  const schluessel = Buffer.from(hex, 'hex');

  if (schluessel.length !== SCHLUESSEL_LAENGE) {
    throw new Error(
      `Schluessel muss ${SCHLUESSEL_LAENGE} Byte lang sein, war ${schluessel.length}`,
    );
  }

  return schluessel;
}

/**
 * Erzeugt ein neues Webhook-Geheimnis.
 *
 * 32 Byte aus `randomBytes`, also dem kryptografisch sicheren Zufall des
 * Betriebssystems - NICHT `Math.random()`. Das ist derselbe Punkt wie bei den
 * Einladungs-Token: `Math.random()` ist vorhersagbar, sobald jemand genug
 * Ausgaben gesehen hat, und war nie fuer Geheimnisse gedacht.
 *
 * Ausgabe als Hex, weil der Wert von Hand in ein GitHub-Formular kopiert wird.
 * Base64 enthaelt `+` und `/` - Zeichen, die beim Kopieren aus einem Terminal
 * oder in einer URL erfahrungsgemaess Aerger machen.
 */
export function erzeugeGeheimnis(): string {
  return randomBytes(32).toString('hex');
}

/** Verschluesselt ein Geheimnis. Der IV wird bei jedem Aufruf neu gezogen. */
export function verschluessele(
  klartext: string,
  schluessel: Buffer,
): VerschluesseltesGeheimnis {
  const iv = randomBytes(IV_LAENGE);
  const cipher = createCipheriv(VERFAHREN, schluessel, iv);

  const ciphertext = Buffer.concat([
    cipher.update(klartext, 'utf8'),
    cipher.final(),
  ]);

  // Der Tag entsteht ERST nach `final()`. Wer ihn vorher liest, bekommt einen
  // leeren Puffer - und merkt es nicht, weil das Entschluesseln dann mit einer
  // Meldung ueber "unsupported state" scheitert statt mit "falscher Tag".
  return {
    ciphertext: alsBytes(ciphertext),
    iv: alsBytes(iv),
    authTag: alsBytes(cipher.getAuthTag()),
  };
}

/**
 * Entschluesselt ein Geheimnis.
 *
 * ============================================================================
 * WARUM HIER KEIN `timingSafeEqual` STEHT
 * ============================================================================
 * Beim Vergleich der Webhook-Signatur (Scheibe 5.3) ist ein zeitkonstanter
 * Vergleich Pflicht. Hier nicht - und der Unterschied ist lehrreich:
 *
 * Der Authentifizierungs-Tag wird nicht von uns verglichen, sondern von der
 * GCM-Implementierung in `final()` geprueft, und die ist bereits
 * zeitkonstant. Ein eigener Vergleich waere hier bestenfalls ueberfluessig.
 *
 * `final()` WIRFT, wenn der Tag nicht passt. Genau das ist der Gewinn von GCM
 * gegenueber einem reinen CBC-Modus: Eine veraenderte Zeile in der Datenbank
 * faellt auf, statt stillschweigend Unsinn zu ergeben, mit dem dann eine
 * Signatur nachgerechnet wuerde.
 *
 * Der Fehler wird bewusst NICHT abgefangen. Ein unlesbares Geheimnis ist kein
 * Zustand, in dem man weitermachen darf - der Aufrufer soll scheitern, nicht
 * mit einem leeren Wert weiterrechnen.
 */
export function entschluessele(
  geheimnis: VerschluesseltesGeheimnis,
  schluessel: Buffer,
): string {
  const decipher = createDecipheriv(VERFAHREN, schluessel, geheimnis.iv);
  decipher.setAuthTag(geheimnis.authTag);

  return Buffer.concat([
    decipher.update(geheimnis.ciphertext),
    decipher.final(),
  ]).toString('utf8');
}
