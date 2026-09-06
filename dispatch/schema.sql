-- =============================================================================
--  Datenbank der Auftragsvermittlung
-- =============================================================================
--  Anlegen mit:  npm run db:anlegen   (bzw. db:lokal zum Ausprobieren)
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

  fahrer_id      INTEGER REFERENCES fahrer (id),
  angenommen_um  TEXT,
  beendet_um     TEXT
);

CREATE INDEX IF NOT EXISTS idx_auftraege_eingang ON auftraege (eingang DESC);
CREATE INDEX IF NOT EXISTS idx_auftraege_status ON auftraege (status);

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
  ('tarif_rundung', '0.50');

-- --- Missbrauchsschutz -------------------------------------------------------
-- Verhindert, dass jemand ueber das Bestellformular die Fahrerhandys flutet.
-- Gespeichert wird nur ein gesalzener Hash der IP-Adresse, nicht die Adresse
-- selbst, und Eintraege aelter als eine Stunde werden geloescht.
CREATE TABLE IF NOT EXISTS drosselung (
  kennung   TEXT NOT NULL,
  zeitpunkt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_drosselung ON drosselung (kennung, zeitpunkt);
