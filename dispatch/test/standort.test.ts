import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  standortAusNachricht,
  standortLesen,
  standortMerken,
  standortVergessen,
  type Datenbank,
} from '../src/standort';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function testDatenbank() {
  const roh = new DatabaseSync(':memory:');
  roh.exec('PRAGMA foreign_keys = ON');
  const schema = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
  roh.exec(readFileSync(schema, 'utf8'));

  const db: Datenbank = {
    prepare: (sql) => ({
      bind: (...werte) => ({
        run: async () => roh.prepare(sql).run(...werte),
        first: async <T>() => (roh.prepare(sql).get(...werte) ?? null) as T | null,
      }),
    }),
  };

  roh
    .prepare(
      `INSERT INTO fahrer (id, name, telefon, telegram_chat_id, anmeldecode)
       VALUES (1, 'Anna', '0171', '555', 'CODE1')`,
    )
    .run();

  const fahrtAnlegen = (status = 'angenommen', beendet: string | null = null) =>
    roh
      .prepare(
        `INSERT INTO auftraege (id, art, abholung, kunde_name, kunde_telefon, fahrer_id, status, beendet_um)
         VALUES ('A1', 'Stadtfahrt', 'Feuerbach', 'Kunde', '0711', 1, ?, ?)`,
      )
      .run(status, beendet);

  const zeilen = () =>
    roh.prepare('SELECT * FROM fahrer_standort').all() as Record<string, unknown>[];

  return { db, fahrtAnlegen, zeilen };
}

const ORT = { breite: 48.81, laenge: 9.17 };

describe('Standort aus einer Telegram-Nachricht', () => {
  it('liest Breite und Länge', () => {
    expect(standortAusNachricht({ location: { latitude: 48.8, longitude: 9.2 } })).toEqual({
      breite: 48.8,
      laenge: 9.2,
    });
  });

  it('erkennt eine Nachricht ohne Standort', () => {
    expect(standortAusNachricht({ text: 'Bin unterwegs' })).toBeNull();
    expect(standortAusNachricht(null)).toBeNull();
    expect(standortAusNachricht(undefined)).toBeNull();
  });

  it('weist unbrauchbare Werte ab', () => {
    // 0/0 liegt im Atlantik - Telegram schickt das nie, als Vorgabewert
    // entsteht es aber leicht
    expect(standortAusNachricht({ location: { latitude: 0, longitude: 0 } })).toBeNull();
    expect(standortAusNachricht({ location: { latitude: 95, longitude: 9 } })).toBeNull();
    expect(standortAusNachricht({ location: { latitude: 48, longitude: 200 } })).toBeNull();
    expect(standortAusNachricht({ location: { latitude: 'hier', longitude: 9 } })).toBeNull();
  });
});

describe('Standort merken', () => {
  it('speichert ihn während einer laufenden Fahrt', async () => {
    const { db, fahrtAnlegen, zeilen } = testDatenbank();
    fahrtAnlegen();

    expect(await standortMerken(db, '555', ORT)).toBe('gemerkt');
    expect(zeilen()).toHaveLength(1);
    expect(zeilen()[0]).toMatchObject({ fahrer_id: 1, breite: 48.81, laenge: 9.17 });
  });

  it('speichert NICHTS ohne laufende Fahrt', async () => {
    // Der Unterschied zwischen "weiß, wo der Wagen ist" und "zeichnet auf,
    // wo der Fahrer war"
    const { db, zeilen } = testDatenbank();

    expect(await standortMerken(db, '555', ORT)).toBe('keine-fahrt');
    expect(zeilen()).toHaveLength(0);
  });

  it('speichert nichts mehr, sobald die Fahrt abgemeldet ist', async () => {
    const { db, fahrtAnlegen, zeilen } = testDatenbank();
    fahrtAnlegen('angenommen', '2026-10-14 18:00:00');

    expect(await standortMerken(db, '555', ORT)).toBe('keine-fahrt');
    expect(zeilen()).toHaveLength(0);
  });

  it('kennt einen fremden Chat nicht', async () => {
    const { db, fahrtAnlegen, zeilen } = testDatenbank();
    fahrtAnlegen();

    expect(await standortMerken(db, '999', ORT)).toBe('unbekannt');
    expect(zeilen()).toHaveLength(0);
  });

  it('führt keinen Verlauf, sondern überschreibt', async () => {
    const { db, fahrtAnlegen, zeilen } = testDatenbank();
    fahrtAnlegen();

    await standortMerken(db, '555', ORT);
    await standortMerken(db, '555', { breite: 48.79, laenge: 9.18 });

    expect(zeilen()).toHaveLength(1);
    expect(zeilen()[0]).toMatchObject({ breite: 48.79, laenge: 9.18 });
  });
});

describe('Standort vergessen', () => {
  it('löscht den Eintrag', async () => {
    const { db, fahrtAnlegen, zeilen } = testDatenbank();
    fahrtAnlegen();
    await standortMerken(db, '555', ORT);

    await standortVergessen(db, 1);
    expect(zeilen()).toHaveLength(0);
  });

  it('stört sich nicht daran, wenn gar keiner da ist', async () => {
    const { db } = testDatenbank();
    await expect(standortVergessen(db, 1)).resolves.toBeUndefined();
  });
});

describe('Standort lesen', () => {
  it('liefert den letzten Punkt mit Zeitpunkt', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();
    await standortMerken(db, '555', ORT);

    const gelesen = await standortLesen(db, 1);
    expect(gelesen).toMatchObject({ breite: 48.81, laenge: 9.17 });
    expect(gelesen?.zeitpunkt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('liefert null, wenn nichts gemeldet wurde', async () => {
    const { db } = testDatenbank();
    expect(await standortLesen(db, 1)).toBeNull();
  });
});
