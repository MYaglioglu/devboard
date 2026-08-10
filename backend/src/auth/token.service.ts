import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { Env } from '../config/env.schema';

/**
 * Inhalt eines Access-Tokens.
 *
 * ============================================================================
 * WAS IST EIN JWT?
 * ============================================================================
 * Drei mit Punkten getrennte, base64url-kodierte Teile:
 *
 *   eyJhbGciOiJIUzI1NiJ9 . eyJzdWIiOiJhYmMifQ . 4f2b9c...
 *   \__________________/   \________________/   \______/
 *        Header                 Payload         Signatur
 *
 * Header  = welches Signaturverfahren (hier HS256)
 * Payload = die Nutzdaten ("Claims")
 * Signatur= Pruefsumme ueber Header + Payload mit dem geheimen Schluessel
 *
 * ============================================================================
 * DER WICHTIGSTE SATZ ZU JWTs
 * ============================================================================
 * Ein JWT ist LESBAR, aber nicht FAELSCHBAR.
 *
 * base64 ist keine Verschluesselung, sondern nur eine Kodierung. Jeder, der
 * den Token hat, kann den Payload im Browser entschluesselt anzeigen -
 * jwt.io macht genau das. Was er NICHT kann: den Inhalt aendern, denn dann
 * passt die Signatur nicht mehr, und ohne das Geheimnis kann er keine neue
 * berechnen.
 *
 * Daraus folgt die Regel, die im Gespraech am haeufigsten gefragt wird:
 * NIEMALS Geheimnisse in den Payload. Kein Passwort, kein Hash, keine
 * Kreditkartennummer. Nur Angaben, die der Nutzer ohnehin ueber sich wissen
 * darf.
 *
 * ============================================================================
 * WARUM HS256 UND NICHT RS256?
 * ============================================================================
 * HS256 ist symmetrisch: Ein Geheimnis signiert UND prueft. Passt, solange
 * derselbe Dienst beides tut - unser Fall.
 *
 * RS256 ist asymmetrisch: Ein privater Schluessel signiert, ein oeffentlicher
 * prueft. Noetig, sobald mehrere Dienste Token pruefen sollen, ohne selbst
 * welche ausstellen zu duerfen (Microservices, externe Partner).
 *
 * Sicherheitshinweis fuer den Gespraechsfall: Die Bibliothek muss das
 * erwartete Verfahren festlegen und darf es nicht dem Header des Tokens
 * entnehmen. Sonst waere der beruehmte "alg: none"-Angriff moeglich, bei dem
 * ein Angreifer die Signaturpruefung schlicht abschaltet.
 */
export interface AccessTokenPayload {
  /**
   * "Subject" - die Kennung des Nutzers. `sub` ist ein in RFC 7519 fest
   * definierter Claim; eigene Namen wie `userId` wuerden zwar funktionieren,
   * aber jedes Standardwerkzeug erwartet `sub`.
   */
  sub: string;

  /** Nur zur Bequemlichkeit im Frontend - keine geheime Information. */
  email: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Stellt einen Access-Token aus.
   *
   * `iat` (ausgestellt am) und `exp` (laeuft ab am) setzt die Bibliothek
   * selbst - `exp` aus der konfigurierten Lebensdauer.
   *
   * Warum die Laufzeit kurz sein muss: Ein JWT laesst sich nicht widerrufen.
   * Der Server speichert ihn nirgends; er prueft nur die Signatur. Ein
   * gestohlener Token gilt deshalb bis zu seinem Ablauf - egal ob der Nutzer
   * sich abmeldet oder das Passwort aendert. Die kurze Lebensdauer ist der
   * einzige Schutz. Genau dafuer gibt es in Scheibe 3 den Refresh-Token, der
   * sehr wohl widerrufbar ist.
   */
  async erstelleAccessToken(nutzerId: string, email: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: nutzerId, email };

    return this.jwt.signAsync(payload, {
      expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
    });
  }

  /**
   * Prueft Signatur und Ablaufzeit und liefert den Inhalt zurueck.
   * Wirft, wenn der Token gefaelscht, veraendert oder abgelaufen ist.
   */
  async pruefeAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }
}
