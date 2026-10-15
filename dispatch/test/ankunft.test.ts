import { describe, expect, it } from 'vitest';
import {
  HOECHSTALTER_LIVE_SEKUNDEN,
  HOECHSTALTER_SEKUNDEN,
  ankunftMinuten,
  ankunftstext,
  luftlinieKm,
} from '../src/ankunft';

// Betriebssitz und ein paar bekannte Punkte in Stuttgart
const BETRIEB = { breite: 48.8143644, laenge: 9.165389 };
const FLUGHAFEN = { breite: 48.690542, laenge: 9.193195 };
const JETZT = new Date('2026-10-14T18:00:00.000Z');

describe('Luftlinie', () => {
  it('misst eine bekannte Strecke richtig', () => {
    // Feuerbach – Flughafen sind rund 14 km Luftlinie
    expect(luftlinieKm(BETRIEB, FLUGHAFEN)).toBeGreaterThan(13);
    expect(luftlinieKm(BETRIEB, FLUGHAFEN)).toBeLessThan(15);
  });

  it('ist null auf dem Fleck', () => {
    expect(luftlinieKm(BETRIEB, BETRIEB)).toBe(0);
  });

  it('misst in beide Richtungen gleich', () => {
    expect(luftlinieKm(BETRIEB, FLUGHAFEN)).toBeCloseTo(
      luftlinieKm(FLUGHAFEN, BETRIEB),
      9,
    );
  });
});

describe('Geschätzte Minuten', () => {
  it('gibt für dieselbe Stelle die Mindestzeit', () => {
    expect(ankunftMinuten(BETRIEB, BETRIEB)).toBe(2);
  });

  it('schätzt eine kurze Strecke in Minuten, nicht in Sekunden', () => {
    // Gut zwei Kilometer Luftlinie
    const nah = { breite: 48.8, laenge: 9.19 };
    const minuten = ankunftMinuten(BETRIEB, nah);
    expect(minuten).toBeGreaterThanOrEqual(5);
    expect(minuten).toBeLessThanOrEqual(12);
  });

  it('bleibt für eine Fernfahrt im Rahmen', () => {
    const minuten = ankunftMinuten(BETRIEB, FLUGHAFEN);
    expect(minuten).toBeGreaterThan(30);
    expect(minuten).toBeLessThan(60);
  });
});

describe('Text für den Fahrgast', () => {
  const standort = (werte = {}) => ({
    breite: 48.81,
    laenge: 9.17,
    zeitpunkt: JETZT.toISOString(),
    ...werte,
  });

  it('nennt die geschätzte Zeit', () => {
    const text = ankunftstext(standort(), BETRIEB, JETZT);
    expect(text).toMatch(/^Ihr Fahrer ist etwa \d+ Minuten entfernt\.$/);
  });

  it('sagt „gleich da", wenn der Fahrer praktisch dasteht', () => {
    const text = ankunftstext(
      standort({ breite: BETRIEB.breite, laenge: BETRIEB.laenge }),
      BETRIEB,
      JETZT,
    );
    // Zwei Minuten Zuschlag fürs Anhalten - "gleich da" wäre erst darunter
    expect(text).toBe('Ihr Fahrer ist etwa 2 Minuten entfernt.');
  });

  it('schweigt ohne Standort', () => {
    expect(ankunftstext(null, BETRIEB, JETZT)).toBeNull();
  });

  it('schweigt ohne Abholpunkt', () => {
    // Kommt vor: Wer die Adresse frei eintippt, hat keine Koordinaten
    expect(ankunftstext(standort(), null, JETZT)).toBeNull();
  });

  it('schweigt bei einer veralteten Meldung', () => {
    const alt = new Date(JETZT.getTime() - (HOECHSTALTER_SEKUNDEN + 10) * 1000);
    expect(ankunftstext(standort({ zeitpunkt: alt.toISOString() }), BETRIEB, JETZT)).toBeNull();
  });

  it('nimmt eine Meldung kurz vor der Grenze noch an', () => {
    const grenzwertig = new Date(JETZT.getTime() - (HOECHSTALTER_SEKUNDEN - 10) * 1000);
    expect(
      ankunftstext(standort({ zeitpunkt: grenzwertig.toISOString() }), BETRIEB, JETZT),
    ).toContain('Minuten');
  });

  it('versteht die Schreibweise von SQLite', () => {
    // "2026-10-14 18:00:00" ohne Zeitzone ist UTC
    expect(ankunftstext(standort({ zeitpunkt: '2026-10-14 17:59:00' }), BETRIEB, JETZT)).toContain(
      'Fahrer',
    );
  });

  it('schweigt bei unlesbarem Zeitpunkt', () => {
    expect(ankunftstext(standort({ zeitpunkt: 'gestern' }), BETRIEB, JETZT)).toBeNull();
  });

  it('schweigt, wenn die Meldung aus der Zukunft kommt', () => {
    // Dann geht irgendwo eine Uhr falsch, und jede Zahl wäre geraten
    const zukunft = new Date(JETZT.getTime() + 5 * 60_000);
    expect(ankunftstext(standort({ zeitpunkt: zukunft.toISOString() }), BETRIEB, JETZT)).toBeNull();
  });
});

describe('Laufende Live-Freigabe', () => {
  const vorMinuten = (n: number) => new Date(JETZT.getTime() - n * 60_000).toISOString();
  const spaeter = new Date(JETZT.getTime() + 30 * 60_000).toISOString();

  it('zeigt die Zeit auch bei einer aelteren Meldung', () => {
    // Telegram aktualisiert nur bei Bewegung: Wer an der Ampel steht, meldet
    // minutenlang nichts - sein Punkt stimmt trotzdem
    const text = ankunftstext(
      { breite: 48.81, laenge: 9.17, zeitpunkt: vorMinuten(8), live_bis: spaeter },
      BETRIEB,
      JETZT,
    );
    expect(text).toContain('Minuten entfernt');
  });

  it('schweigt ohne Freigabe bei derselben Meldung', () => {
    const text = ankunftstext(
      { breite: 48.81, laenge: 9.17, zeitpunkt: vorMinuten(8) },
      BETRIEB,
      JETZT,
    );
    expect(text).toBeNull();
  });

  it('schweigt, wenn die Freigabe abgelaufen ist', () => {
    const abgelaufen = new Date(JETZT.getTime() - 60_000).toISOString();
    const text = ankunftstext(
      { breite: 48.81, laenge: 9.17, zeitpunkt: vorMinuten(8), live_bis: abgelaufen },
      BETRIEB,
      JETZT,
    );
    expect(text).toBeNull();
  });

  it('hat auch bei laufender Freigabe eine Obergrenze', () => {
    // Falls das Handy in den Tiefschlaf geht, soll keine Zahl stehen bleiben
    const zuAlt = new Date(JETZT.getTime() - (HOECHSTALTER_LIVE_SEKUNDEN + 60) * 1000);
    const text = ankunftstext(
      {
        breite: 48.81,
        laenge: 9.17,
        zeitpunkt: zuAlt.toISOString(),
        live_bis: spaeter,
      },
      BETRIEB,
      JETZT,
    );
    expect(text).toBeNull();
  });
});
