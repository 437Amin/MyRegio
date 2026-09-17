import { describe, expect, it } from 'vitest';
import {
  erfassungPruefen,
  plausibleTelefonnummer,
  type ErfassungsEingabe,
} from '../src/auftrag-erfassen';

const JETZT = new Date('2026-09-18T09:00:00.000Z'); // 11:00 deutscher Zeit

/** Eine vollständige, gültige Eingabe - einzelne Felder je Test überschrieben. */
function eingabe(werte: Partial<ErfassungsEingabe> = {}): ErfassungsEingabe {
  return {
    kanal: 'telefon',
    art: 'Flughafentransfer',
    abholung: 'Steiermärker Straße 3-5, Stuttgart',
    ziel: 'Flughafen Stuttgart – Terminal',
    vonGewaehlt: true,
    nachGewaehlt: true,
    wann: 'sofort',
    datum: '',
    zeit: '',
    name: 'Frau Keller',
    telefon: '0711 1234567',
    personen: '2',
    anmerkung: '',
    preis: '',
    preisAbweichend: false,
    eingangDatum: '',
    eingangZeit: '',
    ...werte,
  };
}

/** Kurzer Zugriff auf das Ergebnis, damit die Tests lesbar bleiben. */
function auftragVon(werte: Partial<ErfassungsEingabe> = {}) {
  const ergebnis = erfassungPruefen(eingabe(werte), JETZT);
  if ('fehler' in ergebnis) throw new Error('Unerwartete Fehler: ' + ergebnis.fehler.join(' | '));
  return ergebnis.auftrag;
}

function fehlerVon(werte: Partial<ErfassungsEingabe>) {
  const ergebnis = erfassungPruefen(eingabe(werte), JETZT);
  return 'fehler' in ergebnis ? ergebnis.fehler.join(' | ') : '';
}

describe('Telefonnummer', () => {
  it('erkennt echte Rufnummern', () => {
    for (const nummer of ['0711 1234567', '+49 173 3480810', '0173/348 08 10']) {
      expect(plausibleTelefonnummer(nummer)).toBe(true);
    }
  });

  it('weist zu kurze und zu lange ab', () => {
    for (const nummer of ['123', '', '01234567890123456']) {
      expect(plausibleTelefonnummer(nummer)).toBe(false);
    }
  });
});

describe('Pflichtangaben', () => {
  it('nimmt eine vollständige Aufnahme an', () => {
    const auftrag = auftragVon();
    expect(auftrag.kanal).toBe('telefon');
    expect(auftrag.sofort).toBe(1);
    expect(auftrag.preisBerechnen).toBe(true);
    expect(auftrag.preisCent).toBeNull();
    expect(auftrag.personen).toBe(2);
  });

  it('besteht auf dem Eingangskanal – er ist der Nachweis nach § 49 PBefG', () => {
    expect(fehlerVon({ kanal: '' })).toContain('wie der Auftrag hereinkam');
    expect(fehlerVon({ kanal: 'brieftaube' })).toContain('wie der Auftrag hereinkam');
  });

  it('besteht auf Abholung, Name und Telefonnummer', () => {
    expect(fehlerVon({ abholung: '   ' })).toContain('Abholadresse');
    expect(fehlerVon({ name: '' })).toContain('Name des Fahrgasts');
    expect(fehlerVon({ telefon: '' })).toContain('Telefonnummer des Fahrgasts');
    expect(fehlerVon({ telefon: '12' })).toContain('nicht richtig aus');
  });

  it('lässt das Ziel offen – nicht jede Stadtfahrt hat eines', () => {
    const auftrag = auftragVon({ ziel: '', nachGewaehlt: false, preis: '25,00' });
    expect(auftrag.ziel).toBe('');
  });
});

describe('Preis', () => {
  it('lässt den Server rechnen, wenn beide Adressen ausgewählt wurden', () => {
    expect(auftragVon().preisBerechnen).toBe(true);
  });

  it('verlangt bei Freitext einen Preis, statt zu raten', () => {
    expect(fehlerVon({ nachGewaehlt: false, preis: '' })).toContain('kein Preis berechnen');
  });

  it('nimmt bei Freitext den eingetragenen Betrag', () => {
    const auftrag = auftragVon({ vonGewaehlt: false, nachGewaehlt: false, preis: '46,50' });
    expect(auftrag.preisBerechnen).toBe(false);
    expect(auftrag.preisCent).toBe(4650);
  });

  it('erlaubt einen abweichend vereinbarten Preis trotz Auswahl', () => {
    const auftrag = auftragVon({ preisAbweichend: true, preis: '40' });
    expect(auftrag.preisBerechnen).toBe(false);
    expect(auftrag.preisCent).toBe(4000);
  });

  it('weist einen unlesbaren oder absurden Betrag ab', () => {
    expect(fehlerVon({ preisAbweichend: true, preis: 'vierzig' })).toContain('abweichend vereinbarten Preis');
    expect(fehlerVon({ preisAbweichend: true, preis: '99999' })).toContain('zu hoch');
  });
});

describe('Zeitpunkt der Fahrt', () => {
  it('rechnet eine Vorbestellung in deutscher Ortszeit um', () => {
    const auftrag = auftragVon({ wann: 'spaeter', datum: '2026-09-19', zeit: '07:30' });
    expect(auftrag.sofort).toBe(0);
    expect(auftrag.wunschIso).toBe('2026-09-19T05:30:00.000Z');
    expect(auftrag.wunschzeit).toContain('19.09.2026');
    expect(auftrag.wunschzeit).toContain('07:30');
  });

  it('verlangt Datum und Uhrzeit, wenn nicht sofort gefahren wird', () => {
    expect(fehlerVon({ wann: 'spaeter', datum: '', zeit: '' })).toContain('unvollständig');
  });

  it('weist Termine weit in der Zukunft ab', () => {
    expect(fehlerVon({ wann: 'spaeter', datum: '2028-01-01', zeit: '08:00' })).toContain('ein Jahr');
  });
});

describe('Auftragseingang', () => {
  it('nimmt ohne Angabe den aktuellen Zeitpunkt', () => {
    expect(auftragVon().eingangIso).toBe(JETZT.toISOString());
  });

  it('erlaubt das Nachtragen eines früheren Anrufs', () => {
    // 10:15 deutscher Zeit = 08:15 UTC, also 45 Minuten vor "jetzt"
    const auftrag = auftragVon({ eingangDatum: '2026-09-18', eingangZeit: '10:15' });
    expect(auftrag.eingangIso).toBe('2026-09-18T08:15:00.000Z');
  });

  it('lässt keinen Eingang in der Zukunft zu', () => {
    expect(fehlerVon({ eingangDatum: '2026-09-18', eingangZeit: '23:00' })).toContain('Zukunft');
  });

  it('lässt kein Nachtragen aus dem Vorjahr zu', () => {
    expect(fehlerVon({ eingangDatum: '2026-01-05', eingangZeit: '10:00' })).toContain('zurück');
  });
});

describe('Aufräumen der Eingaben', () => {
  it('ersetzt einen unbekannten Anlass durch „Fahrt“', () => {
    expect(auftragVon({ art: 'Mondflug' }).art).toBe('Fahrt');
  });

  it('hält die Personenzahl im sinnvollen Bereich', () => {
    expect(auftragVon({ personen: '0' }).personen).toBe(1);
    expect(auftragVon({ personen: '99' }).personen).toBe(8);
    expect(auftragVon({ personen: 'zwei' }).personen).toBe(1);
  });

  it('sammelt mehrere Fehler auf einmal, statt einen nach dem anderen zu melden', () => {
    const ergebnis = erfassungPruefen(
      eingabe({ kanal: '', abholung: '', name: '', telefon: '' }),
      JETZT,
    );
    expect('fehler' in ergebnis && ergebnis.fehler.length).toBe(4);
  });
});
