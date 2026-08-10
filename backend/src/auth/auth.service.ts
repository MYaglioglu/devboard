import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

/**
 * Ein gueltiger argon2id-Hash eines zufaelligen, nirgends verwendeten Wertes.
 *
 * ============================================================================
 * WOZU EIN PLATZHALTER-HASH?
 * ============================================================================
 * Gegen einen TIMING-ANGRIFF.
 *
 * Naiver Login-Code:
 *
 *     const nutzer = await findeNutzer(email);
 *     if (!nutzer) throw new UnauthorizedException();   // <- kehrt SOFORT zurueck
 *     if (!await verify(nutzer.passwordHash, passwort)) throw ...;
 *
 * Existiert die Adresse nicht, antwortet der Server nach wenigen
 * Millisekunden. Existiert sie, laeuft vorher argon2 - absichtlich langsam,
 * ~50-100 ms. Diesen Unterschied kann ein Angreifer messen und damit
 * herausfinden, welche Adressen registriert sind, ganz ohne dass sich die
 * Fehlermeldung unterscheidet (User Enumeration ueber die Antwortzeit).
 *
 * Loesung: Auch wenn kein Nutzer gefunden wurde, wird `verify` ausgefuehrt -
 * gegen diesen Platzhalter. Beide Wege kosten dann etwa gleich viel Zeit.
 *
 * Der Wert ist KEIN Geheimnis: Es ist der Hash einer Zufallszeichenkette, die
 * niemand kennt und die zu keinem Konto gehoert. Er darf im Quelltext stehen.
 */
const PLATZHALTER_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$db7cH2nHJpDs8Q+M4Qa3XA$IkAV9Tqs96zzOMK47sZP3lTz9B1beTfO0b/H1f4eVc0';

/**
 * Oeffentliche Sicht auf ein Benutzerkonto.
 *
 * Der `passwordHash` fehlt hier ABSICHTLICH. Er verlaesst diesen Service nie -
 * weder in einer HTTP-Antwort noch in einem Log. Ein eigener Typ macht das
 * nicht nur zur Absicht, sondern zur Compiler-Regel: Wer den Hash
 * herausgeben wollte, muesste diesen Typ aendern und faellt damit im Review auf.
 */
export interface OeffentlicherNutzer {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

/** Antwort auf einen erfolgreichen Login. */
export interface LoginErgebnis {
  accessToken: string;
  /** Geht ausschliesslich ins Cookie, niemals in den Antwortkoerper. */
  refreshToken: { token: string; expiresAt: Date };
  user: { id: string; email: string; name: string | null };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Legt ein neues Benutzerkonto an.
   *
   * ==========================================================================
   * REIHENFOLGE: ERST HASHEN, DANN SCHREIBEN
   * ==========================================================================
   * Das Klartext-Passwort existiert nur als lokale Variable und wird nie
   * weitergereicht. In die Datenbank geht ausschliesslich der Hash.
   *
   * ==========================================================================
   * WARUM KEINE VORAB-PRUEFUNG "GIBT ES DIE E-MAIL SCHON?"
   * ==========================================================================
   * Naheliegend waere:
   *
   *     const vorhanden = await prisma.user.findUnique({ where: { email } });
   *     if (vorhanden) throw new ConflictException();
   *     await prisma.user.create(...);
   *
   * Das enthaelt eine RACE CONDITION. Zwischen Pruefung und Schreiben liegt ein
   * Zeitfenster; zwei gleichzeitige Registrierungen mit derselben Adresse
   * koennen beide die Pruefung bestehen. Wer dann gewinnt, entscheidet der
   * Zufall - und ohne Datenbank-Constraint haette man zwei Konten.
   *
   * Richtig ist: schreiben und den Fehler der DATENBANK auswerten. Der
   * UNIQUE-Index auf `email` ist die einzige Instanz, die diese Frage atomar
   * beantworten kann. Prisma meldet einen Verstoss mit dem Code `P2002`.
   *
   * Merksatz: Die Pruefung im Code ist fuer die FEHLERMELDUNG da, der
   * Constraint fuer die GARANTIE.
   *
   * ==========================================================================
   * ABWAEGUNG: 409 VERRAET, DASS DIE ADRESSE EXISTIERT
   * ==========================================================================
   * Ein 409 sagt einem Angreifer: "Diese Adresse ist registriert." Das nennt
   * man User Enumeration. Vollstaendig vermeiden liesse sich das nur, indem
   * die Registrierung immer 201 zurueckgibt und den Hinweis per E-Mail
   * zustellt.
   *
   * Wir entscheiden uns bewusst fuer 409: Ohne E-Mail-Versand waere die
   * Alternative fuer Nutzer unbrauchbar ("warum kann ich mich nicht
   * einloggen?"). Beim LOGIN dagegen bleibt die Fehlermeldung generisch - dort
   * gibt es keinen Grund, etwas preiszugeben. Siehe 10_SECURITY.md.
   */
  async register(daten: RegisterDto): Promise<OeffentlicherNutzer> {
    // Die E-Mail ist durch das Zod-Schema bereits getrimmt und kleingeschrieben.
    const passwordHash = await this.passwords.hash(daten.password);

    try {
      const nutzer = await this.prisma.user.create({
        data: {
          email: daten.email,
          name: daten.name ?? null,
          passwordHash,
        },
        // `select` statt alles zurueckzugeben: Der Hash darf diesen Service
        // nicht verlassen. Waehle explizit aus, statt hinterher zu loeschen -
        // wer Felder nachtraeglich entfernt, vergisst irgendwann eines.
        select: { id: true, email: true, name: true, createdAt: true },
      });

      // Bewusst OHNE die E-Mail-Adresse: Logs werden weitergeleitet,
      // durchsucht und aufbewahrt. Personenbezogene Daten gehoeren nicht
      // hinein (DSGVO), eine ID reicht zur Nachverfolgung.
      this.logger.log(`Neues Konto angelegt: ${nutzer.id}`);

      return nutzer;
    } catch (fehler: unknown) {
      if (this.istEindeutigkeitsVerstoss(fehler)) {
        throw new ConflictException(
          'Diese E-Mail-Adresse ist bereits registriert',
        );
      }
      throw fehler;
    }
  }

  /**
   * Meldet einen Nutzer an und gibt einen Access-Token zurueck.
   *
   * ==========================================================================
   * WARUM IMMER DIESELBE FEHLERMELDUNG?
   * ==========================================================================
   * Egal ob die Adresse unbekannt ist oder das Passwort falsch: Es kommt
   * immer 401 mit "E-Mail oder Passwort ist falsch".
   *
   * Unterschiedliche Meldungen ("Diese E-Mail ist nicht registriert" vs.
   * "Falsches Passwort") waeren bequemer - und ein Geschenk an Angreifer. Wer
   * eine Liste geleakter Adressen hat, koennte damit in Minuten herausfinden,
   * welche davon bei uns Konten haben, und sich dann auf die konzentrieren.
   *
   * Unterschied zur Registrierung: Dort geben wir mit 409 zu, dass die
   * Adresse existiert - weil ohne E-Mail-Versand die Alternative fuer Nutzer
   * unbrauchbar waere. Hier gibt es keinen solchen Grund, also wird nichts
   * preisgegeben. Siehe ADR-007 und 10_SECURITY.md.
   *
   * ==========================================================================
   * WARUM WIRD AUCH BEI UNBEKANNTER ADRESSE GEPRUEFT?
   * ==========================================================================
   * Weil sonst die ANTWORTZEIT verraet, was die Fehlermeldung verschweigt -
   * siehe Kommentar bei PLATZHALTER_HASH. Ein frueher `return` waere hier ein
   * Sicherheitsfehler, kein Performance-Gewinn.
   */
  async login(daten: LoginDto): Promise<LoginErgebnis> {
    const nutzer = await this.prisma.user.findUnique({
      where: { email: daten.email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    // Bewusst KEIN frueher Ausstieg bei `!nutzer` - siehe oben.
    const passwortStimmt = await this.passwords.verify(
      nutzer?.passwordHash ?? PLATZHALTER_HASH,
      daten.password,
    );

    if (!nutzer || !passwortStimmt) {
      // Ohne E-Mail-Adresse im Log: Fehlgeschlagene Logins sind haeufig, und
      // die Logs waeren sonst eine Sammlung personenbezogener Daten. Fuer die
      // Angriffserkennung reicht die Anzahl - das kommt mit dem Rate Limiting
      // in Scheibe 6.
      this.logger.warn('Fehlgeschlagener Login-Versuch');
      throw new UnauthorizedException('E-Mail oder Passwort ist falsch');
    }

    const accessToken = await this.tokens.erstelleAccessToken(
      nutzer.id,
      nutzer.email,
    );
    const refreshToken = await this.refreshTokens.erstelleNeueFamilie(
      nutzer.id,
    );

    return {
      accessToken,
      refreshToken: {
        token: refreshToken.token,
        expiresAt: refreshToken.expiresAt,
      },
      // Der `passwordHash` aus der Abfrage wird bewusst NICHT durchgereicht.
      user: { id: nutzer.id, email: nutzer.email, name: nutzer.name },
    };
  }

  /**
   * Stellt einen neuen Access-Token aus und rotiert den Refresh-Token.
   *
   * Beachte: Es wird KEIN Passwort geprueft. Der Besitz eines gueltigen,
   * unverbrauchten Refresh-Tokens IST der Nachweis. Genau deshalb muss dieser
   * Token so gut geschuetzt sein - httpOnly-Cookie, Rotation, und Widerruf
   * der ganzen Familie bei Wiederverwendung.
   */
  async erneuere(rohToken: string | undefined): Promise<LoginErgebnis> {
    if (!rohToken) {
      throw new UnauthorizedException('Sitzung ungueltig');
    }

    const rotiert = await this.refreshTokens.rotiere(rohToken);

    const nutzer = await this.prisma.user.findUnique({
      where: { id: rotiert.userId },
      select: { id: true, email: true, name: true },
    });

    if (!nutzer) {
      // Konto wurde zwischenzeitlich geloescht. Kann durch `onDelete: Cascade`
      // eigentlich nicht auftreten - aber ein Fehler hier waere ein 500er,
      // und der verriete mehr als noetig.
      throw new UnauthorizedException('Sitzung ungueltig');
    }

    const accessToken = await this.tokens.erstelleAccessToken(
      nutzer.id,
      nutzer.email,
    );

    return {
      accessToken,
      refreshToken: { token: rotiert.token, expiresAt: rotiert.expiresAt },
      user: nutzer,
    };
  }

  /**
   * Beendet die Sitzung.
   *
   * Widerrufen wird die ganze Token-Familie. Der Access-Token bleibt bis zu
   * seinem Ablauf technisch gueltig - das ist die bekannte Schwaeche
   * zustandsloser Token und der Grund fuer die kurze Lebensdauer. Neue
   * bekommt der Angreifer aber nicht mehr.
   */
  async abmelden(rohToken: string | undefined): Promise<void> {
    await this.refreshTokens.beendeSitzung(rohToken);
  }

  /**
   * Erkennt einen Verstoss gegen einen UNIQUE-Constraint (Prisma-Code P2002).
   *
   * Bewusst ueber die Eigenschaft geprueft statt ueber `instanceof`: Der
   * Fehlertyp liegt im generierten Prisma-Client, und `instanceof` kann bei
   * mehreren Client-Instanzen oder nach einem Versionswechsel unerwartet
   * fehlschlagen. Der Fehlercode dagegen ist Teil der oeffentlichen,
   * dokumentierten Schnittstelle von Prisma.
   */
  private istEindeutigkeitsVerstoss(fehler: unknown): boolean {
    return (
      typeof fehler === 'object' &&
      fehler !== null &&
      'code' in fehler &&
      (fehler as { code?: unknown }).code === 'P2002'
    );
  }
}
