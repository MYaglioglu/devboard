import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { dekodiereCursor, kodiereCursor } from './cursor';
import type { ActivityType } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import type { FeedQueryDto } from './dto/feed-query.dto';

/** Wer ein Ereignis ausgeloest hat - oder `null`, wenn das Konto weg ist. */
export interface Akteur {
  userId: string;
  name: string | null;
  email: string;
}

/** Ein Eintrag im Feed, wie ihn die API herausgibt. */
export interface FeedEintrag {
  id: string;
  type: ActivityType;
  actor: Akteur | null;
  projectId: string | null;
  taskId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
}

/**
 * Eine Seite des Feeds.
 *
 * ============================================================================
 * WARUM HIER EIN UMSCHLAG STEHT UND KEINE BLANKE LISTE
 * ============================================================================
 * Alle bisherigen Listen-Endpoints geben ein nacktes Array zurueck. Hier geht
 * das nicht: Der Client muss erfahren, ob es weitergeht und wo.
 *
 * Die Alternative waere ein `Link`-Header, wie GitHub ihn benutzt - formal
 * sauberer, weil die Navigationsangabe dann nicht mit den Daten vermischt ist.
 * Sie kostet aber jeden Client eine Kopfzeilen-Auswertung, und Kopfzeilen
 * gehen durch Proxys und Zwischenschichten leichter verloren als der Koerper.
 *
 * `nextCursor: null` heisst ausdruecklich "keine weitere Seite" - nicht
 * "unbekannt". Diesen Unterschied gibt es nur, weil eine Zeile mehr gelesen
 * wird, als ausgeliefert wird.
 */
export interface FeedSeite {
  items: FeedEintrag[];
  nextCursor: string | null;
}

/**
 * Die Felder des Feeds - an einer Stelle, wie AUFGABE_FELDER bei den Tasks.
 *
 * ============================================================================
 * DIE STELLE, AN DER EINE N+1-ABFRAGE ENTSTEHEN WUERDE
 * ============================================================================
 * Der Feed zeigt Namen ("Murat hat ..."), gespeichert ist aber nur `actorId`.
 * Der naheliegende Weg waere, ueber die Eintraege zu laufen und je Eintrag den
 * Nutzer nachzuladen: 1 Abfrage fuer die Seite, 20 fuer die Namen - die
 * klassische N+1.
 *
 * Das verschachtelte `select` verhindert das. Wichtig ist, was Prisma dabei
 * TATSAECHLICH tut, und es ist nicht das, was die meisten annehmen: Es erzeugt
 * KEINEN JOIN, sondern eine ZWEITE Abfrage der Form `WHERE id IN (...)` und
 * setzt die Ergebnisse im Speicher zusammen.
 *
 * Also zwei Abfragen, nicht eine - und das ist kein Mangel. Ein JOIN wuerde
 * die Nutzerspalten fuer JEDEN Eintrag wiederholen; bei zwanzig Eintraegen
 * desselben Akteurs kaeme derselbe Name zwanzigmal ueber die Leitung.
 * Entscheidend ist nicht, dass es eine Abfrage ist, sondern dass die Zahl
 * NICHT mit der Seitengroesse waechst.
 *
 * Wer es doch als JOIN will, kann Prisma seit Version 5 mit
 * `relationLoadStrategy: 'join'` dazu bringen. Das ist eine Messfrage, keine
 * Glaubensfrage - und in Scheibe 4.4 wird gemessen statt geglaubt.
 */
const FEED_FELDER = {
  id: true,
  type: true,
  projectId: true,
  taskId: true,
  payload: true,
  createdAt: true,
  actor: { select: { id: true, name: true, email: true } },
} as const;

interface FeedZeile {
  id: string;
  type: ActivityType;
  projectId: string | null;
  taskId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
  actor: { id: string; name: string | null; email: string } | null;
}

/**
 * `actor: null` ist nach einer Kontoloeschung der Normalfall und kein Fehler:
 * `ON DELETE SET NULL` laesst das Ereignis stehen und nimmt ihm nur die
 * Zuordnung. Das Frontend zeigt dann "Ein entferntes Mitglied".
 */
const zuFeedEintrag = (zeile: FeedZeile): FeedEintrag => ({
  id: zeile.id,
  type: zeile.type,
  actor: zeile.actor
    ? {
        userId: zeile.actor.id,
        name: zeile.actor.name,
        email: zeile.actor.email,
      }
    : null,
  projectId: zeile.projectId,
  taskId: zeile.taskId,
  payload: zeile.payload,
  createdAt: zeile.createdAt,
});

/**
 * Liest den Aktivitaets-Feed.
 *
 * Eigene Klasse neben dem `ActivitiesService` - die Begruendung steht dort:
 * Der Schreiber darf keinen eigenen `PrismaService` haben, dieser hier braucht
 * einen.
 */
@Injectable()
export class ActivityFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async findeSeite(
    organizationId: string,
    abfrage: FeedQueryDto,
  ): Promise<FeedSeite> {
    // ========================================================================
    // DER PROJEKTFILTER IST EINE PRUEFUNG, KEIN FILTER
    // ========================================================================
    // Verlockend waere, `projectId` einfach in die WHERE-Bedingung zu haengen.
    // Sicher waere das sogar: Der Mandant steht ohnehin daneben, ein fremdes
    // Projekt fuehrte also zu einer leeren Liste statt zu fremden Daten.
    //
    // Es waere trotzdem falsch - weil "leere Liste" und "gibt es nicht" fuer
    // den Client dasselbe waeren. Ein Client mit einer veralteten Projekt-ID
    // saehe einen leeren Feed und glaubte, es sei nichts passiert.
    //
    // Deshalb erst nachschlagen, dann filtern. Die Rueckmeldung ist 404 - und
    // zwar dieselbe fuer "fremdes Projekt" wie fuer "gibt es nicht", nach der
    // Regel aus Sprint 2: Fuer diesen Nutzer existiert es nicht.
    if (abfrage.projectId) {
      const projekt = await this.prisma.project.findFirst({
        where: { id: abfrage.projectId, organizationId },
        select: { id: true },
      });

      if (!projekt) {
        throw new NotFoundException('Projekt nicht gefunden');
      }
    }

    const stelle = abfrage.cursor ? dekodiereCursor(abfrage.cursor) : null;

    // Ein mitgeschickter, aber unlesbarer Cursor ist ein Fehler des Clients
    // und wird gemeldet. Ihn stillschweigend zu ignorieren und von vorne zu
    // beginnen waere die "freundlichere" Variante - und die schlechtere: Der
    // Client bekaeme dieselben Eintraege noch einmal und haette keinen
    // Hinweis, dass seine Paginierung kaputt ist. Eine Endlosschleife, die
    // wie normales Verhalten aussieht.
    if (abfrage.cursor && !stelle) {
      throw new BadRequestException('Ungültiger Cursor');
    }

    const zeilen = await this.prisma.activity.findMany({
      where: {
        // Der Mandant steht IMMER hier - unabhaengig davon, ob nach Projekt
        // gefiltert wird. Der Projektfilter ist eine Verfeinerung INNERHALB
        // des Mandanten, nicht sein Ersatz.
        organizationId,
        ...(abfrage.projectId ? { projectId: abfrage.projectId } : {}),
        ...(stelle ? { OR: keysetBedingung(stelle) } : {}),
      },
      // Dieselbe Reihenfolge wie im Index und dieselbe wie im Cursor. Weichen
      // die drei voneinander ab, ist die Paginierung still kaputt: Der Cursor
      // bezeichnet dann eine Stelle in einer anderen Ordnung als der, in der
      // gelesen wird.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // ======================================================================
      // EINE ZEILE MEHR ALS VERLANGT
      // ======================================================================
      // Nur so laesst sich "es gibt noch mehr" beantworten, ohne eine zweite
      // Abfrage (`count`) zu stellen - und ein `count` waere hier besonders
      // teuer, weil PostgreSQL dafuer die gesamte Treffermenge zaehlen muesste,
      // nicht nur die Seite.
      //
      // Die Alternative waere, `nextCursor` immer zu setzen und den Client auf
      // eine leere letzte Seite laufen zu lassen. Das kostet einen zusaetzlichen
      // Netzwerkumlauf am Ende JEDER Liste - fuer eine Zeile mehr pro Seite
      // ein schlechter Tausch.
      take: abfrage.limit + 1,
      select: FEED_FELDER,
    });

    const gibtEsMehr = zeilen.length > abfrage.limit;
    // Die Zusatzzeile wird verworfen - sie war nur die Antwort auf eine Frage,
    // nicht Teil des Ergebnisses.
    const seite = gibtEsMehr ? zeilen.slice(0, abfrage.limit) : zeilen;
    const letzter = seite.at(-1);

    return {
      items: seite.map(zuFeedEintrag),
      // `letzter` kann fehlen, wenn die Seite leer ist. Dann gibt es auch
      // nichts, worauf ein Cursor zeigen koennte.
      nextCursor:
        gibtEsMehr && letzter
          ? kodiereCursor({ createdAt: letzter.createdAt, id: letzter.id })
          : null,
    };
  }
}

/**
 * ============================================================================
 * DIE KEYSET-BEDINGUNG - WARUM SIE SO UMSTAENDLICH AUSSIEHT
 * ============================================================================
 * Gemeint ist ein Vergleich von WERTEPAAREN:
 *
 *     WHERE ("createdAt", "id") < ($1, $2)
 *
 * PostgreSQL kann das direkt, und es ist sogar die Form, die den Index am
 * besten nutzt. Prisma kann sie nicht ausdruecken - `where` vergleicht immer
 * einzelne Spalten. Ausgeschrieben heisst dasselbe:
 *
 *     WHERE "createdAt" < $1
 *        OR ("createdAt" = $1 AND "id" < $2)
 *
 * Der zweite Zweig ist der entscheidende und der, den man weglaesst, wenn man
 * es eilig hat: Er behandelt die Eintraege mit GENAU demselben Zeitstempel.
 * Ohne ihn wuerden bei einem Gleichstand an der Seitengrenze Eintraege
 * uebersprungen - und zwar genau die, die zusammen in einer Transaktion
 * entstanden sind. Der Fehler traete also bevorzugt dort auf, wo mehrere
 * Dinge auf einmal passiert sind.
 *
 * Warum `lt` und nicht `lte`: Der Cursor zeigt auf den LETZTEN gelieferten
 * Eintrag. Er selbst gehoert zur vorigen Seite und darf nicht noch einmal
 * kommen.
 *
 * Warum eine freie Funktion und keine Methode: Sie rechnet nur, sie fragt
 * nichts ab - und laesst sich damit ohne Datenbank und ohne NestJS pruefen.
 * Dieselbe Trennung wie bei `positionen.ts`.
 */
export const keysetBedingung = (stelle: {
  createdAt: Date;
  id: string;
}): Prisma.ActivityWhereInput[] => [
  { createdAt: { lt: stelle.createdAt } },
  { createdAt: stelle.createdAt, id: { lt: stelle.id } },
];
