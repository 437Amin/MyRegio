import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOECHSTLAENGE,
  HOECHSTZAHL,
  SICHTBAR,
  antwortAblegen,
  antwortPruefen,
  antwortenLesen,
  antwortenVergessen,
  laufendeFahrtVon,
  type Datenbank,
} from '../src/fahrer-antwort';

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
        all: async <T>() => ({ results: roh.prepare(sql).all(...werte) as T[] }),
      }),
    }),
  };

  roh
    .prepare(
      `INSERT INTO fahrer (id, name, telefon, telegram_chat_id, anmeldecode)
       VALUES (1, 'Anna', '0171', '555', 'CODE1')`,
    )
    .run();

  const fahrtAnlegen = (id = 'A1', status = 'angenommen', beendet: string | null = null) =>
    roh
      .prepare(
        `INSERT INTO auftraege (id, art, abholung, kunde_name, kunde_telefon, fahrer_id, status, beendet_um, angenommen_um)
         VALUES (?, 'Stadtfahrt', 'Feuerbach', 'Kunde', '0711', 1, ?, ?, datetime('now'))`,
      )
      .run(id, status, beendet);

  return { db, fahrtAnlegen };
}

describe('Antwort prüfen', () => {
  it('nimmt einen gewöhnlichen Satz an', () => {
    expect(antwortPruefen('Bin in zwei Minuten da')).toEqual({
      ok: true,
      text: 'Bin in zwei Minuten da',
    });
  });

  it('übergeht Befehle', () => {
    // Ein vertipptes "/start" soll nicht beim Fahrgast auf der Seite landen
    expect(antwortPruefen('/start ABC123')).toEqual({ ok: false, grund: 'befehl' });
  });

  it('übergeht Leeres', () => {
    expect(antwortPruefen('   ').ok).toBe(false);
    expect(antwortPruefen(undefined).ok).toBe(false);
  });

  it('weist zu lange Antworten ab', () => {
    const ergebnis = antwortPruefen('a'.repeat(HOECHSTLAENGE + 1));
    expect(ergebnis.ok).toBe(false);
    expect(JSON.stringify(ergebnis)).toContain('zu lang');
  });
});

describe('Laufende Fahrt des Fahrers', () => {
  it('findet die angenommene Fahrt', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    expect(await laufendeFahrtVon(db, '555')).toEqual({ auftragId: 'A1', fahrerId: 1 });
  });

  it('findet nichts nach dem Abmelden', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen('A1', 'angenommen', '2026-10-15 20:00:00');

    expect(await laufendeFahrtVon(db, '555')).toBeNull();
  });

  it('kennt einen fremden Chat nicht', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    expect(await laufendeFahrtVon(db, '999')).toBeNull();
  });
});

describe('Antworten ablegen und lesen', () => {
  it('gibt sie in der Reihenfolge zurück, in der sie kamen', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    await antwortAblegen(db, 'A1', 'Bin unterwegs');
    await antwortAblegen(db, 'A1', 'Stehe vor dem roten Tor');

    expect(await antwortenLesen(db, 'A1')).toEqual([
      'Bin unterwegs',
      'Stehe vor dem roten Tor',
    ]);
  });

  it('zeigt nur die letzten, nicht alles', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    for (let n = 1; n <= SICHTBAR + 2; n++) await antwortAblegen(db, 'A1', `Nummer ${n}`);

    const gelesen = await antwortenLesen(db, 'A1');
    expect(gelesen).toHaveLength(SICHTBAR);
    expect(gelesen.at(-1)).toBe(`Nummer ${SICHTBAR + 2}`);
  });

  it('begrenzt die Zahl je Fahrt', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    for (let n = 0; n < HOECHSTZAHL; n++) {
      expect(await antwortAblegen(db, 'A1', `Nummer ${n}`)).toBe('abgelegt');
    }
    expect(await antwortAblegen(db, 'A1', 'eine zu viel')).toBe('zu-viele');
  });

  it('hält Fahrten auseinander', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen('A1');
    fahrtAnlegen('A2');

    await antwortAblegen(db, 'A1', 'Für die eine');
    await antwortAblegen(db, 'A2', 'Für die andere');

    expect(await antwortenLesen(db, 'A1')).toEqual(['Für die eine']);
    expect(await antwortenLesen(db, 'A2')).toEqual(['Für die andere']);
  });

  it('löscht sie nach der Fahrt', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();
    await antwortAblegen(db, 'A1', 'Bin unterwegs');

    await antwortenVergessen(db, 'A1');
    expect(await antwortenLesen(db, 'A1')).toEqual([]);
  });
});
