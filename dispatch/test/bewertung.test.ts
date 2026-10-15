import { describe, expect, it } from 'vitest';
import { HOECHSTLAENGE, bewertungPruefen, chefmeldung, sterneZeichen } from '../src/bewertung';

const ANGABEN = {
  von: 'Wallensteinstraße 33',
  nach: 'Flughafen Stuttgart',
  fahrer: 'Anna',
  // Wie sicher() in telegram.ts - sonst prueft der Test eine andere Welt
  sicher: (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
};

describe('Bewertung prüfen', () => {
  it('nimmt Sterne mit Text an', () => {
    expect(bewertungPruefen(5, '  Alles bestens  ')).toEqual({
      ok: true,
      sterne: 5,
      text: 'Alles bestens',
    });
  });

  it('nimmt Sterne ohne Text an', () => {
    // Wer nur tippen will, soll nicht schreiben muessen
    expect(bewertungPruefen(4, '')).toEqual({ ok: true, sterne: 4, text: '' });
    expect(bewertungPruefen(4, undefined)).toEqual({ ok: true, sterne: 4, text: '' });
  });

  it('weist Sterne außerhalb von eins bis fünf ab', () => {
    for (const wert of [0, 6, -1, 2.5, 'viele', null, undefined]) {
      expect(bewertungPruefen(wert, '').ok, String(wert)).toBe(false);
    }
  });

  it('kürzt einen überlangen Text, statt ihn abzuweisen', () => {
    // Die Rueckmeldung selbst ist wichtiger als ihre Laenge
    const ergebnis = bewertungPruefen(3, 'a'.repeat(HOECHSTLAENGE + 50));
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.ok && ergebnis.text.length).toBe(HOECHSTLAENGE);
  });
});

describe('Sterne als Zeichen', () => {
  it('zeigt volle und leere Sterne', () => {
    expect(sterneZeichen(5)).toBe('★★★★★');
    expect(sterneZeichen(3)).toBe('★★★☆☆');
    expect(sterneZeichen(1)).toBe('★☆☆☆☆');
  });

  it('bleibt bei Unsinn im Rahmen', () => {
    expect(sterneZeichen(0)).toBe('☆☆☆☆☆');
    expect(sterneZeichen(9)).toBe('★★★★★');
  });
});

describe('Meldung an den Chef', () => {
  it('nennt Sterne, Fahrer und Strecke', () => {
    const text = chefmeldung(5, 'Sehr freundlich', ANGABEN);

    expect(text).toContain('★★★★★');
    expect(text).toContain('5 von 5');
    expect(text).toContain('Anna');
    expect(text).toContain('Flughafen Stuttgart');
    expect(text).toContain('Sehr freundlich');
  });

  it('hebt eine schlechte Bewertung hervor', () => {
    // Sie soll auffallen, solange sich noch etwas tun laesst
    expect(chefmeldung(2, '', ANGABEN)).toContain('Schlechte Bewertung');
    expect(chefmeldung(1, '', ANGABEN)).toContain('⚠️');
    expect(chefmeldung(3, '', ANGABEN)).not.toContain('Schlechte Bewertung');
  });

  it('kommt ohne Text aus', () => {
    const text = chefmeldung(4, '', ANGABEN);
    expect(text).toContain('★★★★☆');
    expect(text).not.toContain('<i>');
  });

  it('maskiert, was der Fahrgast geschrieben hat', () => {
    const text = chefmeldung(1, '<b>frech</b>', ANGABEN);
    expect(text).toContain('&lt;b&gt;frech');
  });
});
