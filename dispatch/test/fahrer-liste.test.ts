import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gueltigerWunschfahrer,
  oeffentlicheFahrer,
  type Datenbank,
} from '../src/fahrer-liste';
import type { Fahrer } from '../src/typen';

function fahrer(werte: Partial<Fahrer>): Fahrer {
  return {
    id: 1,
    name: 'Anna Beispiel',
    telefon: '+491700000001',
    telegram_chat_id: '101',
    anmeldecode: 'AAA111',
    schicht: 'beide',
    reihenfolge: 10,
    aktiv: 1,
    ausgeschieden: 0,
    ...werte,
  };
}

describe('Fahrerliste für die Website', () => {
  it('gibt nur Nummer und Vornamen heraus', () => {
    expect(oeffentlicheFahrer([fahrer({ id: 7, name: 'Anna Beispiel' })])).toEqual([
      { id: 7, name: 'Anna' },
    ]);
  });

  it('gibt weder Telefonnummer noch Anmeldecode preis', () => {
    const [eintrag] = oeffentlicheFahrer([fahrer({ telefon: '+4917612345', anmeldecode: 'GEHEIM' })]);
    expect(JSON.stringify(eintrag)).not.toContain('4917612345');
    expect(JSON.stringify(eintrag)).not.toContain('GEHEIM');
    expect(Object.keys(eintrag!).sort()).toEqual(['id', 'name']);
  });

  it('lässt aus, wer nicht erreichbar wäre', () => {
    const alle = [
      fahrer({ id: 1, name: 'Dabei' }),
      fahrer({ id: 2, name: 'Inaktiv', aktiv: 0 }),
      fahrer({ id: 3, name: 'Ausgetragen', ausgeschieden: 1 }),
      fahrer({ id: 4, name: 'Ohne Telegram', telegram_chat_id: null }),
    ];
    expect(oeffentlicheFahrer(alle).map((f) => f.name)).toEqual(['Dabei']);
  });

  it('hält die eingestellte Reihenfolge ein', () => {
    const alle = [
      fahrer({ id: 1, name: 'Dritter Mann', reihenfolge: 30 }),
      fahrer({ id: 2, name: 'Erster Mann', reihenfolge: 10 }),
      fahrer({ id: 3, name: 'Zweiter Mann', reihenfolge: 20 }),
    ];
    expect(oeffentlicheFahrer(alle).map((f) => f.name)).toEqual([
      'Erster',
      'Zweiter',
      'Dritter',
    ]);
  });

  it('unterscheidet zwei gleiche Vornamen über den Nachnamen', () => {
    const alle = [
      fahrer({ id: 1, name: 'Mehmet Yilmaz', reihenfolge: 10 }),
      fahrer({ id: 2, name: 'Mehmet Kaya', reihenfolge: 20 }),
      fahrer({ id: 3, name: 'Anna Beispiel', reihenfolge: 30 }),
    ];
    expect(oeffentlicheFahrer(alle).map((f) => f.name)).toEqual([
      'Mehmet Y.',
      'Mehmet K.',
      'Anna',
    ]);
  });

  it('kommt mit einem einzelnen Namen ohne Nachnamen zurecht', () => {
    const alle = [
      fahrer({ id: 1, name: 'Mehmet', reihenfolge: 10 }),
      fahrer({ id: 2, name: 'Mehmet', reihenfolge: 20 }),
    ];
    // Keine Erfindung: Ohne Nachnamen bleibt es beim Vornamen
    expect(oeffentlicheFahrer(alle).map((f) => f.name)).toEqual(['Mehmet', 'Mehmet']);
  });

  it('gibt eine leere Liste zurück, wenn niemand auswählbar ist', () => {
    expect(oeffentlicheFahrer([])).toEqual([]);
    expect(oeffentlicheFahrer([fahrer({ aktiv: 0 })])).toEqual([]);
  });
});

// node:sqlite ueber require laden: Vite kennt das Modul nicht als eingebautes
// Node-Modul und wuerde beim normalen Import stolpern.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/** Echte SQLite-Datenbank mit unserem Schema - wie D1 mit Verweis-Pruefung. */
function testDatenbank() {
  const roh = new DatabaseSync(':memory:');
  roh.exec('PRAGMA foreign_keys = ON');
  const schema = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
  roh.exec(readFileSync(schema, 'utf8'));

  const db: Datenbank = {
    prepare: (sql) => ({
      bind: (...werte) => ({
        first: async <T>() => (roh.prepare(sql).get(...werte) ?? null) as T | null,
      }),
    }),
  };

  const fahrerAnlegen = (id: number, name: string, ausgeschieden = 0) =>
    roh
      .prepare(
        `INSERT INTO fahrer (id, name, telefon, telegram_chat_id, anmeldecode, ausgeschieden)
         VALUES (?, ?, '0171 1234567', '555', ?, ?)`,
      )
      .run(id, name, `CODE${id}`, ausgeschieden);

  const auftragAnlegen = (id: string, wunschFahrerId: number | null) =>
    roh
      .prepare(
        `INSERT INTO auftraege (id, art, abholung, kunde_name, kunde_telefon, wunsch_fahrer_id)
         VALUES (?, 'Stadtfahrt', 'Feuerbach', 'Kunde', '0711', ?)`,
      )
      .run(id, wunschFahrerId);

  return { db, fahrerAnlegen, auftragAnlegen };
}

describe('Wunschfahrer pruefen, bevor er in die Datenbank geht', () => {
  it('nimmt die Nummer eines vorhandenen Fahrers an', async () => {
    const { db, fahrerAnlegen } = testDatenbank();
    fahrerAnlegen(7, 'Anna Beispiel');

    expect(await gueltigerWunschfahrer(7, db)).toBe(7);
    expect(await gueltigerWunschfahrer('7', db)).toBe(7);
  });

  it('verwirft eine Nummer, die es nicht gibt - die Fahrt laeuft weiter', async () => {
    const { db, fahrerAnlegen } = testDatenbank();
    fahrerAnlegen(7, 'Anna Beispiel');

    // Genau dieser Fall liess vorher die ganze Bestellung scheitern
    expect(await gueltigerWunschfahrer(999, db)).toBeNull();
  });

  it('verwirft einen ausgetragenen Fahrer', async () => {
    const { db, fahrerAnlegen } = testDatenbank();
    fahrerAnlegen(7, 'Ehemalig', 1);

    expect(await gueltigerWunschfahrer(7, db)).toBeNull();
  });

  it('verwirft Unsinn, ohne die Datenbank zu fragen', async () => {
    const { db } = testDatenbank();

    for (const wert of [undefined, null, '', 'egal', 0, -3, Number.NaN, {}, []]) {
      expect(await gueltigerWunschfahrer(wert, db)).toBeNull();
    }
  });

  it('belegt, warum geprueft werden muss: die Datenbank weist Unbekannte ab', async () => {
    const { auftragAnlegen, fahrerAnlegen } = testDatenbank();
    fahrerAnlegen(7, 'Anna Beispiel');

    // Ohne Wunsch und mit einem vorhandenen Fahrer geht der Auftrag durch
    expect(() => auftragAnlegen('A1', null)).not.toThrow();
    expect(() => auftragAnlegen('A2', 7)).not.toThrow();
    // Mit einer unbekannten Nummer scheitert der Eintrag am Fremdschluessel
    expect(() => auftragAnlegen('A3', 999)).toThrow(/FOREIGN KEY/i);
  });
});
