import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { erzeugeGeheimnis, leseSchluessel, verschluessele } from './krypto';
import type { Env } from '../config/env.schema';
import type { ConnectRepositoryDto } from './dto/connect-repository.dto';

/**
 * Eine Verbindung, wie sie die API nach aussen gibt.
 *
 * Bewusst NICHT der Prisma-Typ: Der enthaelt `secretCiphertext`, `secretIv`
 * und `secretAuthTag`. Dieselbe Ueberlegung wie bei `Projekt` in Sprint 3, nur
 * mit hoeherem Einsatz - hier waere die Bequemlichkeit, den Prisma-Typ
 * durchzureichen, gleichbedeutend damit, das Geheimnis auszuliefern.
 */
export interface Verbindung {
  id: string;
  repositoryFullName: string;
  webhookUrl: string;
  createdAt: Date;
}

/**
 * Die Antwort auf das ANLEGEN - einmalig mit Geheimnis im Klartext.
 *
 * Ein eigener Typ und nicht ein optionales Feld an `Verbindung`. Ein
 * `geheimnis?: string` waere die Einladung, es versehentlich auch beim Lesen
 * mitzugeben - und niemand saehe es dem Typ an. So muss jede Stelle, die das
 * Geheimnis ausliefert, das ausdruecklich hinschreiben.
 */
export interface VerbindungMitGeheimnis extends Verbindung {
  geheimnis: string;
}

/**
 * Die Felder, die nach aussen gehen - an EINER Stelle.
 *
 * `select` und nicht "alles": Ohne diese Liste lieferte Prisma auch die drei
 * Geheimnis-Spalten. Bei `projects` war das eine Frage der Sauberkeit, hier
 * ist es der Unterschied zwischen einer Verbindung und einer Kompromittierung.
 */
const VERBINDUNGS_FELDER = {
  id: true,
  repositoryFullName: true,
  createdAt: true,
} as const;

@Injectable()
export class RepositoryConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Die URL, die der Nutzer in GitHub eintraegt.
   *
   * Die Verbindungs-ID steht IM PFAD, und das ist eine bewusste Entscheidung
   * (siehe Scheibe 5.3): Sie waehlt aus, mit welchem Geheimnis die Signatur
   * nachgerechnet wird. Die Alternative waere, das Repository aus der Nutzlast
   * zu lesen - dann waehlte ungeprueftes Material den Schluessel aus, mit dem
   * es selbst geprueft werden soll.
   *
   * Die ID ist dabei kein Geheimnis. Wer sie kennt, kann Anfragen schicken;
   * ohne das Geheimnis scheitert jede davon an der Signatur.
   */
  private webhookUrl(verbindungsId: string): string {
    return `${this.config.get('PUBLIC_BASE_URL', { infer: true })}/webhooks/github/${verbindungsId}`;
  }

  /**
   * Verbindet ein Projekt mit einem Repository.
   *
   * ==========================================================================
   * DER MANDANTENFILTER STEHT IM `WHERE`, NICHT IN EINER PRUEFUNG DANACH
   * ==========================================================================
   * Gesucht wird nicht "das Projekt mit dieser ID", sondern "das Projekt mit
   * dieser ID IN DIESER ORGANISATION". Die ID im Pfad gehoert nicht
   * automatisch zu der Organisation im Pfad - ein `findUnique` auf die
   * Projekt-ID mit anschliessendem Vergleich waere die haeufigste kritische
   * Luecke in mandantenfaehigen Anwendungen, und sie sieht harmlos aus.
   *
   * Fremdes Projekt und nicht existierendes Projekt sind damit
   * ununterscheidbar: beides 404. Ein 403 wuerde bestaetigen, dass es das
   * Projekt gibt.
   */
  async verbinde(
    organizationId: string,
    projektId: string,
    akteurId: string,
    daten: ConnectRepositoryDto,
  ): Promise<VerbindungMitGeheimnis> {
    const projekt = await this.prisma.project.findFirst({
      where: { id: projektId, organizationId },
      select: { id: true, archivedAt: true },
    });

    if (!projekt) {
      throw new NotFoundException('Projekt nicht gefunden');
    }

    // Dieselbe Regel wie beim Anlegen von Aufgaben: Ein archiviertes Projekt
    // bleibt lesbar, nimmt aber nichts Neues mehr auf. Ein Webhook daran waere
    // eine Verbindung, die still weiter Ereignisse in ein abgeschlossenes
    // Projekt schriebe.
    if (projekt.archivedAt !== null) {
      throw new ConflictException(
        'Ein archiviertes Projekt kann nicht verbunden werden',
      );
    }

    const geheimnis = erzeugeGeheimnis();
    const schluessel = leseSchluessel(
      this.config.get('WEBHOOK_ENCRYPTION_KEY', { infer: true }),
    );
    const verschluesselt = verschluessele(geheimnis, schluessel);

    /**
     * ========================================================================
     * WARUM `create` UND KEIN `upsert`
     * ========================================================================
     * Ein `upsert` waere bequemer: verbinden oder ersetzen, ein Aufruf. Er
     * wuerde aber ein bestehendes Geheimnis STILL ueberschreiben - und der
     * bereits in GitHub eingetragene Webhook waere ab diesem Moment kaputt,
     * ohne dass jemand es merkt, bis das erste Ereignis ausbleibt.
     *
     * Der Konflikt wird deshalb sichtbar gemacht: 409, und wer wirklich
     * wechseln will, trennt zuerst. Eine unumkehrbare Nebenwirkung darf nicht
     * der Standardfall eines bequemen Aufrufs sein.
     *
     * Abgefangen wird die Verletzung des UNIQUE-Constraints (P2002) und NICHT
     * vorher gelesen: Zwischen einem `findFirst` und dem `create` passen zwei
     * gleichzeitige Anfragen durch. Dieselbe Regel wie ueberall in diesem
     * Projekt - die Bedingung gehoert in die Datenbank, nicht in ein `if`
     * davor.
     */
    try {
      const verbindung = await this.prisma.repositoryConnection.create({
        data: {
          projectId: projekt.id,
          repositoryFullName: daten.repositoryFullName,
          secretCiphertext: verschluesselt.ciphertext,
          secretIv: verschluesselt.iv,
          secretAuthTag: verschluesselt.authTag,
          createdById: akteurId,
        },
        select: VERBINDUNGS_FELDER,
      });

      return {
        ...verbindung,
        webhookUrl: this.webhookUrl(verbindung.id),
        // Das einzige Mal, dass das Geheimnis den Server im Klartext verlaesst.
        // Dieselbe Entscheidung wie bei den Einladungs-Token: Wer es verliert,
        // trennt und verbindet neu.
        geheimnis,
      };
    } catch (fehler) {
      if (istEindeutigkeitVerletzt(fehler)) {
        throw new ConflictException(
          'Dieses Projekt ist bereits mit einem Repository verbunden',
        );
      }

      throw fehler;
    }
  }

  /**
   * Die Verbindung eines Projekts - ohne Geheimnis.
   *
   * `null` und keine 404, wenn es keine gibt: "Dieses Projekt hat kein
   * Repository" ist eine gueltige Auskunft ueber ein existierendes Projekt,
   * kein Fehler. Eine 404 waere hier mehrdeutig - sie hiesse entweder "Projekt
   * gibt es nicht" oder "Verbindung gibt es nicht", und der Client koennte die
   * Faelle nicht unterscheiden.
   */
  async zeige(
    organizationId: string,
    projektId: string,
  ): Promise<Verbindung | null> {
    const projekt = await this.prisma.project.findFirst({
      where: { id: projektId, organizationId },
      select: { id: true },
    });

    if (!projekt) {
      throw new NotFoundException('Projekt nicht gefunden');
    }

    const verbindung = await this.prisma.repositoryConnection.findUnique({
      where: { projectId: projekt.id },
      select: VERBINDUNGS_FELDER,
    });

    return verbindung
      ? { ...verbindung, webhookUrl: this.webhookUrl(verbindung.id) }
      : null;
  }

  /**
   * Trennt die Verbindung.
   *
   * `deleteMany` mit dem Mandantenfilter in der Bedingung statt `delete` mit
   * anschliessender Pruefung - dieselbe Regel wie ueberall. Das Ergebnis sagt
   * ueber `count`, ob etwas getroffen wurde; eine Zeile, die nicht zu dieser
   * Organisation gehoert, wird gar nicht erst geladen.
   *
   * Die bereits empfangenen Zustellungen gehen ueber `ON DELETE CASCADE` mit.
   * Die daraus ENTSTANDENEN Feed-Eintraege bleiben - sie haengen an der
   * Organisation. Was passiert ist, ist passiert.
   */
  async trenne(organizationId: string, projektId: string): Promise<void> {
    const ergebnis = await this.prisma.repositoryConnection.deleteMany({
      where: { project: { id: projektId, organizationId } },
    });

    if (ergebnis.count === 0) {
      throw new NotFoundException('Keine Verbindung gefunden');
    }
  }
}

/**
 * Prisma meldet eine verletzte Eindeutigkeit mit P2002.
 *
 * Eigene Pruefung statt `catch (fehler: any)`: `any` waere hier der Anfang
 * eines stillen Fehlers - `fehler.code` ginge auch dann durch, wenn es das
 * Feld gar nicht gibt. Dieselbe Hilfsfunktion wie bei P2025 im ProjectsService.
 */
const istEindeutigkeitVerletzt = (fehler: unknown): boolean =>
  typeof fehler === 'object' &&
  fehler !== null &&
  // Nach `'code' in fehler` kennt TypeScript das Feld bereits - eine
  // Zusicherung mit `as` waere hier nicht nur ueberfluessig, sondern
  // schaedlich: Sie wuerde die Verengung durch den `in`-Operator ersetzen
  // und damit gerade die Pruefung entwerten, die sie erlaubt.
  'code' in fehler &&
  fehler.code === 'P2002';
