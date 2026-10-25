// Agenda : vue Jour / Semaine / Mois — bandeaux (journées entières, séjours de 20 h et plus), partage des rendez-vous simultanés. Données FICTIVES.
import { describe, it, expect } from 'vitest';
import { fonction } from './helpers/extraire-biomeca.mjs';

const NOMS = [
  '_agAddDays',
  '_agDateKey',
  '_agEventSegmentOnDay',
  '_agEstBandeau',
  '_agBandeauxDuJour',
  '_agGeomEvenement',
  '_agRange',
  '_agStartOfWeek',
];
function monter(events, view = 'week', ref = new Date(2026, 9, 21)) {
  const corps = [
    'const agCal = { events: __ev, view: __view, refDate: __ref };',
    'const AG_CAL_HOUR_START = 7;',
    ...NOMS.map(fonction),
    `return { ${NOMS.join(', ')}, agCal };`,
  ].join('\n');
  return new Function('__ev', '__view', '__ref', corps)(events, view, ref);
}
const iso = (j, h, m = 0) => new Date(2026, 9, j, h, m).toISOString();

describe('bandeaux', () => {
  const E = [
    { id: 'a', start: '2026-10-20', end: '2026-10-22' }, // journée entière sur 2 jours (fin exclusive)
    { id: 'b', start: '2026-10-21' }, // journée entière sans fin
    { id: 'c', start: iso(19, 0), end: iso(22, 0) }, // séjour horodaté de 3 jours
    { id: 'd', start: iso(21, 9), end: iso(21, 10) }, // rendez-vous normal
    { id: 'e', start: iso(21, 8), end: iso(22, 3) }, // 19 h : reste dans la grille
    { id: 'f', start: iso(21, 8), end: iso(22, 4) }, // 20 h : bandeau
  ];
  it('journée entière, séjour de 20 h et plus = bandeau ; rendez-vous normal et 19 h = grille', () => {
    const { _agEstBandeau } = monter(E);
    expect(E.map((e) => [e.id, _agEstBandeau(e)])).toEqual([
      ['a', true],
      ['b', true],
      ['c', true],
      ['d', false],
      ['e', false],
      ['f', true],
    ]);
    expect(_agEstBandeau({ start: iso(21, 9) })).toBe(false); // sans fin : 30 min par défaut
    expect(_agEstBandeau({})).toBe(false);
  });
  it('un bandeau se répète sur chaque jour qu’il couvre (fin exclusive pour les journées entières)', () => {
    const { _agBandeauxDuJour } = monter(E);
    const ids = (j) =>
      _agBandeauxDuJour(new Date(2026, 9, j))
        .map((e) => e.id)
        .sort();
    expect(ids(19)).toEqual(['c']);
    expect(ids(20)).toEqual(['a', 'c']);
    expect(ids(21)).toEqual(['a', 'b', 'c', 'f']);
    expect(ids(22)).toEqual(['f']);
    expect(ids(23)).toEqual([]);
  });
});

describe('partage des rendez-vous simultanés', () => {
  const { _agGeomEvenement } = monter([]);
  it('1 ou 2 : partage égal en semaine', () => {
    expect(_agGeomEvenement(0, 1, false)).toEqual({ left: 0, width: 100 });
    expect(_agGeomEvenement(1, 2, false)).toEqual({ left: 50, width: 50 });
  });
  it('3 et plus en semaine : cascade lisible (jamais de colonne minuscule)', () => {
    for (let n = 3; n <= 8; n++) {
      for (let c = 0; c < n; c++) {
        const g = _agGeomEvenement(c, n, false);
        expect(g.width).toBeGreaterThanOrEqual(50);
        expect(g.left + g.width).toBeLessThanOrEqual(100.0001);
      }
    }
    expect(_agGeomEvenement(0, 5, false).left).toBe(0);
    expect(_agGeomEvenement(4, 5, false).left + 55).toBeCloseTo(100);
  });
  it('vue jour : partage égal jusqu’à 4, puis cascade d’au moins 30 %', () => {
    expect(_agGeomEvenement(3, 4, true)).toEqual({ left: 75, width: 25 });
    const g = _agGeomEvenement(5, 6, true);
    expect(g.width).toBeGreaterThanOrEqual(30);
    expect(g.left + g.width).toBeCloseTo(100);
  });
});

describe('plages affichées', () => {
  it('jour : 24 h ; semaine : lundi → lundi ; mois : 6 semaines', () => {
    const j = monter([], 'day')._agRange();
    expect(j.end - j.start).toBe(24 * 3600000);
    expect(j.start.getDate()).toBe(21);
    const s = monter([], 'week')._agRange();
    expect(s.start.getDay()).toBe(1);
    expect(Math.round((s.end - s.start) / 864e5)).toBe(7);
    const m = monter([], 'month')._agRange();
    expect(Math.round((m.end - m.start) / 864e5)).toBe(42);
  });
});

describe('contrat du code', () => {
  it('trois vues, grille horaire commune, 7 colonnes de largeur égale en mois', async () => {
    const { readFileSync } = await import('node:fs');
    const js = readFileSync(new URL('../js/biomeca.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../css/biomeca.css', import.meta.url), 'utf8');
    expect(js).toMatch(/agCalSetView\(\\'day\\'\)">Jour/);
    expect(js).toMatch(/agCal\.view === 'day' \? _agRenderTimeGrid\(\[agCal\.refDate\]\)/);
    expect(css).toMatch(/\.cal-grid-month \{[^}]*repeat\(7,minmax\(0,1fr\)\)/);
    expect(css).toMatch(/\.cal-week-col \{[^}]*flex:1 1 0; min-width:0/);
    expect(css).toMatch(/\.cal-week-head \{[^}]*flex:1 1 0; min-width:0/);
  });
});
