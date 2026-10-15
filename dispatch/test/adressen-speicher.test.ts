import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HALTBARKEIT_TAGE,
  ausSpeicher,
  inSpeicher,
  schluessel,
  type Datenbank,
} from '../src/adressen-speicher';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function testDatenbank() {
  const roh = new DatabaseSync(':memory:');
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

  const zeilen = () =>
    roh.prepare('SELECT * FROM adressen_speicher').all() as Record<string, unknown>[];

  const veraltern = (tage: number) =>
    roh
      .prepare(`UPDATE adressen_speicher SET angelegt = datetime('now', '-${tage} days')`)
      .run();

  return { db, zeilen, veraltern };
}

const TREFFER = [
  { text: 'Steiermärker Straße 3, Stuttgart', breite: 48.8143, laenge: 9.1653 },
  { text: 'Steiermärker Straße 30, Stuttgart', breite: 48.815, laenge: 9.166 },
];

describe('Schlüssel', () => {
  it('fasst Schreibweisen derselben Eingabe zusammen', () => {
    expect(schluessel('  Steiermärker  STR. 3 ')).toBe('steiermärker str. 3');
    expect(schluessel('Steiermärker Str. 3')).toBe(schluessel('steiermärker str. 3'));
  });

  it('lässt Umlaute stehen – sie gehören zum Namen', () => {
    expect(schluessel('Killesbergstraße')).toContain('ß');
    expect(schluessel('Böblingen')).toContain('ö');
  });
});

describe('Adressen zwischenspeichern', () => {
  it('liefert beim zweiten Mal aus dem Speicher', async () => {
    const { db } = testDatenbank();
    await inSpeicher(db, 'Steiermärker Str.', TREFFER);

    expect(await ausSpeicher(db, 'Steiermärker Str.')).toEqual(TREFFER);
  });

  it('trifft auch bei anderer Schreibweise', async () => {
    const { db } = testDatenbank();
    await inSpeicher(db, 'Steiermärker Str.', TREFFER);

    expect(await ausSpeicher(db, '  steiermärker   STR. ')).toEqual(TREFFER);
  });

  it('kennt eine unbekannte Eingabe nicht', async () => {
    const { db } = testDatenbank();
    expect(await ausSpeicher(db, 'Gibt es nicht')).toBeNull();
  });

  it('speichert ein leeres Ergebnis NICHT', async () => {
    // Es kann aus einem Ausfall stammen - erschöpftes Kontingent, Netz weg.
    // Dann wäre "nichts gefunden" für dreißig Tage einbetoniert.
    const { db, zeilen } = testDatenbank();
    await inSpeicher(db, 'Steiermärker Str.', []);

    expect(zeilen()).toHaveLength(0);
    expect(await ausSpeicher(db, 'Steiermärker Str.')).toBeNull();
  });

  it('überschreibt einen vorhandenen Eintrag', async () => {
    const { db, zeilen } = testDatenbank();
    await inSpeicher(db, 'Steiermärker Str.', TREFFER);
    await inSpeicher(db, 'Steiermärker Str.', [TREFFER[0]!]);

    expect(zeilen()).toHaveLength(1);
    expect(await ausSpeicher(db, 'Steiermärker Str.')).toHaveLength(1);
  });

  it('vergisst alte Einträge', async () => {
    const { db, veraltern } = testDatenbank();
    await inSpeicher(db, 'Steiermärker Str.', TREFFER);

    veraltern(HALTBARKEIT_TAGE + 1);
    expect(await ausSpeicher(db, 'Steiermärker Str.')).toBeNull();
  });

  it('hält einen Eintrag kurz vor der Frist noch', async () => {
    const { db, veraltern } = testDatenbank();
    await inSpeicher(db, 'Steiermärker Str.', TREFFER);

    veraltern(HALTBARKEIT_TAGE - 1);
    expect(await ausSpeicher(db, 'Steiermärker Str.')).toEqual(TREFFER);
  });

  it('legt die Vorschläge nicht lahm, wenn der Eintrag kaputt ist', async () => {
    const { db } = testDatenbank();
    await db
      .prepare('INSERT INTO adressen_speicher (schluessel, treffer) VALUES (?, ?)')
      .bind('kaputt', '{kein json')
      .run();

    expect(await ausSpeicher(db, 'kaputt')).toBeNull();
  });
});
