import type { Auftrag, Fahrer, Umgebung } from './typen';
import { fahrerFuerZeitpunkt } from './schichten';
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

    if (pfad === '/abbrechen') {
      await this.beende('storniert');
      return new Response('ok');
    }

    return new Response('Unbekannt', { status: 404 });
  }

  /* ------------------------------------------------------------------ Start */

  private async starte(auftragId: string): Promise<void> {
    const auftrag = await this.ladeAuftrag(auftragId);
    if (!auftrag) return;

    const einstellungen = await this.ladeEinstellungen();

    const alleFahrer = await this.env.DB.prepare(
      'SELECT * FROM fahrer ORDER BY reihenfolge, id',
    ).all<Fahrer>();

    // Massgeblich ist die Zeit der FAHRT, nicht die der Bestellung. Wer nachts
    // eine Fahrt fuer den naechsten Morgen bestellt, soll die Tagfahrer
    // erreichen.
    const fahrtzeit =
      !auftrag.sofort && auftrag.wunsch_iso
        ? new Date(auftrag.wunsch_iso)
        : new Date();

    const passende = fahrerFuerZeitpunkt(
      alleFahrer.results ?? [],
      Number.isNaN(fahrtzeit.getTime()) ? new Date() : fahrtzeit,
      einstellungen.nacht_von,
      einstellungen.nacht_bis,
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

    // Erst jetzt bekommt der Fahrer die Adresse.
    await this.entwerteNachricht(zustand, fahrerId, this.zusagetext(auftrag));

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

    if (zustand) {
      await this.env.DB.prepare(
        `UPDATE auftraege SET status = ?, beendet_um = datetime('now')
          WHERE id = ? AND status = 'vermittlung'`,
      )
        .bind(status, zustand.auftragId)
        .run();
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

    zeilen.push('');
    // Name und Rufnummer bleiben zurueck, bis jemand zusagt. Sonst haetten
    // am Ende auch alle, die ablehnen, die Daten des Fahrgasts.
    zeilen.push('Kontaktdaten des Fahrgasts siehst du nach dem Annehmen.');
    zeilen.push(`⏱ <b>${sekunden} Sekunden</b>`);

    return zeilen.join('\n');
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
      'Zahlung bar oder mit Karte im Fahrzeug.',
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

  private async entwerteNachricht(
    zustand: Zustand,
    fahrerId: number,
    text: string,
  ): Promise<void> {
    const eintrag = zustand.gesendet.find((g) => g.fahrerId === fahrerId);
    if (!eintrag) return;
    await ersetzeNachricht(
      this.env.TELEGRAM_TOKEN,
      eintrag.chatId,
      eintrag.nachrichtId,
      text,
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
