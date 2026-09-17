import { describe, expect, it } from 'vitest';
import {
  HOECHSTDAUER_MINUTEN,
  belegteFahrerIds,
  dauerMinuten,
  type LaufenderAuftrag,
} from '../src/belegung';

/** Ein laufender Auftrag mit sinnvollen Vorgaben. */
function auftrag(werte: Partial<LaufenderAuftrag>): LaufenderAuftrag {
  return {
    fahrer_id: 1,
    wunsch_iso: '',
    sofort: 1,
    eingang: '2026-09-18 08:00:00',
    strecke_km: 0,
    ...werte,
  };
}

describe('geschätzte Dauer', () => {
  it('rechnet zwei Minuten je Kilometer auf die Grunddauer', () => {
    expect(dauerMinuten(0)).toBe(60);
    expect(dauerMinuten(18.8)).toBe(98);
  });

  it('deckelt Fernfahrten, damit niemand halbe Tage gesperrt ist', () => {
    expect(dauerMinuten(500)).toBe(HOECHSTDAUER_MINUTEN);
  });

  it('verkraftet unsinnige Kilometerangaben', () => {
    expect(dauerMinuten(-5)).toBe(60);
  });
});

describe('Wer ist belegt?', () => {
  it('sperrt den Fahrer während seiner Fahrt', () => {
    const laufend = [auftrag({ fahrer_id: 7, strecke_km: 10 })]; // 80 Minuten
    // Eine halbe Stunde nach dem Beginn
    const belegt = belegteFahrerIds(laufend, new Date('2026-09-18T08:30:00Z'));
    expect([...belegt]).toEqual([7]);
  });

  it('gibt ihn nach der geschätzten Dauer wieder frei', () => {
    const laufend = [auftrag({ fahrer_id: 7, strecke_km: 10 })]; // 80 Minuten
    expect(belegteFahrerIds(laufend, new Date('2026-09-18T09:30:00Z')).size).toBe(0);
  });

  it('sperrt eine Vorbestellung für morgen nicht', () => {
    // Genau der Fall aus der Praxis: Der Fahrer ist jetzt unterwegs, die neue
    // Fahrt ist für morgen früh - er soll sie trotzdem angeboten bekommen.
    const laufend = [auftrag({ fahrer_id: 7, strecke_km: 10 })];
    expect(belegteFahrerIds(laufend, new Date('2026-09-19T07:00:00Z')).size).toBe(0);
  });

  it('sperrt schon ab dem Beginn einer Vorbestellung, nicht ab ihrem Eingang', () => {
    const laufend = [
      auftrag({
        fahrer_id: 7,
        sofort: 0,
        wunsch_iso: '2026-09-18T14:00:00.000Z',
        eingang: '2026-09-17 09:00:00',
      }),
    ];
    // Kurz nach dem Eingang, lange vor der Fahrt: frei
    expect(belegteFahrerIds(laufend, new Date('2026-09-17T09:30:00Z')).size).toBe(0);
    // Waehrend der Fahrt: belegt
    expect([...belegteFahrerIds(laufend, new Date('2026-09-18T14:30:00Z'))]).toEqual([7]);
  });

  it('nimmt bei „so bald wie möglich“ den Eingang als Beginn', () => {
    const laufend = [auftrag({ fahrer_id: 3, sofort: 1, eingang: '2026-09-18 20:00:00' })];
    expect([...belegteFahrerIds(laufend, new Date('2026-09-18T20:15:00Z'))]).toEqual([3]);
    expect(belegteFahrerIds(laufend, new Date('2026-09-18T19:45:00Z')).size).toBe(0);
  });

  it('liest den Zeitstempel der Datenbank als UTC', () => {
    // SQLite liefert "2026-09-18 20:00:00" ohne Zeitzone. Wird das als
    // Ortszeit gelesen, verschiebt sich die Sperre um zwei Stunden.
    const laufend = [auftrag({ fahrer_id: 3, eingang: '2026-09-18 20:00:00' })];
    expect(belegteFahrerIds(laufend, new Date('2026-09-18T18:30:00Z')).size).toBe(0);
  });

  it('sammelt mehrere Fahrer und übergeht Aufträge ohne Fahrer', () => {
    const laufend = [
      auftrag({ fahrer_id: 1 }),
      auftrag({ fahrer_id: 2 }),
      auftrag({ fahrer_id: 0 }),
    ];
    expect([...belegteFahrerIds(laufend, new Date('2026-09-18T08:10:00Z'))].sort()).toEqual([1, 2]);
  });
});
