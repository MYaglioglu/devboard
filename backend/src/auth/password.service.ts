import { Injectable, Logger } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Passwort-Hashing.
 *
 * ============================================================================
 * WARUM HASHEN UND NICHT VERSCHLUESSELN?
 * ============================================================================
 * Verschluesselung ist umkehrbar - wer den Schluessel hat, bekommt alle
 * Passwoerter im Klartext. Wir brauchen die Umkehrung aber gar nicht: Beim
 * Login muessen wir nur pruefen, OB das eingegebene Passwort dasselbe ist,
 * nicht wie es lautet. Hashing ist eine Einbahnstrasse - genau das Richtige.
 *
 * ============================================================================
 * WARUM NICHT SHA-256 ODER MD5?
 * ============================================================================
 * Beide sind Hashfunktionen, aber auf GESCHWINDIGKEIT optimiert - gedacht fuer
 * Pruefsummen ueber Dateien. Eine moderne Grafikkarte rechnet Milliarden
 * SHA-256-Hashes pro Sekunde; eine geklaute Datenbank waere in Stunden offen.
 *
 * Ein Passwort-Hash muss das Gegenteil sein:
 *   - absichtlich LANGSAM  -> bremst das Durchprobieren
 *   - SPEICHERHUNGRIG      -> verhindert massives Parallelisieren auf GPUs
 *                             (Rechenkerne hat eine Grafikkarte viele,
 *                              Speicher pro Kern dagegen wenig)
 *
 * ============================================================================
 * WARUM ARGON2ID?
 * ============================================================================
 * argon2 hat 2015 die Password Hashing Competition gewonnen und ist
 * speicherhart - bcrypt ist das nicht. bcrypt hat ausserdem die Eigenheit,
 * alles nach 72 Bytes Eingabe stillschweigend zu ignorieren.
 *
 * Von den drei Varianten ist argon2id die richtige Wahl: eine Mischung, die
 * sowohl gegen GPU-Angriffe (argon2d) als auch gegen Seitenkanalangriffe
 * (argon2i) schuetzt. Es ist die Voreinstellung dieser Bibliothek.
 *
 * ============================================================================
 * WO IST DER SALT?
 * ============================================================================
 * Ein Salt ist ein Zufallswert, der vor dem Hashen beigemischt wird. Ohne ihn
 * ergaebe dasselbe Passwort immer denselben Hash - ein Angreifer saehe sofort,
 * welche Nutzer dasselbe Passwort haben, und koennte mit vorberechneten
 * Tabellen (Rainbow Tables) arbeiten.
 *
 * argon2 erzeugt den Salt SELBST und legt ihn im Hash-String ab. Wir muessen
 * nichts dafuer tun. Wer in einem Tutorial sieht, dass jemand den Salt von Hand
 * baut und getrennt speichert, sollte das Tutorial schliessen.
 *
 * Ein erzeugter Hash sieht so aus:
 *
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
 *    \______/ \___/ \_____________/
 *    Verfahren Ver-  Parameter: m = Speicher in KiB, t = Durchlaeufe,
 *              sion             p = Parallelitaet
 *
 * Die Parameter stehen IM Hash. Deshalb koennen sie spaeter erhoeht werden,
 * ohne dass bestehende Passwoerter unbrauchbar werden - alte Hashes werden
 * weiterhin mit ihren eigenen Parametern geprueft.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  /**
   * Erzeugt einen argon2id-Hash.
   *
   * Bewusst OHNE eigene Parameter: Die Voreinstellungen der Bibliothek sind
   * fachkundig gewaehlt. Eigene Werte sind hier fast immer eine
   * Verschlechterung - und wer die Parameter spaeter erhoehen will, kann das
   * tun, ohne alte Hashes zu brechen (siehe oben).
   */
  async hash(klartext: string): Promise<string> {
    return hash(klartext);
  }

  /**
   * Prueft ein Passwort gegen einen gespeicherten Hash.
   *
   * WICHTIG: Diese Methode wirft NIEMALS.
   *
   * Ist der gespeicherte Hash beschaedigt, leer oder in einem fremden Format,
   * wirft die Bibliothek eine Exception. Fuer den Aufrufer bedeutet das aber
   * genau dasselbe wie "Passwort falsch" - also faengt der Service den Fehler
   * ab und liefert `false`.
   *
   * Warum das eine Sicherheitsfrage ist: Wuerde hier eine Exception nach oben
   * durchschlagen, antwortete der Server bei kaputten Datensaetzen mit einem
   * 500er statt mit 401. Ein Angreifer koennte daraus ableiten, welche Konten
   * existieren und in welchem Zustand sie sind (User Enumeration).
   *
   * Der eigentliche Vergleich laeuft in der Bibliothek in konstanter Zeit -
   * ein naiver Vergleich mit === waere angreifbar, weil er bei der ersten
   * abweichenden Stelle abbricht und damit messbar frueher zurueckkehrt.
   */
  async verify(hashWert: string, klartext: string): Promise<boolean> {
    try {
      return await verify(hashWert, klartext);
    } catch {
      // Bewusst ohne Details im Log: weder Hash noch Klartext duerfen je in
      // einer Logdatei landen. Logs werden weitergeleitet, durchsucht und
      // aufbewahrt - ein Passwort darin ist dauerhaft kompromittiert.
      this.logger.warn(
        'Hash konnte nicht geprueft werden (ungueltiges Format)',
      );
      return false;
    }
  }
}
