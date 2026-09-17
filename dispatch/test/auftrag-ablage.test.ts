import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auftragEintragen,
  laufendeFahrten,
  type AuftragEintrag,
  type Datenbank,
} from '../src/auftrag-ablage';
import { belegteFahrerIds, type LaufenderAuftrag } from '../src/belegung';

// node:sqlite ueber require laden: Vite kennt das Modul nicht als eingebautes
// Node-Modul und wuerde beim normalen Import stolpern.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/**
 * Echte SQLite-Datenbank mit unserem echten Schema - und wie D1 mit
 * Verweis-Pruefung. Nur so faellt ein falscher Spaltenname auf.
 */
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

  const fahrerAnlegen = (id: number, name: string) =>
    roh
      .prepare(
        `INSERT INTO fahrer (id, name, telegram_chat_id, anmeldecode) VALUES (?, ?, '555', ?)`,
      )
      .run(id, name, `CODE${id}`);

  const zeile = (id: string) =>
    roh.prepare('SELECT * FROM auftraege WHERE id = ?').get(id) as Record<string, unknown>;

  return { roh, db, fahrerAnlegen, zeile };
}

function eintrag(werte: Partial<AuftragEintrag> = {}): AuftragEintrag {
  return {
    id: 'A1',
    eingang: '2026-09-17 09:00:00',
    kanal: 'telefon',
    art: 'Flughafentransfer',
    abholung: 'Steiermärker Straße 3-5, Stuttgart',
    ziel: 'Flughafen Stuttgart – Terminal',
    wunschzeit: '',
    wunschIso: '',
    sofort: 1,
    personen: 2,
    anmerkung: 'Zwei Koffer',
    preis: 46.5,
    streckeKm: 18.78,
    preisQuelle: 'berechnet',
    kundeName: 'Frau Keller',
    kundeTelefon: '0711 1234567',
    ...werte,
  };
}

describe('Auftrag eintragen', () => {
  it('schreibt alle Angaben in die richtigen Spalten', async () => {
    const { db, zeile } = testDatenbank();
    await auftragEintragen(db, eintrag());

    expect(zeile('A1')).toMatchObject({
      eingang: '2026-09-17 09:00:00',
      kanal: 'telefon',
      art: 'Flughafentransfer',
      abholung: 'Steiermärker Straße 3-5, Stuttgart',
      ziel: 'Flughafen Stuttgart – Terminal',
      sofort: 1,
      personen: 2,
      anmerkung: 'Zwei Koffer',
      preis: 46.5,
      strecke_km: 18.78,
      preis_quelle: 'berechnet',
      kunde_name: 'Frau Keller',
      kunde_telefon: '0711 1234567',
    });
  });

  it('startet in der Vermittlung und ohne Fahrer – darüber entscheidet erst das Vermittlungsobjekt', async () => {
    const { db, zeile } = testDatenbank();
    await auftragEintragen(db, eintrag());

    expect(zeile('A1')).toMatchObject({
      status: 'vermittlung',
      zuweisungsart: 'selbst',
      fahrer_id: null,
      beendet_um: null,
    });
  });

  it('hält den von Hand vereinbarten Preis fest', async () => {
    const { db, zeile } = testDatenbank();
    await auftragEintragen(db, eintrag({ preis: 40, streckeKm: 0, preisQuelle: 'manuell' }));

    expect(zeile('A1')).toMatchObject({ preis: 40, strecke_km: 0, preis_quelle: 'manuell' });
  });

  it('merkt sich den Zeitpunkt einer Vorbestellung maschinenlesbar', async () => {
    const { db, zeile } = testDatenbank();
    await auftragEintragen(
      db,
      eintrag({ sofort: 0, wunschIso: '2026-09-19T05:30:00.000Z', wunschzeit: 'Sa., 19.09.2026, 07:30' }),
    );

    expect(zeile('A1')).toMatchObject({
      sofort: 0,
      wunsch_iso: '2026-09-19T05:30:00.000Z',
      wunschzeit: 'Sa., 19.09.2026, 07:30',
    });
  });
});

describe('Laufende Fahrten', () => {
  it('zeigt neue Aufträge und lässt abgeschlossene weg', async () => {
    const { roh, db } = testDatenbank();
    await auftragEintragen(db, eintrag({ id: 'A1' }));
    await auftragEintragen(db, eintrag({ id: 'A2' }));
    await auftragEintragen(db, eintrag({ id: 'A3' }));

    roh.prepare("UPDATE auftraege SET beendet_um = datetime('now') WHERE id = 'A2'").run();
    roh.prepare("UPDATE auftraege SET status = 'storniert' WHERE id = 'A3'").run();

    const laufend = await laufendeFahrten(db);
    expect(laufend.map((a: any) => a.id)).toEqual(['A1']);
  });

  it('nennt den Namen des eingeteilten Fahrers', async () => {
    const { roh, db, fahrerAnlegen } = testDatenbank();
    fahrerAnlegen(5, 'Bekir');
    await auftragEintragen(db, eintrag({ id: 'A1' }));
    roh.prepare("UPDATE auftraege SET status='angenommen', fahrer_id=5, zuweisungsart='fest' WHERE id='A1'").run();

    const laufend = await laufendeFahrten(db);
    expect(laufend[0]).toMatchObject({ fahrername: 'Bekir', zuweisungsart: 'fest', fahrer_id: 5 });
  });

  it('liefert genau die Felder, die die Belegung braucht', async () => {
    const { roh, db, fahrerAnlegen } = testDatenbank();
    fahrerAnlegen(5, 'Bekir');
    await auftragEintragen(db, eintrag({ id: 'A1', eingang: '2026-09-17 09:00:00', streckeKm: 10 }));
    roh.prepare("UPDATE auftraege SET status='angenommen', fahrer_id=5 WHERE id='A1'").run();

    const laufend = (await laufendeFahrten(db)) as unknown as LaufenderAuftrag[];
    // 80 Minuten Sperre ab 09:00 - eine halbe Stunde spaeter belegt
    expect([...belegteFahrerIds(laufend, new Date('2026-09-17T09:30:00Z'))]).toEqual([5]);
    expect(belegteFahrerIds(laufend, new Date('2026-09-17T11:00:00Z')).size).toBe(0);
  });

  it('lässt einen Auftrag auf Wunsch aus – für die Prüfung beim Zuweisen', async () => {
    const { db } = testDatenbank();
    await auftragEintragen(db, eintrag({ id: 'A1' }));
    await auftragEintragen(db, eintrag({ id: 'A2' }));

    const laufend = await laufendeFahrten(db, 'A1');
    expect(laufend.map((a: any) => a.id)).toEqual(['A2']);
  });
});

describe('Rechnung zum Auftrag', () => {
  it('lässt sich mit einem Auftrag verknüpfen', async () => {
    const { roh, db } = testDatenbank();
    await auftragEintragen(db, eintrag({ id: 'A1' }));

    roh
      .prepare(
        `INSERT INTO rechnungen (jahr, laufnummer, rechnungsdatum, fahrtdatum, von, nach,
                                 brutto_cent, netto_cent, steuer_cent, steuersatz, absender, auftrag_id)
         VALUES (2026, 1, '2026-09-17', '2026-09-17', 'Feuerbach', 'Flughafen',
                 4650, 3908, 742, 19, '{}', 'A1')`,
      )
      .run();

    const verknuepft = roh
      .prepare('SELECT auftrag_id FROM rechnungen WHERE laufnummer = 1')
      .get() as { auftrag_id: string };
    expect(verknuepft.auftrag_id).toBe('A1');
  });

  it('weist eine Rechnung auf einen erfundenen Auftrag ab', async () => {
    const { roh } = testDatenbank();
    expect(() =>
      roh
        .prepare(
          `INSERT INTO rechnungen (jahr, laufnummer, rechnungsdatum, fahrtdatum, von, nach,
                                   brutto_cent, netto_cent, steuer_cent, steuersatz, absender, auftrag_id)
           VALUES (2026, 2, '2026-09-17', '2026-09-17', 'A', 'B', 100, 84, 16, 19, '{}', 'GIBTESNICHT')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });
});
