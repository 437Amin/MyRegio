/** Menuepunkte im Kopf und im Fuss der Website. */
export const hauptmenue = [
  { titel: 'Start', pfad: '/' },
  { titel: 'Park & Fly', pfad: '/park-and-fly' },
  { titel: 'Leistungen', pfad: '/leistungen' },
  { titel: 'Kontakt', pfad: '/kontakt' },
  { titel: 'Jobs', pfad: '/jobs' },
] as const;

export const rechtsmenue = [
  { titel: 'Impressum', pfad: '/impressum' },
  { titel: 'Datenschutz', pfad: '/datenschutz' },
] as const;

/** Prueft, ob ein Menuepunkt zur aktuell geoeffneten Seite gehoert. */
export function istAktiv(pfad: string, aktuell: string): boolean {
  const sauber = aktuell.replace(/\/$/, '') || '/';
  if (pfad === '/') return sauber === '/';
  return sauber === pfad || sauber.startsWith(pfad + '/');
}
