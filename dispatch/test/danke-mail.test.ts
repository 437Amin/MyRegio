import { describe, expect, it } from 'vitest';
import { dankeAnschreiben, dankeFaellig } from '../src/danke-mail';
import { STANDARD_ABSENDER } from '../src/rechnung';

const LINK = 'https://g.page/r/beispiel/review';

describe('Nachricht nach der Fahrt', () => {
  it('dankt und nennt den Namen', () => {
    const brief = dankeAnschreiben('Frau Keller', STANDARD_ABSENDER, LINK);

    expect(brief.betreff).toBe('Danke für Ihre Fahrt – MyRegioCar');
    expect(brief.text).toContain('Guten Tag Frau Keller,');
    expect(brief.text).toContain('vielen Dank');
  });

  it('kommt ohne Namen aus', () => {
    const brief = dankeAnschreiben('', STANDARD_ABSENDER, LINK);
    expect(brief.text).toContain('Guten Tag,');
    expect(brief.text).not.toContain('Guten Tag ,');
  });

  it('nimmt den Bewertungslink auf', () => {
    expect(dankeAnschreiben('Frau Keller', STANDARD_ABSENDER, LINK).text).toContain(LINK);
  });

  it('bleibt ohne Link sinnvoll, statt ins Leere zu zeigen', () => {
    const brief = dankeAnschreiben('Frau Keller', STANDARD_ABSENDER, '');

    expect(brief.text).not.toContain('http');
    expect(brief.text).toContain('Antworten Sie gern kurz');
  });

  it('weist in jeder Nachricht auf den Widerspruch hin', () => {
    // Die Bitte um eine Bewertung ist Werbung - der Hinweis gehört nicht nur
    // in die erste Nachricht
    for (const link of [LINK, '']) {
      const brief = dankeAnschreiben('Frau Keller', STANDARD_ABSENDER, link);
      expect(brief.text, link).toContain('künftig nicht mehr');
    }
  });

  it('unterschreibt mit den Firmendaten', () => {
    const brief = dankeAnschreiben('Frau Keller', STANDARD_ABSENDER, LINK);
    expect(brief.text).toContain('Önder Sarak Mietwagenunternehmen');
    expect(brief.text).toContain('70469 Stuttgart');
  });
});

describe('Wann die Nachricht fällig ist', () => {
  const auftrag = (werte = {}) => ({
    bewertung_gewuenscht: 1,
    kunde_email: 'kunde@example.com',
    kunde_name: 'Frau Keller',
    ...werte,
  });

  it('wird verschickt, wenn sie gewünscht ist', () => {
    expect(dankeFaellig(auftrag(), false)).toBe(true);
  });

  it('unterbleibt ohne Wunsch', () => {
    expect(dankeFaellig(auftrag({ bewertung_gewuenscht: 0 }), false)).toBe(false);
  });

  it('unterbleibt ohne Adresse', () => {
    expect(dankeFaellig(auftrag({ kunde_email: '  ' }), false)).toBe(false);
  });

  it('unterbleibt, wenn eine Rechnung im Spiel war', () => {
    // Ging sie raus, steht die Bitte schon darin. Ging sie nicht raus, wartet
    // der Fahrgast darauf - dann waere eine Bitte um Bewertung der falsche Ton
    expect(dankeFaellig(auftrag(), true)).toBe(false);
  });
});
