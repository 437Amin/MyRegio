/**
 * Aus einer abgeschlossenen Fahrt wird eine Rechnung.
 *
 * Angestossen vom "Fahrt erledigt"-Knopf des Fahrers. Alles hier gilt der
 * einen Regel: **Eine Stoerung beim Rechnungsschreiben darf die Fahrt nicht
 * mitreissen.** Der Fahrer ist zu diesem Zeitpunkt bereits freigemeldet;
 * schlaegt hier etwas fehl, bekommt der Chef eine Nachricht und kann die
 * Rechnung im Fahrerbereich schreiben oder erneut verschicken.
 */

import { ladeEinstellungen } from './festpreis';
import { rechnungAnlegen, rechnungLaden } from './rechnung-ablage';
import { rechnungsentscheidung } from './rechnung-automatik';
import { rechnungVerschicken } from './rechnung-versand';
import {
  STEUERSATZ,
  absenderAusEinstellungen,
  betragAufteilen,
  euro,
  heuteInDeutschland,
  rechnungsnummer,
  type Zahlungsart,
} from './rechnung';
import { sendeNachricht } from './telegram';
import type { Auftrag, Umgebung } from './typen';

/** Was aus der Auftragstabelle gebraucht wird. */
type AuftragZeile = Pick<
  Auftrag,
  'id' | 'abholung' | 'ziel' | 'preis' | 'kunde_name' | 'eingang'
> & {
  rechnung_gewuenscht: number;
  kunde_email: string;
  wunsch_iso: string;
  sofort: number;
};

/**
 * Legt die Rechnung zur Fahrt an und verschickt sie.
 *
 * Wirft nie. Der Rueckgabewert sagt, was geschehen ist - fuer die Tests und
 * fuer das Protokoll.
 */
export async function rechnungAusFahrt(
  env: Umgebung,
  auftragId: string,
  zahlungsart: Zahlungsart | null,
): Promise<'keine' | 'verschickt' | 'angelegt' | 'chef' | 'schon-da'> {
  try {
    const auftrag = await env.DB.prepare(
      `SELECT id, abholung, ziel, preis, kunde_name, eingang, wunsch_iso, sofort,
              rechnung_gewuenscht, kunde_email
         FROM auftraege WHERE id = ?`,
    )
      .bind(auftragId)
      .first<AuftragZeile>();

    if (!auftrag) return 'keine';

    const entscheidung = rechnungsentscheidung(auftrag);
    if (entscheidung.art === 'keine') return 'keine';

    if (entscheidung.art === 'von-hand') {
      await chefBitten(env, auftrag, entscheidung.grund);
      return 'chef';
    }

    // Doppelte Rechnung verhindern: Zweimal auf "Erledigt" zu tippen ist
    // leicht passiert, und eine Rechnung zu viel muss von Hand storniert
    // werden. Stornorechnungen zaehlen nicht mit - sie gehoeren dazu.
    const vorhanden = await env.DB.prepare(
      'SELECT id FROM rechnungen WHERE auftrag_id = ? AND storno_von IS NULL',
    )
      .bind(auftragId)
      .first<{ id: number }>();
    if (vorhanden) return 'schon-da';

    const einstellungen = await ladeEinstellungen(env);
    const absender = absenderAusEinstellungen(einstellungen);
    const heute = heuteInDeutschland(new Date());
    const betraege = betragAufteilen(entscheidung.bruttoCent, STEUERSATZ);

    const id = await rechnungAnlegen(
      env.DB,
      {
        von: auftrag.abholung,
        nach: auftrag.ziel,
        fahrtdatum: fahrtdatum(auftrag),
        // Unter 250 EUR genuegt die Kleinbetragsrechnung ohne Anschrift. Der
        // Name steht trotzdem drauf: Er liegt vor und hilft beim Zuordnen.
        kundeName: auftrag.kunde_name,
        kundeAnschrift: '',
        zahlungsart: zahlungsart ?? 'bar',
        bruttoCent: entscheidung.bruttoCent,
        nettoCent: betraege.nettoCent,
        steuerCent: betraege.steuerCent,
        steuersatz: STEUERSATZ,
      },
      absender,
      heute,
      auftragId,
    );

    const rechnung = await rechnungLaden(env.DB, id);
    if (!rechnung) return 'angelegt';

    const ergebnis = await rechnungVerschicken(
      env.DB,
      env,
      rechnung,
      auftrag.kunde_email,
      absender,
      einstellungen.bewertung_link ?? '',
    );

    if (!ergebnis.ok) {
      await chefMelden(
        env,
        `⚠️ <b>Rechnung ${rechnungsnummer(rechnung.jahr, rechnung.laufnummer)} konnte nicht verschickt werden.</b>\n\n` +
          `An: ${auftrag.kunde_email}\n` +
          `Grund: ${ergebnis.grund}\n\n` +
          'Die Rechnung ist angelegt. Im Fahrerbereich unter „Rechnungen" lässt sie sich erneut verschicken.',
      );
      return 'angelegt';
    }

    return 'verschickt';
  } catch (fehler) {
    // Hier endet jeder unerwartete Fehler. Die Fahrt ist zu diesem Zeitpunkt
    // bereits abgeschlossen und der Fahrer frei - das bleibt auch so.
    await chefMelden(
      env,
      '⚠️ <b>Die Rechnung zu einer Fahrt konnte nicht erstellt werden.</b>\n\n' +
        `Grund: ${fehler instanceof Error ? fehler.message : String(fehler)}\n\n` +
        'Bitte im Fahrerbereich unter „Rechnungen" von Hand schreiben.',
    ).catch(() => undefined);
    return 'keine';
  }
}

/** Das Datum der Fahrt: die Wunschzeit, sonst der Eingang des Auftrags. */
function fahrtdatum(auftrag: AuftragZeile): string {
  const quelle =
    !auftrag.sofort && auftrag.wunsch_iso ? auftrag.wunsch_iso : auftrag.eingang;
  const datum = new Date(/[TZ]/.test(quelle) ? quelle : quelle.replace(' ', 'T') + 'Z');
  return Number.isNaN(datum.getTime())
    ? heuteInDeutschland(new Date())
    : heuteInDeutschland(datum);
}

async function chefBitten(
  env: Umgebung,
  auftrag: AuftragZeile,
  grund: string,
): Promise<void> {
  await chefMelden(
    env,
    '🧾 <b>Rechnung von Hand nötig.</b>\n\n' +
      `${grund}\n\n` +
      `<b>Fahrgast:</b> ${auftrag.kunde_name}\n` +
      (auftrag.kunde_email ? `<b>E-Mail:</b> ${auftrag.kunde_email}\n` : '') +
      `<b>Von:</b> ${auftrag.abholung}\n` +
      (auftrag.ziel ? `<b>Nach:</b> ${auftrag.ziel}\n` : '') +
      (auftrag.preis > 0 ? `<b>Preis:</b> ${euro(Math.round(auftrag.preis * 100))}\n` : '') +
      '\nIm Fahrerbereich unter „Rechnungen".',
  );
}

async function chefMelden(env: Umgebung, text: string): Promise<void> {
  if (!env.CHEF_CHAT_ID) return;
  await sendeNachricht(env.TELEGRAM_TOKEN, env.CHEF_CHAT_ID, text);
}
