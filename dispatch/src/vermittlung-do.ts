import type { Auftrag, Fahrer, Umgebung } from './typen';
import { fahrerFuerZeitpunkt } from './schichten';
import { belegteFahrerIds, type LaufenderAuftrag } from './belegung';
import {
  ersetzeNachricht,
  sendeNachricht,
  setzeTelegramBasis,
  sicher,
  type Knopf,
} from './telegram';

/**
 * Vermittelt EINEN Auftrag an die Fahrer.
 *
 * Je Auftrag existiert genau ein Exemplar dieses Objekts. Cloudflare fuehrt
 * dessen Aufrufe nacheinander aus - dadurch koennen zwei Fahrer nicht
 * gleichzeitig denselben Auftrag annehmen, ohne dass wir sperren muessten.
 *
 * Der Wecker (Alarm) laeuft in der Cloudflare-Infrastruktur, nicht in einem
 * Prozess, den jemand neu starten muesste. Er feuert auch dann, wenn in der
 * Zwischenzeit nichts los war.
 */

/** Formatiert einen Betrag als deutschen Eurobetrag. */
function geld(betrag: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(betrag);
}

interface Gesendet {
  fahrerId: number;
  chatId: string;
  nachrichtId: number;
}

interface Zustand {
  auftragId: string;
  warteschlange: number[];
  index: number;
  gesendet: Gesendet[];
  beendet: boolean;
  antwortzeitMs: number;
}

export class Vermittlung implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: Umgebung,
  ) {
    // Auch hier noetig: Der Wecker feuert ohne vorherigen Aufruf des Workers.
    setzeTelegramBasis(env.TELEGRAM_BASIS);
  }

  async fetch(anfrage: Request): Promise<Response> {
    const pfad = new URL(anfrage.url).pathname;

    if (pfad === '/start') {
      const { auftragId } = (await anfrage.json()) as { auftragId: string };
      await this.starte(auftragId);
      return new Response('ok');
    }

    if (pfad === '/antwort') {
      const daten = (await anfrage.json()) as {
        fahrerId: number;
        annahme: boolean;
        nachrichtId?: number;
      };
      const ergebnis = await this.antwort(daten.fahrerId, daten.annahme);
      return Response.json(ergebnis);
    }

    // Telefonisch vergeben: Oender weiss schon, wer faehrt. Laeuft trotzdem
    // durch dieses Objekt, damit derselbe Schutz gegen Doppelvergabe greift.
    if (pfad === '/zuweisen') {
      const { auftragId, fahrerId } = (await anfrage.json()) as {
        auftragId: string;
        fahrerId: number;
      };
      return Response.json(await this.zuweisen(auftragId, fahrerId));
    }

    // Der Fahrer meldet die Fahrt als abgeschlossen und ist wieder frei
    if (pfad === '/erledigt') {
      const { fahrerId } = (await anfrage.json()) as { fahrerId: number };
      return Response.json(await this.erledigt(fahrerId));
    }

    // Der fest eingeteilte Fahrer kann doch nicht - die Fahrt wird
    // ausgeschrieben, statt beim Chef liegen zu bleiben
    if (pfad === '/abgeben') {
      const { fahrerId } = (await anfrage.json()) as { fahrerId: number };
      return Response.json(await this.abgeben(fahrerId));
    }

    if (pfad === '/abbrechen') {
      await this.beende('storniert');
      return new Response('ok');
    }

    return new Response('Unbekannt', { status: 404 });
  }

  /* ------------------------------------------------------------------ Start */

  private async starte(auftragId: string, ohne?: number): Promise<void> {
    const auftrag = await this.ladeAuftrag(auftragId);
    if (!auftrag) return;

    const einstellungen = await this.ladeEinstellungen();

    const alleFahrer = await this.env.DB.prepare(
      'SELECT * FROM fahrer WHERE ausgeschieden = 0 ORDER BY reihenfolge, id',
    ).all<Fahrer>();

    const fahrtzeit = this.fahrtzeit(auftrag);
    const belegt = await this.belegteFahrer(auftrag, fahrtzeit);
    // Wer die Fahrt gerade abgegeben hat, wird nicht gleich wieder gefragt
    if (ohne) belegt.add(ohne);

    const passende = fahrerFuerZeitpunkt(
      alleFahrer.results ?? [],
      fahrtzeit,
      einstellungen.nacht_von,
      einstellungen.nacht_bis,
      belegt,
    );

    const zustand: Zustand = {
      auftragId,
      warteschlange: passende.map((fahrer) => fahrer.id),
      index: 0,
      gesendet: [],
      beendet: false,
      antwortzeitMs: Number(einstellungen.antwortzeit_sekunden || 40) * 1000,
    };
    await this.state.storage.put('zustand', zustand);

    if (zustand.warteschlange.length === 0) {
      await this.protokolliere(
        auftragId,
        null,
        'niemand',
        'Zu dieser Uhrzeit ist kein Fahrer eingeteilt oder angemeldet.',
      );
      await this.niemandGefunden(auftrag, 0);
      return;
    }

    await this.frageNaechsten();
  }

  /* --------------------------------------------------------------- Anfragen */

  private async frageNaechsten(): Promise<void> {
    const zustand = await this.state.storage.get<Zustand>('zustand');
    if (!zustand || zustand.beendet) return;

    const auftrag = await this.ladeAuftrag(zustand.auftragId);
    if (!auftrag) return;

    if (zustand.index >= zustand.warteschlange.length) {
      await this.niemandGefunden(auftrag, zustand.warteschlange.length);
      return;
    }

    const fahrerId = zustand.warteschlange[zustand.index]!;
    const fahrer = await this.ladeFahrer(fahrerId);

    if (!fahrer?.telegram_chat_id) {
      // Fahrer inzwischen abgemeldet - ueberspringen
      zustand.index += 1;
      await this.state.storage.put('zustand', zustand);
      await this.frageNaechsten();
      return;
    }

    const sekunden = Math.round(zustand.antwortzeitMs / 1000);
    const knoepfe: Knopf[] = [
      { text: '✅ Annehmen', daten: `ja:${zustand.auftragId}:${fahrerId}` },
      { text: '✖️ Ablehnen', daten: `nein:${zustand.auftragId}:${fahrerId}` },
    ];

    const ergebnis = await sendeNachricht(
      this.env.TELEGRAM_TOKEN,
      fahrer.telegram_chat_id,
      this.angebotstext(auftrag, sekunden),
      knoepfe,
    );

    if (ergebnis.ok && ergebnis.nachrichtId) {
      zustand.gesendet.push({
        fahrerId,
        chatId: fahrer.telegram_chat_id,
        nachrichtId: ergebnis.nachrichtId,
      });
      await this.protokolliere(zustand.auftragId, fahrerId, 'gefragt');
    } else {
      await this.protokolliere(
        zustand.auftragId,
        fahrerId,
        'fehler',
        ergebnis.fehler ?? 'Nachricht konnte nicht zugestellt werden',
      );
      // Zustellung gescheitert - sofort weiter, nicht 40 Sekunden warten
      zustand.index += 1;
      await this.state.storage.put('zustand', zustand);
      await this.frageNaechsten();
      return;
    }

    await this.state.storage.put('zustand', zustand);
    await this.state.storage.setAlarm(Date.now() + zustand.antwortzeitMs);
  }

  /* ----------------------------------------------------------------- Wecker */

  async alarm(): Promise<void> {
    const zustand = await this.state.storage.get<Zustand>('zustand');
    if (!zustand || zustand.beendet) return;

    const fahrerId = zustand.warteschlange[zustand.index];
    if (fahrerId !== undefined) {
      await this.protokolliere(zustand.auftragId, fahrerId, 'zeit-abgelaufen');
      await this.entwerteNachricht(
        zustand,
        fahrerId,
        '⏱ Zeit abgelaufen – die Fahrt ging an jemand anderen.',
      );
    }

    zustand.index += 1;
    await this.state.storage.put('zustand', zustand);
    await this.frageNaechsten();
  }

  /* ---------------------------------------------------------------- Antwort */

  private async antwort(
    fahrerId: number,
    annahme: boolean,
  ): Promise<{ ergebnis: 'angenommen' | 'vergeben' | 'abgelehnt' | 'unbekannt' }> {
    const zustand = await this.state.storage.get<Zustand>('zustand');
    if (!zustand) return { ergebnis: 'unbekannt' };

    // Wer zuerst tippt, bekommt die Fahrt. Alle spaeteren laufen hier auf.
    if (zustand.beendet) return { ergebnis: 'vergeben' };

    if (!annahme) {
      await this.protokolliere(zustand.auftragId, fahrerId, 'abgelehnt');
      await this.entwerteNachricht(zustand, fahrerId, '✖️ Du hast abgelehnt.');

      // Nur weiterschalten, wenn der aktuell Gefragte ablehnt. Lehnt jemand
      // ab, der laengst uebergangen wurde, aendert das nichts.
      if (zustand.warteschlange[zustand.index] === fahrerId) {
        await this.state.storage.deleteAlarm();
        zustand.index += 1;
        await this.state.storage.put('zustand', zustand);
        await this.frageNaechsten();
      }
      return { ergebnis: 'abgelehnt' };
    }

    // --- Annahme -----------------------------------------------------------
    zustand.beendet = true;
    await this.state.storage.put('zustand', zustand);
    await this.state.storage.deleteAlarm();

    const auftrag = await this.ladeAuftrag(zustand.auftragId);
    const fahrer = await this.ladeFahrer(fahrerId);
    if (!auftrag || !fahrer) return { ergebnis: 'unbekannt' };

    await this.env.DB.prepare(
      `UPDATE auftraege
          SET status = 'angenommen', fahrer_id = ?, angenommen_um = datetime('now')
        WHERE id = ? AND status = 'vermittlung'`,
    )
      .bind(fahrerId, auftrag.id)
      .run();

    await this.protokolliere(auftrag.id, fahrerId, 'angenommen');

    // Erst jetzt bekommt der Fahrer die Adresse - und den Knopf, mit dem er
    // sich nach der Fahrt wieder freimeldet.
    await this.entwerteNachricht(
      zustand,
      fahrerId,
      this.zusagetext(auftrag),
      this.erledigtKnoepfe(auftrag.id, fahrerId),
    );

    // Bei allen anderen die Knoepfe entfernen
    for (const eintrag of zustand.gesendet) {
      if (eintrag.fahrerId === fahrerId) continue;
      await ersetzeNachricht(
        this.env.TELEGRAM_TOKEN,
        eintrag.chatId,
        eintrag.nachrichtId,
        '➡️ Die Fahrt wurde bereits von jemand anderem übernommen.',
      );
    }

    return { ergebnis: 'angenommen' };
  }

  /* ------------------------------------------------- Telefonische Vergabe */

  /**
   * Teilt den Auftrag einem bestimmten Fahrer zu.
   *
   * Der Zustand wird sofort als beendet abgelegt: Dieses Objekt fragt danach
   * niemanden mehr, und es laeuft kein Wecker. Die Bedingung im UPDATE ist
   * die zweite Sicherung - kommt gleichzeitig eine Annahme ueber Telegram
   * herein, gewinnt genau eine von beiden.
   */
  private async zuweisen(
    auftragId: string,
    fahrerId: number,
  ): Promise<{ ergebnis: 'zugewiesen' | 'belegt' | 'vergeben' | 'unbekannt' }> {
    const auftrag = await this.ladeAuftrag(auftragId);
    if (!auftrag) return { ergebnis: 'unbekannt' };

    const fahrer = await this.ladeFahrer(fahrerId);
    if (!fahrer || fahrer.ausgeschieden === 1 || fahrer.aktiv !== 1) {
      return { ergebnis: 'unbekannt' };
    }

    const fahrtzeit = this.fahrtzeit(auftrag);
    const belegt = await this.belegteFahrer(auftrag, fahrtzeit);
    if (belegt.has(fahrerId)) return { ergebnis: 'belegt' };

    const ergebnis = await this.env.DB.prepare(
      `UPDATE auftraege
          SET status = 'angenommen', fahrer_id = ?, zuweisungsart = 'fest',
              angenommen_um = datetime('now')
        WHERE id = ? AND status = 'vermittlung'`,
    )
      .bind(fahrerId, auftragId)
      .run();

    if (ergebnis.meta.changes === 0) return { ergebnis: 'vergeben' };

    const zustand: Zustand = {
      auftragId,
      warteschlange: [fahrerId],
      index: 0,
      gesendet: [],
      beendet: true,
      antwortzeitMs: 0,
    };
    await this.state.storage.deleteAlarm();
    await this.protokolliere(auftragId, fahrerId, 'zugewiesen', 'telefonisch eingeteilt');

    if (fahrer.telegram_chat_id) {
      const gesendet = await sendeNachricht(
        this.env.TELEGRAM_TOKEN,
        fahrer.telegram_chat_id,
        this.einteilungstext(auftrag),
        this.erledigtKnoepfe(auftragId, fahrerId, true),
      );
      if (gesendet.ok && gesendet.nachrichtId) {
        zustand.gesendet.push({
          fahrerId,
          chatId: fahrer.telegram_chat_id,
          nachrichtId: gesendet.nachrichtId,
        });
      } else {
        // Die Fahrt steht trotzdem - Oender hat sie ja am Telefon vergeben.
        // Im Verlauf ist nachlesbar, dass die Nachricht nicht ankam.
        await this.protokolliere(
          auftragId,
          fahrerId,
          'fehler',
          gesendet.fehler ?? 'Nachricht konnte nicht zugestellt werden',
        );
      }
    } else {
      await this.protokolliere(
        auftragId,
        fahrerId,
        'fehler',
        'Fahrer ist nicht in Telegram angemeldet - bitte selbst anrufen',
      );
    }

    await this.state.storage.put('zustand', zustand);
    return { ergebnis: 'zugewiesen' };
  }

  /** Der Fahrer meldet die Fahrt als erledigt und ist wieder frei. */
  private async erledigt(
    fahrerId: number,
  ): Promise<{ ergebnis: 'erledigt' | 'unbekannt' }> {
    const zustand = await this.state.storage.get<Zustand>('zustand');
    if (!zustand) return { ergebnis: 'unbekannt' };

    const ergebnis = await this.env.DB.prepare(
      `UPDATE auftraege SET beendet_um = datetime('now')
        WHERE id = ? AND fahrer_id = ? AND beendet_um IS NULL`,
    )
      .bind(zustand.auftragId, fahrerId)
      .run();

    if (ergebnis.meta.changes === 0) return { ergebnis: 'unbekannt' };

    await this.protokolliere(zustand.auftragId, fahrerId, 'erledigt');
    await this.entwerteNachricht(
      zustand,
      fahrerId,
      '✅ <b>Fahrt abgeschlossen.</b> Danke – du bekommst wieder Aufträge.',
    );
    return { ergebnis: 'erledigt' };
  }

  /**
   * Der fest eingeteilte Fahrer kann doch nicht.
   *
   * Die Fahrt geht zurueck in die normale Ausschreibung, ohne ihn. Das ist
   * schneller, als sie beim Chef liegen zu lassen - meldet sich niemand,
   * bekommt er ohnehin die uebliche Meldung.
   */
  private async abgeben(
    fahrerId: number,
  ): Promise<{ ergebnis: 'abgegeben' | 'unbekannt' }> {
    const zustand = await this.state.storage.get<Zustand>('zustand');
    if (!zustand) return { ergebnis: 'unbekannt' };

    const ergebnis = await this.env.DB.prepare(
      `UPDATE auftraege
          SET status = 'vermittlung', fahrer_id = NULL, angenommen_um = NULL,
              zuweisungsart = 'selbst'
        WHERE id = ? AND fahrer_id = ? AND status = 'angenommen' AND beendet_um IS NULL`,
    )
      .bind(zustand.auftragId, fahrerId)
      .run();

    if (ergebnis.meta.changes === 0) return { ergebnis: 'unbekannt' };

    await this.protokolliere(
      zustand.auftragId,
      fahrerId,
      'abgelehnt',
      'zugewiesene Fahrt abgegeben',
    );
    await this.entwerteNachricht(
      zustand,
      fahrerId,
      '✖️ Du hast die Fahrt abgegeben. Sie wird jetzt den anderen angeboten.',
    );

    await this.starte(zustand.auftragId, fahrerId);
    return { ergebnis: 'abgegeben' };
  }

  /* ------------------------------------------------------------- Eskalation */

  private async niemandGefunden(auftrag: Auftrag, gefragt: number): Promise<void> {
    await this.beende('niemand');
    await this.protokolliere(auftrag.id, null, 'niemand', `${gefragt} Fahrer gefragt`);

    if (this.env.CHEF_CHAT_ID) {
      await sendeNachricht(
        this.env.TELEGRAM_TOKEN,
        this.env.CHEF_CHAT_ID,
        this.chefText(auftrag, gefragt),
      );
    }
  }

  private async beende(status: 'niemand' | 'storniert'): Promise<void> {
    const zustand = await this.state.storage.get<Zustand>('zustand');
    if (zustand) {
      zustand.beendet = true;
      await this.state.storage.put('zustand', zustand);
    }
    await this.state.storage.deleteAlarm();
    if (!zustand) return;

    // Eine Absage erreicht auch eine bereits vergebene Fahrt - der Fahrgast
    // ruft an und sagt ab, egal ob schon jemand zugesagt hat. "niemand" darf
    // dagegen nur einen Auftrag treffen, der noch in der Vermittlung ist.
    const erlaubt =
      status === 'storniert' ? "('vermittlung', 'angenommen')" : "('vermittlung')";

    const ergebnis = await this.env.DB.prepare(
      `UPDATE auftraege SET status = ?, beendet_um = datetime('now')
        WHERE id = ? AND status IN ${erlaubt}`,
    )
      .bind(status, zustand.auftragId)
      .run();

    // Wer die Fahrt schon hatte, erfaehrt von der Absage
    if (status === 'storniert' && ergebnis.meta.changes > 0) {
      const auftrag = await this.ladeAuftrag(zustand.auftragId);
      if (auftrag?.fahrer_id) {
        await this.entwerteNachricht(
          zustand,
          auftrag.fahrer_id,
          '🚫 <b>Die Fahrt wurde abgesagt.</b> Bitte nicht hinfahren.',
        );
      }
    }
  }

  /* -------------------------------------------------------------- Textbau */

  private angebotstext(auftrag: Auftrag, sekunden: number): string {
    const zeilen = [
      '🚗 <b>Neue Fahrt</b>',
      '',
      `<b>Anlass:</b> ${sicher(auftrag.art)}`,
      // Die Abholadresse steht bewusst schon im Angebot: Ohne sie kann
      // niemand beurteilen, ob er es rechtzeitig schafft.
      `<b>Abholung:</b> ${sicher(auftrag.abholung)}`,
    ];

    if (auftrag.ziel) zeilen.push(`<b>Ziel:</b> ${sicher(auftrag.ziel)}`);
    zeilen.push(
      `<b>Wann:</b> ${auftrag.sofort ? 'so bald wie möglich' : sicher(auftrag.wunschzeit)}`,
    );

    const personen = [`${auftrag.personen} Pers.`];
    if (auftrag.gepaeck > 0) personen.push(`${auftrag.gepaeck} Gepäck`);
    if (auftrag.kindersitze > 0) personen.push(`${auftrag.kindersitze} Kindersitz`);
    zeilen.push(`<b>Dabei:</b> ${personen.join(' · ')}`);

    if (auftrag.anmerkung) zeilen.push(`<b>Hinweis:</b> ${sicher(auftrag.anmerkung)}`);

    if (auftrag.preis > 0) {
      zeilen.push('');
      zeilen.push(
        `<b>Festpreis: ${geld(auftrag.preis)}</b>${auftrag.strecke_km > 0 ? ` · ca. ${auftrag.strecke_km.toFixed(1)} km` : ''}`,
      );
    }

    zeilen.push('');
    // Name und Rufnummer bleiben zurueck, bis jemand zusagt. Sonst haetten
    // am Ende auch alle, die ablehnen, die Daten des Fahrgasts.
    zeilen.push('Kontaktdaten des Fahrgasts siehst du nach dem Annehmen.');
    zeilen.push(`⏱ <b>${sekunden} Sekunden</b>`);

    return zeilen.join('\n');
  }

  /**
   * Nachricht an den telefonisch eingeteilten Fahrer.
   *
   * Er hat nicht zugesagt, deshalb steht hier gleich alles drin, was er
   * braucht - und der Weg zurueck, falls er doch nicht kann.
   */
  private einteilungstext(auftrag: Auftrag): string {
    return [
      '📞 <b>Du bist für eine Fahrt eingeteilt.</b>',
      '',
      `<b>Anlass:</b> ${sicher(auftrag.art)}`,
      `<b>Abholung:</b> ${sicher(auftrag.abholung)}`,
      auftrag.ziel ? `<b>Ziel:</b> ${sicher(auftrag.ziel)}` : '',
      `<b>Wann:</b> ${auftrag.sofort ? 'so bald wie möglich' : sicher(auftrag.wunschzeit)}`,
      '',
      `<b>Fahrgast:</b> ${sicher(auftrag.kunde_name)}`,
      `<b>Telefon:</b> ${sicher(auftrag.kunde_telefon)}`,
      auftrag.anmerkung ? `<b>Hinweis:</b> ${sicher(auftrag.anmerkung)}` : '',
      '',
      auftrag.preis > 0
        ? `<b>Festpreis: ${geld(auftrag.preis)}</b> – bar oder mit Karte im Fahrzeug.`
        : 'Preis mit dem Fahrgast absprechen. Zahlung bar oder mit Karte im Fahrzeug.',
      '',
      'Tippe nach der Fahrt auf „Fahrt erledigt“ – erst dann bekommst du wieder Angebote.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Der Knopf, mit dem sich ein Fahrer wieder freimeldet. Ohne ihn bliebe er
   * bis zum Ablauf der geschaetzten Fahrtzeit gesperrt.
   */
  private erledigtKnoepfe(auftragId: string, fahrerId: number, abgeben = false): Knopf[] {
    const knoepfe: Knopf[] = [
      { text: '✅ Fahrt erledigt', daten: `fertig:${auftragId}:${fahrerId}` },
    ];
    if (abgeben) {
      knoepfe.push({ text: '✖️ Kann ich nicht', daten: `weg:${auftragId}:${fahrerId}` });
    }
    return knoepfe;
  }

  private zusagetext(auftrag: Auftrag): string {
    return [
      '✅ <b>Die Fahrt gehört dir.</b>',
      '',
      `<b>Abholung:</b> ${sicher(auftrag.abholung)}`,
      auftrag.ziel ? `<b>Ziel:</b> ${sicher(auftrag.ziel)}` : '',
      `<b>Wann:</b> ${auftrag.sofort ? 'so bald wie möglich' : sicher(auftrag.wunschzeit)}`,
      '',
      `<b>Fahrgast:</b> ${sicher(auftrag.kunde_name)}`,
      `<b>Telefon:</b> ${sicher(auftrag.kunde_telefon)}`,
      auftrag.anmerkung ? `<b>Hinweis:</b> ${sicher(auftrag.anmerkung)}` : '',
      '',
      auftrag.preis > 0
        ? `<b>Festpreis: ${geld(auftrag.preis)}</b> – bar oder mit Karte im Fahrzeug.`
        : 'Preis mit dem Fahrgast absprechen. Zahlung bar oder mit Karte im Fahrzeug.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private chefText(auftrag: Auftrag, gefragt: number): string {
    return [
      '⚠️ <b>Kein Fahrer gefunden</b>',
      '',
      gefragt === 0
        ? 'Zu dieser Uhrzeit war kein Fahrer eingeteilt oder angemeldet.'
        : `${gefragt} Fahrer wurden gefragt, niemand hat angenommen.`,
      '',
      `<b>Anlass:</b> ${sicher(auftrag.art)}`,
      `<b>Abholung:</b> ${sicher(auftrag.abholung)}`,
      auftrag.ziel ? `<b>Ziel:</b> ${sicher(auftrag.ziel)}` : '',
      `<b>Wann:</b> ${auftrag.sofort ? 'so bald wie möglich' : sicher(auftrag.wunschzeit)}`,
      '',
      `<b>Fahrgast:</b> ${sicher(auftrag.kunde_name)}`,
      `<b>Telefon:</b> ${sicher(auftrag.kunde_telefon)}`,
      '',
      'Bitte kümmere dich selbst darum.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /* --------------------------------------------------------------- Hilfen */

  /**
   * Massgeblich ist die Zeit der FAHRT, nicht die der Bestellung. Wer nachts
   * eine Fahrt fuer den naechsten Morgen bestellt, soll die Tagfahrer
   * erreichen.
   */
  private fahrtzeit(auftrag: Auftrag): Date {
    const gewuenscht =
      !auftrag.sofort && auftrag.wunsch_iso ? new Date(auftrag.wunsch_iso) : null;
    return gewuenscht && !Number.isNaN(gewuenscht.getTime()) ? gewuenscht : new Date();
  }

  /** Wer ist zur Zeit dieser Fahrt schon unterwegs? Regeln in belegung.ts */
  private async belegteFahrer(auftrag: Auftrag, fahrtzeit: Date): Promise<Set<number>> {
    const laufende = await this.env.DB.prepare(
      `SELECT fahrer_id, wunsch_iso, sofort, eingang, strecke_km
         FROM auftraege
        WHERE status = 'angenommen' AND beendet_um IS NULL
          AND fahrer_id IS NOT NULL AND id != ?`,
    )
      .bind(auftrag.id)
      .all<LaufenderAuftrag>();

    return belegteFahrerIds(laufende.results ?? [], fahrtzeit);
  }

  private async entwerteNachricht(
    zustand: Zustand,
    fahrerId: number,
    text: string,
    knoepfe: Knopf[] = [],
  ): Promise<void> {
    const eintrag = zustand.gesendet.find((g) => g.fahrerId === fahrerId);
    if (!eintrag) return;
    await ersetzeNachricht(
      this.env.TELEGRAM_TOKEN,
      eintrag.chatId,
      eintrag.nachrichtId,
      text,
      knoepfe,
    );
  }

  private async ladeAuftrag(id: string): Promise<Auftrag | null> {
    return this.env.DB.prepare('SELECT * FROM auftraege WHERE id = ?')
      .bind(id)
      .first<Auftrag>();
  }

  private async ladeFahrer(id: number): Promise<Fahrer | null> {
    return this.env.DB.prepare('SELECT * FROM fahrer WHERE id = ?')
      .bind(id)
      .first<Fahrer>();
  }

  private async ladeEinstellungen(): Promise<Record<string, string>> {
    const zeilen = await this.env.DB.prepare(
      'SELECT schluessel, wert FROM einstellungen',
    ).all<{ schluessel: string; wert: string }>();

    const werte: Record<string, string> = {};
    for (const zeile of zeilen.results ?? []) werte[zeile.schluessel] = zeile.wert;
    return werte;
  }

  private async protokolliere(
    auftragId: string,
    fahrerId: number | null,
    ereignis: string,
    hinweis = '',
  ): Promise<void> {
    await this.env.DB.prepare(
      'INSERT INTO verlauf (auftrag_id, fahrer_id, ereignis, hinweis) VALUES (?, ?, ?, ?)',
    )
      .bind(auftragId, fahrerId, ereignis, hinweis)
      .run();
  }
}
