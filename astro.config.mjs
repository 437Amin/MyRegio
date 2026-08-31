// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Hier die spaetere Internetadresse eintragen (wichtig fuer Google):
const SEITEN_URL = 'https://www.myregiocar.com';

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
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: 'auto',
  },
  image: {
    responsiveStyles: true,
  },
});
