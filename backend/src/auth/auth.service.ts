import { ConflictException, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import type { RegisterDto } from './dto/register.dto';

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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
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
