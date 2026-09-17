/**
 * Wer ist gerade unterwegs?
 *
 * Bis jetzt kannte die Vermittlung diesen Zustand nicht: Ein Fahrer, der eine
 * Fahrt angenommen hatte, wurde beim naechsten Auftrag genauso gefragt wie
 * jeder andere. Bei telefonisch vergebenen Fahrten faellt das auf die Fuesse -
 * der Fahrer sitzt schon im Auto und bekommt trotzdem ein Angebot.
 *
 * Rein und ohne Datenbank, damit sich die Regeln testen lassen.
 */

/** Was aus der Auftragstabelle gebraucht wird, um Belegung zu beurteilen. */
export interface LaufenderAuftrag {
  fahrer_id: number;
  /** Zeitpunkt der Fahrt, maschinenlesbar. Leer bei "so bald wie moeglich" */
  wunsch_iso: string;
  sofort: number;
  /** Eingang des Auftrags - gilt als Beginn, wenn es keine Wunschzeit gibt */
  eingang: string;
  strecke_km: number;
}

/** Grundannahme, wenn die Strecke unbekannt ist. */
export const GRUNDDAUER_MINUTEN = 60;
/** Obergrenze, damit eine Fernfahrt niemanden den halben Tag sperrt. */
export const HOECHSTDAUER_MINUTEN = 240;

/**
 * Wie lange ein Auftrag seinen Fahrer voraussichtlich bindet.
 *
 * Geschaetzt, nicht gemessen: In der Auftragstabelle stehen Kilometer, aber
 * keine Minuten. Zwei Minuten je Kilometer trifft Stadtverkehr gut genug, und
 * die Grunddauer deckt Anfahrt, Warten und Rueckweg ab.
 *
 * Die Schaetzung ist die Notbremse, nicht der Normalfall: Im Regelfall meldet
 * der Fahrer die Fahrt in Telegram als erledigt und ist sofort wieder frei.
 * Ohne diese Obergrenze wuerde ein vergessener Auftrag den Fahrer dauerhaft
 * sperren - im schlimmsten Fall die ganze Flotte.
 */
export function dauerMinuten(streckeKm: number): number {
  const geschaetzt = GRUNDDAUER_MINUTEN + Math.max(0, streckeKm) * 2;
  return Math.min(HOECHSTDAUER_MINUTEN, Math.round(geschaetzt));
}

/** Wann beginnt der Auftrag? */
export function beginn(auftrag: LaufenderAuftrag): Date {
  const gewuenscht =
    !auftrag.sofort && auftrag.wunsch_iso ? new Date(auftrag.wunsch_iso) : null;
  if (gewuenscht && !Number.isNaN(gewuenscht.getTime())) return gewuenscht;

  // "so bald wie moeglich": Der Eingang ist der Beginn. SQLite liefert
  // "2026-09-18 05:30:00" ohne Zeitzone - das ist UTC. Ein bereits
  // vollstaendiger Zeitstempel wird unveraendert gelesen.
  const text = auftrag.eingang ?? '';
  const eingang = new Date(/[TZ]|[+-]\d\d:\d\d$/.test(text) ? text : text.replace(' ', 'T') + 'Z');
  return Number.isNaN(eingang.getTime()) ? new Date(0) : eingang;
}

/**
 * Welche Fahrer sind zum Zeitpunkt der neuen Fahrt belegt?
 *
 * Geprueft wird die Ueberschneidung, nicht die blosse Tatsache einer offenen
 * Fahrt: Wer jetzt unterwegs ist, kann die Fahrt morgen frueh trotzdem
 * uebernehmen. Deshalb sperrt ein Auftrag nur von seinem Beginn bis zum Ende
 * seiner geschaetzten Dauer.
 */
export function belegteFahrerIds(
  laufende: LaufenderAuftrag[],
  fahrtzeit: Date,
): Set<number> {
  const belegt = new Set<number>();
  const zeitpunkt = fahrtzeit.getTime();

  for (const auftrag of laufende) {
    if (!auftrag.fahrer_id) continue;

    const start = beginn(auftrag).getTime();
    const ende = start + dauerMinuten(auftrag.strecke_km) * 60_000;

    if (zeitpunkt >= start && zeitpunkt < ende) belegt.add(auftrag.fahrer_id);
  }

  return belegt;
}
