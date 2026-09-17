import type { LaufenderAuftrag } from './belegung';

/**
 * Auftraege in die Datenbank schreiben und die laufenden wieder herausholen.
 *
 * Steht getrennt von der Seite, damit sich gegen eine echte SQLite-Datenbank
 * pruefen laesst, dass die Spaltennamen stimmen und die Werte dort landen, wo
 * sie hingehoeren. Die Typpruefung kann das nicht: Ein Tippfehler in einer
 * SQL-Zeichenkette faellt ihr nicht auf.
 */

/** Das Stueck D1, das hier gebraucht wird - so laesst es sich auch testen. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): {
      run(): Promise<unknown>;
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results: T[] }>;
    };
  };
}

export interface AuftragEintrag {
  id: string;
  /** Eingang in der Schreibweise von SQLite: "2026-09-17 09:00:00" (UTC) */
  eingang: string;
  kanal: string;
  art: string;
  abholung: string;
  ziel: string;
  wunschzeit: string;
  wunschIso: string;
  sofort: number;
  personen: number;
  anmerkung: string;
  preis: number;
  streckeKm: number;
  preisQuelle: 'berechnet' | 'manuell';
  kundeName: string;
  kundeTelefon: string;
}

/**
 * Legt einen telefonisch aufgenommenen Auftrag an.
 *
 * Status und Zuweisungsart bleiben auf den Vorgaben ('vermittlung',
 * 'selbst'): Ob ausgeschrieben oder fest eingeteilt wird, entscheidet danach
 * das Vermittlungsobjekt - dort und nur dort, damit zwei Wege nicht
 * gleichzeitig denselben Auftrag vergeben koennen.
 */
export async function auftragEintragen(
  db: Datenbank,
  eintrag: AuftragEintrag,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auftraege
         (id, eingang, kanal, art, abholung, ziel, wunschzeit, wunsch_iso, sofort,
          personen, anmerkung, preis, strecke_km, preis_quelle, kunde_name, kunde_telefon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      eintrag.id,
      eintrag.eingang,
      eintrag.kanal,
      eintrag.art,
      eintrag.abholung,
      eintrag.ziel,
      eintrag.wunschzeit,
      eintrag.wunschIso,
      eintrag.sofort,
      eintrag.personen,
      eintrag.anmerkung,
      eintrag.preis,
      eintrag.streckeKm,
      eintrag.preisQuelle,
      eintrag.kundeName,
      eintrag.kundeTelefon,
    )
    .run();
}

/**
 * Alle Fahrten, die gerade laufen oder noch vermittelt werden.
 *
 * "beendet_um IS NULL" ist der Kern: Eine Fahrt gilt so lange als laufend,
 * bis der Fahrer sie als erledigt meldet - oder bis die geschaetzte Dauer
 * abgelaufen ist, das rechnet belegung.ts.
 */
export async function laufendeFahrten(
  db: Datenbank,
  ausser = '',
): Promise<(LaufenderAuftrag & Record<string, unknown>)[]> {
  const zeilen = await db
    .prepare(
      `SELECT a.id, a.eingang, a.kanal, a.status, a.zuweisungsart, a.art, a.abholung, a.ziel,
              a.wunschzeit, a.sofort, a.wunsch_iso, a.strecke_km, a.preis, a.preis_quelle,
              a.kunde_name, a.kunde_telefon, a.fahrer_id, f.name AS fahrername
         FROM auftraege a LEFT JOIN fahrer f ON f.id = a.fahrer_id
        WHERE a.status IN ('vermittlung', 'angenommen')
          AND a.beendet_um IS NULL
          AND a.id != ?
        ORDER BY a.eingang DESC
        LIMIT 25`,
    )
    .bind(ausser)
    .all<LaufenderAuftrag & Record<string, unknown>>();

  return zeilen.results ?? [];
}
