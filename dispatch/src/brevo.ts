/**
 * E-Mail-Versand über Brevo.
 *
 * Bewusst reiner Text, kein HTML. Drei Gruende:
 *
 *  1. Brevo schreibt Links in HTML-Mails um, um Klicks zu zaehlen. Auf einer
 *     Rechnung sieht eine fremde Zaehladresse unseriös aus und kostet eher
 *     Vertrauen, als sie nuetzt. In reinem Text passiert das nicht.
 *  2. Was zaehlt, ist das PDF im Anhang - der Text ist nur das Anschreiben.
 *  3. Reiner Text kommt ueberall an und laesst sich nicht kaputt darstellen.
 *
 * Die Zerlegung ist Absicht: "mailKoerper" baut nur den Datensatz und ist
 * ohne Netz testbar; "mailSenden" schickt ihn los.
 */

import type { Umgebung } from './typen';

const BREVO_ADRESSE = 'https://api.brevo.com/v3/smtp/email';

/** Im Test zeigt BREVO_BASIS auf eine Attrappe, sonst gilt die echte Adresse. */
function adresse(env: Umgebung): string {
  return env.BREVO_BASIS ? `${env.BREVO_BASIS}/v3/smtp/email` : BREVO_ADRESSE;
}

/** Absender aller Mails. Die Domain ist bei Brevo authentifiziert. */
export const ABSENDER = {
  name: 'MyRegioCar',
  email: 'contact@myregiocar.com',
};

export interface Anhang {
  /** Dateiname, so wie ihn der Empfaenger sieht */
  name: string;
  daten: Uint8Array;
}

export interface Mail {
  an: string;
  anName?: string;
  betreff: string;
  text: string;
  anhaenge?: Anhang[];
}

export type Versandergebnis =
  | { ok: true; kennung: string }
  | { ok: false; grund: string };

/**
 * Wandelt Binaerdaten in Base64 um.
 *
 * In Schritten von 8 KB, weil String.fromCharCode mit allen Bytes auf einmal
 * bei grossen Dateien den Aufrufstapel sprengt - ein PDF mit Logo reicht dafuer
 * schon aus.
 */
export function alsBase64(daten: Uint8Array): string {
  const SCHRITT = 8192;
  let roh = '';
  for (let i = 0; i < daten.length; i += SCHRITT) {
    roh += String.fromCharCode(...daten.subarray(i, i + SCHRITT));
  }
  return btoa(roh);
}

/** Baut den Datensatz, den Brevo erwartet. Ohne Netz - deshalb testbar. */
export function mailKoerper(mail: Mail): Record<string, unknown> {
  const koerper: Record<string, unknown> = {
    sender: ABSENDER,
    to: [mail.anName ? { email: mail.an, name: mail.anName } : { email: mail.an }],
    subject: mail.betreff,
    textContent: mail.text,
  };

  if (mail.anhaenge?.length) {
    koerper.attachment = mail.anhaenge.map((anhang) => ({
      name: anhang.name,
      content: alsBase64(anhang.daten),
    }));
  }

  return koerper;
}

/**
 * Verschickt eine Mail.
 *
 * Wirft nicht, sondern liefert den Grund zurueck: Ein gescheiterter Versand
 * darf nie den Vorgang mitreissen, aus dem er stammt. Eine Rechnung, die
 * angelegt, aber nicht verschickt wurde, laesst sich nachschicken - eine
 * Fahrt, die wegen eines Mailfehlers nicht als erledigt gilt, blockiert den
 * Fahrer.
 */
export async function mailSenden(mail: Mail, env: Umgebung): Promise<Versandergebnis> {
  if (!env.BREVO_API_KEY) {
    return { ok: false, grund: 'Kein BREVO_API_KEY hinterlegt' };
  }

  try {
    const antwort = await fetch(adresse(env), {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(mailKoerper(mail)),
    });

    if (!antwort.ok) {
      // Brevos Fehlertext mitnehmen, aber gekuerzt und ohne den Schluessel
      const text = (await antwort.text().catch(() => '')).slice(0, 300);
      return { ok: false, grund: `Brevo antwortete ${antwort.status}: ${text}` };
    }

    const daten = (await antwort.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, kennung: daten.messageId ?? '' };
  } catch (fehler) {
    return {
      ok: false,
      grund: fehler instanceof Error ? fehler.message : String(fehler),
    };
  }
}
