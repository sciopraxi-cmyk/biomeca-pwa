// Lot e2 : exercices de la bibliothèque dans les bilans, et plus d'annexes PDF. Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const corps = [
    "const FICHES_SYSTEMES = { 'systeme-visuel': { label: '👁️ Système visuel', bilans: ['sport','posturo'], subs: ['1. Fixation','2. Poursuite'] } };",
    "const SPORT_SYSTEMES_LABELS = { 'systeme-visuel': '👁️ Système visuel' };",
    'let _exoBib = null;',
    'function _escHtml(s){return String(s);}',
    fonction('_exoBibConstruire'),
    fonction('_exoBibCats'),
    fonction('_exoBibSubs'),
    fonction('_exoBibLabelSys'),
    fonction('_exoBibLabelSub'),
    fonction('_exoBibPairs'),
    'return { _exoBibConstruire, _exoBibCats, _exoBibSubs, _exoBibPairs, charger: (b,c,p)=>{ _exoBib = _exoBibConstruire(b,c,p); } };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}
const BASE = [
  {
    categorie_id: 'c1',
    categorie_code: 'systeme-visuel',
    categorie_libelle: 'Système visuel',
    bilans: ['sport', 'posturo'],
    exercice_id: 'e1',
    exercice_code: 'systeme-visuel|1. Fixation',
    libelle: 'Fixation',
  },
  {
    categorie_id: 'c2',
    categorie_code: 'reeduc-pied',
    categorie_libelle: 'Rééducation du pied',
    bilans: ['sport'],
    exercice_id: 'e2',
    exercice_code: 'reeduc-pied|pied-enfant|pont',
    libelle: 'Pont',
  },
  {
    categorie_id: 'c3',
    categorie_code: 'podo-seul',
    categorie_libelle: 'Podo',
    bilans: ['podo'],
    exercice_id: 'e3',
    exercice_code: 'podo-seul|x',
    libelle: 'X',
  },
];

describe('bibliothèque dans les bilans', () => {
  it('sans bibliothèque : liste de secours = ancienne liste', () => {
    const f = monter();
    expect(f._exoBibCats('sport').map((c) => c.value)).toEqual(['systeme-visuel']);
    expect(f._exoBibSubs('systeme-visuel').map((o) => o.value)).toEqual([
      '1. Fixation',
      '2. Poursuite',
    ]);
  });
  it('filtre par bilan, garde les anciennes valeurs (code privé de la catégorie)', () => {
    const f = monter();
    f.charger(BASE, [], []);
    expect(f._exoBibCats('posturo').map((c) => c.value)).toEqual(['systeme-visuel']);
    expect(f._exoBibCats('sport').map((c) => c.value)).toEqual(['systeme-visuel', 'reeduc-pied']);
    expect(f._exoBibSubs('systeme-visuel')[0].value).toBe('1. Fixation');
    expect(f._exoBibSubs('reeduc-pied')[0].value).toBe('pied-enfant|pont');
  });
  it('ajoute les exercices perso (catégorie de la base ou catégorie perso) et ignore les inactifs', () => {
    const f = monter();
    f.charger(
      BASE,
      [
        { id: 'p1', libelle: 'Mes exos', actif: true },
        { id: 'p2', libelle: 'Cachée', actif: false },
      ],
      [
        { id: 'x1', categorie_base_id: 'c1', libelle: 'Mon oculaire', actif: true },
        { id: 'x2', categorie_perso_id: 'p1', libelle: 'Gainage maison', actif: true },
        { id: 'x3', categorie_perso_id: 'p1', libelle: 'Inactif', actif: false },
        { id: 'x4', categorie_perso_id: 'p2', libelle: 'Dans cachée', actif: true },
      ]
    );
    expect(f._exoBibSubs('systeme-visuel').map((o) => o.value)).toContain('perso:x1');
    expect(f._exoBibCats('posturo').map((c) => c.value)).toContain('pcat:p1');
    expect(f._exoBibCats('posturo').map((c) => c.value)).not.toContain('pcat:p2');
    expect(f._exoBibSubs('pcat:p1').map((o) => o.label)).toEqual(['Gainage maison']);
  });
  it("rapport : « Catégorie → Exercice », libellé conservé si l'exercice perso a disparu", () => {
    const f = monter();
    f.charger(BASE, [], []);
    expect(
      f._exoBibPairs(
        ['systeme-visuel', '', 'pcat:zz'],
        ['1. Fixation', '', 'perso:yy'],
        [],
        ['', '', 'Mon ancien exo']
      )[0]
    ).toBe('Système visuel → Fixation');
    const p = f._exoBibPairs(['pcat:zz'], ['perso:yy'], ['Ma catégorie'], ['Mon ancien exo']);
    expect(p).toEqual(['Ma catégorie → Mon ancien exo']);
    expect(f._exoBibPairs(['pcat:zz'], ['perso:yy'], [], [])[0]).toContain('supprimé');
    expect(f._exoBibPairs(['ancien-slug'], [''], [], [])).toEqual(['ancien-slug']);
  });
});

describe("plus d'annexes PDF dans les rapports", () => {
  it('le code des annexes et pdf.js ont disparu', () => {
    [
      '_resolveSportFichesImages',
      '_resolvePosturoFichesImages',
      '_resolveFichesImagesFromPairs',
      '_collectSportFichesPairs',
      '_collectPosturoFichesPairs',
      '_buildFichesFailHTML',
      'pdfjsLib',
      'Annexes incomplètes',
    ].forEach((m) => {
      expect(SRC_BIOMECA.includes(m), m).toBe(false);
    });
  });
});
