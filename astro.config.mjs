// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Hier die spaetere Internetadresse eintragen (wichtig fuer Google):
const SEITEN_URL = 'https://www.myregiocar.com';

/**
 * Der Entwicklungsserver soll auf Aenderungen im Ordner content/ reagieren.
 *
 * Noetig, weil src/config/site.ts die YAML-Dateien direkt vom Dateisystem
 * liest. Sie sind dadurch nicht Teil des Modulgraphen, und ohne diesen
 * Beobachter wuerde eine geaenderte Telefonnummer oder ein neuer Preis beim
 * Entwickeln erst nach einem Neustart erscheinen.
 *
 * Auf den fertigen Build hat das keinen Einfluss - der liest ohnehin frisch.
 */
function inhalteBeobachten() {
  return {
    name: 'inhalte-beobachten',
    configureServer(server) {
      server.watcher.add('content');
      server.watcher.on('change', (pfad) => {
        if (/[\\/]content[\\/]/.test(pfad)) {
          server.restart();
        }
      });
    },
  };
}

export default defineConfig({
  site: SEITEN_URL,
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      // Diese Seiten sollen nicht bei Google auftauchen
      filter: (seite) =>
        !seite.includes('/impressum') && !seite.includes('/datenschutz'),
    }),
  ],
  vite: {
    plugins: [tailwindcss(), inhalteBeobachten()],
  },
  build: {
    inlineStylesheets: 'auto',
  },
  image: {
    responsiveStyles: true,
  },
});
