import { describe, expect, it } from 'vitest';
import { festeZieleEinsetzen, FESTE_ZIELE, type Ort } from '../src/strecke';

// Alle Vorschlaege unten sind echte Antworten der Kartensuche vom 13.09.2026.

const TERMINAL = 'Flughafen Stuttgart – Terminal';

const flughafenSuche: Ort[] = [
  { bezeichnung: 'Stuttgart Flughafen/Messe, Leinfelden-Echterdingen, BW, Germany', breite: 48.690542, laenge: 9.193195 },
  // Der Doppelgaenger: Ostende der Startbahn, gut 4 km vom Terminal
  { bezeichnung: 'Flughafen Stuttgart, Neuhausen auf den Fildern, BW, Germany', breite: 48.694538, laenge: 9.248769 },
  { bezeichnung: 'Besucherterrasse Flughafen Stuttgart, Leinfelden-Echterdingen, BW, Germany', breite: 48.689856, laenge: 9.194048 },
  { bezeichnung: 'Kiddieland Flughafen Stuttgart, Leinfelden-Echterdingen, BW, Germany', breite: 48.69097, laenge: 9.194731 },
  { bezeichnung: 'Bundespolizei Flughafen Stuttgart, Leinfelden-Echterdingen, BW, Germany', breite: 48.690005, laenge: 9.192879 },
];

const messeSuche: Ort[] = [
  { bezeichnung: 'Messe Stuttgart, Leinfelden-Echterdingen, BW, Germany', breite: 48.693561, laenge: 9.186315 },
  { bezeichnung: 'Messe Stuttgart, Stuttgart, BW, Germany', breite: 48.694739, laenge: 9.190607 },
  { bezeichnung: 'Stuttgart Flughafen/Messe, Leinfelden-Echterdingen, BW, Germany', breite: 48.690542, laenge: 9.193195 },
  { bezeichnung: 'Reisemobilstellplätze Messe Stuttgart, Leinfelden-Echterdingen, BW, Germany', breite: 48.695808, laenge: 9.183095 },
];

// Echte Adressen 200-500 m vom Terminal - Hotels, Bueros, Parkhaeuser
const flughafenstrasseSuche: Ort[] = [
  { bezeichnung: 'Flughafenstraße 63, Stuttgart, BW, Germany', breite: 48.693303, laenge: 9.197179 },
  { bezeichnung: 'Flughafenstraße 59-61, Stuttgart, BW, Germany', breite: 48.693163, laenge: 9.195992 },
  { bezeichnung: 'Flughafenstraße 51, Stuttgart, BW, Germany', breite: 48.692506, laenge: 9.193468 },
];

const namen = (liste: Ort[]) => liste.map((o) => o.bezeichnung);

describe('Feste Ziele: Flughafen Stuttgart', () => {
  it('zeigt bei "Flughafen Stuttgart" das Terminal ganz oben – und keinen Doppelgänger mehr', () => {
    const ergebnis = festeZieleEinsetzen('Flughafen Stuttgart', flughafenSuche);

    expect(ergebnis[0]).toEqual({
      bezeichnung: TERMINAL,
      breite: 48.690542,
      laenge: 9.193195,
    });
    // Alle fuenf Flughafen-Eintraege sind durch den einen ersetzt
    expect(ergebnis).toHaveLength(1);
    expect(namen(ergebnis).some((n) => n.includes('Neuhausen'))).toBe(false);
  });

  it('greift schon beim Tippen und bei "Airport"', () => {
    for (const eingabe of ['Flughaf', 'flughafen', 'Stuttgart Airport']) {
      expect(namen(festeZieleEinsetzen(eingabe, []))).toEqual([TERMINAL]);
    }
  });

  it('biegt die Flughafenstraße NICHT zum Terminal um', () => {
    // Hotels und Bueros direkt am Flughafen - eigene, echte Ziele
    for (const eingabe of ['Flughafenstraße 51', 'Flughafen-Straße', 'Flughafen Straße 63']) {
      const ergebnis = festeZieleEinsetzen(eingabe, flughafenstrasseSuche);
      expect(namen(ergebnis)).toEqual(namen(flughafenstrasseSuche));
    }
  });

  it('ersetzt bei "Messe Stuttgart" nur die S-Bahn-Station – an ihrem Platz, nicht vorne', () => {
    const ergebnis = festeZieleEinsetzen('Messe Stuttgart', messeSuche);

    expect(namen(ergebnis)).toEqual([
      'Messe Stuttgart, Leinfelden-Echterdingen, BW, Germany',
      'Messe Stuttgart, Stuttgart, BW, Germany',
      TERMINAL,
      'Reisemobilstellplätze Messe Stuttgart, Leinfelden-Echterdingen, BW, Germany',
    ]);
  });

  it('lässt Suchen ohne Flughafenbezug unverändert', () => {
    const steiermaerker: Ort[] = [
      { bezeichnung: 'Steiermärker Straße 3-5, Stuttgart, BW, Germany', breite: 48.814364, laenge: 9.165389 },
    ];
    expect(festeZieleEinsetzen('Steiermärker Straße 3', steiermaerker)).toEqual(steiermaerker);
  });

  it('lässt "Flughafen"-Einträge außerhalb des Umkreises stehen', () => {
    const frankfurt: Ort[] = [
      { bezeichnung: 'Flughafen Frankfurt am Main, Frankfurt, HE, Germany', breite: 50.0379, laenge: 8.5622 },
    ];
    const ergebnis = festeZieleEinsetzen('Flughafen Frankfurt', frankfurt);
    // Stuttgart steht zusaetzlich oben, Frankfurt bleibt waehlbar
    // (und wird dann ueber die 150-km-Grenze "auf Anfrage")
    expect(namen(ergebnis)).toEqual([TERMINAL, frankfurt[0].bezeichnung]);
  });

  it('der Umkreis erfasst den Doppelgänger bei Neuhausen', () => {
    // Sicherung gegen spaeteres Verkleinern des Umkreises
    expect(FESTE_ZIELE[0].umkreisKm).toBeGreaterThan(4.2);
  });
});
