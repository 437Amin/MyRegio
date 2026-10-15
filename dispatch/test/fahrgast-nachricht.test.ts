import { describe, expect, it } from 'vitest';
import {
  HOECHSTLAENGE,
  nachrichtPruefen,
  nachrichtentext,
} from '../src/fahrgast-nachricht';

describe('Nachricht prüfen', () => {
  it('nimmt eine gewöhnliche Mitteilung an', () => {
    expect(nachrichtPruefen('Ich stehe am hinteren Ausgang')).toEqual({
      ok: true,
      text: 'Ich stehe am hinteren Ausgang',
    });
  });

  it('räumt Zeilenumbrüche und doppelte Leerzeichen weg', () => {
    // In Telegram wäre jede Zeile eine eigene - für einen Zuruf zu viel
    expect(nachrichtPruefen('Bin  draußen\n\nbeim  Kiosk')).toEqual({
      ok: true,
      text: 'Bin draußen beim Kiosk',
    });
  });

  it('weist Leeres ab', () => {
    for (const wert of ['', '   ', '\n', null, undefined]) {
      expect(nachrichtPruefen(wert).ok, String(wert)).toBe(false);
    }
  });

  it('weist zu lange Nachrichten ab', () => {
    const ergebnis = nachrichtPruefen('a'.repeat(HOECHSTLAENGE + 1));
    expect(ergebnis.ok).toBe(false);
    expect(JSON.stringify(ergebnis)).toContain('kürzer');
  });

  it('lässt genau die Höchstlänge durch', () => {
    expect(nachrichtPruefen('a'.repeat(HOECHSTLAENGE)).ok).toBe(true);
  });
});

describe('Nachricht für den Fahrer', () => {
  it('nennt den Absender', () => {
    expect(nachrichtentext('Frau Keller', 'Bin am Ausgang')).toContain(
      'Nachricht von Frau Keller',
    );
  });

  it('kommt ohne Namen aus', () => {
    expect(nachrichtentext('  ', 'Bin am Ausgang')).toContain('Ihr Fahrgast');
  });

  it('maskiert HTML – der Fahrgast soll nichts unterschieben können', () => {
    // Telegram liest die Nachricht als HTML
    const text = nachrichtentext('<b>Chef</b>', '<a href="https://böse">klick</a>');

    expect(text).not.toContain('<a href');
    expect(text).toContain('&lt;a href');
    expect(text).toContain('&lt;b&gt;Chef&lt;/b&gt;');
    // Die eigene Auszeichnung bleibt erhalten
    expect(text).toContain('<b>Nachricht von');
  });
});
