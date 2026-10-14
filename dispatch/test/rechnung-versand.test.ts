import { describe, expect, it } from 'vitest';
import { alsBase64, mailKoerper } from '../src/brevo';
import { anhangName, anschreiben } from '../src/rechnung-versand';
import { STANDARD_ABSENDER, type Rechnung } from '../src/rechnung';

function rechnung(werte: Partial<Rechnung> = {}): Rechnung {
  return {
    id: 1,
    jahr: 2026,
    laufnummer: 7,
    rechnungsdatum: '2026-10-14',
    fahrtdatum: '2026-10-13',
    von: 'Steiermärker Straße 3-5, Stuttgart',
    nach: 'Flughafen Stuttgart – Terminal',
    kunde_name: 'Frau Keller',
    kunde_anschrift: '',
    zahlungsart: 'bar',
    brutto_cent: 4650,
    netto_cent: 3908,
    steuer_cent: 742,
    steuersatz: 19,
    absender: JSON.stringify(STANDARD_ABSENDER),
    storno_von: null,
    ...werte,
  };
}

describe('Anschreiben zur Rechnung', () => {
  it('nennt Nummer, Betrag und die Fahrt', () => {
    const brief = anschreiben(rechnung(), STANDARD_ABSENDER);

    expect(brief.betreff).toBe('Ihre Rechnung 2026-0007 – MyRegioCar');
    expect(brief.text).toContain('Guten Tag Frau Keller,');
    expect(brief.text).toContain('2026-0007');
    expect(brief.text).toContain('46,50');
    expect(brief.text).toContain('13.10.2026');
    expect(brief.text).toContain('Flughafen Stuttgart');
  });

  it('kommt ohne Namen aus', () => {
    const brief = anschreiben(rechnung({ kunde_name: '' }), STANDARD_ABSENDER);
    expect(brief.text).toContain('Guten Tag,');
    expect(brief.text).not.toContain('Guten Tag ,');
  });

  it('lässt die Bewertungszeile weg, solange kein Link hinterlegt ist', () => {
    const brief = anschreiben(rechnung(), STANDARD_ABSENDER, '');
    expect(brief.text).not.toContain('Bewertung');
  });

  it('nimmt den Bewertungslink auf – mit Hinweis auf den Widerspruch', () => {
    const brief = anschreiben(
      rechnung(),
      STANDARD_ABSENDER,
      'https://g.page/r/beispiel/review',
    );
    expect(brief.text).toContain('https://g.page/r/beispiel/review');
    // Die Bitte um eine Bewertung ist Werbung, auch an einer Rechnung
    expect(brief.text).toContain('antworten Sie kurz auf diese E-Mail');
  });

  it('bittet unter einer Stornorechnung nicht um eine Bewertung', () => {
    const brief = anschreiben(
      rechnung({ storno_von: 1, brutto_cent: -4650 }),
      STANDARD_ABSENDER,
      'https://g.page/r/beispiel/review',
    );
    expect(brief.betreff).toContain('Stornorechnung');
    expect(brief.text).toContain('hebt die zuvor');
    expect(brief.text).not.toContain('Bewertung');
  });

  it('unterschreibt mit den Firmendaten', () => {
    const brief = anschreiben(rechnung(), STANDARD_ABSENDER);
    expect(brief.text).toContain('Önder Sarak Mietwagenunternehmen');
    expect(brief.text).toContain('70469 Stuttgart');
  });
});

describe('Anhang', () => {
  it('heißt nach der Rechnungsnummer', () => {
    expect(anhangName(rechnung())).toBe('Rechnung-2026-0007.pdf');
    expect(anhangName(rechnung({ storno_von: 1 }))).toBe('Stornorechnung-2026-0007.pdf');
  });
});

describe('Mail für Brevo', () => {
  it('schickt reinen Text, kein HTML', () => {
    // HTML-Links würde Brevo umschreiben, um Klicks zu zählen - auf einer
    // Rechnung sieht eine fremde Zähladresse unseriös aus.
    const koerper = mailKoerper({
      an: 'kunde@example.com',
      betreff: 'Test',
      text: 'Hallo',
    });

    expect(koerper).toHaveProperty('textContent', 'Hallo');
    expect(koerper).not.toHaveProperty('htmlContent');
    expect(koerper.to).toEqual([{ email: 'kunde@example.com' }]);
  });

  it('hängt Dateien als Base64 an', () => {
    const koerper = mailKoerper({
      an: 'kunde@example.com',
      anName: 'Frau Keller',
      betreff: 'Test',
      text: 'Hallo',
      anhaenge: [{ name: 'Rechnung.pdf', daten: new Uint8Array([72, 97, 108, 108, 111]) }],
    });

    expect(koerper.attachment).toEqual([{ name: 'Rechnung.pdf', content: 'SGFsbG8=' }]);
    expect(koerper.to).toEqual([{ email: 'kunde@example.com', name: 'Frau Keller' }]);
  });

  it('verträgt ein ganzes PDF, ohne am Aufrufstapel zu scheitern', () => {
    // String.fromCharCode mit allen Bytes auf einmal bricht hier ab - genau
    // deshalb wandelt alsBase64 in Schritten um.
    const gross = new Uint8Array(300_000).fill(65);
    const kodiert = alsBase64(gross);

    expect(kodiert.length).toBeGreaterThan(300_000);
    expect(atob(kodiert).length).toBe(300_000);
  });
});
