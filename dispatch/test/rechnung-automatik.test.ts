import { describe, expect, it } from 'vitest';
import {
  rechnungsentscheidung,
  zahlungsartLesen,
  type AuftragFuerRechnung,
} from '../src/rechnung-automatik';

function auftrag(werte: Partial<AuftragFuerRechnung> = {}): AuftragFuerRechnung {
  return {
    rechnung_gewuenscht: 1,
    kunde_email: 'kunde@example.com',
    preis: 46.5,
    ...werte,
  };
}

describe('Rechnung nach der Fahrt', () => {
  it('legt sie automatisch an, wenn alles vorliegt', () => {
    expect(rechnungsentscheidung(auftrag())).toEqual({
      art: 'automatisch',
      bruttoCent: 4650,
    });
  });

  it('tut nichts, wenn der Fahrgast keine Rechnung wollte', () => {
    expect(rechnungsentscheidung(auftrag({ rechnung_gewuenscht: 0 }))).toEqual({
      art: 'keine',
    });
  });

  it('rechnet in Cent, ohne Rundungsfehler', () => {
    // 29,95 wird in Gleitkomma zu 2994.9999… - ohne Runden fehlte ein Cent
    expect(rechnungsentscheidung(auftrag({ preis: 29.95 }))).toEqual({
      art: 'automatisch',
      bruttoCent: 2995,
    });
  });

  it('übergibt an den Chef, wenn kein Festpreis feststeht', () => {
    const ergebnis = rechnungsentscheidung(auftrag({ preis: 0 }));
    expect(ergebnis.art).toBe('von-hand');
    expect(JSON.stringify(ergebnis)).toContain('kein Festpreis');
  });

  it('übergibt an den Chef, wenn die Adresse fehlt', () => {
    const ergebnis = rechnungsentscheidung(auftrag({ kunde_email: '  ' }));
    expect(ergebnis.art).toBe('von-hand');
    expect(JSON.stringify(ergebnis)).toContain('keine E-Mail-Adresse');
  });

  it('übergibt an den Chef über 250 €', () => {
    const ergebnis = rechnungsentscheidung(auftrag({ preis: 250.01 }));
    expect(ergebnis.art).toBe('von-hand');
    expect(JSON.stringify(ergebnis)).toContain('Anschrift');
  });

  it('erledigt genau 250 € noch selbst', () => {
    // Die Grenze gehoert zur Kleinbetragsrechnung dazu (§ 33 UStDV)
    expect(rechnungsentscheidung(auftrag({ preis: 250 }))).toEqual({
      art: 'automatisch',
      bruttoCent: 25000,
    });
  });
});

describe('Zahlungsart vom Fahrer', () => {
  it('nimmt die drei erlaubten Werte', () => {
    expect(zahlungsartLesen('bar')).toBe('bar');
    expect(zahlungsartLesen('karte')).toBe('karte');
    expect(zahlungsartLesen('ueberweisung')).toBe('ueberweisung');
  });

  it('verträgt Leerzeichen am Rand', () => {
    expect(zahlungsartLesen(' bar ')).toBe('bar');
  });

  it('weist alles andere ab, statt zu raten', () => {
    for (const wert of ['', undefined, null, 'BAR', 'paypal', 'rechnung', 42]) {
      expect(zahlungsartLesen(wert), String(wert)).toBeNull();
    }
  });
});
