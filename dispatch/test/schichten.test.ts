import { describe, expect, it } from 'vitest';
import { deutscheUhrzeit, istNacht, fahrerFuerZeitpunkt } from '../src/schichten';
import type { Fahrer } from '../src/typen';

/** Baut einen Fahrer mit sinnvollen Vorgaben. */
function fahrer(werte: Partial<Fahrer>): Fahrer {
  return {
    id: 1,
    name: 'Test',
    telefon: '',
    telegram_chat_id: '111',
    anmeldecode: 'ABC123',
    schicht: 'beide',
    reihenfolge: 10,
    aktiv: 1,
    ausgeschieden: 0,
    ...werte,
  };
}

describe('deutsche Ortszeit', () => {
  it('rechnet die Sommerzeit korrekt um', () => {
    // 21:00 UTC im Juli = 23:00 in Deutschland (MESZ, UTC+2)
    expect(deutscheUhrzeit(new Date('2026-07-15T21:00:00Z'))).toEqual({
      stunde: 23,
      minute: 0,
    });
  });

  it('rechnet die Winterzeit korrekt um', () => {
    // 21:00 UTC im Januar = 22:00 in Deutschland (MEZ, UTC+1)
    expect(deutscheUhrzeit(new Date('2026-01-15T21:00:00Z'))).toEqual({
      stunde: 22,
      minute: 0,
    });
  });

  it('liefert Mitternacht als 0 und nicht als 24', () => {
    expect(deutscheUhrzeit(new Date('2026-01-15T23:00:00Z')).stunde).toBe(0);
  });
});

describe('Nachtfenster', () => {
  it('erkennt 23:00 deutscher Sommerzeit als Nacht', () => {
    // Ohne Zeitzonenumrechnung waere das 21:00 UTC und faelschlich Tag
    expect(istNacht(new Date('2026-07-15T21:00:00Z'))).toBe(true);
  });

  it('erkennt 14:00 als Tag', () => {
    expect(istNacht(new Date('2026-07-15T12:00:00Z'))).toBe(false);
  });

  it('erkennt 02:00 nachts als Nacht', () => {
    expect(istNacht(new Date('2026-07-15T00:00:00Z'))).toBe(true);
  });

  it('endet punktgenau um 06:00', () => {
    // 03:59 UTC = 05:59 deutsch -> noch Nacht
    expect(istNacht(new Date('2026-07-15T03:59:00Z'))).toBe(true);
    // 04:00 UTC = 06:00 deutsch -> schon Tag
    expect(istNacht(new Date('2026-07-15T04:00:00Z'))).toBe(false);
  });

  it('kommt auch mit einem Fenster ohne Mitternacht zurecht', () => {
    // 01:00 - 05:00
    expect(istNacht(new Date('2026-07-15T00:00:00Z'), '01:00', '05:00')).toBe(true);
    expect(istNacht(new Date('2026-07-15T21:00:00Z'), '01:00', '05:00')).toBe(false);
  });
});

describe('Fahrerauswahl', () => {
  const tagsUeber = new Date('2026-07-15T12:00:00Z'); // 14:00 deutsch
  const nachts = new Date('2026-07-15T21:00:00Z'); // 23:00 deutsch

  it('fragt tagsüber Tag- und Allzeitfahrer, aber keine Nachtfahrer', () => {
    const alle = [
      fahrer({ id: 1, name: 'Tag', schicht: 'tag' }),
      fahrer({ id: 2, name: 'Nacht', schicht: 'nacht' }),
      fahrer({ id: 3, name: 'Beide', schicht: 'beide' }),
    ];
    expect(fahrerFuerZeitpunkt(alle, tagsUeber).map((f) => f.name)).toEqual([
      'Tag',
      'Beide',
    ]);
  });

  it('fragt nachts Nacht- und Allzeitfahrer', () => {
    const alle = [
      fahrer({ id: 1, name: 'Tag', schicht: 'tag' }),
      fahrer({ id: 2, name: 'Nacht', schicht: 'nacht' }),
      fahrer({ id: 3, name: 'Beide', schicht: 'beide' }),
    ];
    expect(fahrerFuerZeitpunkt(alle, nachts).map((f) => f.name)).toEqual([
      'Nacht',
      'Beide',
    ]);
  });

  it('überspringt abgemeldete Fahrer', () => {
    const alle = [fahrer({ id: 1, aktiv: 0 }), fahrer({ id: 2, name: 'Aktiv' })];
    expect(fahrerFuerZeitpunkt(alle, tagsUeber).map((f) => f.name)).toEqual([
      'Aktiv',
    ]);
  });

  it('überspringt Fahrer ohne Telegram-Anmeldung', () => {
    // Wer den Bot nie gestartet hat, koennte die Nachricht gar nicht empfangen
    const alle = [
      fahrer({ id: 1, name: 'Ohne', telegram_chat_id: null }),
      fahrer({ id: 2, name: 'Mit' }),
    ];
    expect(fahrerFuerZeitpunkt(alle, tagsUeber).map((f) => f.name)).toEqual([
      'Mit',
    ]);
  });

  it('fragt ausgetragene Fahrer nie – selbst wenn sie noch aktiv wären', () => {
    // Doppelte Sicherung: Beim Austragen werden aktiv und Telegram ohnehin
    // zurueckgesetzt. Hier wird geprueft, dass der Filter auch allein greift.
    const alle = [
      fahrer({ id: 1, name: 'Ausgetragen', ausgeschieden: 1 }),
      fahrer({ id: 2, name: 'Dabei' }),
    ];
    expect(fahrerFuerZeitpunkt(alle, tagsUeber).map((f) => f.name)).toEqual([
      'Dabei',
    ]);
  });

  it('hält die eingestellte Reihenfolge ein', () => {
    const alle = [
      fahrer({ id: 1, name: 'Dritter', reihenfolge: 30 }),
      fahrer({ id: 2, name: 'Erster', reihenfolge: 10 }),
      fahrer({ id: 3, name: 'Zweiter', reihenfolge: 20 }),
    ];
    expect(fahrerFuerZeitpunkt(alle, tagsUeber).map((f) => f.name)).toEqual([
      'Erster',
      'Zweiter',
      'Dritter',
    ]);
  });

  it('gibt eine leere Liste zurück, wenn niemand eingeteilt ist', () => {
    const alle = [fahrer({ id: 1, schicht: 'tag' })];
    expect(fahrerFuerZeitpunkt(alle, nachts)).toEqual([]);
  });
});
