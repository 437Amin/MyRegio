import { describe, expect, it } from 'vitest';
import { berlinNachIso, jetztAlsFormular, zeitpunktDeutsch } from '../src/zeit';

describe('Formulareingabe in einen Zeitpunkt umrechnen', () => {
  it('rechnet Sommerzeit um (UTC+2)', () => {
    // 18.09.2026, 07:30 in Stuttgart = 05:30 UTC
    expect(berlinNachIso('2026-09-18', '07:30')).toBe('2026-09-18T05:30:00.000Z');
  });

  it('rechnet Winterzeit um (UTC+1)', () => {
    expect(berlinNachIso('2026-01-10', '07:30')).toBe('2026-01-10T06:30:00.000Z');
  });

  it('trifft die Stunde direkt vor der Umstellung im Frühjahr', () => {
    // 29.03.2026: Die Uhr springt um 02:00 auf 03:00
    expect(berlinNachIso('2026-03-29', '01:30')).toBe('2026-03-29T00:30:00.000Z');
  });

  it('legt eine Uhrzeit, die es nicht gibt, auf die Stunde danach', () => {
    // 02:30 existiert am 29.03.2026 nicht -> 03:30 deutscher Zeit = 01:30 UTC
    const iso = berlinNachIso('2026-03-29', '02:30');
    expect(iso).toBe('2026-03-29T01:30:00.000Z');
    expect(zeitpunktDeutsch(iso!)).toContain('03:30');
  });

  it('nimmt bei der doppelten Stunde im Herbst die erste', () => {
    // 25.10.2026: 02:30 gibt es zweimal - einmal in der Sommerzeit (00:30 UTC),
    // einmal in der Winterzeit (01:30 UTC)
    expect(berlinNachIso('2026-10-25', '02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('rechnet über den Jahreswechsel richtig', () => {
    // 01.01.2027 um 00:30 deutscher Zeit ist in UTC noch der 31.12.2026
    expect(berlinNachIso('2027-01-01', '00:30')).toBe('2026-12-31T23:30:00.000Z');
  });

  it('weist unlesbare Eingaben ab, statt zu raten', () => {
    for (const [datum, zeit] of [
      ['', '07:30'],
      ['2026-09-18', ''],
      ['18.09.2026', '07:30'],
      ['2026-09-18', '7.30'],
      ['2026-13-01', '07:30'],
      ['2026-09-18', '25:00'],
      ['2026-02-31', '07:30'],
    ]) {
      expect(berlinNachIso(datum!, zeit!)).toBeNull();
    }
  });
});

describe('Anzeige', () => {
  it('zeigt den Zeitpunkt in deutscher Ortszeit an', () => {
    const text = zeitpunktDeutsch('2026-09-18T05:30:00.000Z');
    expect(text).toContain('18.09.2026');
    expect(text).toContain('07:30');
  });

  it('bleibt bei unlesbaren Angaben leer', () => {
    expect(zeitpunktDeutsch('gibt es nicht')).toBe('');
  });

  it('füllt die Formularfelder mit der deutschen Ortszeit vor', () => {
    expect(jetztAlsFormular(new Date('2026-09-18T05:30:00.000Z'))).toEqual({
      datum: '2026-09-18',
      zeit: '07:30',
    });
    // Kurz vor Mitternacht in UTC ist in Deutschland schon der naechste Tag
    expect(jetztAlsFormular(new Date('2026-09-18T23:30:00.000Z'))).toEqual({
      datum: '2026-09-19',
      zeit: '01:30',
    });
  });
});
