import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { zuZeile, type Ereignis } from '../activities/ereignisse';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenService } from './token.service';
import type { LoginErgebnis } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivitySource, Role, TaskStatus } from '../generated/prisma/enums';

/**
 * Wie lange eine Demo-Umgebung bestehen bleibt.
 *
 * 24 Stunden sind lang genug, dass jemand die Seite zwischendurch schliessen
 * und spaeter weiterschauen kann, und kurz genug, dass sich in der Datenbank
 * nichts ansammelt. Bei Neon im kostenlosen Tarif stehen 0,5 GB zur
 * Verfuegung - eine Demo wiegt wenige Kilobyte, aber unbegrenzt waechst auch
 * das.
 */
export const DEMO_AUFBEWAHRUNG_STUNDEN = 24;

/** Ergebnis eines Aufraeumlaufs - fuer Protokoll und Tests. */
export interface AufraeumErgebnis {
  organisationen: number;
  nutzer: number;
}

/**
 * Der Demo-Zugang: eine vollstaendige, eigene Umgebung je Besucher.
 *
 * Liegt im Auth-Modul, obwohl er Projekte und Aufgaben anlegt. Grund ist die
 * Modulgrenze: Er braucht TokenService und RefreshTokenService, um den
 * Besucher sofort anzumelden, und der RefreshTokenService wird bewusst nicht
 * exportiert. Ein eigenes Demo-Modul haette ihn importieren muessen, waehrend
 * das Auth-Modul den Demo-Dienst fuer seine Route braucht - ein Ringschluss.
 * Fachlich ist die Zuordnung vertretbar: Der Endpoint stellt eine Sitzung aus,
 * das Befuellen ist das Beiwerk.
 *
 * ============================================================================
 * WARUM NICHT EIN GEMEINSAMES DEMO-KONTO
 * ============================================================================
 * Ein festes Konto haette bedeutet, dass alle Besucher in dieselben Daten
 * schreiben. Wer die Demo ausprobiert, benennt ein Projekt um oder loescht
 * eine Aufgabe - das ist der Sinn einer Demo. Nur sieht der NAECHSTE Besucher
 * das Ergebnis, und der ist im Zweifel derjenige, auf den es ankommt.
 *
 * Dagegen haette nur regelmaessiges Zuruecksetzen geholfen, also derselbe
 * Aufraeum-Aufwand - mit dem schlechteren Ergebnis.
 *
 * Mit einer eigenen Organisation je Besucher kann die Demo nicht kaputtgehen.
 * Nicht weil sie geschuetzt waere, sondern weil niemand die Daten eines
 * anderen sieht. Dieselbe Denkweise wie bei `expose` statt `ports` in der
 * Bereitstellung: Ein Weg, den es nicht gibt, muss man nicht bewachen.
 *
 * ============================================================================
 * WARUM OHNE ZEITPLANER AUFGERAEUMT WIRD
 * ============================================================================
 * DevBoard hat keinen Scheduler, und fuer diese eine Aufgabe lohnt er nicht.
 * Stattdessen raeumt jeder Demo-Start die abgelaufenen Umgebungen der
 * Vorgaenger weg.
 *
 * Der Preis ist ehrlich zu benennen: Kommt monatelang niemand vorbei, bleibt
 * die letzte Demo liegen. Das ist unschoen, aber harmlos - es sind wenige
 * Kilobyte, und es entsteht kein Wachstum ohne Nutzung. Die Arbeit haengt am
 * einzigen Ausloeser, den es ohnehin gibt.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  /**
   * Legt eine frische Demo-Umgebung an und meldet den Besucher darin an.
   *
   * Die Reihenfolge ist Absicht: erst aufraeumen, dann anlegen. Andersherum
   * wuerde die gerade erzeugte Umgebung im selben Lauf geprueft - unkritisch,
   * weil sie die Frist nicht reisst, aber es waere unnoetige Arbeit an der
   * falschen Stelle.
   */
  async starte(): Promise<LoginErgebnis> {
    const aufgeraeumt = await this.raeumeAbgelaufeneAuf();
    if (aufgeraeumt.organisationen > 0) {
      this.logger.log(
        `Abgelaufene Demos entfernt: ${aufgeraeumt.organisationen} Organisationen, ${aufgeraeumt.nutzer} Konten`,
      );
    }

    const nutzer = await this.legeUmgebungAn();

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
      user: { id: nutzer.id, email: nutzer.email, name: nutzer.name },
    };
  }

  /**
   * Entfernt Demo-Umgebungen, deren Frist abgelaufen ist.
   *
   * `jetzt` ist ein Parameter und wird nicht im Inneren aus der Uhr gelesen.
   * Nur so laesst sich der Ablauf in einem Test HERSTELLEN statt abzuwarten -
   * die Lehre, die in diesem Projekt bereits dreimal Geld gekostet hat.
   */
  async raeumeAbgelaufeneAuf(
    jetzt: Date = new Date(),
  ): Promise<AufraeumErgebnis> {
    const grenze = new Date(
      jetzt.getTime() - DEMO_AUFBEWAHRUNG_STUNDEN * 60 * 60 * 1000,
    );

    // Beide Loeschungen in EINER Transaktion: Sonst koennte zwischen ihnen ein
    // Fehler auftreten und Konten zurueckbleiben, deren Organisation schon weg
    // ist. Die waeren durch nichts mehr auffindbar ausser dem Feld selbst.
    return this.prisma.$transaction(async (tx) => {
      // Die Organisation zieht Mitgliedschaften, Projekte, Aufgaben und
      // Aktivitaeten per Cascade mit.
      const organisationen = await tx.organization.deleteMany({
        where: { isDemo: true, createdAt: { lt: grenze } },
      });

      // Der Nutzer haengt NICHT an der Organisation, sondern nur ueber eine
      // Mitgliedschaft. Ohne diese zweite Loeschung bliebe er als Waise
      // zurueck. Seine Refresh-Token verschwinden per Cascade mit ihm.
      const nutzer = await tx.user.deleteMany({
        where: { isDemo: true, createdAt: { lt: grenze } },
      });

      return { organisationen: organisationen.count, nutzer: nutzer.count };
    });
  }

  /**
   * Erzeugt Konto, Organisation und Inhalt in EINER Transaktion.
   *
   * Ganz oder gar nicht: Eine halb angelegte Demo - Konto ohne Organisation,
   * oder Projekt ohne Aufgaben - waere schlimmer als gar keine. Der Besucher
   * saehe eine leere Anwendung und hielte sie fuer kaputt.
   */
  private async legeUmgebungAn(): Promise<{
    id: string;
    email: string;
    name: string | null;
  }> {
    // Ein zufaelliges Passwort, das nie jemand erfaehrt und niemand braucht -
    // die Anmeldung erfolgt ueber die hier ausgestellten Token. Es wird
    // trotzdem regulaer gehasht statt einen Platzhalter zu schreiben: Ein
    // Konto mit unbrauchbarem Hash waere ein Sonderfall im Datenbestand, und
    // Sonderfaelle im Datenbestand raechen sich spaeter.
    const passwortHash = await this.passwords.hash(
      randomBytes(32).toString('base64url'),
    );

    // Die Adresse ist absichtlich eindeutig und unter einer Subdomain, die
    // niemandem gehoert - so kollidiert sie nie mit einer echten Anmeldung.
    const email = `demo-${randomUUID()}@demo.devboard.info`;

    return this.prisma.$transaction(async (tx) => {
      const nutzer = await tx.user.create({
        data: {
          email,
          name: 'Demo-Besucher',
          passwordHash: passwortHash,
          isDemo: true,
        },
        select: { id: true, email: true, name: true },
      });

      const organisation = await tx.organization.create({
        data: { name: 'Demo-Organisation', isDemo: true },
        select: { id: true },
      });

      // OWNER und nicht MEMBER: Der Besucher soll ALLES ausprobieren koennen,
      // auch Einladungen und das Loeschen von Projekten. Es sind seine eigenen
      // Daten - er kann niemandem schaden.
      const mitgliedschaft = await tx.membership.create({
        data: {
          organizationId: organisation.id,
          userId: nutzer.id,
          role: Role.OWNER,
        },
        select: { id: true },
      });

      const ereignisse: Ereignis[] = [];

      for (const entwurf of PROJEKTE) {
        const projekt = await tx.project.create({
          data: {
            organizationId: organisation.id,
            name: entwurf.name,
            description: entwurf.beschreibung,
          },
          select: { id: true },
        });

        ereignisse.push({
          typ: 'PROJEKT_ANGELEGT',
          projektId: projekt.id,
          name: entwurf.name,
        });

        // Die Position wird je Spalte in Tausenderschritten vergeben. Grosse
        // Abstaende sind bei fractional indexing kein Zufall: Sie lassen Platz
        // fuer viele spaetere Einfuegungen, bevor die Nachkommastellen
        // gebraucht werden.
        const naechstePosition = new Map<TaskStatus, number>();

        for (const aufgabe of entwurf.aufgaben) {
          const position = (naechstePosition.get(aufgabe.status) ?? 0) + 1000;
          naechstePosition.set(aufgabe.status, position);

          const erstellt = await tx.task.create({
            data: {
              projectId: projekt.id,
              title: aufgabe.titel,
              description: aufgabe.beschreibung,
              status: aufgabe.status,
              position,
              assigneeId: aufgabe.zugewiesen ? mitgliedschaft.id : null,
            },
            select: { id: true },
          });

          ereignisse.push({
            typ: 'AUFGABE_ANGELEGT',
            projektId: projekt.id,
            aufgabenId: erstellt.id,
            titel: aufgabe.titel,
            status: aufgabe.status,
          });

          // Erledigte Aufgaben haben den Weg ueber das Board genommen. Ohne
          // diese Ereignisse waere der Feed eine Liste von Anlagen und wuerde
          // nicht zeigen, wofuer er da ist.
          if (aufgabe.status === TaskStatus.DONE) {
            ereignisse.push({
              typ: 'AUFGABE_VERSCHOBEN',
              projektId: projekt.id,
              aufgabenId: erstellt.id,
              titel: aufgabe.titel,
              vonStatus: TaskStatus.IN_PROGRESS,
              nachStatus: TaskStatus.DONE,
            });
          }
        }
      }

      // `zuZeile` ist derselbe Uebersetzer, den der reguläre Betrieb benutzt.
      // Bewusst nicht von Hand nachgebaut: Sonst saehe der Demo-Feed anders
      // aus als ein echter, und eine Aenderung am Format wuerde hier
      // vergessen.
      await tx.activity.createMany({
        data: ereignisse.map((ereignis) => {
          const zeile = zuZeile(ereignis);
          return {
            organizationId: organisation.id,
            type: zeile.type,
            source: ActivitySource.APP,
            actorId: nutzer.id,
            projectId: zeile.projectId,
            taskId: zeile.taskId,
            payload: zeile.payload,
          };
        }),
      });

      return nutzer;
    });
  }
}

/** Der Inhalt, den jede Demo-Umgebung mitbringt. */
const PROJEKTE: {
  name: string;
  beschreibung: string;
  aufgaben: {
    titel: string;
    beschreibung?: string;
    status: TaskStatus;
    zugewiesen?: boolean;
  }[];
}[] = [
  {
    name: 'Website-Relaunch',
    beschreibung:
      'Neuer Auftritt mit ueberarbeiteter Navigation und schnellerem Seitenaufbau.',
    aufgaben: [
      {
        titel: 'Startseite umbauen',
        beschreibung: 'Neue Struktur mit Hero-Bereich und Funktionsuebersicht.',
        status: TaskStatus.DONE,
        zugewiesen: true,
      },
      {
        titel: 'Bilder komprimieren',
        status: TaskStatus.DONE,
      },
      {
        titel: 'Navigation fuer kleine Bildschirme',
        beschreibung: 'Ausklappbares Menue unterhalb von 768 Pixeln.',
        status: TaskStatus.IN_PROGRESS,
        zugewiesen: true,
      },
      {
        titel: 'Kontaktformular anbinden',
        status: TaskStatus.IN_PROGRESS,
      },
      {
        titel: 'Barrierefreiheit pruefen',
        beschreibung: 'Tastaturbedienung und Kontraste nach WCAG AA.',
        status: TaskStatus.TODO,
      },
      {
        titel: 'Alte Seiten umleiten',
        beschreibung: 'Damit vorhandene Verweise nicht ins Leere fuehren.',
        status: TaskStatus.TODO,
      },
    ],
  },
  {
    name: 'Mobile App',
    beschreibung: 'Begleitende App fuer unterwegs, zunaechst nur lesend.',
    aufgaben: [
      {
        titel: 'Anmeldung uebernehmen',
        status: TaskStatus.DONE,
        zugewiesen: true,
      },
      {
        titel: 'Aufgabenliste anzeigen',
        status: TaskStatus.IN_PROGRESS,
      },
      {
        titel: 'Benachrichtigungen',
        beschreibung: 'Erst nach dem ersten Testlauf mit echten Nutzern.',
        status: TaskStatus.TODO,
      },
    ],
  },
];
