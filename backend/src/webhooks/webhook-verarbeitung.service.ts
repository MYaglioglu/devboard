import { Injectable, Logger } from '@nestjs/common';

import { ActivitiesService } from '../activities/activities.service';
import { WebhookDeliveryStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { uebersetze } from './uebersetzung';

/** Wie viele Zustellungen ein Durchlauf hoechstens anfasst. */
const STAPELGROESSE = 20;

/**
 * Uebersetzt angenommene Zustellungen in Feed-Eintraege (ADR-015).
 *
 * ============================================================================
 * DER ERNSTFALL AUS ADR-012
 * ============================================================================
 * Dort steht: Konsistenz gehoert in die Transaktion. Bisher hiess das, dass
 * eine fachliche Aenderung und ihr Feed-Eintrag zusammen gelten.
 *
 * Hier sind es zwei ANDERE Dinge, die zusammen gelten muessen:
 *
 *   1. der Feed-Eintrag
 *   2. der Zustandswechsel der Zustellung auf PROCESSED
 *
 * Faellt eines aus, muss beides zurueck. Sonst gibt es zwei Arten, falsch zu
 * liegen, und beide sind unangenehm:
 *
 *   - Eintrag geschrieben, Zustand nicht gesetzt  => beim naechsten Durchlauf
 *     entsteht der Eintrag ein ZWEITES Mal. Die Idempotenz aus 5.4 hilft
 *     nicht: Sie schuetzt gegen doppelte ZUSTELLUNGEN, nicht gegen doppelte
 *     VERARBEITUNG derselben Zustellung.
 *   - Zustand gesetzt, Eintrag nicht geschrieben  => die Zustellung gilt als
 *     erledigt, und im Feed steht nichts. Sie wird nie wieder angefasst.
 *
 * Deshalb eine Transaktion um beides.
 *
 * ============================================================================
 * WARUM ES KEINEN SCHEDULER GIBT - UND WAS DAS KOSTET
 * ============================================================================
 * Angestossen wird die Verarbeitung nach der Quittung des Endpoints, also
 * NACH der Antwort an GitHub. Ein `@nestjs/schedule`-Intervall waere die
 * naheliegende Alternative und braechte eine weitere Abhaengigkeit sowie einen
 * Zeitgeber, der in jedem E2E-Lauf mitlaeuft.
 *
 * Der Preis wird hier ausdruecklich benannt, statt ihn zu verschweigen:
 * Kommt keine weitere Zustellung, bleibt eine gescheiterte Zeile LIEGEN. Es
 * gibt derzeit nichts, was sie von selbst noch einmal versucht. Weil jeder
 * Durchlauf aber ALLE offenen Zeilen aufnimmt, holt die naechste Zustellung
 * die liegengebliebenen mit.
 *
 * Fuer ein Aktivitaetsprotokoll ist das vertretbar. Fuer eine Zahlung waere es
 * das nicht. Vermerkt in 06_BACKLOG.md mit Faelligkeit Sprint 6, wo mit dem
 * Deployment ohnehin die Frage aufkommt, was regelmaessig laufen soll.
 */
@Injectable()
export class WebhookVerarbeitungService {
  private readonly logger = new Logger(WebhookVerarbeitungService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesService,
  ) {}

  /**
   * Verarbeitet offene Zustellungen und liefert die Zahl der erledigten.
   *
   * ==========================================================================
   * WARUM ERST LESEN UND DANN JEDE ZEILE EINZELN IN IHRER TRANSAKTION
   * ==========================================================================
   * Eine grosse Transaktion um den ganzen Stapel waere kuerzer und waere
   * falsch: Eine einzige unbrauchbare Nutzlast riesse dann alle anderen mit
   * zurueck. Die Zeilen haengen fachlich nicht zusammen - jede ist eine eigene
   * Zustellung mit eigenem Schicksal.
   *
   * Der Preis ist eine Abfrage je Zeile statt einer fuer alle. Bei einem
   * Stapel von 20 ist das kein Thema; waere es eines, waere die Antwort nicht
   * eine grosse Transaktion, sondern ein kleinerer Stapel.
   */
  async verarbeiteOffene(): Promise<{
    verarbeitet: number;
    gescheitert: number;
  }> {
    const offene = await this.prisma.webhookDelivery.findMany({
      where: { status: WebhookDeliveryStatus.ACCEPTED },
      // Aelteste zuerst - der Feed soll die Reihenfolge der Ereignisse
      // widerspiegeln, nicht die ihrer Verarbeitung. Bedient vom Index
      // (status, receivedAt).
      orderBy: { receivedAt: 'asc' },
      take: STAPELGROESSE,
      select: {
        id: true,
        eventType: true,
        payload: true,
        connection: {
          select: {
            project: { select: { id: true, organizationId: true } },
          },
        },
      },
    });

    let verarbeitet = 0;
    let gescheitert = 0;

    for (const zustellung of offene) {
      const projekt = zustellung.connection.project;

      try {
        const ereignis = uebersetze(
          zustellung.eventType,
          zustellung.payload,
          projekt.id,
        );

        const erledigt = await this.prisma.$transaction(async (tx) => {
          /**
           * ==================================================================
           * ZUERST BEANSPRUCHEN, DANN SCHREIBEN - UND WARUM DIE REIHENFOLGE
           * ==================================================================
           * `updateMany` mit `status: ACCEPTED` in der Bedingung, nicht
           * `update` auf die ID allein. Der Unterschied ist der ganze Punkt:
           *
           * Zwei Durchlaeufe koennen sich ueberlappen - der Anstoss aus dem
           * Controller und ein zweiter, den eine gleichzeitige Zustellung
           * ausloest. Beide lesen dieselben offenen Zeilen, BEVOR einer von
           * beiden schreibt. Ohne die Bedingung im `WHERE` verarbeiteten beide
           * dieselbe Zustellung, und der Feed-Eintrag stuende doppelt da.
           *
           * Die Idempotenz aus Scheibe 5.4 hilft dagegen NICHT: Sie schuetzt
           * gegen doppelte ZUSTELLUNGEN, nicht gegen doppelte VERARBEITUNG
           * derselben Zustellung.
           *
           * `count === 0` heisst: Ein anderer Durchlauf war schneller. Dann
           * wird hier nichts geschrieben - kein Fehler, nur nichts zu tun.
           *
           * Zum fuenften Mal dieselbe Regel: DIE BEDINGUNG GEHOERT INS
           * `WHERE`, NICHT IN EIN `if` DAVOR. (ADR-010, ADR-012, das `create`
           * beim Verbinden, der Constraint beim Empfangen - und jetzt hier.)
           *
           * Der Anspruch steht VOR dem Schreiben des Eintrags, nicht danach.
           * Andersherum haette der Verlierer des Rennens den Eintrag bereits
           * geschrieben und muesste ihn ueber einen Fehler zurueckrollen -
           * also ueber einen Weg, der die Zeile als FAILED markiert, obwohl
           * nichts schiefgegangen ist.
           */
          const beansprucht = await tx.webhookDelivery.updateMany({
            where: {
              id: zustellung.id,
              status: WebhookDeliveryStatus.ACCEPTED,
            },
            /**
             * ================================================================
             * AUCH EIN `null`-ERGEBNIS IST EIN ERFOLG
             * ================================================================
             * `uebersetze` liefert `null` fuer alles, woraus kein Feed-Eintrag
             * entsteht - ein `star`-Ereignis, ein `synchronize` an einem PR,
             * ein Push auf ein Tag.
             *
             * Diese Zustellungen als FAILED zu markieren waere falsch: Nichts
             * ist schiefgegangen, es gab nur nichts anzuzeigen. Sie stuenden
             * sonst in einer Halde, die man irgendwann nicht mehr ansieht,
             * weil sie voller Nicht-Fehler ist.
             */
            data: {
              status: WebhookDeliveryStatus.PROCESSED,
              processedAt: new Date(),
              versuche: { increment: 1 },
              fehlermeldung: null,
            },
          });

          if (beansprucht.count === 0) {
            return false;
          }

          if (ereignis) {
            await this.activities.protokolliereVonGitHub(
              tx,
              projekt.organizationId,
              ereignis,
            );
          }

          return true;
        });

        if (erledigt) {
          verarbeitet += 1;
        }
      } catch (fehler) {
        gescheitert += 1;
        await this.merkeFehler(zustellung.id, fehler);
      }
    }

    return { verarbeitet, gescheitert };
  }

  /**
   * Haelt einen Fehlschlag an der Zeile fest.
   *
   * Bewusst AUSSERHALB der zurueckgerollten Transaktion: Innerhalb waere die
   * Notiz mit zurueckgerollt worden, und die Zeile saehe hinterher aus wie
   * eine, die nie versucht wurde. Genau der Zaehler `versuche` unterscheidet
   * eine Zeile, die JEDES Mal scheitert, von einer, die noch nie an der Reihe
   * war.
   */
  private async merkeFehler(id: string, fehler: unknown): Promise<void> {
    const meldung = fehler instanceof Error ? fehler.message : 'Unbekannt';

    this.logger.warn(`Zustellung ${id} konnte nicht verarbeitet werden`);

    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: WebhookDeliveryStatus.FAILED,
        versuche: { increment: 1 },
        // Die Meldung ist fuer die Fehlersuche, nicht fuer die Anzeige. Sie
        // wird ueber keinen Endpoint ausgeliefert - interne Meldungen nach
        // aussen zu geben ist der Anfang einer laengeren Geschichte.
        fehlermeldung: meldung.slice(0, 500),
      },
    });
  }

  /**
   * Nimmt gescheiterte Zustellungen wieder auf.
   *
   * Getrennt vom normalen Durchlauf, weil eine Zeile, die zuverlaessig
   * scheitert, sonst bei JEDEM Durchlauf denselben Fehler erzeugt und das
   * Protokoll flutet. Ein erneuter Versuch ist eine ENTSCHEIDUNG - nach einer
   * Korrektur am Code, nicht nach einer Weile.
   *
   * Der Zaehler `versuche` bleibt dabei stehen und waechst weiter. Er ist die
   * einzige Spur davon, wie oft es schon nicht geklappt hat.
   */
  async nimmGescheiterteWiederAuf(): Promise<number> {
    const ergebnis = await this.prisma.webhookDelivery.updateMany({
      where: { status: WebhookDeliveryStatus.FAILED },
      data: { status: WebhookDeliveryStatus.ACCEPTED },
    });

    return ergebnis.count;
  }

  /**
   * Loescht verarbeitete Zustellungen, die aelter als `tage` sind.
   *
   * ==========================================================================
   * WARUM DIESE TABELLE EINE AUFBEWAHRUNGSFRIST BRAUCHT
   * ==========================================================================
   * Sie ist die einzige im Projekt, die FREMDE Rohdaten speichert:
   * Commit-Nachrichten, Zweignamen, GitHub-Anmeldenamen, oft auch
   * E-Mail-Adressen von Menschen, die nie etwas mit DevBoard zu tun hatten.
   * Erhoben haben wir davon nichts - es kam mit der Nutzlast.
   *
   * Sie waechst dabei unbegrenzt und wird nach der Verarbeitung nie wieder
   * gelesen. Damit ist sie genau das, wovor jede Datenschutzpruefung warnt:
   * ein Speicher ohne Zweck und ohne Ende.
   *
   * Der Feed selbst bleibt unberuehrt. Was hier geloescht wird, sind die
   * ROHDATEN - die daraus entstandenen Aktivitaeten haengen an der
   * Organisation und sind das, was fachlich zaehlt.
   *
   * ==========================================================================
   * WARUM NUR PROCESSED UND NICHT ALLES
   * ==========================================================================
   * `ACCEPTED` heisst "noch nicht verarbeitet" - die Zeile zu loeschen hiesse,
   * ein Ereignis zu verlieren, das nie im Feed ankam.
   *
   * `FAILED` heisst "wir konnten es nicht deuten". Genau diese Zeilen sind die
   * interessanten: Sie sind der Grund, warum die Tabelle ueberhaupt existiert.
   * Wer sie nach 30 Tagen wegraeumt, loescht die Fehler, die er noch nicht
   * angesehen hat.
   *
   * Beide bleiben also stehen. Dass die Halde aus gescheiterten Zeilen damit
   * unbegrenzt wachsen KANN, ist der bewusst gewaehlte Rest: Lieber eine
   * Liste, die auffaellt, als eine, die sich selbst aufraeumt.
   */
  async raeumeAlteZustellungenAb(tage: number): Promise<number> {
    if (!Number.isInteger(tage) || tage < 1) {
      // Ein `raeumeAlteZustellungenAb(0)` wuerde alles Verarbeitete loeschen -
      // ein Tippfehler mit unumkehrbarer Wirkung. Deshalb kein stiller
      // Rueckfall auf einen Vorgabewert, sondern ein Abbruch.
      throw new Error('Aufbewahrungsfrist muss mindestens ein Tag sein');
    }

    const grenze = new Date(Date.now() - tage * 24 * 60 * 60 * 1000);

    const ergebnis = await this.prisma.webhookDelivery.deleteMany({
      where: {
        status: WebhookDeliveryStatus.PROCESSED,
        // `receivedAt` und nicht `processedAt`: Die Frist laeuft ab dem
        // Zeitpunkt, an dem wir die Daten BEKOMMEN haben. Wann wir sie
        // verarbeitet haben, ist unsere Sache und darf die Aufbewahrung nicht
        // verlaengern - sonst hielte eine spaet verarbeitete Zeile ihre Daten
        // laenger fest als eine puenktliche.
        receivedAt: { lt: grenze },
      },
    });

    if (ergebnis.count > 0) {
      this.logger.log(
        `${ergebnis.count} verarbeitete Zustellungen aelter als ${tage} Tage entfernt`,
      );
    }

    return ergebnis.count;
  }
}
