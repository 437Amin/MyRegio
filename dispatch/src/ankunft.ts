/**
 * Wie weit ist der Fahrer noch weg?
 *
 * Gerechnet wird aus der Luftlinie, nicht aus einer gefahrenen Route. Das ist
 * Absicht: Die Statusseite fragt alle paar Sekunden nach, und jede Anfrage an
 * einen Kartendienst waere eine Anfrage zu viel - fuer Geld, fuer Wartezeit
 * und fuer die Zusage, dass auf der Seite nichts von fremden Servern laeuft.
 *
 * Die Zahl ist deshalb eine Schaetzung und wird dem Fahrgast auch so gesagt
 * ("etwa"). Lieber ehrlich ungenau als genau falsch.
 *
 * Rein und ohne Datenbank, damit sich jede Regel einzeln pruefen laesst.
 */

/** Erdradius in Kilometern. */
const ERDRADIUS_KM = 6371;

/**
 * Umweg-Zuschlag auf die Luftlinie.
 *
 * Strassen laufen nicht schnurgerade. 1,35 trifft Stuttgarter Stadtverkehr
 * brauchbar - durch die Kessellage sind es stellenweise mehr, auf den
 * Ausfallstrassen weniger.
 */
const UMWEG = 1.35;

/** Durchschnittstempo in km/h, inklusive Ampeln und Suchen der Einfahrt. */
const TEMPO_KMH = 27;

/** Zuschlag fuer das Anhalten, Parken und die letzten Meter zu Fuss. */
const ZUSCHLAG_MINUTEN = 2;

/**
 * Aelter als das - dann sagen wir lieber nichts.
 *
 * Gilt fuer einen einmalig gesendeten Punkt. Laenger als zwanzig Minuten
 * unterwegs heisst: Irgendetwas ist anders gekommen als gedacht, und jede
 * Hochrechnung waere geraten.
 */
export const HOECHSTALTER_SEKUNDEN = 20 * 60;

/**
 * So weit darf die Schaetzung ueberzogen werden, bevor wir schweigen.
 *
 * Der Fahrer hat EINEN Punkt geschickt und faehrt seitdem los. Wir zaehlen
 * mit - aber wenn die geschaetzte Zeit um mehr als diese Spanne verstrichen
 * ist, stimmt die Annahme nicht mehr, und ein "gleich da" waere eine
 * Beschwichtigung statt einer Auskunft.
 */
export const NACHLAUF_MINUTEN = 3;

export interface Punkt {
  breite: number;
  laenge: number;
}

/** Luftlinie zwischen zwei Punkten in Kilometern (Haversine). */
export function luftlinieKm(von: Punkt, nach: Punkt): number {
  const bogen = (grad: number): number => (grad * Math.PI) / 180;

  const dBreite = bogen(nach.breite - von.breite);
  const dLaenge = bogen(nach.laenge - von.laenge);

  const a =
    Math.sin(dBreite / 2) ** 2 +
    Math.cos(bogen(von.breite)) * Math.cos(bogen(nach.breite)) * Math.sin(dLaenge / 2) ** 2;

  return 2 * ERDRADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Geschaetzte Minuten bis zur Abholung, mindestens 1. */
export function ankunftMinuten(von: Punkt, nach: Punkt): number {
  const strecke = luftlinieKm(von, nach) * UMWEG;
  return Math.max(1, Math.round((strecke / TEMPO_KMH) * 60 + ZUSCHLAG_MINUTEN));
}

export interface Standort extends Punkt {
  /** Zeitpunkt der Meldung, als ISO-Text oder SQLite-Zeit */
  zeitpunkt: string;
  /** Bis wann die Live-Freigabe laeuft. Fehlt bei einem einmaligen Punkt. */
  live_bis?: string | null;
}

/**
 * Solange eine Live-Freigabe laeuft, darf die letzte Meldung aelter sein.
 *
 * Telegram aktualisiert nur bei Bewegung: Ein Fahrer im Stau oder an der
 * Ampel meldet minutenlang nichts, und sein Punkt stimmt trotzdem. Eine
 * Obergrenze bleibt, falls das Handy in den Tiefschlaf geht.
 */
export const HOECHSTALTER_LIVE_SEKUNDEN = 900;

/** Laeuft die Live-Freigabe gerade noch? */
function liveLaeuft(bis: string | null | undefined, jetzt: Date): boolean {
  if (!bis) return false;
  const ende = new Date(/[TZ]|[+-]\d\d:\d\d$/.test(bis) ? bis : bis.replace(' ', 'T') + 'Z');
  return !Number.isNaN(ende.getTime()) && ende.getTime() > jetzt.getTime();
}

/**
 * Der Satz, den der Fahrgast liest - oder null, wenn wir nichts sagen sollten.
 *
 * Null statt eines vagen Satzes ist hier die bessere Antwort: Ohne Standort,
 * ohne Abholpunkt oder mit einer veralteten Meldung waere jede Zahl geraten.
 * Dann steht auf der Seite einfach nichts weiter - der Fahrgast weiss ja, dass
 * jemand unterwegs ist.
 */
export function ankunftstext(
  standort: Standort | null,
  abholung: Punkt | null,
  jetzt: Date,
): string | null {
  if (!standort || !abholung) return null;

  const gemeldet = new Date(
    /[TZ]|[+-]\d\d:\d\d$/.test(standort.zeitpunkt)
      ? standort.zeitpunkt
      : standort.zeitpunkt.replace(' ', 'T') + 'Z',
  );
  if (Number.isNaN(gemeldet.getTime())) return null;

  const alterSekunden = (jetzt.getTime() - gemeldet.getTime()) / 1000;
  // Auch ein Standort aus der Zukunft ist unbrauchbar - dann geht eine Uhr falsch
  if (alterSekunden < -60) return null;

  const vomPunkt = ankunftMinuten(standort, abholung);

  // --- Laufende Live-Freigabe: der Punkt selbst ist aktuell ----------------
  if (liveLaeuft(standort.live_bis, jetzt)) {
    if (alterSekunden > HOECHSTALTER_LIVE_SEKUNDEN) return null;
    return satz(vomPunkt);
  }

  // --- Einmaliger Punkt: mitzaehlen ----------------------------------------
  //
  // Der Fahrer hat einmal getippt und faehrt seitdem. Die Zahl einzufrieren
  // waere falsch, und sie nach drei Minuten verschwinden zu lassen auch: Er
  // ist ja unterwegs, und zwar genau dorthin. Also rechnen wir mit, was seit
  // der Meldung vergangen ist - und schweigen, sobald die Schaetzung
  // ueberzogen ist. Lieber nichts sagen als beschwichtigen.
  if (alterSekunden > HOECHSTALTER_SEKUNDEN) return null;

  const verbleibend = vomPunkt - alterSekunden / 60;
  if (verbleibend < -NACHLAUF_MINUTEN) return null;

  return satz(Math.round(verbleibend));
}

function satz(minuten: number): string {
  if (minuten <= 1) return 'Ihr Fahrer ist gleich da.';
  if (minuten <= 2) return 'Ihr Fahrer ist etwa 2 Minuten entfernt.';
  return `Ihr Fahrer ist etwa ${minuten} Minuten entfernt.`;
}
