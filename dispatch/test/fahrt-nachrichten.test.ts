import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOECHSTLAENGE,
  HOECHSTZAHL,
  SICHTBAR,
  laufendeFahrtVon,
  nachrichtAblegen,
  nachrichtPruefen,
  uhrzeit,
  verlaufLesen,
  verlaufVergessen,
  type Datenbank,
} from '../src/fahrt-nachrichten';

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

  const fahrtAnlegen = (id = 'A1', beendet: string | null = null) =>
    roh
      .prepare(
        `INSERT INTO auftraege (id, art, abholung, kunde_name, kunde_telefon, fahrer_id, status, beendet_um, angenommen_um)
         VALUES (?, 'Stadtfahrt', 'Feuerbach', 'Kunde', '0711', 1, 'angenommen', ?, datetime('now'))`,
      )
      .run(id, beendet);

  return { db, fahrtAnlegen };
}

describe('Nachricht prüfen', () => {
  it('nimmt einen gewöhnlichen Satz an', () => {
    expect(nachrichtPruefen('Bin in zwei Minuten da')).toEqual({
      ok: true,
      text: 'Bin in zwei Minuten da',
    });
  });

  it('übergeht Befehle', () => {
    // Ein vertipptes "/start" soll nicht im Verlauf des Fahrgasts landen
    expect(nachrichtPruefen('/start ABC123')).toEqual({ ok: false, grund: 'befehl' });
  });

  it('übergeht Leeres', () => {
    expect(nachrichtPruefen('   ').ok).toBe(false);
    expect(nachrichtPruefen(undefined).ok).toBe(false);
  });

  it('weist zu lange Nachrichten ab', () => {
    const ergebnis = nachrichtPruefen('a'.repeat(HOECHSTLAENGE + 1));
    expect(ergebnis.ok).toBe(false);
    expect(JSON.stringify(ergebnis)).toContain('zu lang');
  });
});

describe('Uhrzeit', () => {
  it('rechnet die gespeicherte Zeit nach deutscher Ortszeit um', () => {
    // SQLite speichert UTC ohne Zeitzone - im Sommer sind das zwei Stunden
    expect(uhrzeit('2026-07-15 18:41:00')).toBe('20:41');
  });

  it('rechnet im Winter eine Stunde', () => {
    expect(uhrzeit('2026-01-15 18:41:00')).toBe('19:41');
  });

  it('kommt mit Unlesbarem zurecht', () => {
    expect(uhrzeit('gestern')).toBe('');
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
    fahrtAnlegen('A1', '2026-10-15 20:00:00');

    expect(await laufendeFahrtVon(db, '555')).toBeNull();
  });

  it('kennt einen fremden Chat nicht', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    expect(await laufendeFahrtVon(db, '999')).toBeNull();
  });
});

describe('Verlauf', () => {
  it('zeigt beide Seiten in der Reihenfolge, in der sie kamen', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    await nachrichtAblegen(db, 'A1', 'fahrgast', 'Ich stehe am hinteren Ausgang');
    await nachrichtAblegen(db, 'A1', 'fahrer', 'Bin in zwei Minuten da');

    const verlauf = await verlaufLesen(db, 'A1');
    expect(verlauf.map((n) => [n.von, n.text])).toEqual([
      ['fahrgast', 'Ich stehe am hinteren Ausgang'],
      ['fahrer', 'Bin in zwei Minuten da'],
    ]);
    expect(verlauf[0]!.zeit).toMatch(/^\d{2}:\d{2}$/);
  });

  it('zeigt nur die letzten, nicht alles', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    for (let n = 1; n <= SICHTBAR + 2; n++) {
      await nachrichtAblegen(db, 'A1', 'fahrer', `Nummer ${n}`);
    }

    const verlauf = await verlaufLesen(db, 'A1');
    expect(verlauf).toHaveLength(SICHTBAR);
    expect(verlauf.at(-1)?.text).toBe(`Nummer ${SICHTBAR + 2}`);
  });

  it('begrenzt beide Richtungen zusammen', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();

    for (let n = 0; n < HOECHSTZAHL; n++) {
      const seite = n % 2 === 0 ? 'fahrgast' : 'fahrer';
      expect(await nachrichtAblegen(db, 'A1', seite, `Nummer ${n}`)).toBe('abgelegt');
    }
    expect(await nachrichtAblegen(db, 'A1', 'fahrgast', 'eine zu viel')).toBe('zu-viele');
  });

  it('hält Fahrten auseinander', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen('A1');
    fahrtAnlegen('A2');

    await nachrichtAblegen(db, 'A1', 'fahrer', 'Für die eine');
    await nachrichtAblegen(db, 'A2', 'fahrer', 'Für die andere');

    expect((await verlaufLesen(db, 'A1')).map((n) => n.text)).toEqual(['Für die eine']);
    expect((await verlaufLesen(db, 'A2')).map((n) => n.text)).toEqual(['Für die andere']);
  });

  it('wird nach der Fahrt gelöscht', async () => {
    const { db, fahrtAnlegen } = testDatenbank();
    fahrtAnlegen();
    await nachrichtAblegen(db, 'A1', 'fahrer', 'Bin unterwegs');

    await verlaufVergessen(db, 'A1');
    expect(await verlaufLesen(db, 'A1')).toEqual([]);
  });
});
