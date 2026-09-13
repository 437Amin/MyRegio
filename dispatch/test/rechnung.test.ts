import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STANDARD_ABSENDER,
  absenderAusEinstellungen,
  betragAufteilen,
  betragLesen,
  heuteInDeutschland,
  ibanPruefen,
  rechnungPruefen,
  rechnungsnummer,
  steuernummerBeschriftung,
  type GepruefteRechnung,
  type RechnungsEingabe,
} from '../src/rechnung';
import {
  letzteRechnungen,
  rechnungAnlegen,
  rechnungLaden,
  rechnungStornieren,
  type Datenbank,
} from '../src/rechnung-ablage';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

describe('Betrag lesen', () => {
  it.each([
    ['46,50', 4650],
    ['46.50', 4650],
    ['46', 4600],
    ['12,5', 1250],
    ['46,50 €', 4650],
    [' 46,50 ', 4650],
    ['1.234,50', 123450],
    ['1234,50', 123450],
    // In Deutschland tausendfuenfhundert - nicht 1,50 €
    ['1.500', 150000],
    ['0,29', 29],
  ])('„%s“ ergibt %i Cent', (eingabe, cent) => {
    expect(betragLesen(eingabe)).toBe(cent);
  });

  it.each(['', '0', '0,00', '-5', 'abc', '46,', '46,505', '1,234.50', '46..5', '4 6,50x'])(
    'lehnt „%s“ ab, statt zu raten',
    (eingabe) => {
      expect(betragLesen(eingabe)).toBeNull();
    },
  );
});

describe('Steuer herausrechnen', () => {
  it('Flughafenfahrt 46,50 €: 39,08 netto + 7,42 Steuer', () => {
    expect(betragAufteilen(4650)).toEqual({ bruttoCent: 4650, nettoCent: 3908, steuerCent: 742 });
  });

  it('Netto und Steuer ergeben bei jedem Betrag bis 300 € genau den Endpreis', () => {
    const abweichend: number[] = [];
    for (let brutto = 1; brutto <= 300_00; brutto++) {
      const { nettoCent, steuerCent } = betragAufteilen(brutto);
      // ... und die Steuer passt auf den Cent zum Netto
      if (nettoCent + steuerCent !== brutto || Math.abs(nettoCent * 0.19 - steuerCent) > 1) {
        abweichend.push(brutto);
      }
    }
    expect(abweichend).toEqual([]);
  });
});

describe('Rechnungsnummer und Datum', () => {
  it('ist vierstellig mit Jahr', () => {
    expect(rechnungsnummer(2026, 7)).toBe('2026-0007');
    expect(rechnungsnummer(2026, 12345)).toBe('2026-12345');
  });

  it('rechnet in deutscher Ortszeit - Silvesternacht landet im neuen Jahr', () => {
    // 23:30 UTC = 0:30 Uhr am 1. Januar in Stuttgart
    expect(heuteInDeutschland(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    // Sommerzeit: 21:59 UTC = 23:59 Uhr, 22:00 UTC = Mitternacht
    expect(heuteInDeutschland(new Date('2026-09-13T21:59:00Z'))).toBe('2026-09-13');
    expect(heuteInDeutschland(new Date('2026-09-13T22:00:00Z'))).toBe('2026-09-14');
  });
});

describe('Pflichtangaben prüfen', () => {
  const gueltig: RechnungsEingabe = {
    von: 'Steiermärker Str. 3, 70469 Stuttgart',
    nach: 'Flughafen Stuttgart – Terminal',
    betrag: '46,50',
    fahrtdatum: '2026-09-12',
    kundeName: '',
    kundeAnschrift: '',
    zahlungsart: 'bar',
  };
  const heute = '2026-09-13';

  it('nimmt eine Fahrt nur mit Start, Ziel und Preis an', () => {
    const ergebnis = rechnungPruefen(gueltig, heute);
    expect(ergebnis).toEqual({
      rechnung: expect.objectContaining({ bruttoCent: 4650, steuerCent: 742, steuersatz: 19 }),
    });
  });

  it('meldet alle fehlenden Angaben auf einmal', () => {
    const ergebnis = rechnungPruefen({ ...gueltig, von: ' ', nach: '', betrag: 'x' }, heute);
    expect('fehler' in ergebnis && ergebnis.fehler).toHaveLength(3);
  });

  it('verlangt über 250 € Name und Anschrift des Fahrgasts', () => {
    const teuer = { ...gueltig, betrag: '250,01' };
    expect(rechnungPruefen(teuer, heute)).toHaveProperty('fehler');
    expect(rechnungPruefen({ ...teuer, kundeName: 'Firma GmbH' }, heute)).toHaveProperty('fehler');
    expect(
      rechnungPruefen({ ...teuer, kundeName: 'Firma GmbH', kundeAnschrift: 'Hauptstr. 1\n70173 Stuttgart' }, heute),
    ).toHaveProperty('rechnung');
  });

  it('genau 250 € ist noch eine Kleinbetragsrechnung', () => {
    expect(rechnungPruefen({ ...gueltig, betrag: '250' }, heute)).toHaveProperty('rechnung');
  });

  it.each(['2026-02-31', '13.09.2026', '', '2062-09-12', '2019-12-31'])('lehnt das Datum „%s“ ab', (datum) => {
    expect(rechnungPruefen({ ...gueltig, fahrtdatum: datum }, heute)).toHaveProperty('fehler');
  });

  it('nimmt nur bekannte Zahlungsarten', () => {
    expect(rechnungPruefen({ ...gueltig, zahlungsart: 'toString' }, heute)).toHaveProperty('fehler');
    expect(rechnungPruefen({ ...gueltig, zahlungsart: 'ueberweisung' }, heute)).toHaveProperty('rechnung');
  });
});

describe('Firmendaten', () => {
  it('Pflichtangaben lassen sich nicht leeren', () => {
    const absender = absenderAusEinstellungen({ rechnung_firma: '  ', rechnung_iban: 'DE89 3704 0044 0532 0130 00' });
    expect(absender.firma).toBe(STANDARD_ABSENDER.firma);
    expect(absender.iban).toBe('DE89 3704 0044 0532 0130 00');
  });

  it('erkennt USt-IdNr. und Steuernummer', () => {
    expect(steuernummerBeschriftung('DE285112009')).toBe('USt-IdNr.');
    expect(steuernummerBeschriftung('99/123/45678')).toBe('Steuernummer');
  });

  it('prüft die IBAN und schreibt sie in Viererblöcken', () => {
    expect(ibanPruefen('de89370400440532013000')).toBe('DE89 3704 0044 0532 0130 00');
    expect(ibanPruefen('')).toBe('');
    // Zahlendreher in der letzten Stelle
    expect(ibanPruefen('DE89 3704 0044 0532 0130 01')).toBeNull();
    // Deutsche IBAN mit einer Ziffer zu wenig
    expect(ibanPruefen('DE89 3704 0044 0532 0130 0')).toBeNull();
  });
});

/* ============================================================ Datenbank */

function testDatenbank() {
  const roh = new DatabaseSync(':memory:');
  roh.exec('PRAGMA foreign_keys = ON');
  const schema = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
  roh.exec(readFileSync(schema, 'utf8'));

  const db: Datenbank = {
    prepare: (sql) => ({
      bind: (...werte) => ({
        first: async <T>() => (roh.prepare(sql).get(...werte) ?? null) as T | null,
        all: async <T>() => ({ results: roh.prepare(sql).all(...werte) as T[] }),
      }),
    }),
  };
  return { roh, db };
}

const fahrt: GepruefteRechnung = {
  von: 'Feuerbach',
  nach: 'Flughafen',
  fahrtdatum: '2026-09-12',
  kundeName: '',
  kundeAnschrift: '',
  zahlungsart: 'bar',
  ...betragAufteilen(4650),
  steuersatz: 19,
};

describe('Rechnungen speichern', () => {
  it('vergibt fortlaufende Nummern und beginnt jedes Jahr bei 1', async () => {
    const { db } = testDatenbank();
    const a = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2026-12-30');
    const b = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2026-12-31');
    const c = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2027-01-01');

    const nummern = await Promise.all(
      [a, b, c].map(async (id) => {
        const r = (await rechnungLaden(db, id))!;
        return rechnungsnummer(r.jahr, r.laufnummer);
      }),
    );
    expect(nummern).toEqual(['2026-0001', '2026-0002', '2027-0001']);
  });

  it('hält die Firmendaten zum Zeitpunkt der Ausstellung fest', async () => {
    const { db } = testDatenbank();
    const id = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2026-09-13');
    const r = (await rechnungLaden(db, id))!;
    expect(JSON.parse(r.absender)).toEqual(STANDARD_ABSENDER);
  });

  it('die Datenbank verweigert eine doppelte Nummer', () => {
    const { roh } = testDatenbank();
    const einfuegen = () =>
      roh
        .prepare(
          `INSERT INTO rechnungen (jahr, laufnummer, rechnungsdatum, fahrtdatum, von, nach,
             brutto_cent, netto_cent, steuer_cent, steuersatz, absender)
           VALUES (2026, 1, '2026-09-13', '2026-09-13', 'a', 'b', 1, 1, 0, 19, '{}')`,
        )
        .run();
    einfuegen();
    expect(einfuegen).toThrow(/UNIQUE/);
  });
});

describe('Rechnungen stornieren', () => {
  it('legt eine Stornorechnung mit eigener Nummer und umgekehrten Beträgen an', async () => {
    const { db } = testDatenbank();
    const id = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2026-09-13');
    const stornoId = await rechnungStornieren(db, id, STANDARD_ABSENDER, '2026-09-14');

    const storno = (await rechnungLaden(db, stornoId!))!;
    expect(storno).toMatchObject({
      laufnummer: 2,
      storno_von: id,
      rechnungsdatum: '2026-09-14',
      fahrtdatum: '2026-09-12',
      brutto_cent: -4650,
      netto_cent: -3908,
      steuer_cent: -742,
    });

    // Das Original bleibt unveraendert stehen und weiss, wodurch es aufgehoben ist
    expect(await rechnungLaden(db, id)).toMatchObject({ brutto_cent: 4650, storniert_durch: stornoId });
  });

  it('doppeltes Tippen erzeugt keine zweite Stornorechnung', async () => {
    const { db } = testDatenbank();
    const id = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2026-09-13');
    const erstes = await rechnungStornieren(db, id, STANDARD_ABSENDER, '2026-09-13');
    const zweites = await rechnungStornieren(db, id, STANDARD_ABSENDER, '2026-09-13');

    expect(zweites).toBe(erstes);
    expect(await letzteRechnungen(db)).toHaveLength(2);
  });

  it('eine Stornorechnung selbst lässt sich nicht stornieren', async () => {
    const { db } = testDatenbank();
    const id = await rechnungAnlegen(db, fahrt, STANDARD_ABSENDER, '2026-09-13');
    const stornoId = await rechnungStornieren(db, id, STANDARD_ABSENDER, '2026-09-13');

    expect(await rechnungStornieren(db, stornoId!, STANDARD_ABSENDER, '2026-09-13')).toBeNull();
    expect(await rechnungStornieren(db, 999, STANDARD_ABSENDER, '2026-09-13')).toBeNull();
    expect(await letzteRechnungen(db)).toHaveLength(2);
  });
});
