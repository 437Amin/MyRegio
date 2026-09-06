-- =============================================================================
--  Nachtraegliche Erweiterung fuer die Festpreise
-- =============================================================================
--  Nur einmal noetig, fuer Datenbanken, die vor dem Festpreis-Feature
--  angelegt wurden. Bei einer frisch aufgesetzten Datenbank bringt
--  schema.sql die Spalten bereits mit.
--
--  Aufruf:
--    npx wrangler d1 execute vermittlung --remote --file=migration-preise.sql
-- =============================================================================

ALTER TABLE auftraege ADD COLUMN preis REAL NOT NULL DEFAULT 0;
ALTER TABLE auftraege ADD COLUMN strecke_km REAL NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO einstellungen (schluessel, wert) VALUES
  ('tarif_grundpreis', '3.50'),
  ('tarif_km_grenze', '4'),
  ('tarif_preis_nah', '2.60'),
  ('tarif_preis_fern', '2.20'),
  ('tarif_mindestpreis', '12'),
  ('tarif_rundung', '0.50');
