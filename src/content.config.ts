import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Beschreibt die Markdown-Dateien im Ordner content/.
 * Fehlt in einer Datei eine Pflichtangabe, bricht der Build ab und die
 * bisherige Fassung der Website bleibt online.
 */

const leistungen = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/leistungen' }),
  schema: z.object({
    titel: z.string().min(1, 'Jede Leistung braucht einen "titel".'),
    kurz: z.string().min(1, 'Bitte einen kurzen Satz unter "kurz" ergänzen.'),
    icon: z.enum(
      ['flugzeug', 'herz', 'aktentasche', 'paket', 'stern', 'route', 'parken'],
      {
        errorMap: () => ({
          message:
            'Unbekanntes Symbol. Erlaubt sind: flugzeug, herz, aktentasche, paket, stern, route, parken',
        }),
      },
    ),
    reihenfolge: z
      .number()
      .int()
      .positive('Die "reihenfolge" muss eine Zahl ab 1 sein und legt die Sortierung fest.'),
    seoTitel: z.string().max(70, 'Der SEO-Titel sollte höchstens 70 Zeichen haben.'),
    seoBeschreibung: z
      .string()
      .max(175, 'Die SEO-Beschreibung sollte höchstens 175 Zeichen haben.'),
    vorteile: z.array(z.string()).min(1, 'Bitte mindestens einen Vorteil nennen.'),
  }),
});

const jobs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/jobs' }),
  schema: z.object({
    titel: z.string().min(1, 'Die Stellenanzeige braucht einen "titel".'),
    art: z.string().min(1, 'Bitte die Anstellungsart angeben, z. B. Vollzeit.'),
    standort: z.string().min(1, 'Bitte den Standort angeben.'),
    aktiv: z.boolean({
      invalid_type_error:
        '"aktiv" muss true oder false sein. Auf false stellen, sobald die Stelle besetzt ist.',
    }),
    reihenfolge: z.number().int().positive('Die "reihenfolge" muss eine Zahl ab 1 sein.'),
    anforderungen: z.array(z.string()).default([]),
    wirBieten: z.array(z.string()).default([]),
  }),
});

export const collections = { leistungen, jobs };
