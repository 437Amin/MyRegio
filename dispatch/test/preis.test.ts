import { describe, expect, it } from 'vitest';
import {
  preisBerechnen,
  taxiVergleich,
  tarifAusEinstellungen,
  STANDARD_TARIF,
} from '../src/preis';

describe('Festpreis', () => {
  it('rechnet die Flughafenstrecke wie besprochen', () => {
    // 22 km: 3,50 + 4 × 2,60 + 18 × 2,20 = 53,50
    expect(preisBerechnen(22, STANDARD_TARIF)).toBe(53.5);
  });

  it('wechselt bei 4 km auf den günstigeren Kilometerpreis', () => {
    // Genau an der Grenze: 3,50 + 4 × 2,60 = 13,90 -> aufgerundet 14,00
    expect(preisBerechnen(4, STANDARD_TARIF)).toBe(14);
    // Ein Kilometer mehr kostet nur noch 2,20 statt 2,60
    expect(preisBerechnen(5, STANDARD_TARIF)).toBe(16.5);
  });

  it('rundet immer auf, nie ab', () => {
    // 10 km: 3,50 + 10,40 + 13,20 = 27,10 -> 27,50
    expect(preisBerechnen(10, STANDARD_TARIF)).toBe(27.5);
  });

  it('hält den Mindestpreis ein', () => {
    // 1 km käme rechnerisch auf 6,10 - der Mindestpreis greift
    expect(preisBerechnen(1, STANDARD_TARIF)).toBe(12);
    expect(preisBerechnen(0, STANDARD_TARIF)).toBe(12);
    // 2 km: 3,50 + 5,20 = 8,70 -> ebenfalls Mindestpreis
    expect(preisBerechnen(2, STANDARD_TARIF)).toBe(12);
  });

  it('liegt bei allen üblichen Strecken unter dem Taxitarif', () => {
    for (const km of [5, 8, 10, 15, 22, 30, 50]) {
      const unser = preisBerechnen(km, STANDARD_TARIF);
      const taxi = taxiVergleich(km);
      expect(unser, `${km} km`).toBeLessThan(taxi);
    }
  });

  it('liegt bei längeren Strecken etwa 12 bis 15 Prozent unter dem Taxi', () => {
    for (const km of [10, 22, 50]) {
      const ersparnis =
        (1 - preisBerechnen(km, STANDARD_TARIF) / taxiVergleich(km)) * 100;
      expect(ersparnis, `${km} km`).toBeGreaterThan(10);
      expect(ersparnis, `${km} km`).toBeLessThan(16);
    }
  });

  it('weist unsinnige Strecken ab, statt einen Preis zu erfinden', () => {
    expect(() => preisBerechnen(-1, STANDARD_TARIF)).toThrow();
    expect(() => preisBerechnen(Number.NaN, STANDARD_TARIF)).toThrow();
  });

  it('liefert saubere Beträge ohne Nachkomma-Reste', () => {
    for (let km = 0; km <= 60; km += 0.3) {
      const preis = preisBerechnen(km, STANDARD_TARIF);
      expect(Math.round(preis * 100)).toBe(preis * 100);
    }
  });
});

describe('Tarif aus den Einstellungen', () => {
  it('übernimmt hinterlegte Werte', () => {
    const tarif = tarifAusEinstellungen({
      tarif_grundpreis: '4',
      tarif_preis_nah: '3',
      tarif_preis_fern: '2.5',
      tarif_km_grenze: '5',
      tarif_mindestpreis: '15',
      tarif_rundung: '1',
    });
    expect(tarif.grundpreis).toBe(4);
    expect(tarif.mindestpreis).toBe(15);
    // 10 km: 4 + 5×3 + 5×2,50 = 31,50 -> auf volle Euro aufgerundet
    expect(preisBerechnen(10, tarif)).toBe(32);
  });

  it('fällt bei fehlenden oder unsinnigen Werten auf den Standard zurück', () => {
    const tarif = tarifAusEinstellungen({ tarif_grundpreis: 'abc' });
    expect(tarif).toEqual(STANDARD_TARIF);
  });
});
