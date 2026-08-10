import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Wandelt jede geworfene Ausnahme in eine einheitliche HTTP-Antwort.
 *
 * ============================================================================
 * WARUM DAS EINE SICHERHEITSMASSNAHME IST
 * ============================================================================
 * Ohne Filter beantwortet NestJS unerwartete Fehler mit einem 500er - und je
 * nach Konfiguration steht dann ein Stacktrace im Antwortkoerper. Der verraet
 * Dateipfade, Bibliotheksversionen und Teile des Quelltexts. Genau daraus baut
 * ein Angreifer sein Bild vom System.
 *
 * Regel: Nach INNEN alles protokollieren, nach AUSSEN nur das Noetige.
 *
 * ============================================================================
 * WARUM BEKANNTE FEHLER ANDERS BEHANDELT WERDEN
 * ============================================================================
 * Eine `HttpException` ist eine ABSICHTLICHE Aussage des Codes
 * ("E-Mail bereits vergeben", "Sitzung ungueltig"). Ihre Meldung ist fuer
 * Nutzer gedacht und wird unveraendert durchgereicht.
 *
 * Alles andere ist ein unerwarteter Fehler. Dessen Meldung ist fuer
 * Entwickelnde gedacht - sie geht ins Log, nicht zum Nutzer.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(ausnahme: unknown, host: ArgumentsHost): void {
    const kontext = host.switchToHttp();
    const antwort = kontext.getResponse<Response>();
    const anfrage = kontext.getRequest<Request>();

    const istBekannt = ausnahme instanceof HttpException;
    const status = istBekannt
      ? ausnahme.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (istBekannt) {
      // Absichtliche Aussage des Codes - Inhalt unveraendert durchreichen.
      // Dadurch bleiben die feldbezogenen Meldungen der Zod-Pipe erhalten.
      const inhalt = ausnahme.getResponse();

      antwort
        .status(status)
        .json(
          typeof inhalt === 'string'
            ? { statusCode: status, message: inhalt, path: anfrage.url }
            : { ...inhalt, path: anfrage.url },
        );
      return;
    }

    // Unerwarteter Fehler: vollstaendig protokollieren...
    this.logger.error(
      `Unerwarteter Fehler bei ${anfrage.method} ${anfrage.url}`,
      ausnahme instanceof Error ? ausnahme.stack : String(ausnahme),
    );

    // ...nach aussen aber nichts verraten.
    antwort.status(status).json({
      statusCode: status,
      message: 'Interner Serverfehler',
      path: anfrage.url,
    });
  }
}
