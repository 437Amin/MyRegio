import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rechnungAusFahrt } from '../src/rechnung-fahrt';
import type { Umgebung } from '../src/typen';

const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

/**
 * Die ganze Kette gegen eine echte SQLite-Datenbank: Auftrag anlegen, Fahrt
 * abmelden, Rechnung prüfen. Brevo und Telegram werden abgefangen - verschickt
 * wird im Test nichts.
 */
function aufbau({ brevoAntwort = 201 }: { brevoAntwort?: number } = {}) {
  const roh = new DatabaseSync(':memory:');
  roh.exec('PRAGMA foreign_keys = ON');
  const schema = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');
  roh.exec(readFileSync(schema, 'utf8'));

  // Wie D1: Abfragen ohne Platzhalter laufen direkt, mit Platzhaltern ueber
  // bind(). Beides muss der Nachbau koennen, sonst prueft er die falsche Welt.
  const anweisung = (sql: string, werte: unknown[] = []) => ({
    run: async () => roh.prepare(sql).run(...werte),
    first: async <T>() => (roh.prepare(sql).get(...werte) ?? null) as T | null,
    all: async <T>() => ({ results: roh.prepare(sql).all(...werte) as T[] }),
  });

  const db = {
    prepare: (sql: string) => ({
      ...anweisung(sql),
      bind: (...werte: unknown[]) => anweisung(sql, werte),
    }),
  };

  const env = {
    DB: db,
    TELEGRAM_TOKEN: 'test-token',
    CHEF_CHAT_ID: '999',
    BREVO_API_KEY: 'test-schluessel',
  } as unknown as Umgebung;

  const mails: Record<string, unknown>[] = [];
  const telegram: Record<string, unknown>[] = [];

  vi.stubGlobal('fetch', async (adresse: string, optionen: RequestInit) => {
    const koerper = JSON.parse(String(optionen.body ?? '{}'));
    if (String(adresse).includes('brevo')) {
      mails.push(koerper);
      return new Response(JSON.stringify({ messageId: '<abc@brevo>' }), {
        status: brevoAntwort,
      });
    }
    telegram.push(koerper);
    return new Response('{"ok":true}', { status: 200 });
  });

  const auftragAnlegen = (werte: Record<string, unknown> = {}) => {
    const a = {
      id: 'A1',
      art: 'Flughafentransfer',
      abholung: 'Steiermärker Straße 3-5, Stuttgart',
      ziel: 'Flughafen Stuttgart – Terminal',
      preis: 46.5,
      kunde_name: 'Frau Keller',
      kunde_telefon: '0711 1234567',
      rechnung_gewuenscht: 1,
      kunde_email: 'kunde@example.com',
      ...werte,
    };
    roh
      .prepare(
        `INSERT INTO auftraege
           (id, art, abholung, ziel, preis, kunde_name, kunde_telefon,
            rechnung_gewuenscht, kunde_email, eingang)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-13 08:30:00')`,
      )
      .run(
        a.id,
        a.art,
        a.abholung,
        a.ziel,
        a.preis,
        a.kunde_name,
        a.kunde_telefon,
        a.rechnung_gewuenscht,
        a.kunde_email,
      );
    return String(a.id);
  };

  const rechnungen = () =>
    roh.prepare('SELECT * FROM rechnungen ORDER BY id').all() as Record<
      string,
      unknown
    >[];

  return { env, auftragAnlegen, rechnungen, mails, telegram };
}

afterEach(() => vi.unstubAllGlobals());

describe('Rechnung aus einer abgeschlossenen Fahrt', () => {
  it('legt sie an und verschickt sie', async () => {
    const { env, auftragAnlegen, rechnungen, mails } = aufbau();
    auftragAnlegen();

    expect(await rechnungAusFahrt(env, 'A1', 'karte')).toBe('verschickt');

    const [r] = rechnungen();
    expect(r).toMatchObject({
      jahr: 2026,
      laufnummer: 1,
      brutto_cent: 4650,
      netto_cent: 3908,
      steuer_cent: 742,
      steuersatz: 19,
      zahlungsart: 'karte',
      kunde_name: 'Frau Keller',
      auftrag_id: 'A1',
      versand_an: 'kunde@example.com',
    });
    expect(r!.versendet_um).toBeTruthy();

    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({
      to: [{ email: 'kunde@example.com', name: 'Frau Keller' }],
      subject: 'Ihre Rechnung 2026-0001 – MyRegioCar',
    });
    // Das PDF hängt dran und ist keine leere Hülle
    const anhang = (mails[0] as { attachment: { name: string; content: string }[] })
      .attachment[0]!;
    expect(anhang.name).toBe('Rechnung-2026-0001.pdf');
    expect(atob(anhang.content).startsWith('%PDF')).toBe(true);
  });

  it('übernimmt die Zahlungsart des Fahrers, statt sie zu raten', async () => {
    const { env, auftragAnlegen, rechnungen } = aufbau();
    auftragAnlegen();

    await rechnungAusFahrt(env, 'A1', 'bar');
    expect(rechnungen()[0]).toMatchObject({ zahlungsart: 'bar' });
  });

  it('tut nichts, wenn keine Rechnung gewünscht war', async () => {
    const { env, auftragAnlegen, rechnungen, mails } = aufbau();
    auftragAnlegen({ rechnung_gewuenscht: 0, kunde_email: '' });

    expect(await rechnungAusFahrt(env, 'A1', 'bar')).toBe('keine');
    expect(rechnungen()).toHaveLength(0);
    expect(mails).toHaveLength(0);
  });

  it('schreibt bei zweimaligem Tippen keine zweite Rechnung', async () => {
    const { env, auftragAnlegen, rechnungen } = aufbau();
    auftragAnlegen();

    expect(await rechnungAusFahrt(env, 'A1', 'bar')).toBe('verschickt');
    expect(await rechnungAusFahrt(env, 'A1', 'bar')).toBe('schon-da');
    expect(rechnungen()).toHaveLength(1);
  });

  it('übergibt über 250 € an den Chef, statt ohne Anschrift zu verschicken', async () => {
    const { env, auftragAnlegen, rechnungen, mails, telegram } = aufbau();
    auftragAnlegen({ preis: 320 });

    expect(await rechnungAusFahrt(env, 'A1', 'bar')).toBe('chef');
    expect(rechnungen()).toHaveLength(0);
    expect(mails).toHaveLength(0);
    expect(String(telegram[0]?.text)).toContain('Anschrift');
    expect(String(telegram[0]?.text)).toContain('kunde@example.com');
  });

  it('übergibt an den Chef, wenn kein Festpreis feststeht', async () => {
    const { env, auftragAnlegen, rechnungen, telegram } = aufbau();
    auftragAnlegen({ preis: 0 });

    expect(await rechnungAusFahrt(env, 'A1', 'bar')).toBe('chef');
    expect(rechnungen()).toHaveLength(0);
    expect(String(telegram[0]?.text)).toContain('kein Festpreis');
  });

  it('behält die Rechnung, wenn der Versand scheitert, und meldet es', async () => {
    const { env, auftragAnlegen, rechnungen, telegram } = aufbau({ brevoAntwort: 401 });
    auftragAnlegen();

    expect(await rechnungAusFahrt(env, 'A1', 'bar')).toBe('angelegt');

    // Angelegt ja, als verschickt markiert nein - sonst ginge sie nie raus
    const [r] = rechnungen();
    expect(r).toBeTruthy();
    expect(r!.versendet_um).toBeNull();
    expect(r!.versand_an).toBe('');

    expect(String(telegram[0]?.text)).toContain('konnte nicht verschickt werden');
  });

  it('reißt die Fahrt nicht mit, wenn etwas Unerwartetes schiefgeht', async () => {
    const { env, auftragAnlegen } = aufbau();
    auftragAnlegen();
    // Die Einstellungen-Tabelle verschwindet mitten im Vorgang
    await env.DB.prepare('DROP TABLE einstellungen').bind().run();

    // Kein Wurf, nur ein Ergebnis - der Fahrer bleibt freigemeldet
    await expect(rechnungAusFahrt(env, 'A1', 'bar')).resolves.toBe('keine');
  });

  it('kennt einen unbekannten Auftrag und tut nichts', async () => {
    const { env, rechnungen } = aufbau();
    expect(await rechnungAusFahrt(env, 'gibt-es-nicht', 'bar')).toBe('keine');
    expect(rechnungen()).toHaveLength(0);
  });
});
