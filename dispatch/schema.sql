-- =============================================================================
--  Datenbank der Auftragsvermittlung
-- =============================================================================
--  Anlegen mit:  npm run db:anlegen   (bzw. db:lokal zum Ausprobieren)
--
--  NACHTRAG fuer Datenbanken, die vor dem 13.09.2026 angelegt wurden:
--  "CREATE TABLE IF NOT EXISTS" ergaenzt bei einer bestehenden Tabelle keine
--  Spalten. Einmalig ausfuehren, BEVOR neuer Code veroeffentlicht wird:
--
--    npx wrangler d1 execute vermittlung --remote --command
--      "ALTER TABLE fahrer ADD COLUMN ausgeschieden INTEGER NOT NULL DEFAULT 0"
--
--  NACHTRAG Rechnungen (13.09.2026): Die Tabelle "rechnungen" ist neu.
--  Vor dem Veroeffentlichen einmal "npm run db:anlegen" ausfuehren - die Datei
--  laesst sich gefahrlos erneut ausfuehren, Bestehendes bleibt unberuehrt.
--
--  NACHTRAG telefonische Auftraege (17.09.2026): vier neue Spalten. Einmalig
--  ausfuehren, BEVOR neuer Code veroeffentlicht wird:
--
--    ALTER TABLE auftraege  ADD COLUMN kanal         TEXT NOT NULL DEFAULT 'website';
--    ALTER TABLE auftraege  ADD COLUMN zuweisungsart TEXT NOT NULL DEFAULT 'selbst';
--    ALTER TABLE auftraege  ADD COLUMN preis_quelle  TEXT NOT NULL DEFAULT 'berechnet';
--    ALTER TABLE rechnungen ADD COLUMN auftrag_id    TEXT REFERENCES auftraege (id);
--
--  NACHTRAG Wunschfahrer (13.10.2026):
--
--    ALTER TABLE auftraege ADD COLUMN wunsch_fahrer_id INTEGER REFERENCES fahrer (id);
--
--  NACHTRAG Rechnung per E-Mail (13.10.2026). Einmalig ausfuehren, BEVOR
--  neuer Code veroeffentlicht wird:
--
--    ALTER TABLE auftraege  ADD COLUMN rechnung_gewuenscht  INTEGER NOT NULL DEFAULT 0;
--    ALTER TABLE auftraege  ADD COLUMN bewertung_gewuenscht INTEGER NOT NULL DEFAULT 0;
--
--  NACHTRAG Ankunftszeit (14.10.2026): zwei Spalten und eine neue Tabelle.
--  Einmalig ausfuehren, BEVOR neuer Code veroeffentlicht wird:
--
--    ALTER TABLE auftraege ADD COLUMN von_breite REAL NOT NULL DEFAULT 0;
--    ALTER TABLE auftraege ADD COLUMN von_laenge REAL NOT NULL DEFAULT 0;
--
--  Die Tabelle "fahrer_standort" legt "npm run db:anlegen" selbst an.
--
--  NACHTRAG Live-Freigabe (15.10.2026), falls die Tabelle schon stand:
--
--    ALTER TABLE fahrer_standort ADD COLUMN live_bis TEXT;
--
--  NACHTRAG Adressspeicher (15.10.2026): neue Tabelle, legt
--  "npm run db:anlegen" selbst an.
--
--  NACHTRAG "Fahrgast abgeholt" (15.10.2026):
--
--    ALTER TABLE auftraege ADD COLUMN abgeholt_um TEXT;
--    ALTER TABLE auftraege  ADD COLUMN kunde_email         TEXT    NOT NULL DEFAULT '';
--    ALTER TABLE rechnungen ADD COLUMN versendet_um        TEXT;
--    ALTER TABLE rechnungen ADD COLUMN versand_an          TEXT    NOT NULL DEFAULT '';
-- =============================================================================

-- --- Fahrerinnen und Fahrer --------------------------------------------------
-- ACHTUNG: Diese Tabelle enthaelt personenbezogene Daten von Beschaeftigten.
-- Sie liegt bewusst NICHT im Git-Repository, sondern nur hier in der Datenbank,
-- erreichbar ausschliesslich ueber den passwortgeschuetzten Fahrerbereich.
CREATE TABLE IF NOT EXISTS fahrer (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  telefon          TEXT    NOT NULL DEFAULT '',
  -- Wird gesetzt, sobald der Fahrer den Telegram-Bot mit seinem Code startet
  telegram_chat_id TEXT,
  -- Einmalcode, mit dem sich der Fahrer beim Bot anmeldet
  anmeldecode      TEXT    NOT NULL,
  -- 'tag', 'nacht' oder 'beide'
  schicht          TEXT    NOT NULL DEFAULT 'beide',
  -- Kleinere Zahl = wird zuerst gefragt
  reihenfolge      INTEGER NOT NULL DEFAULT 10,
  aktiv            INTEGER NOT NULL DEFAULT 1,
  -- 1 = ausgetragen. Wer schon Auftraege hatte, laesst sich nicht loeschen,
  -- weil die Auftragsliste auf ihn verweist. Er wird stattdessen ausgetragen:
  -- keine Auftraege mehr, Telefon und Telegram entfernt, Name bleibt.
  -- Siehe src/fahrer-entfernen.ts
  ausgeschieden    INTEGER NOT NULL DEFAULT 0,
  angelegt         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fahrer_aktiv ON fahrer (aktiv, schicht, reihenfolge);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fahrer_code ON fahrer (anmeldecode);

-- --- Auftraege ---------------------------------------------------------------
-- Der Zeitpunkt "eingang" erfuellt zugleich die Aufzeichnungspflicht nach
-- § 49 PBefG: Der Eingang des Befoerderungsauftrags am Betriebssitz muss
-- festgehalten werden.
CREATE TABLE IF NOT EXISTS auftraege (
  id             TEXT PRIMARY KEY,
  eingang        TEXT    NOT NULL DEFAULT (datetime('now')),
  -- 'vermittlung' | 'angenommen' | 'niemand' | 'storniert'
  status         TEXT    NOT NULL DEFAULT 'vermittlung',

  -- Wie der Auftrag hereinkam: 'website' | 'telefon' | 'whatsapp' |
  -- 'persoenlich'. Bei telefonischer Aufnahme Pflichtangabe - zusammen mit
  -- "eingang" ist das der Nachweis nach § 49 PBefG.
  kanal          TEXT    NOT NULL DEFAULT 'website',
  -- 'selbst': Der Fahrer hat in Telegram angenommen.
  -- 'fest':   Der Chef hat ihn eingeteilt, meist am Telefon.
  zuweisungsart  TEXT    NOT NULL DEFAULT 'selbst',
  -- 'berechnet': aus der gemessenen Strecke. 'manuell': von Hand vereinbart,
  -- etwa weil die Adresse nur als Freitext vorlag.
  preis_quelle   TEXT    NOT NULL DEFAULT 'berechnet',

  art            TEXT    NOT NULL,
  abholung       TEXT    NOT NULL,
  ziel           TEXT    NOT NULL DEFAULT '',
  wunschzeit     TEXT    NOT NULL DEFAULT '',
  -- Derselbe Zeitpunkt maschinenlesbar. Danach richtet sich, ob Tag- oder
  -- Nachtfahrer gefragt werden - nicht nach der Uhrzeit der Bestellung.
  wunsch_iso     TEXT    NOT NULL DEFAULT '',
  sofort         INTEGER NOT NULL DEFAULT 0,
  personen       INTEGER NOT NULL DEFAULT 1,
  gepaeck        INTEGER NOT NULL DEFAULT 0,
  kindersitze    INTEGER NOT NULL DEFAULT 0,
  anmerkung      TEXT    NOT NULL DEFAULT '',

  -- Vereinbarter Festpreis in Euro. 0 bedeutet: konnte nicht ermittelt
  -- werden, der Preis wird individuell abgesprochen.
  preis          REAL    NOT NULL DEFAULT 0,
  strecke_km     REAL    NOT NULL DEFAULT 0,

  kunde_name     TEXT    NOT NULL,
  kunde_telefon  TEXT    NOT NULL,

  -- Will der Fahrgast eine Rechnung per E-Mail? Nur dann wird die Adresse
  -- ueberhaupt gespeichert - ohne Wunsch bleibt kunde_email leer. Die
  -- Rechnung entsteht automatisch, sobald der Fahrer die Fahrt abmeldet.
  rechnung_gewuenscht INTEGER NOT NULL DEFAULT 0,

  -- Moechte der Fahrgast nach der Fahrt eine kurze Nachricht mit der Bitte um
  -- eine Bewertung? Das ist eine EIGENE Einwilligung, getrennt von der
  -- Rechnung: Eine Rechnung schuldet man dem Kunden, eine Bitte um Bewertung
  -- ist Werbung. Deshalb ein eigenes Haekchen und keine Koppelung.
  bewertung_gewuenscht INTEGER NOT NULL DEFAULT 0,

  kunde_email    TEXT    NOT NULL DEFAULT '',

  -- Vom Fahrgast gewuenschter Fahrer. Er wird zuerst gefragt, ist aber nicht
  -- der Einzige: Reagiert er nicht, laeuft die Vermittlung normal weiter.
  wunsch_fahrer_id INTEGER REFERENCES fahrer (id),

  -- Koordinaten der Abholadresse, falls der Fahrgast sie aus den Vorschlaegen
  -- gewaehlt hat. 0 heisst: nur Freitext - dann gibt es keine Ankunftszeit,
  -- weil sich ohne Punkt nichts rechnen laesst.
  von_breite     REAL    NOT NULL DEFAULT 0,
  von_laenge     REAL    NOT NULL DEFAULT 0,

  fahrer_id      INTEGER REFERENCES fahrer (id),
  angenommen_um  TEXT,
  -- Der Fahrer hat den Fahrgast aufgenommen. Ab hier ist die Ankunftszeit
  -- gegenstandslos: Sie rechnet zur ABHOLADRESSE, und wer schon im Auto
  -- sitzt, laese sonst waehrend der ganzen Fahrt "etwa 1 Minute entfernt".
  abgeholt_um    TEXT,
  beendet_um     TEXT
);

CREATE INDEX IF NOT EXISTS idx_auftraege_eingang ON auftraege (eingang DESC);
CREATE INDEX IF NOT EXISTS idx_auftraege_status ON auftraege (status);
-- Fuer die Frage "wer ist gerade unterwegs?" vor jeder Vermittlung
CREATE INDEX IF NOT EXISTS idx_auftraege_fahrer ON auftraege (fahrer_id, status);

-- --- Verlauf der Vermittlung -------------------------------------------------
-- Haelt fest, wer wann gefragt wurde und wie reagiert hat. Hilft bei
-- Rueckfragen ("warum hat niemand abgeholt?") und belegt den Ablauf.
CREATE TABLE IF NOT EXISTS verlauf (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  auftrag_id TEXT    NOT NULL REFERENCES auftraege (id),
  fahrer_id  INTEGER REFERENCES fahrer (id),
  -- 'gefragt' | 'angenommen' | 'abgelehnt' | 'zeit-abgelaufen' | 'niemand' | 'fehler'
  ereignis   TEXT    NOT NULL,
  hinweis    TEXT    NOT NULL DEFAULT '',
  zeitpunkt  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_verlauf_auftrag ON verlauf (auftrag_id, zeitpunkt);

-- --- Standort der Fahrer -----------------------------------------------------
-- ACHTUNG: Beschaeftigtendaten. Deshalb so sparsam wie moeglich:
--
--   * Nur der LETZTE Punkt, kein Verlauf. Es entsteht kein Bewegungsprofil.
--   * Nur waehrend einer laufenden Fahrt. Ohne angenommenen Auftrag wird eine
--     Standortmeldung verworfen, nicht gespeichert.
--   * Mit dem Abmelden der Fahrt wird der Eintrag geloescht.
--   * Nach aussen geht nie der Punkt, sondern nur ein Satz wie "etwa 4
--     Minuten entfernt" - und den sieht allein der Fahrgast dieser Fahrt.
--
-- Der Fahrer teilt den Standort aktiv in Telegram ("Live-Standort"). Tut er es
-- nicht, laeuft alles wie bisher; die Zeile faellt dann einfach weg.
CREATE TABLE IF NOT EXISTS fahrer_standort (
  fahrer_id INTEGER PRIMARY KEY REFERENCES fahrer (id),
  breite    REAL NOT NULL,
  laenge    REAL NOT NULL,
  zeitpunkt TEXT NOT NULL DEFAULT (datetime('now')),
  -- Bis wann die Live-Freigabe laeuft. NULL = einmalig gesendeter Punkt.
  --
  -- Der Unterschied ist wichtig: Telegram schickt bei einer laufenden Freigabe
  -- nur dann eine Aktualisierung, wenn sich der Fahrer BEWEGT. Wer an der
  -- Ampel steht, meldet minutenlang nichts - sein Punkt stimmt trotzdem.
  -- Ohne diese Spalte wuerde er von der Anzeige verschwinden.
  live_bis  TEXT
);

-- --- Einstellungen -----------------------------------------------------------
-- Damit der Chef Nachtfenster und Antwortzeit selbst aendern kann.
CREATE TABLE IF NOT EXISTS einstellungen (
  schluessel TEXT PRIMARY KEY,
  wert       TEXT NOT NULL
);

INSERT OR IGNORE INTO einstellungen (schluessel, wert) VALUES
  ('nacht_von', '22:00'),
  ('nacht_bis', '06:00'),
  ('antwortzeit_sekunden', '40'),
  -- Festpreistarif. Liegt rund 13 % unter dem Stuttgarter Taxitarif
  -- (4,20 Grundpreis, 3,00 bis 4 km, danach 2,50).
  ('tarif_grundpreis', '3.50'),
  ('tarif_km_grenze', '4'),
  ('tarif_preis_nah', '2.60'),
  ('tarif_preis_fern', '2.20'),
  ('tarif_mindestpreis', '12'),
  ('tarif_rundung', '0.50'),
  -- Link zur Bewertungsseite, erscheint unter der Rechnung per E-Mail.
  -- Leer heisst: Die Zeile bleibt weg. Wird eingetragen, sobald das
  -- Google-Unternehmensprofil steht.
  ('bewertung_link', '');

-- --- Missbrauchsschutz -------------------------------------------------------
-- Verhindert, dass jemand ueber das Bestellformular die Fahrerhandys flutet.
-- Gespeichert wird nur ein gesalzener Hash der IP-Adresse, nicht die Adresse
-- selbst, und Eintraege aelter als eine Stunde werden geloescht.
CREATE TABLE IF NOT EXISTS drosselung (
  kennung   TEXT NOT NULL,
  zeitpunkt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drosselung ON drosselung (kennung, zeitpunkt);


-- --- Zwischenspeicher fuer Strecken ------------------------------------------
-- Dieselbe Strecke aendert sich nicht von Tag zu Tag. Der Speicher spart
-- Abfragen beim Kartendienst und macht die Preisanzeige spuerbar schneller.
CREATE TABLE IF NOT EXISTS strecken_speicher (
  schluessel TEXT PRIMARY KEY,
  km         REAL NOT NULL,
  minuten    INTEGER NOT NULL,
  angelegt   TEXT NOT NULL DEFAULT (datetime('now'))
);


-- --- Zwischenspeicher fuer Adressvorschlaege ---------------------------------
-- Derselbe Gedanke: Zehn Fahrgaeste tippen dieselben zehn Strassen. Der
-- Kartendienst hat ein Tageskontingent, und jeder Tastendruck kostet davon.
--
-- "treffer" ist die fertige Vorschlagsliste als JSON. Eine LEERE Liste wird
-- nie gespeichert - sie kann aus einem Ausfall stammen, und dann waere
-- "nichts gefunden" fuer dreissig Tage einbetoniert. Siehe
-- src/adressen-speicher.ts
CREATE TABLE IF NOT EXISTS adressen_speicher (
  schluessel TEXT PRIMARY KEY,
  treffer    TEXT NOT NULL,
  angelegt   TEXT NOT NULL DEFAULT (datetime('now'))
);


-- --- Rechnungen --------------------------------------------------------------
-- Eine ausgestellte Rechnung wird NIE geaendert oder geloescht (UStG, GoBD,
-- 8 Jahre Aufbewahrung). Fehler hebt eine Stornorechnung mit eigener Nummer
-- auf. Siehe src/rechnung-ablage.ts
--
-- Enthaelt Namen und Anschriften von Fahrgaesten - deshalb hier und nicht im
-- oeffentlichen Repository.
CREATE TABLE IF NOT EXISTS rechnungen (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Nummer "2026-0007": jahr und laufnummer. Jedes Jahr beginnt bei 1.
  jahr            INTEGER NOT NULL,
  laufnummer      INTEGER NOT NULL,
  -- JJJJ-MM-TT in deutscher Ortszeit
  rechnungsdatum  TEXT    NOT NULL,
  fahrtdatum      TEXT    NOT NULL,
  von             TEXT    NOT NULL,
  nach            TEXT    NOT NULL,
  -- Unter 250 EUR darf beides leer bleiben (Kleinbetragsrechnung)
  kunde_name      TEXT    NOT NULL DEFAULT '',
  kunde_anschrift TEXT    NOT NULL DEFAULT '',
  -- 'bar' | 'karte' | 'ueberweisung'
  zahlungsart     TEXT    NOT NULL DEFAULT 'bar',
  -- In Cent, damit keine Rundungsfehler entstehen. Negativ bei Stornorechnungen.
  brutto_cent     INTEGER NOT NULL,
  netto_cent      INTEGER NOT NULL,
  steuer_cent     INTEGER NOT NULL,
  steuersatz      INTEGER NOT NULL,
  -- Firmendaten beim Ausstellen als JSON. Zieht die Firma um, bleiben alte
  -- Rechnungen trotzdem so, wie sie der Fahrgast bekommen hat.
  absender        TEXT    NOT NULL,
  -- Gesetzt bei einer Stornorechnung: die Rechnung, die sie aufhebt
  storno_von      INTEGER REFERENCES rechnungen (id),
  -- Gefahrener Auftrag, falls die Rechnung aus einem stammt. Ein Auftrag kann
  -- zwei Rechnungen haben (Original und Storno), deshalb steht der Verweis
  -- hier und nicht umgekehrt.
  auftrag_id      TEXT    REFERENCES auftraege (id),

  -- Wann und wohin die Rechnung per E-Mail ging. Leer heisst: nicht
  -- verschickt - etwa weil sie im Fahrerbereich von Hand geschrieben wurde
  -- oder der Versand gescheitert ist. Beides muss unterscheidbar bleiben,
  -- sonst bekommt ein Fahrgast die Rechnung zweimal oder gar nicht.
  versendet_um    TEXT,
  versand_an      TEXT    NOT NULL DEFAULT '',

  angelegt        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rechnungen_nummer ON rechnungen (jahr, laufnummer);
-- Jede Rechnung kann nur einmal storniert werden
CREATE UNIQUE INDEX IF NOT EXISTS idx_rechnungen_storno ON rechnungen (storno_von);
CREATE INDEX IF NOT EXISTS idx_rechnungen_auftrag ON rechnungen (auftrag_id);
