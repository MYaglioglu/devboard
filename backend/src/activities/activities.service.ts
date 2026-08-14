import { Injectable } from '@nestjs/common';

import { zuZeile } from './ereignisse';
import type { Prisma } from '../generated/prisma/client';
import type { Ereignis } from './ereignisse';

/**
 * Schreibt Eintraege in den Aktivitaets-Feed.
 *
 * ============================================================================
 * WARUM DIESE KLASSE KEINEN PrismaService HAT
 * ============================================================================
 * Das ist die wichtigste Zeile dieser Datei - naemlich die, die FEHLT. Es gibt
 * hier keinen `constructor(private readonly prisma: PrismaService)`.
 *
 * Stattdessen bekommt `protokolliere` den Transaktionsklienten des Aufrufers
 * HEREINGEREICHT. Damit ist der Feed-Eintrag Teil derselben Transaktion wie
 * die fachliche Aenderung: Beides gilt, oder nichts gilt.
 *
 * Haette diese Klasse ihren eigenen `PrismaService`, liefe ihr `INSERT` in
 * einer EIGENEN Transaktion. Ein Rollback der fachlichen Aenderung - etwa der
 * 409 beim Verschieben, ein Validierungsfehler, ein Netzwerkabbruch - liesse
 * den Feed-Eintrag stehen. Der Feed behauptete dann etwas, das nie passiert
 * ist, und niemand koennte es an den Fachdaten erkennen.
 *
 * Genau daran scheitert auch die naheliegende Alternative aus dem Lehrbuch:
 * `EventEmitter2` mit `@OnEvent`-Listenern. Ein Listener laeuft AUSSERHALB der
 * Transaktion des Ausloesers und kann diese Garantie nicht geben. Ausfuehrlich
 * begruendet in ADR-012.
 *
 * ============================================================================
 * WARUM ES TROTZDEM EINE EIGENE KLASSE IST
 * ============================================================================
 * `tx.activity.create(...)` direkt im TasksService waere kuerzer. Dann stuende
 * die Abbildung Ereignis -> Zeile aber an jeder Aufrufstelle erneut, und die
 * Zusicherung aus ereignisse.ts ("payload wird NUR typisiert geschrieben")
 * waere eine Bitte statt einer Regel. Hier ist sie ein Engpass, an dem jeder
 * Eintrag vorbeimuss.
 *
 * ============================================================================
 * WARUM DAS LESEN IN EINER ANDEREN KLASSE STEHT
 * ============================================================================
 * Der Feed wird in Scheibe 4.3 auch gelesen, und Lesen BRAUCHT einen eigenen
 * `PrismaService` - es laeuft in keiner fremden Transaktion. Beides in eine
 * Klasse zu legen waere die naheliegende Loesung und wuerde die Zusage oben
 * aufheben: Sobald `this.prisma` in dieser Klasse existiert, ist es eine Frage
 * der Aufmerksamkeit, ob `protokolliere` den `tx` benutzt oder es.
 *
 * Deshalb `ActivityFeedService` als eigene Klasse. Nicht wegen CQRS oder einer
 * anderen Lehre - sondern weil die Trennung hier eine GARANTIE traegt: Was
 * nicht da ist, kann man nicht versehentlich benutzen. Dasselbe Argument wie
 * beim Nachschlagen der Mitgliedschaft im TasksService.
 */
@Injectable()
export class ActivitiesService {
  /**
   * Protokolliert ein Ereignis - innerhalb der Transaktion des Aufrufers.
   *
   * @param tx  Der Transaktionsklient der laufenden fachlichen Aenderung.
   *            KEIN optionaler Parameter mit Rueckfall auf eine eigene
   *            Verbindung: Ein optionales `tx` waere eine Einladung, es zu
   *            vergessen, und der vergessene Fall waere genau der, in dem die
   *            Garantie fehlt - ohne dass irgendetwas rot wird.
   * @param organizationId Der Mandant. Kommt aus der geprueften Mitgliedschaft,
   *            nicht aus dem Pfad.
   * @param akteurId Wer es getan hat.
   */
  async protokolliere(
    tx: Prisma.TransactionClient,
    organizationId: string,
    akteurId: string,
    ereignis: Ereignis,
  ): Promise<void> {
    const zeile = zuZeile(ereignis);

    await tx.activity.create({
      data: {
        organizationId,
        actorId: akteurId,
        type: zeile.type,
        projectId: zeile.projectId,
        taskId: zeile.taskId,
        payload: zeile.payload,
      },
    });
  }
}
