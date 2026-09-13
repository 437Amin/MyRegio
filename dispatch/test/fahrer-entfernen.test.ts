import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fahrerEntfernen, type Datenbank } from '../src/fahrer-entfernen';

// node:sqlite ueber require laden: Vite kennt das Modul nicht als eingebautes
// Node-Modul und wuerde beim normalen Import stolpern.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/**
 * Eine echte SQLite-Datenbank mit unserem Schema - und wie D1 mit aktiver
 * Verweis-Pruefung. Genau daran ist das Loeschen im Fahrerbereich gescheitert.
 */
function testDatenbank() {
  const roh = new DatabaseSync(':memory:');
  roh.exec('PRAGMA foreign_keys = ON');
  // Ueber einen Pfad statt new URL(): Die Worker-Typen und die Node-Typen
  // haben je ein eigenes URL, das die Typpruefung nicht zusammenbringt
  const schema = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
  roh.exec(readFileSync(schema, 'utf8'));

  const db: Datenbank = {
    prepare: (sql) => ({
      bind: (...werte) => ({ run: async () => roh.prepare(sql).run(...werte) }),
    }),
  };

  const fahrerAnlegen = (id: number, name: string) =>
    roh
      .prepare(
        `INSERT INTO fahrer (id, name, telefon, telegram_chat_id, anmeldecode)
         VALUES (?, ?, '0171 1234567', '555', ?)`,
      )
      .run(id, name, `CODE${id}`);

  const zeile = (id: number) =>
    roh.prepare('SELECT * FROM fahrer WHERE id = ?').get(id);

  return { roh, db, fahrerAnlegen, zeile };
}

describe('Fahrer entfernen', () => {
  it('löscht einen Fahrer ohne frühere Aufträge wirklich', async () => {
    const { db, fahrerAnlegen, zeile } = testDatenbank();
    fahrerAnlegen(1, 'Neu');

    expect(await fahrerEntfernen(db, 1, 'NEUCOD')).toBe('geloescht');
    expect(zeile(1)).toBeUndefined();
  });

  it('trägt einen Fahrer mit angenommenem Auftrag aus, statt zu scheitern', async () => {
    const { roh, db, fahrerAnlegen, zeile } = testDatenbank();
    fahrerAnlegen(1, 'Erfahren');
    roh
      .prepare(
        `INSERT INTO auftraege (id, art, abholung, kunde_name, kunde_telefon, fahrer_id)
         VALUES ('A1', 'Flughafentransfer', 'Feuerbach', 'Kunde', '0711', 1)`,
      )
      .run();

    expect(await fahrerEntfernen(db, 1, 'NEUCOD')).toBe('ausgetragen');

    expect(zeile(1)).toMatchObject({
      name: 'Erfahren', // bleibt fuer die Auftragsliste
      ausgeschieden: 1,
      aktiv: 0,
      telefon: '', // Beschaeftigtendaten entfernt
      telegram_chat_id: null, // bekommt keine Nachrichten mehr
      anmeldecode: 'NEUCOD', // alter Anmeldelink ist ungueltig
    });

    // In alten Auftraegen steht weiterhin, wer gefahren ist
    const auftrag = roh
      .prepare(
        `SELECT f.name FROM auftraege a JOIN fahrer f ON f.id = a.fahrer_id
          WHERE a.id = 'A1'`,
      )
      .get();
    expect(auftrag).toEqual({ name: 'Erfahren' });
  });

  it('trägt auch aus, wenn der Fahrer nur gefragt wurde, aber nie angenommen hat', async () => {
    // Genau der Fall beim Testeintrag: 10 Verlaufseintraege
    const { roh, db, fahrerAnlegen, zeile } = testDatenbank();
    fahrerAnlegen(1, 'Nur gefragt');
    roh
      .prepare(
        `INSERT INTO auftraege (id, art, abholung, kunde_name, kunde_telefon)
         VALUES ('A1', 'Stadtfahrt', 'Feuerbach', 'Kunde', '0711')`,
      )
      .run();
    roh
      .prepare(
        `INSERT INTO verlauf (auftrag_id, fahrer_id, ereignis) VALUES ('A1', 1, 'gefragt')`,
      )
      .run();

    expect(await fahrerEntfernen(db, 1, 'NEUCOD')).toBe('ausgetragen');
    expect(zeile(1)).toMatchObject({ ausgeschieden: 1, telegram_chat_id: null });
  });

  it('lässt andere Datenbankfehler nicht als „ausgetragen" durchrutschen', async () => {
    const kaputt: Datenbank = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error('D1_ERROR: database is locked');
          },
        }),
      }),
    };
    await expect(fahrerEntfernen(kaputt, 1, 'NEUCOD')).rejects.toThrow('locked');
  });
});
