import { describe, expect, it } from 'vitest';

import { sichererPfad } from './weiterleitung';

describe('sichererPfad', () => {
  it('laesst einen einfachen Pfad durch', () => {
    expect(sichererPfad('/organizations', '/dashboard')).toBe('/organizations');
  });

  it('laesst Pfad mit Abfrageteil durch', () => {
    expect(sichererPfad('/einladung?token=abc', '/dashboard')).toBe(
      '/einladung?token=abc',
    );
  });

  it('faellt ohne Wert auf den Ersatz zurueck', () => {
    expect(sichererPfad(null, '/dashboard')).toBe('/dashboard');
    expect(sichererPfad(undefined, '/dashboard')).toBe('/dashboard');
    expect(sichererPfad('', '/dashboard')).toBe('/dashboard');
  });

  /**
   * ==========================================================================
   * DIE FAELLE, UM DIE ES GEHT - OPEN REDIRECT
   * ==========================================================================
   * Ohne diese Pruefung bestimmt der Absender des Links, wohin der Nutzer nach
   * der Anmeldung geschickt wird. Er sieht eine echte DevBoard-Adresse, meldet
   * sich an - und landet auf einer nachgebauten Seite, die ihn erneut nach
   * seinen Zugangsdaten fragt.
   */
  it('weist eine absolute Adresse ab', () => {
    expect(sichererPfad('https://boese.example', '/dashboard')).toBe(
      '/dashboard',
    );
    expect(sichererPfad('http://boese.example/login', '/dashboard')).toBe(
      '/dashboard',
    );
  });

  /**
   * Der Klassiker: Eine Pruefung auf "beginnt mit einem Schraegstrich" laesst
   * das durch. Der Browser ergaenzt das Protokoll der aktuellen Seite - und
   * der Nutzer landet auf einem FREMDEN Host.
   */
  it('weist eine protokollrelative Adresse ab', () => {
    expect(sichererPfad('//boese.example', '/dashboard')).toBe('/dashboard');
    expect(sichererPfad('//boese.example/login', '/dashboard')).toBe(
      '/dashboard',
    );
  });

  it('weist Backslash-Varianten ab', () => {
    // Manche Browser behandeln \ wie /, damit waere auch das
    // protokollrelativ.
    expect(sichererPfad('/\\boese.example', '/dashboard')).toBe('/dashboard');
    expect(sichererPfad('\\\\boese.example', '/dashboard')).toBe('/dashboard');
  });

  it('weist ein Skript-Schema ab', () => {
    expect(sichererPfad('javascript:alert(1)', '/dashboard')).toBe(
      '/dashboard',
    );
  });

  it('weist einen Pfad ohne fuehrenden Schraegstrich ab', () => {
    // Ohne fuehrenden Schraegstrich waere es relativ zur aktuellen Seite -
    // schwer vorhersagbar und deshalb nicht erlaubt.
    expect(sichererPfad('organizations', '/dashboard')).toBe('/dashboard');
  });
});
