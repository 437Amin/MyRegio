/** Gemeinsame Typen der Auftragsvermittlung. */

export interface Umgebung {
  DB: D1Database;
  VERMITTLUNG: DurableObjectNamespace;

  /** Token des Telegram-Bots (von @BotFather) */
  TELEGRAM_TOKEN: string;
  /** Geheimnis, mit dem Telegram seine Aufrufe an uns ausweist */
  TELEGRAM_WEBHOOK_GEHEIMNIS: string;
  /** Telegram-Chat-ID des Chefs - bekommt Meldung, wenn niemand annimmt */
  CHEF_CHAT_ID: string;
  /** Benutzername des Bots ohne @, fuer die Anmeldelinks der Fahrer */
  TELEGRAM_BOT_NAME: string;
  /** Passwort fuer den Fahrerbereich */
  ADMIN_PASSWORT: string;
  /** Woher Anfragen kommen duerfen, z. B. https://www.myregiocar.com */
  ERLAUBTE_HERKUNFT: string;

  /** Schluessel fuer OpenRouteService - ohne ihn gibt es keine Festpreise */
  ORS_SCHLUESSEL?: string;
  /** Nur fuer Tests: andere Adresse fuer die Telegram-Schnittstelle */
  TELEGRAM_BASIS?: string;
}

export type Schicht = 'tag' | 'nacht' | 'beide';

export type AuftragStatus =
  | 'vermittlung'
  | 'angenommen'
  | 'niemand'
  | 'storniert';

export interface Fahrer {
  id: number;
  name: string;
  telefon: string;
  telegram_chat_id: string | null;
  anmeldecode: string;
  schicht: Schicht;
  reihenfolge: number;
  aktiv: number;
}

export interface Auftrag {
  id: string;
  eingang: string;
  status: AuftragStatus;
  art: string;
  abholung: string;
  ziel: string;
  wunschzeit: string;
  wunsch_iso: string;
  sofort: number;
  personen: number;
  gepaeck: number;
  kindersitze: number;
  anmerkung: string;
  preis: number;
  strecke_km: number;
  kunde_name: string;
  kunde_telefon: string;
  fahrer_id: number | null;
  angenommen_um: string | null;
  beendet_um: string | null;
}

/** Was der Buchungsassistent an uns schickt. */
export interface Bestellung {
  art: string;
  abholung: string;
  ziel?: string;
  wunschzeit?: string;
  wunschIso?: string;
  sofort?: boolean;
  personen?: number;
  gepaeck?: number;
  kindersitze?: number;
  anmerkung?: string;
  /** Vom Fahrgast ausgewaehlte Punkte aus der Vorschlagsliste */
  vonPunkt?: { breite: number; laenge: number; bezeichnung?: string };
  nachPunkt?: { breite: number; laenge: number; bezeichnung?: string };
  preis?: number;
  streckeKm?: number;
  name: string;
  telefon: string;
}

/** Was die Statusseite dem Kunden zeigt. */
export interface StatusAntwort {
  status: AuftragStatus;
  /** Vorname des Fahrers - mehr braucht der Kunde nicht */
  fahrer?: string;
  angenommenUm?: string;
}
