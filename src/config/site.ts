import { z } from 'zod';
import { ladeYaml, ladeYamlOrdner } from '~/lib/yaml-laden';

/* ===========================================================================
   Schemas - sie beschreiben, wie die Dateien im Ordner content/ aussehen
   muessen. Die Texte in den Fehlermeldungen richten sich bewusst an
   Nicht-Techniker, weil sie im Netlify-Protokoll landen.
   =========================================================================== */

const pflichtText = (feld: string, beispiel?: string) =>
  z
    .string({ required_error: `"${feld}" fehlt und muss ausgefüllt werden.` })
    .trim()
    .min(
      1,
      `"${feld}" darf nicht leer sein.${beispiel ? ` Beispiel: ${beispiel}` : ''}`,
    );

const einstellungenSchema = z.object({
  unternehmen: z.object({
    marke: pflichtText('marke', 'MyRegioCar'),
    firmenname: pflichtText('firmenname'),
    inhaber: pflichtText('inhaber'),
    strasse: pflichtText('strasse'),
    plz: z
      .string()
      .regex(
        /^\d{5}$/,
        'Die Postleitzahl muss aus genau 5 Ziffern bestehen, z. B. 70469.',
      ),
    ort: pflichtText('ort'),
    land: pflichtText('land'),
    slogan: pflichtText('slogan'),
  }),
  kontakt: z.object({
    telefonAnzeige: pflichtText('telefonAnzeige', '+49 711 123456'),
    telefonWaehlen: z
      .string()
      .regex(
        /^\+[0-9]{7,17}$/,
        'Die Wähl-Nummer muss mit + beginnen und darf danach NUR Ziffern enthalten - keine Leerzeichen, Schrägstriche oder Klammern. Beispiel: +4971112345',
      ),
    whatsapp: z
      .string()
      .regex(
        /^[0-9]{8,15}$/,
        'Die WhatsApp-Nummer darf NUR Ziffern enthalten - ohne +, ohne Leerzeichen, ohne die 0 am Anfang. Aus 0171 2345678 wird 491712345678',
      ),
    email: z
      .string()
      .email(
        'Das ist keine gültige E-Mail-Adresse. Beispiel: contact@myregiocar.com',
      ),
    bestellungenEmail: z
      .string()
      .email('Das ist keine gültige E-Mail-Adresse.'),
    bewerbungEmail: z.string().email('Das ist keine gültige E-Mail-Adresse.'),
  }),
  oeffnungszeiten: z.object({
    text: pflichtText('text'),
    kurz: pflichtText('kurz'),
    durchgehend: z.boolean({
      required_error:
        '"durchgehend" muss true oder false sein (ohne Anführungszeichen).',
      invalid_type_error:
        '"durchgehend" muss true oder false sein (ohne Anführungszeichen).',
    }),
    zeiten: z
      .array(
        z.object({
          tage: pflichtText('tage'),
          von: z
            .string()
            .regex(/^\d{2}:\d{2}$/, 'Uhrzeit bitte als 08:00 schreiben.'),
          bis: z
            .string()
            .regex(/^\d{2}:\d{2}$/, 'Uhrzeit bitte als 22:00 schreiben.'),
        }),
      )
      .default([]),
  }),
  hinweisBanner: z.object({
    anzeigen: z.boolean({
      invalid_type_error:
        '"anzeigen" muss true oder false sein (ohne Anführungszeichen).',
    }),
    text: z.string().default(''),
  }),
  anfahrt: z.object({
    breitengrad: z.number({
      invalid_type_error: 'Der Breitengrad muss eine Zahl sein.',
    }),
    laengengrad: z.number({
      invalid_type_error: 'Der Längengrad muss eine Zahl sein.',
    }),
    haltestelle: pflichtText('haltestelle'),
    fussMeter: z
      .number()
      .int()
      .positive('Die Entfernung muss eine Zahl größer als 0 sein.'),
    fussMinuten: z
      .number()
      .int()
      .positive('Die Gehzeit muss eine Zahl größer als 0 sein.'),
    linien: z.array(z.string()).min(1, 'Mindestens eine Linie angeben, z. B. U6.'),
    flughafenMinuten: z
      .number()
      .int()
      .positive('Die Fahrzeit muss eine Zahl größer als 0 sein.'),
    taktMinuten: z
      .number()
      .int()
      .positive('Der Takt muss eine Zahl größer als 0 sein.'),
  }),
  einzugsgebiet: z.array(z.string()).min(1, 'Mindestens einen Ort angeben.'),
  rechtliches: z.object({
    ustId: z.string().default(''),
    aufsichtsbehoerde: z.string().default(''),
    konzession: z.string().default(''),
  }),
});

const preiseSchema = z.object({
  waehrung: z.string().default('EUR'),
  strecken: z
    .array(
      z.object({
        ziel: pflichtText('ziel'),
        preis: z
          .number()
          .nonnegative('Der Preis muss eine Zahl sein, z. B. 49 oder 49.50'),
        hinweis: z.string().default(''),
      }),
    )
    .default([]),
  parkAndFly: z.object({
    preisProTag: z.number().nonnegative('Der Tagespreis muss eine Zahl sein.'),
    preisProWoche: z.number().nonnegative('Der Wochenpreis muss eine Zahl sein.'),
    stellplaetze: z
      .number()
      .int()
      .nonnegative('Die Anzahl muss eine ganze Zahl sein.'),
    ueberdacht: z.boolean(),
    gesichert: z.boolean(),
    schluesselabgabe: z.boolean(),
    shuttleAufpreis: z.number().nonnegative('Der Aufpreis muss eine Zahl sein.'),
  }),
  zuschlaege: z
    .array(
      z.object({
        bezeichnung: pflichtText('bezeichnung'),
        preis: z.number().nonnegative('Der Preis muss eine Zahl sein.'),
        hinweis: z.string().default(''),
      }),
    )
    .default([]),
  zahlungsarten: z.array(z.string()).default([]),
  anzeigen: z.boolean({
    invalid_type_error:
      '"anzeigen" muss true oder false sein (ohne Anführungszeichen). false blendet die Preise aus.',
  }),
});

const faqSchema = z.object({
  fragen: z.array(
    z.object({
      id: z
        .string()
        .regex(
          /^[a-z0-9-]+$/,
          'Die id darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.',
        ),
      frage: pflichtText('frage'),
      antwort: pflichtText('antwort'),
    }),
  ),
});

/** Eine Datei je Kundenstimme - die id ergibt sich aus dem Dateinamen. */
const kundenstimmeSchema = z.object({
  name: pflichtText('name'),
  ort: z.string().default(''),
  anlass: z.string().default(''),
  sterne: z
    .number()
    .int()
    .min(1)
    .max(5, 'Sterne müssen zwischen 1 und 5 liegen.'),
  text: pflichtText('text'),
  freigegeben: z.boolean({
    invalid_type_error:
      '"freigegeben" muss true oder false sein. Nur echte, freigegebene Bewertungen auf true stellen.',
  }),
});

/* ===========================================================================
   Geladene Inhalte
   =========================================================================== */

export const site = ladeYaml('einstellungen.yaml', einstellungenSchema);
export const preise = ladeYaml('preise.yaml', preiseSchema);
export const faq = ladeYaml('faq.yaml', faqSchema).fragen;

/** Nur ausdruecklich freigegebene Kundenstimmen erscheinen auf der Website. */
export const kundenstimmen = ladeYamlOrdner(
  'kundenstimmen',
  kundenstimmeSchema,
).filter((stimme) => stimme.freigegeben);

/* ===========================================================================
   Abgeleitete Werte und Hilfsfunktionen
   =========================================================================== */

export const adresseEinzeilig = `${site.unternehmen.strasse}, ${site.unternehmen.plz} ${site.unternehmen.ort}`;

/** Baut einen WhatsApp-Link mit optional vorgeschriebenem Text. */
export function whatsappLink(text?: string): string {
  const basis = `https://wa.me/${site.kontakt.whatsapp}`;
  return text ? `${basis}?text=${encodeURIComponent(text)}` : basis;
}

export const telefonLink = `tel:${site.kontakt.telefonWaehlen}`;

/** Allgemeine Anfragen, Impressum, Datenschutz. */
export const emailLink = `mailto:${site.kontakt.email}`;

/** Fahrtanfragen und Buchungen - z. B. als Ersatz, wenn WhatsApp fehlt. */
export const bestellungenLink = `mailto:${site.kontakt.bestellungenEmail}`;

/** Standardtext, wenn jemand den WhatsApp-Knopf ohne den Assistenten benutzt. */
export const whatsappStandardtext = `Hallo ${site.unternehmen.marke}, ich möchte eine Fahrt anfragen.`;

/** Sind bei den Preisen ueberhaupt schon echte Zahlen hinterlegt? */
export const preiseGepflegt =
  preise.strecken.some((s) => s.preis > 0) || preise.parkAndFly.preisProTag > 0;

/** Preise werden nur gezeigt, wenn der Schalter an ist UND Zahlen hinterlegt sind. */
export const preiseSichtbar = preise.anzeigen && preiseGepflegt;

export function preisFormat(betrag: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: preise.waehrung,
    minimumFractionDigits: betrag % 1 === 0 ? 0 : 2,
  }).format(betrag);
}
