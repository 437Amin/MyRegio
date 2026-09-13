import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { STANDARD_ABSENDER, type Rechnung } from '../src/rechnung';
import { fuerPdfSchrift, rechnungAlsPdf } from '../src/rechnung-pdf';

const rechnung: Rechnung = {
  id: 1,
  jahr: 2026,
  laufnummer: 1,
  rechnungsdatum: '2026-09-13',
  fahrtdatum: '2026-09-12',
  von: 'Steiermärker Straße 3, 70469 Stuttgart',
  nach: 'Flughafen Stuttgart – Terminal',
  kunde_name: '',
  kunde_anschrift: '',
  zahlungsart: 'bar',
  brutto_cent: 4650,
  netto_cent: 3908,
  steuer_cent: 742,
  steuersatz: 19,
  absender: JSON.stringify(STANDARD_ABSENDER),
  storno_von: null,
};

async function lesen(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return { seiten: doc.getPageCount(), titel: doc.getTitle() };
}

describe('Rechnung als PDF', () => {
  it('ergibt eine A4-Seite mit Nummer im Titel', async () => {
    const pdf = await rechnungAlsPdf(rechnung);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-');
    expect(await lesen(pdf)).toEqual({ seiten: 1, titel: 'Rechnung 2026-0001' });
  });

  it('bricht bei türkischen Namen und langen Adressen nicht ab', async () => {
    const pdf = await rechnungAlsPdf({
      ...rechnung,
      kunde_name: 'Şahin Yılmaz – Ğüzel İnşaat GmbH',
      kunde_anschrift: 'Königstraße 1\r\n70173 Stuttgart',
      von: 'Sehr lange Adresse '.repeat(10),
      zahlungsart: 'ueberweisung',
      absender: JSON.stringify({ ...STANDARD_ABSENDER, iban: 'DE89 3704 0044 0532 0130 00', bank: 'Testbank' }),
    });
    expect((await lesen(pdf)).seiten).toBe(1);
  });

  it('schreibt eine Stornorechnung mit Bezug auf das Original', async () => {
    const pdf = await rechnungAlsPdf(
      { ...rechnung, id: 2, laufnummer: 2, storno_von: 1, brutto_cent: -4650, netto_cent: -3908, steuer_cent: -742 },
      rechnung,
    );
    expect((await lesen(pdf)).titel).toBe('Stornorechnung 2026-0002');
  });
});

describe('Text für die PDF-Schrift', () => {
  const schreibbar = async (text: string) => {
    const doc = await PDFDocument.create();
    const zeichen = new Set((await doc.embedFont(StandardFonts.Helvetica)).getCharacterSet());
    return fuerPdfSchrift(text, zeichen);
  };

  it('behält Umlaute, ß, € und Gedankenstrich', async () => {
    expect(await schreibbar('Größe – 46,50 € · Königstraße')).toBe('Größe – 46,50 € · Königstraße');
  });

  it('nimmt Buchstaben, die die Schrift nicht kennt, den Akzent', async () => {
    // ó kennt die Schrift, Ł und ź nicht
    expect(await schreibbar('Şahin Yılmaz, İstanbul, Łódź')).toBe('Sahin Yilmaz, Istanbul, Lódz');
  });

  it('ersetzt gar nicht Darstellbares durch ein Fragezeichen statt abzubrechen', async () => {
    expect(await schreibbar('Fahrt 🚗 北京')).toBe('Fahrt ? ??');
  });
});
