/**
 * Die kurze Nachricht nach der Fahrt - Dank, Bewertung, Rückmeldung.
 *
 * Getrennt von der Rechnung, und zwar bewusst: Eine Rechnung schuldet man dem
 * Fahrgast, eine Bitte um eine Bewertung ist Werbung (so sieht es der BGH).
 * Deshalb ein eigenes Haekchen bei der Bestellung, ein Hinweis auf den
 * Widerspruch in jeder Nachricht - und nie beides zugleich: Wer die Rechnung
 * per Mail bekommt, findet die Bitte dort und nicht noch einmal einzeln.
 *
 * Der Text ist hier rein und ohne Netz gebaut, damit er testbar bleibt.
 */

import { mailSenden } from './brevo';
import { ladeEinstellungen } from './festpreis';
import { absenderAusEinstellungen, type Absender } from './rechnung';
import type { Umgebung } from './typen';

export interface Anschreiben {
  betreff: string;
  text: string;
}

/** Was aus dem Auftrag gebraucht wird. */
export interface AuftragFuerDanke {
  bewertung_gewuenscht: number;
  kunde_email: string;
  kunde_name: string;
}

/**
 * Baut die Nachricht.
 *
 * Ohne Bewertungslink wird sie nicht sinnlos: Dann ist es ein Dank mit der
 * Einladung, auf die Mail zu antworten, wenn etwas nicht gepasst hat. Das ist
 * ehrlicher als ein toter Link - und eine Rueckmeldung ist ohnehin das, was
 * sich verbessern laesst.
 */
export function dankeAnschreiben(
  kundeName: string,
  absender: Absender,
  bewertungLink = '',
): Anschreiben {
  const zeilen: string[] = [];

  zeilen.push(kundeName ? `Guten Tag ${kundeName},` : 'Guten Tag,');
  zeilen.push('');
  zeilen.push('vielen Dank, dass Sie mit uns gefahren sind.');
  zeilen.push('');

  if (bewertungLink) {
    zeilen.push('Waren Sie zufrieden? Über eine kurze Bewertung freuen wir uns:');
    zeilen.push(bewertungLink);
    zeilen.push('');
    zeilen.push(
      'Und falls etwas nicht gepasst hat: Antworten Sie einfach auf diese' +
        ' E-Mail. Wir lesen jede Rückmeldung.',
    );
  } else {
    zeilen.push(
      'Hat alles gepasst? Antworten Sie gern kurz auf diese E-Mail – über Lob' +
        ' freuen wir uns, und aus Kritik lernen wir.',
    );
  }

  zeilen.push('');
  // Die Bitte um eine Bewertung ist Werbung. Der Hinweis auf den Widerspruch
  // gehoert deshalb in jede dieser Nachrichten, nicht nur in die erste.
  zeilen.push(
    'Sie bekommen diese Nachricht, weil Sie bei der Buchung darum gebeten' +
      ' haben. Möchten Sie das künftig nicht mehr, genügt eine kurze Antwort.',
  );
  zeilen.push('');
  zeilen.push('Freundliche Grüße');
  zeilen.push(absender.firma);
  zeilen.push(`${absender.strasse}, ${absender.ort}`);
  if (absender.telefon) zeilen.push(absender.telefon);

  return {
    betreff: `Danke für Ihre Fahrt – ${absender.marke}`,
    text: zeilen.join('\n'),
  };
}

/** Soll nach dieser Fahrt eine Nachricht raus? */
export function dankeFaellig(
  auftrag: AuftragFuerDanke,
  rechnungVerschickt: boolean,
): boolean {
  if (!auftrag.bewertung_gewuenscht) return false;
  if (!auftrag.kunde_email.trim()) return false;
  // Steckt die Bitte schon in der Rechnung, kommt sie nicht noch einmal
  return !rechnungVerschickt;
}

/**
 * Schickt die Nachricht nach der Fahrt.
 *
 * Wirft nie und meldet auch nichts an den Chef: Eine Dankesmail, die nicht
 * ankommt, ist ein Schoenheitsfehler - keine Meldung wert, die zwischen den
 * wichtigen untergehen wuerde.
 */
export async function dankeNachFahrt(
  env: Umgebung,
  auftragId: string,
  rechnungVerschickt: boolean,
): Promise<'keine' | 'verschickt' | 'fehler'> {
  try {
    const auftrag = await env.DB.prepare(
      'SELECT bewertung_gewuenscht, kunde_email, kunde_name FROM auftraege WHERE id = ?',
    )
      .bind(auftragId)
      .first<AuftragFuerDanke>();

    if (!auftrag || !dankeFaellig(auftrag, rechnungVerschickt)) return 'keine';

    const einstellungen = await ladeEinstellungen(env);
    const brief = dankeAnschreiben(
      auftrag.kunde_name,
      absenderAusEinstellungen(einstellungen),
      einstellungen.bewertung_link ?? '',
    );

    const ergebnis = await mailSenden(
      {
        an: auftrag.kunde_email,
        anName: auftrag.kunde_name || undefined,
        betreff: brief.betreff,
        text: brief.text,
      },
      env,
    );

    return ergebnis.ok ? 'verschickt' : 'fehler';
  } catch {
    return 'fehler';
  }
}
