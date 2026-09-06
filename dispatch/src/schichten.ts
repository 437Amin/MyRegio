import type { Fahrer } from './typen';

/**
 * Wer bekommt einen Auftrag - und in welcher Reihenfolge?
 *
 * Bewusst als reine Funktionen ohne Datenbank und ohne Netz, damit sich der
 * Kern der Vermittlung testen laesst (siehe test/schichten.test.ts).
 */

/**
 * Liest Stunde und Minute in DEUTSCHER Ortszeit aus.
 *
 * Wichtig: Cloudflare-Server laufen in UTC. Ohne diese Umrechnung waere es
 * um 23:00 deutscher Zeit im Sommer erst 21:00 UTC - der Auftrag ginge dann
 * faelschlich an die Tagfahrer.
 */
export function deutscheUhrzeit(zeitpunkt: Date): { stunde: number; minute: number } {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(zeitpunkt);

  const zahl = (art: string) =>
    Number(teile.find((teil) => teil.type === art)?.value ?? '0');

  // 24:00 kommt in manchen Umgebungen fuer Mitternacht zurueck
  const stunde = zahl('hour') % 24;
  return { stunde, minute: zahl('minute') };
}

/** Wandelt "22:00" in Minuten seit Mitternacht um. */
export function alsMinuten(uhrzeit: string): number {
  const [stunde, minute] = uhrzeit.split(':').map(Number);
  return (stunde ?? 0) * 60 + (minute ?? 0);
}

/**
 * Faellt der Zeitpunkt in das Nachtfenster?
 * Das Fenster darf ueber Mitternacht gehen (22:00 bis 06:00).
 */
export function istNacht(
  zeitpunkt: Date,
  nachtVon = '22:00',
  nachtBis = '06:00',
): boolean {
  const { stunde, minute } = deutscheUhrzeit(zeitpunkt);
  const jetzt = stunde * 60 + minute;
  const von = alsMinuten(nachtVon);
  const bis = alsMinuten(nachtBis);

  // Fenster ueber Mitternacht, z. B. 22:00 - 06:00
  if (von > bis) return jetzt >= von || jetzt < bis;
  // Fenster innerhalb eines Tages, z. B. 01:00 - 05:00
  return jetzt >= von && jetzt < bis;
}

/**
 * Liefert die Fahrer, die jetzt gefragt werden - in der Reihenfolge, in der
 * sie gefragt werden sollen.
 *
 * Beruecksichtigt werden nur Fahrer, die aktiv sind UND den Telegram-Bot
 * bereits gestartet haben. Wer sich noch nicht angemeldet hat, koennte die
 * Nachricht gar nicht empfangen.
 */
export function fahrerFuerZeitpunkt(
  alle: Fahrer[],
  zeitpunkt: Date,
  nachtVon = '22:00',
  nachtBis = '06:00',
): Fahrer[] {
  const nacht = istNacht(zeitpunkt, nachtVon, nachtBis);
  const passendeSchicht = nacht ? 'nacht' : 'tag';

  return alle
    .filter((fahrer) => fahrer.aktiv === 1)
    .filter((fahrer) => Boolean(fahrer.telegram_chat_id))
    .filter(
      (fahrer) =>
        fahrer.schicht === 'beide' || fahrer.schicht === passendeSchicht,
    )
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.id - b.id);
}
