import type { Umgebung } from './typen';
import { preisBerechnen, tarifAusEinstellungen } from './preis';
import { adresseFinden, streckeZwischenPunkten } from './strecke';

/**
 * Strecke messen und Festpreis rechnen.
 *
 * Steht bewusst in einer eigenen Datei und nicht mehr in index.ts: Sowohl die
 * Website (ueber /api/preis) als auch der Fahrerbereich (telefonische
 * Auftraege) brauchen dieselbe Rechnung. Wuerde der Fahrerbereich sie aus
 * index.ts holen, entstuende ein Ringimport - index laedt admin, admin laedt
 * index.
 *
 * Gerechnet wird ausschliesslich hier auf dem Server. Ein im Browser
 * ermittelter Preis liesse sich veraendern, und ein angezeigter Festpreis ist
 * bindend.
 */

/** Betriebssitz Steiermaerker Str. 3-5 - Mittelpunkt jeder Adresssuche. */
export const HEIMAT = { breite: 48.8143644, laenge: 9.165389 };

export interface Punkt {
  breite: number;
  laenge: number;
  bezeichnung: string;
}

export interface Festpreis {
  preis: number;
  km: number;
  minuten: number;
  vonErkannt: string;
  nachErkannt: string;
}

/**
 * Nimmt uebergebene Koordinaten nur an, wenn sie plausibel sind.
 * Der Preis wird daraus gerechnet - erfundene Werte wuerden ihn verfaelschen.
 */
export function pruefePunkt(roh: unknown): Punkt | undefined {
  if (!roh || typeof roh !== 'object') return undefined;
  const p = roh as Record<string, unknown>;
  const breite = Number(p.breite);
  const laenge = Number(p.laenge);

  // Grob Deutschland - alles andere kann keine Fahrt von hier aus sein
  if (!Number.isFinite(breite) || breite < 47 || breite > 55.2) return undefined;
  if (!Number.isFinite(laenge) || laenge < 5.5 || laenge > 15.1) return undefined;

  return {
    breite,
    laenge,
    bezeichnung: String(p.bezeichnung ?? '').slice(0, 200),
  };
}

/**
 * Ermittelt Strecke und Festpreis. Wird fuer die Voranzeige, beim Bestellen
 * und bei der telefonischen Aufnahme benutzt - so steht am Ende immer der
 * Betrag im Auftrag, den der Server gerechnet hat.
 *
 * Kann eine Adresse nicht sicher zugeordnet werden, kommt bewusst kein Preis
 * zurueck. Ein falscher Festpreis waere bindend.
 */
export async function festpreisErmitteln(
  vonText: string,
  nachText: string,
  env: Umgebung,
  vonPunkt?: Punkt,
  nachPunkt?: Punkt,
): Promise<Festpreis | null> {
  if (!env.ORS_SCHLUESSEL) return null;

  // Hat der Fahrgast aus der Vorschlagsliste gewaehlt, nehmen wir genau
  // diesen Punkt. Nur sonst wird der Freitext gedeutet - mit dem bekannten
  // Risiko, dass eine aehnlich klingende Adresse in der Naehe gefunden wird.
  const von =
    vonPunkt ??
    (vonText
      ? await adresseFinden(vonText, env.ORS_SCHLUESSEL, HEIMAT.breite, HEIMAT.laenge)
      : null);
  const nach =
    nachPunkt ??
    (nachText
      ? await adresseFinden(nachText, env.ORS_SCHLUESSEL, HEIMAT.breite, HEIMAT.laenge)
      : null);

  if (!von || !nach) return null;

  const strecke = await streckeMitSpeicher(von, nach, env);
  if (!strecke) return null;

  const einstellungen = await ladeEinstellungen(env);
  return {
    preis: preisBerechnen(strecke.km, tarifAusEinstellungen(einstellungen)),
    km: strecke.km,
    minuten: strecke.minuten,
    vonErkannt: von.bezeichnung,
    nachErkannt: nach.bezeichnung,
  };
}

/**
 * Holt die Strecke - erst aus dem Zwischenspeicher, sonst vom Kartendienst.
 * Der Schluessel rundet die Koordinaten auf etwa zehn Meter, damit auch
 * leicht abweichende Punkte denselben Eintrag treffen.
 */
export async function streckeMitSpeicher(
  von: { breite: number; laenge: number },
  nach: { breite: number; laenge: number },
  env: Umgebung,
): Promise<{ km: number; minuten: number } | null> {
  const r = (zahl: number) => zahl.toFixed(4);
  const schluessel = `${r(von.breite)},${r(von.laenge)}>${r(nach.breite)},${r(nach.laenge)}`;

  const gespeichert = await env.DB.prepare(
    "SELECT km, minuten FROM strecken_speicher WHERE schluessel = ? AND angelegt > datetime('now', '-30 days')",
  )
    .bind(schluessel)
    .first<{ km: number; minuten: number }>();

  if (gespeichert) return gespeichert;

  const gemessen = await streckeZwischenPunkten(
    von.breite,
    von.laenge,
    nach.breite,
    nach.laenge,
    env.ORS_SCHLUESSEL!,
  );
  if (!gemessen) return null;

  await env.DB.prepare(
    `INSERT INTO strecken_speicher (schluessel, km, minuten) VALUES (?, ?, ?)
     ON CONFLICT(schluessel) DO UPDATE SET km = excluded.km,
       minuten = excluded.minuten, angelegt = datetime('now')`,
  )
    .bind(schluessel, gemessen.km, gemessen.minuten)
    .run();

  return gemessen;
}

export async function ladeEinstellungen(env: Umgebung): Promise<Record<string, string>> {
  const zeilen = await env.DB.prepare(
    'SELECT schluessel, wert FROM einstellungen',
  ).all<{ schluessel: string; wert: string }>();

  const werte: Record<string, string> = {};
  for (const zeile of zeilen.results ?? []) werte[zeile.schluessel] = zeile.wert;
  return werte;
}
