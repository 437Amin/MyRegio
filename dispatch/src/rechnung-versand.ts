/**
 * Die Rechnung als E-Mail an den Fahrgast.
 *
 * Der Text wird hier gebaut und ist ohne Netz testbar; verschickt wird ueber
 * brevo.ts. Festgehalten wird danach, WANN und WOHIN die Rechnung ging -
 * sonst laesst sich spaeter nicht unterscheiden, ob eine Rechnung nie
 * verschickt wurde oder der Versand gescheitert ist. Im ersten Fall darf man
 * nachschicken, im zweiten muss man.
 */

import { mailSenden, type Anhang } from './brevo';
import { rechnungAlsPdf } from './rechnung-pdf';
import {
  datumDeutsch,
  euro,
  rechnungsnummer,
  type Absender,
  type Rechnung,
} from './rechnung';
import type { Umgebung } from './typen';

/** Das Stueck D1, das hier gebraucht wird. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
    };
  };
}

export interface Anschreiben {
  betreff: string;
  text: string;
}

/**
 * Baut das Anschreiben zur Rechnung.
 *
 * Reiner Text, siehe brevo.ts. Der Bewertungshinweis erscheint nur, wenn ein
 * Link hinterlegt ist - ohne Link bleibt die Zeile weg, statt auf ein leeres
 * Ziel zu zeigen. Er steht ausserdem nicht unter einer Stornorechnung: Wer
 * gerade eine Korrektur bekommt, ist der falsche Adressat fuer die Bitte um
 * eine gute Bewertung.
 */
export function anschreiben(
  r: Rechnung,
  absender: Absender,
  bewertungLink = '',
): Anschreiben {
  const nummer = rechnungsnummer(r.jahr, r.laufnummer);
  const istStorno = r.storno_von !== null;

  const zeilen: string[] = [];

  zeilen.push(r.kunde_name ? `Guten Tag ${r.kunde_name},` : 'Guten Tag,');
  zeilen.push('');

  if (istStorno) {
    zeilen.push(
      `anbei die Stornorechnung ${nummer}. Sie hebt die zuvor` +
        ' verschickte Rechnung auf. Die berichtigte Rechnung erhalten Sie' +
        ' in einer getrennten Nachricht.',
    );
  } else {
    zeilen.push('vielen Dank für Ihre Fahrt mit MyRegioCar.');
    zeilen.push('');
    zeilen.push(
      `Im Anhang finden Sie Ihre Rechnung ${nummer} über ${euro(r.brutto_cent)}.`,
    );
  }

  zeilen.push('');
  zeilen.push(`Fahrt am ${datumDeutsch(r.fahrtdatum)}`);
  zeilen.push(`von ${r.von}`);
  if (r.nach) zeilen.push(`nach ${r.nach}`);

  if (bewertungLink && !istStorno) {
    zeilen.push('');
    zeilen.push('Waren Sie zufrieden? Über eine kurze Bewertung freuen wir uns:');
    zeilen.push(bewertungLink);
    // Hinweis auf den Widerspruch: Die Bitte um eine Bewertung ist Werbung,
    // auch wenn sie an einer Rechnung haengt.
    zeilen.push(
      'Wenn Sie solche Hinweise nicht möchten, antworten Sie kurz auf diese' +
        ' E-Mail – dann unterbleiben sie künftig.',
    );
  }

  zeilen.push('');
  zeilen.push('Freundliche Grüße');
  zeilen.push(absender.firma);
  zeilen.push(`${absender.strasse}, ${absender.ort}`);
  if (absender.telefon) zeilen.push(absender.telefon);

  return {
    betreff: istStorno
      ? `Stornorechnung ${nummer} – ${absender.marke}`
      : `Ihre Rechnung ${nummer} – ${absender.marke}`,
    text: zeilen.join('\n'),
  };
}

/** Dateiname des Anhangs: "Rechnung-2026-0007.pdf". */
export function anhangName(r: Rechnung): string {
  const nummer = rechnungsnummer(r.jahr, r.laufnummer);
  return `${r.storno_von !== null ? 'Stornorechnung' : 'Rechnung'}-${nummer}.pdf`;
}

export type Versandergebnis =
  | { ok: true }
  | { ok: false; grund: string };

/**
 * Schickt eine Rechnung als PDF an eine Adresse und haelt den Versand fest.
 *
 * Die Adresse wird mitgespeichert, nicht nur der Zeitpunkt: Aendert der
 * Fahrgast spaeter seine Adresse, muss nachvollziehbar bleiben, wohin die
 * Rechnung tatsaechlich ging.
 */
export async function rechnungVerschicken(
  db: Datenbank,
  env: Umgebung,
  r: Rechnung,
  empfaenger: string,
  absender: Absender,
  bewertungLink = '',
  original?: Rechnung | null,
): Promise<Versandergebnis> {
  let anhang: Anhang;
  try {
    anhang = { name: anhangName(r), daten: await rechnungAlsPdf(r, original) };
  } catch (fehler) {
    return {
      ok: false,
      grund: `PDF konnte nicht erzeugt werden: ${
        fehler instanceof Error ? fehler.message : String(fehler)
      }`,
    };
  }

  const brief = anschreiben(r, absender, bewertungLink);
  const ergebnis = await mailSenden(
    {
      an: empfaenger,
      anName: r.kunde_name || undefined,
      betreff: brief.betreff,
      text: brief.text,
      anhaenge: [anhang],
    },
    env,
  );

  if (!ergebnis.ok) return { ok: false, grund: ergebnis.grund };

  await db
    .prepare(
      `UPDATE rechnungen SET versendet_um = datetime('now'), versand_an = ?
        WHERE id = ?`,
    )
    .bind(empfaenger, r.id)
    .run();

  return { ok: true };
}
