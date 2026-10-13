import type { Fahrer } from './typen';

/**
 * Die Fahrerliste, die der Fahrgast auf der Website zur Auswahl bekommt.
 *
 * Hier wird bewusst gefiltert und gekuerzt: In der Datenbank stehen
 * Handynummern, Anmeldecodes und Schichten - davon darf nichts nach draussen.
 * Nach aussen geht nur, was der Fahrgast zum Auswaehlen braucht: eine Nummer
 * und ein Vorname. Alle Fahrer haben dem zugestimmt (Stand 13.10.2026).
 *
 * Ebenfalls bewusst: Es steht NICHT dabei, wer gerade frei ist. Sonst koennte
 * jeder Fremde von aussen mitlesen, wann welcher Fahrer unterwegs ist.
 */

export interface OeffentlicherFahrer {
  id: number;
  name: string;
}

/** Aus "Anna Beispiel" wird "Anna". */
function vorname(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

export function oeffentlicheFahrer(alle: Fahrer[]): OeffentlicherFahrer[] {
  const auswaehlbar = alle
    .filter((fahrer) => !fahrer.ausgeschieden)
    .filter((fahrer) => fahrer.aktiv === 1)
    // Wer den Bot nie gestartet hat, bekaeme den Auftrag gar nicht
    .filter((fahrer) => Boolean(fahrer.telegram_chat_id))
    .sort((a, b) => a.reihenfolge - b.reihenfolge || a.id - b.id);

  // Zwei Fahrer mit demselben Vornamen waeren fuer den Fahrgast nicht
  // auseinanderzuhalten. Dann kommt der erste Buchstabe des Nachnamens dazu.
  const haeufigkeit = new Map<string, number>();
  for (const fahrer of auswaehlbar) {
    const kurz = vorname(fahrer.name);
    haeufigkeit.set(kurz, (haeufigkeit.get(kurz) ?? 0) + 1);
  }

  return auswaehlbar.map((fahrer) => {
    const kurz = vorname(fahrer.name);
    const rest = fahrer.name.trim().split(/\s+/).slice(1).join(' ');
    const eindeutig =
      (haeufigkeit.get(kurz) ?? 0) > 1 && rest ? `${kurz} ${rest[0]}.` : kurz;

    return { id: fahrer.id, name: eindeutig };
  });
}

/** Das Stueck D1, das hier gebraucht wird - so laesst es sich auch testen. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      first<T>(): Promise<T | null>;
    };
  };
}

/**
 * Gibt die Nummer des Wunschfahrers nur zurueck, wenn es ihn wirklich gibt.
 *
 * Ob er gerade Dienst hat oder unterwegs ist, wird hier NICHT geprueft - das
 * entscheidet die Vermittlung beim Verteilen. Hier geht es allein darum, dass
 * kein unbekannter Verweis in die Datenbank gelangt: Der Fremdschluessel
 * wuerde den Eintrag abweisen und damit die ganze Bestellung scheitern lassen.
 * Ein unbekannter Wunsch kostet also den Wunsch, nie die Fahrt.
 */
export async function gueltigerWunschfahrer(
  roh: unknown,
  db: Datenbank,
): Promise<number | null> {
  const nummer = Number(roh);
  if (!Number.isFinite(nummer) || nummer <= 0) return null;

  const treffer = await db
    .prepare('SELECT id FROM fahrer WHERE id = ? AND ausgeschieden = 0')
    .bind(Math.round(nummer))
    .first<{ id: number }>();

  return treffer?.id ?? null;
}
