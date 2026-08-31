import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import type { z } from 'zod';

const INHALTE_ORDNER = path.resolve(process.cwd(), 'content');

/**
 * Baut eine Fehlermeldung, die auch jemand ohne Programmierkenntnisse versteht.
 * Sie erscheint im Terminal und im Build-Protokoll von Netlify.
 */
function meldung(datei: string, zeilen: string[]): string {
  const rahmen = '-'.repeat(70);
  return [
    '',
    rahmen,
    `  FEHLER IN DER DATEI:  content/${datei}`,
    rahmen,
    '',
    ...zeilen.map((z) => `  ${z}`),
    '',
    '  Die Website wurde NICHT veroeffentlicht.',
    '  Die bisherige Fassung bleibt unveraendert online - es ist nichts kaputt.',
    '',
    '  Bitte korrigieren Sie die oben genannte Stelle und speichern Sie erneut.',
    '  Tipp: Meist fehlt ein Anfuehrungszeichen oder die Einrueckung',
    '  (die Leerzeichen am Zeilenanfang) stimmt nicht.',
    rahmen,
    '',
  ].join('\n');
}

/** Uebersetzt den technischen Pfad eines Fehlers in etwas Lesbares. */
function feldName(pfad: (string | number)[]): string {
  if (pfad.length === 0) return 'Die Datei insgesamt';
  return pfad
    .map((teil) => (typeof teil === 'number' ? `Eintrag ${teil + 1}` : teil))
    .join(' -> ');
}

/**
 * Liest eine YAML-Datei aus dem Ordner content/ und prueft sie gegen ein Schema.
 * Stimmt etwas nicht, bricht der Build mit einer verstaendlichen Meldung ab.
 */
export function ladeYaml<T>(datei: string, schema: z.ZodType<T>): T {
  const pfad = path.join(INHALTE_ORDNER, datei);

  let inhalt: string;
  try {
    inhalt = fs.readFileSync(pfad, 'utf8');
  } catch {
    throw new Error(
      meldung(datei, [
        'Die Datei wurde nicht gefunden.',
        'Wurde sie versehentlich geloescht oder umbenannt?',
      ]),
    );
  }

  let roh: unknown;
  try {
    roh = yaml.load(inhalt);
  } catch (fehler) {
    const text = fehler instanceof Error ? fehler.message : String(fehler);
    throw new Error(
      meldung(datei, [
        'Der Aufbau der Datei ist nicht mehr korrekt.',
        '',
        'Technische Angabe (nennt meist die Zeilennummer):',
        text.split('\n')[0] ?? text,
      ]),
    );
  }

  const ergebnis = schema.safeParse(roh);
  if (!ergebnis.success) {
    const zeilen = ergebnis.error.issues.map(
      (problem) => `* ${feldName(problem.path)}: ${problem.message}`,
    );
    throw new Error(
      meldung(datei, ['Folgende Angaben stimmen nicht:', '', ...zeilen]),
    );
  }

  return ergebnis.data;
}

/**
 * Liest alle YAML-Dateien eines Unterordners. Jede Datei ist EIN Eintrag.
 * Der Dateiname dient als Kennung - so kann der Redaktionsbereich neue
 * Eintraege anlegen, ohne dass jemand eine id von Hand vergeben muss.
 */
export function ladeYamlOrdner<T>(
  ordner: string,
  schema: z.ZodType<T>,
): (T & { id: string })[] {
  const voll = path.join(INHALTE_ORDNER, ordner);
  if (!fs.existsSync(voll)) return [];

  return fs
    .readdirSync(voll)
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
    .sort()
    .map((name) => ({
      ...ladeYaml(`${ordner}/${name}`, schema),
      id: name.replace(/\.ya?ml$/, ''),
    }));
}
