import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  datumDeutsch,
  euro,
  rechnungsnummer,
  steuernummerBeschriftung,
  type Absender,
  type Rechnung,
} from './rechnung';

/**
 * Baut aus einer gespeicherten Rechnung ein PDF im Format A4.
 *
 * Bewusst ein echtes PDF statt einer Druckansicht im Browser: Der Browser
 * schreibt beim Drucken die Adresse des Fahrerbereichs und das Datum in Kopf-
 * und Fusszeile - das gehoert nicht auf eine Rechnung an den Fahrgast. Und
 * ein PDF laesst sich vom Handy direkt per WhatsApp oder E-Mail verschicken.
 */

const BREITE = 595.28;
const HOEHE = 841.89;
const LINKS = 56;
const RECHTS = BREITE - 56;

const SCHRIFT = rgb(0.09, 0.11, 0.14);
const GRAU = rgb(0.42, 0.47, 0.53);
const LINIE = rgb(0.85, 0.87, 0.9);
// Das Cyan aus dem Logo
const MARKE = rgb(0.133, 0.722, 0.941);

export async function rechnungAlsPdf(
  r: Rechnung,
  /** Nur bei einer Stornorechnung: die Rechnung, die sie aufhebt */
  original?: Rechnung | null,
): Promise<Uint8Array> {
  const absender = JSON.parse(r.absender) as Absender;
  const nummer = rechnungsnummer(r.jahr, r.laufnummer);
  const istStorno = r.storno_von !== null;
  const titel = istStorno ? 'Stornorechnung' : 'Rechnung';

  const doc = await PDFDocument.create();
  doc.setTitle(`${titel} ${nummer}`);
  doc.setAuthor(absender.firma);
  doc.setCreator(absender.marke);
  doc.setProducer(absender.marke);
  doc.setLanguage('de-DE');

  const seite = doc.addPage([BREITE, HOEHE]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = schreiber(seite, normal, fett);

  /* --- Kopf -------------------------------------------------------------- */

  const markeTeil = absender.marke.endsWith('Car') ? absender.marke.slice(0, -3) : absender.marke;
  s.text(markeTeil, LINKS, 780, { groesse: 20, fett: true });
  if (markeTeil !== absender.marke) {
    s.text('Car', LINKS + s.breite(markeTeil, 20, true), 780, { groesse: 20, fett: true, farbe: MARKE });
  }
  s.text('Mietwagen mit Fahrer', LINKS, 764, { groesse: 9, farbe: GRAU });

  let y = 780;
  s.rechts(absender.firma, RECHTS, y, { groesse: 9.5, fett: true });
  for (const zeile of [absender.strasse, absender.ort, absender.telefon, absender.email]) {
    if (!zeile) continue;
    y -= 12.5;
    s.rechts(zeile, RECHTS, y, { groesse: 9, farbe: GRAU });
  }

  /* --- Anschrift und Eckdaten ------------------------------------------- */

  if (r.kunde_name || r.kunde_anschrift) {
    s.text(`${absender.firma} · ${absender.strasse} · ${absender.ort}`, LINKS, 700, {
      groesse: 7,
      farbe: GRAU,
    });
    y = 682;
    const zeilen = [
      ...(r.kunde_name ? [r.kunde_name] : []),
      ...s.umbrechen(r.kunde_anschrift, 10.5, 250),
    ].slice(0, 7);
    for (const zeile of zeilen) {
      s.text(zeile, LINKS, y, { groesse: 10.5 });
      y -= 14;
    }
  }

  const eckdaten: [string, string][] = [
    [istStorno ? 'Stornorechnung Nr.' : 'Rechnungsnummer', nummer],
    ['Rechnungsdatum', datumDeutsch(r.rechnungsdatum)],
    ['Datum der Fahrt', datumDeutsch(r.fahrtdatum)],
  ];
  if (istStorno && original) {
    eckdaten.push(['Storno zu Rechnung', rechnungsnummer(original.jahr, original.laufnummer)]);
  }
  y = 682;
  for (const [beschriftung, wert] of eckdaten) {
    s.text(beschriftung, 350, y, { groesse: 9, farbe: GRAU });
    s.rechts(wert, RECHTS, y, { groesse: 9.5, fett: true });
    y -= 15;
  }

  /* --- Titel ------------------------------------------------------------- */

  y = 570;
  s.text(titel, LINKS, y, { groesse: 18, fett: true });

  /* --- Leistung ---------------------------------------------------------- */

  y -= 36;
  s.text('Leistung', LINKS, y, { groesse: 8.5, farbe: GRAU });
  s.rechts('Betrag', RECHTS, y, { groesse: 8.5, farbe: GRAU });
  y -= 8;
  s.linie(y);

  y -= 20;
  s.text('Personenbeförderung – Mietwagen mit Fahrer', LINKS, y, { groesse: 10.5, fett: true });
  s.rechts(euro(r.netto_cent), RECHTS, y, { groesse: 10.5 });

  for (const [beschriftung, adresse] of [
    ['Von', r.von],
    ['Nach', r.nach],
  ] as const) {
    y -= 17;
    s.text(beschriftung, LINKS, y, { groesse: 9.5, farbe: GRAU });
    const zeilen = s.umbrechen(adresse, 9.5, 330).slice(0, 4);
    zeilen.forEach((zeile, i) => {
      if (i > 0) y -= 13;
      s.text(zeile, LINKS + 40, y, { groesse: 9.5 });
    });
  }

  y -= 16;
  s.linie(y);

  /* --- Summen ------------------------------------------------------------ */

  const summe = (beschriftung: string, betrag: string, hervorheben = false) => {
    const groesse = hervorheben ? 12 : 9.5;
    s.text(beschriftung, 330, y, { groesse, fett: hervorheben, farbe: hervorheben ? SCHRIFT : GRAU });
    s.rechts(betrag, RECHTS, y, { groesse, fett: hervorheben });
  };

  y -= 20;
  summe('Nettobetrag', euro(r.netto_cent));
  y -= 16;
  summe(`Umsatzsteuer ${r.steuersatz} %`, euro(r.steuer_cent));
  y -= 10;
  s.linie(y, 330);
  y -= 20;
  summe('Gesamtbetrag', euro(r.brutto_cent), true);

  /* --- Hinweis zur Zahlung ---------------------------------------------- */

  y -= 44;
  const hinweise: string[] = [];
  if (istStorno) {
    const bezug = original
      ? `die Rechnung ${rechnungsnummer(original.jahr, original.laufnummer)} vom ${datumDeutsch(original.rechnungsdatum)}`
      : 'die ursprüngliche Rechnung';
    hinweise.push(`Diese Stornorechnung hebt ${bezug} vollständig auf.`);
  } else if (r.zahlungsart === 'bar') {
    hinweise.push(`Den Betrag von ${euro(r.brutto_cent)} haben wir bar erhalten.`);
  } else if (r.zahlungsart === 'karte') {
    hinweise.push(`Der Betrag von ${euro(r.brutto_cent)} wurde mit Karte bezahlt.`);
  } else {
    hinweise.push(
      `Bitte überweisen Sie ${euro(r.brutto_cent)} innerhalb von 14 Tagen unter Angabe der Rechnungsnummer ${nummer}.`,
    );
    if (absender.iban) {
      hinweise.push(`Kontoinhaber: ${absender.firma}`);
      hinweise.push(`IBAN: ${absender.iban}${absender.bank ? ` · ${absender.bank}` : ''}`);
    }
  }
  for (const hinweis of hinweise) {
    for (const zeile of s.umbrechen(hinweis, 10, RECHTS - LINKS)) {
      s.text(zeile, LINKS, y, { groesse: 10 });
      y -= 14;
    }
  }
  if (!istStorno) {
    y -= 10;
    s.text('Vielen Dank für Ihre Fahrt!', LINKS, y, { groesse: 10, fett: true });
  }

  /* --- Fuss -------------------------------------------------------------- */

  s.linie(74);
  const fuss = [
    [absender.firma, absender.strasse, absender.ort].filter(Boolean).join(' · '),
    [
      absender.telefon && `Tel. ${absender.telefon}`,
      absender.email,
      `${steuernummerBeschriftung(absender.steuernummer)} ${absender.steuernummer}`,
    ]
      .filter(Boolean)
      .join(' · '),
  ];
  s.text(fuss[0]!, LINKS, 60, { groesse: 7.5, farbe: GRAU });
  s.text(fuss[1]!, LINKS, 49, { groesse: 7.5, farbe: GRAU });

  return doc.save();
}

/* ================================================================ Hilfen */

interface Stil {
  groesse: number;
  fett?: boolean;
  farbe?: ReturnType<typeof rgb>;
}

function schreiber(seite: PDFPage, normal: PDFFont, fett: PDFFont) {
  const zeichen = new Set(normal.getCharacterSet());
  const schrift = (istFett?: boolean) => (istFett ? fett : normal);
  const lesbar = (text: string) => fuerPdfSchrift(text, zeichen);

  return {
    text(text: string, x: number, y: number, stil: Stil) {
      seite.drawText(lesbar(text), {
        x,
        y,
        size: stil.groesse,
        font: schrift(stil.fett),
        color: stil.farbe ?? SCHRIFT,
      });
    },
    rechts(text: string, xRechts: number, y: number, stil: Stil) {
      const breite = schrift(stil.fett).widthOfTextAtSize(lesbar(text), stil.groesse);
      this.text(text, xRechts - breite, y, stil);
    },
    breite(text: string, groesse: number, istFett?: boolean) {
      return schrift(istFett).widthOfTextAtSize(lesbar(text), groesse);
    },
    linie(y: number, von = LINKS) {
      seite.drawLine({ start: { x: von, y }, end: { x: RECHTS, y }, thickness: 0.7, color: LINIE });
    },
    /** Bricht an Leerzeichen um, damit lange Adressen nicht ueber den Rand laufen. */
    umbrechen(text: string, groesse: number, maxBreite: number): string[] {
      const zeilen: string[] = [];
      for (const absatz of lesbar(text).split('\n')) {
        let zeile = '';
        for (const wort of absatz.split(/\s+/).filter(Boolean)) {
          const probe = zeile ? `${zeile} ${wort}` : wort;
          if (!zeile || normal.widthOfTextAtSize(probe, groesse) <= maxBreite) {
            zeile = probe;
          } else {
            zeilen.push(zeile);
            zeile = wort;
          }
        }
        if (zeile) zeilen.push(zeile);
      }
      return zeilen;
    },
  };
}

/** Buchstaben ohne naheliegende Zerlegung in Grundbuchstabe und Akzent. */
const ERSATZ: Record<string, string> = {
  ı: 'i',
  ł: 'l',
  Ł: 'L',
  đ: 'd',
  Đ: 'D',
  '\t': ' ',
};

/**
 * Macht Text fuer die eingebaute PDF-Schrift schreibbar.
 *
 * Die Standardschrift kennt Umlaute, ß und €, aber nicht jeden Buchstaben.
 * Tuerkische Namen wie "Şahin Yılmaz" liessen das PDF sonst mit einem Fehler
 * abbrechen. Solche Buchstaben verlieren ihren Akzent: "Sahin Yilmaz".
 * Eine eigene Schrift einzubetten wuerde den Dienst um mehrere hundert
 * Kilobyte vergroessern.
 */
export function fuerPdfSchrift(text: string, zeichen: Set<number>): string {
  let ergebnis = '';
  for (const z of text.replace(/\r\n?/g, '\n')) {
    if (z === '\n' || zeichen.has(z.codePointAt(0)!)) {
      ergebnis += z;
      continue;
    }
    const ohneAkzent = z.normalize('NFD').replace(/\p{M}/gu, '');
    if (ohneAkzent && [...ohneAkzent].every((b) => zeichen.has(b.codePointAt(0)!))) {
      ergebnis += ohneAkzent;
    } else {
      ergebnis += ERSATZ[z] ?? '?';
    }
  }
  return ergebnis;
}
