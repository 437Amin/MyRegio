/**
 * Einen Fahrer aus dem Fahrerbereich entfernen.
 *
 * Ein einfaches DELETE reicht nicht. Sobald ein Fahrer einmal gefragt wurde
 * oder einen Auftrag angenommen hat, verweisen Auftragsliste und Verlauf auf
 * ihn. D1 prueft solche Verweise (foreign_keys = 1), das Loeschen scheitert
 * dann mit "FOREIGN KEY constraint failed" - im Fahrerbereich erschien nur
 * eine nackte Fehlerseite, und der Fahrer blieb in der Liste.
 *
 * Deshalb:
 *   - ohne fruehere Auftraege   -> wirklich loeschen
 *   - mit frueheren Auftraegen  -> austragen. Er bekommt nie wieder Auftraege,
 *     Telefonnummer und Telegram-Verbindung werden entfernt, der alte
 *     Anmeldelink wird ungueltig. Der NAME bleibt, damit in alten Auftraegen
 *     weiterhin steht, wer gefahren ist - das braucht der Chef bei
 *     Rueckfragen und Beschwerden.
 *
 * Erst wird geloescht und nur bei einem Verweis-Fehler ausgetragen, statt
 * vorher Auftraege zu zaehlen. So gibt es keine Luecke zwischen Pruefen und
 * Loeschen, in der dem Fahrer gerade ein neuer Auftrag angeboten wird.
 */

/** Das Stueck D1, das hier gebraucht wird - so laesst es sich auch testen. */
export interface Datenbank {
  prepare(sql: string): {
    bind(...werte: unknown[]): { run(): Promise<unknown> };
  };
}

export async function fahrerEntfernen(
  db: Datenbank,
  id: number,
  neuerAnmeldecode: string,
): Promise<'geloescht' | 'ausgetragen'> {
  try {
    await db.prepare('DELETE FROM fahrer WHERE id = ?').bind(id).run();
    return 'geloescht';
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    // Jeder andere Fehler ist ein echtes Problem und soll nicht als
    // "ausgetragen" durchrutschen
    if (!/FOREIGN KEY/i.test(meldung)) throw fehler;
  }

  await db
    .prepare(
      `UPDATE fahrer
          SET ausgeschieden = 1,
              aktiv = 0,
              telefon = '',
              telegram_chat_id = NULL,
              anmeldecode = ?
        WHERE id = ?`,
    )
    .bind(neuerAnmeldecode, id)
    .run();

  return 'ausgetragen';
}
