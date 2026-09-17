/**
 * Zeitpunkte zwischen Formular und Datenbank umrechnen.
 *
 * Der Grund fuer diese Datei: Cloudflare laeuft in UTC. Tippt Oender im
 * Fahrerbereich "18.09.2026, 07:30" ein, meint er deutsche Ortszeit. Ein
 * schlichtes new Date('2026-09-18T07:30') liest das im Worker als 07:30 UTC -
 * im Sommer waeren das 09:30 in Stuttgart. Die Fahrt ginge damit an die
 * falsche Schicht, und in Telegram staende die falsche Uhrzeit.
 *
 * Bewusst ohne Bibliothek: Intl kennt die Zeitzonendaten bereits.
 */

const ZEITZONE = 'Europe/Berlin';

/**
 * Wie viele Minuten liegt deutsche Ortszeit zu diesem Zeitpunkt vor UTC?
 * Im Winter 60, im Sommer 120.
 */
function abstandZuUtc(zeitpunkt: Date): number {
  const teile = new Intl.DateTimeFormat('en-US', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(zeitpunkt);

  const zahl = (art: string) => Number(teile.find((t) => t.type === art)?.value ?? '0');
  // 24:00 kommt in manchen Umgebungen fuer Mitternacht zurueck
  const alsUtc = Date.UTC(
    zahl('year'),
    zahl('month') - 1,
    zahl('day'),
    zahl('hour') % 24,
    zahl('minute'),
    zahl('second'),
  );

  return Math.round((alsUtc - zeitpunkt.getTime()) / 60000);
}

/** Zeigt die Uhr in Deutschland zu diesem Zeitpunkt genau diese Wandzeit? */
function wandzeitPasst(ms: number, datum: string, stunde: number, minute: number): boolean {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));

  const teil = (art: string) => teile.find((t) => t.type === art)?.value ?? '';
  return (
    `${teil('year')}-${teil('month')}-${teil('day')}` === datum &&
    Number(teil('hour')) % 24 === stunde &&
    Number(teil('minute')) === minute
  );
}

/**
 * Macht aus Datum und Uhrzeit eines Formulars ("2026-09-18", "07:30") den
 * tatsaechlichen Zeitpunkt als ISO-Text.
 *
 * Gerechnet wird mit zwei Kandidaten: einmal mit dem Abstand zu UTC vor der
 * Umstellung, einmal danach. Danach wird geprueft, welcher davon in
 * Deutschland tatsaechlich die eingetippte Uhrzeit zeigt. Das ist der
 * Unterschied zu "einfach zweimal rechnen" - nur so ist das Ergebnis in den
 * Umstellungsnaechten eine Entscheidung und kein Zufall:
 *
 *  - 29.03. um 02:30 gibt es NICHT (die Uhr springt 02:00 -> 03:00). Kein
 *    Kandidat passt, genommen wird die Stunde danach: 03:30.
 *  - 25.10. um 02:30 gibt es ZWEIMAL. Beide passen, genommen wird die
 *    fruehere, also die noch in der Sommerzeit. So halten es auch die
 *    gaengigen Zeitbibliotheken.
 */
export function berlinNachIso(datum: string, zeit: string): string | null {
  const tag = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum.trim());
  const uhr = /^(\d{1,2}):(\d{2})$/.exec(zeit.trim());
  if (!tag || !uhr) return null;

  const [jahr, monat, tagZahl] = [Number(tag[1]), Number(tag[2]), Number(tag[3])];
  const [stunde, minute] = [Number(uhr[1]), Number(uhr[2])];
  if (stunde > 23 || minute > 59) return null;

  const alsWaereEsUtc = Date.UTC(jahr, monat - 1, tagZahl, stunde, minute);
  if (Number.isNaN(alsWaereEsUtc)) return null;

  // Ein Datum wie der 31.02. rutscht bei Date.UTC stillschweigend in den
  // naechsten Monat. Hier faellt das auf, statt eine falsche Fahrt anzulegen.
  const geprueft = new Date(alsWaereEsUtc);
  if (
    geprueft.getUTCFullYear() !== jahr ||
    geprueft.getUTCMonth() !== monat - 1 ||
    geprueft.getUTCDate() !== tagZahl
  ) {
    return null;
  }

  // Die Abstaende von BEIDEN Seiten des Tages holen - einen Tag davor und
  // einen danach. Sonst entsteht in der Umstellungsnacht nur der Kandidat der
  // gerade geltenden Zeit, und die andere Moeglichkeit faellt unter den Tisch.
  const abstaende = new Set([
    abstandZuUtc(new Date(alsWaereEsUtc - 86_400_000)),
    abstandZuUtc(new Date(alsWaereEsUtc + 86_400_000)),
  ]);
  const kandidaten = [...abstaende].map((abstand) => alsWaereEsUtc - abstand * 60000);

  const passende = kandidaten.filter((ms) =>
    wandzeitPasst(ms, `${tag[1]}-${tag[2]}-${tag[3]}`, stunde, minute),
  );

  const gewaehlt =
    passende.length > 0
      ? // Gibt es die Uhrzeit zweimal, gilt die fruehere
        Math.min(...passende)
      : // Gibt es sie gar nicht, die Stunde danach
        Math.max(...kandidaten);

  return new Date(gewaehlt).toISOString();
}

/**
 * Schreibweise, in der SQLite Zeitstempel ablegt: "2026-09-17 09:00:00" in
 * UTC. Wichtig, weil datetime('now') genau so schreibt - stuende in derselben
 * Spalte einmal ISO und einmal dieses Format, waere jede Auswertung schief.
 */
export function alsDatenbankzeit(iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return '';
  return zeitpunkt.toISOString().slice(0, 19).replace('T', ' ');
}

/** Der aktuelle Zeitpunkt als Vorgabe fuer die Formularfelder. */
export function jetztAlsFormular(jetzt: Date): { datum: string; zeit: string } {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZEITZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(jetzt);

  const teil = (art: string) => teile.find((t) => t.type === art)?.value ?? '';
  return {
    datum: `${teil('year')}-${teil('month')}-${teil('day')}`,
    zeit: `${String(Number(teil('hour')) % 24).padStart(2, '0')}:${teil('minute')}`,
  };
}

/**
 * Wie der Zeitpunkt dem Fahrer in Telegram und im Fahrerbereich angezeigt
 * wird: "Fr., 18.09.2026, 07:30".
 */
export function zeitpunktDeutsch(iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return '';

  return new Intl.DateTimeFormat('de-DE', {
    timeZone: ZEITZONE,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(zeitpunkt);
}
