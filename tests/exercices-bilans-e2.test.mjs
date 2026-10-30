// Lot e2 : exercices de la bibliothèque dans les bilans, et plus d'annexes PDF. Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, objet, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const corps = [
    "const FICHES_SYSTEMES = { 'systeme-visuel': { label: '👁️ Système visuel', bilans: ['sport','posturo'], subs: ['1. Fixation','2. Poursuite'] } };",
    "const SPORT_SYSTEMES_LABELS = { 'systeme-visuel': '👁️ Système visuel' };",
    'let _exoBib = null;',
    'function _escHtml(s){return String(s);}',
    objet('_EXO_PICTOS'),
    fonction('_exoAvecPicto'),
    fonction('_exoBibConstruire'),
    SRC_BIOMECA.slice(
      SRC_BIOMECA.indexOf('const _EXO_PODO_EXCLUES'),
      SRC_BIOMECA.indexOf('\n', SRC_BIOMECA.indexOf('const _EXO_PODO_EXCLUES')) + 1
    ),
    SRC_BIOMECA.slice(
      SRC_BIOMECA.indexOf('const _EXO_PATHO_SLUGS'),
      SRC_BIOMECA.indexOf('\n', SRC_BIOMECA.indexOf('const _EXO_PATHO_SLUGS')) + 1
    ),
    fonction('_exoSubsSecours'),
    fonction('_exoBibCats'),
    fonction('_exoBibSubs'),
    fonction('_exoBibLabelSys'),
    fonction('_exoBibLabelSub'),
    fonction('_exoBibPairs'),
    'return { _exoAvecPicto, _exoBibConstruire, _exoBibCats, _exoBibSubs, _exoBibPairs, charger: (b,c,p)=>{ _exoBib = _exoBibConstruire(b,c,p); } };',
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
    ).toBe('👁️ Système visuel → Fixation');
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

describe('podopédiatrie : catégories retirées', () => {
  const codes = [
    'systeme-visuel',
    'systeme-vestibulaire',
    'systeme-somesthesique',
    'reeduc-pied',
    'systeme-mandibulaire',
    'reeduc-terrain',
    'reeduc-chaines',
    'reflexes-archaiques',
    'respi-sport',
    'reeduc-posturale',
    'reeduc-articulaire',
    'pathologies-genou',
    'pathologies-hanche',
    'pathologies-pied',
    'respi-posture',
  ];
  const GARDEES = [
    'systeme-visuel',
    'systeme-vestibulaire',
    'reeduc-pied',
    'systeme-mandibulaire',
    'reeduc-chaines', // rouvertes pour la podopédiatrie (demande du 30/10/2026 : propositions chaînes posturales et chaînistes)
    'reflexes-archaiques',
    'reeduc-posturale',
    'respi-posture',
  ];
  const base = codes.map((c, i) => ({
    categorie_id: 'c' + i,
    categorie_code: c,
    categorie_libelle: c,
    bilans: ['sport'],
    exercice_id: 'e' + i,
    exercice_code: c + '|x',
    libelle: 'X',
  }));
  it('avec la bibliothèque : seules les catégories adaptées (+ nouvelles et perso)', () => {
    const f = monter();
    f.charger(
      [
        ...base,
        {
          categorie_id: 'cn',
          categorie_code: 'nouvelle',
          categorie_libelle: 'Nouvelle',
          bilans: ['sport'],
          exercice_id: 'en',
          exercice_code: 'nouvelle|x',
          libelle: 'N',
        },
      ],
      [{ id: 'p1', libelle: 'Mes exos', actif: true }],
      []
    );
    expect(f._exoBibCats('podo').map((c) => c.value)).toEqual([...GARDEES, 'nouvelle', 'pcat:p1']);
    expect(f._exoBibCats('sport').map((c) => c.value)).toContain('respi-sport');
  });
  it('sans bibliothèque (hors ligne) : même liste adaptée', () => {
    const f = monter();
    const v = f._exoBibCats('podo').map((c) => c.value);
    expect(v).not.toContain('respi-sport');
    expect(v).not.toContain('pathologies-pied');
  });
});

describe('petit dessin devant les catégories', () => {
  it('dessin selon le code ; ⭐ perso ; 🏋️ catégorie inconnue ; jamais deux fois', () => {
    const f = monter();
    expect(f._exoAvecPicto('systeme-visuel', 'Système visuel')).toBe('👁️ Système visuel');
    expect(f._exoAvecPicto('systeme-vestibulaire', 'Système vestibulaire')).toBe(
      '👂 Système vestibulaire'
    );
    expect(f._exoAvecPicto('reeduc-pied', 'Rééducation du pied')).toBe('🦶 Rééducation du pied');
    expect(f._exoAvecPicto('systeme-mandibulaire', 'Système mandibulaire')).toBe(
      '🦷 Système mandibulaire'
    );
    expect(f._exoAvecPicto('reflexes-archaiques', 'Réflexes archaïques')).toBe(
      '🧠 Réflexes archaïques'
    );
    expect(f._exoAvecPicto('respi-posture', 'Rééducation par la respiration (posture)')).toBe(
      '🌬️ Rééducation par la respiration (posture)'
    );
    expect(f._exoAvecPicto('pcat:p1', 'Mes exos')).toBe('⭐ Mes exos');
    expect(f._exoAvecPicto('nouvelle-cat', 'Nouvelle')).toBe('🏋️ Nouvelle');
    expect(f._exoAvecPicto('systeme-visuel', '👁️ Système visuel')).toBe('👁️ Système visuel');
  });
  it('les listes des bilans affichent le dessin (base et perso)', () => {
    const f = monter();
    f.charger(BASE, [{ id: 'p1', libelle: 'Mes exos', actif: true }], []);
    expect(f._exoBibCats('sport').map((c) => c.label)).toEqual([
      '👁️ Système visuel',
      '🦶 Rééducation du pied',
      '⭐ Mes exos',
    ]);
  });
});

describe("catégorie « Rééducation du pied » : plus d'exercice « Rééducation du pied »", () => {
  it("la fiche 28 jours n'est plus proposée dans la liste de secours ni dans la base importée", () => {
    expect(SRC_BIOMECA).not.toMatch(/subs: \[\"1\. Rééducation du pied\"\]/);
    const f = monter();
    expect(f._exoBibSubs('reeduc-pied').map((o) => o.label)).not.toContain(
      '1. Rééducation du pied'
    );
  });
});

describe('catégories découpées (24/10/2026) : dessins et podopédiatrie', () => {
  const NOUVELLES = [
    'terrain-terrien',
    'terrain-aerien',
    'chaine-flexion',
    'chaine-extension',
    'chaine-fermeture',
    'chaine-ouverture',
    'chaine-statique-expiration',
    'chaine-statique-inspiration',
  ];
  it('chaque nouvelle catégorie a son dessin ; terrain exclu de la podopédiatrie, chaînes rouvertes (30/10/2026)', () => {
    const f = monter();
    NOUVELLES.forEach((c) => {
      expect(f._exoAvecPicto(c, 'Test')).toMatch(/^(🏃|⛓️) Test$/u);
    });
    const base = NOUVELLES.map((c, i) => ({
      categorie_id: 'n' + i,
      categorie_code: c,
      categorie_libelle: c,
      bilans: ['sport', 'posturo'],
      exercice_id: 'e' + i,
      exercice_code: 'x|' + i + '|' + c,
      libelle: 'Exo ' + i,
    }));
    base.push({ ...BASE[0] });
    f.charger(base, [], []);
    // terrain moteur : toujours exclu ; chaînes (Busquet / GDS) : rouvertes pour les propositions automatiques
    expect(f._exoBibCats('podo').map((c) => c.value)).toEqual([
      ...NOUVELLES.filter((c) => c.startsWith('chaine-')),
      BASE[0].categorie_code,
    ]);
    expect(f._exoBibCats('sport').map((c) => c.value)).toEqual(expect.arrayContaining(NOUVELLES));
  });
});

describe('nerfs crâniens (30/10/2026) : podopédiatrie', () => {
  it('nerfs crâniens et tronc cérébral exclus de la podopédiatrie, SAUF NC8 qui porte les exercices vestibulaires', () => {
    const exclues = SRC_BIOMECA.slice(
      SRC_BIOMECA.indexOf('const _EXO_PODO_EXCLUES'),
      SRC_BIOMECA.indexOf(']', SRC_BIOMECA.indexOf('const _EXO_PODO_EXCLUES'))
    );
    for (const c of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12])
      expect(exclues).toMatch(new RegExp("'nc" + c + '-'));
    expect(exclues).toMatch(/'tronc-cerebral'/);
    expect(exclues).not.toMatch(/'nc8-vestibulo-cochleaire'/);
  });
});

describe('pathologies genou / hanche / pied (30/10/2026) : plus des exercices des circuits', () => {
  it('absentes des listes des circuits (sport, posturo, podo), liste de secours comprise ; remplacées par des cases', () => {
    const ligne = (nom) =>
      SRC_BIOMECA.slice(
        SRC_BIOMECA.indexOf('const ' + nom),
        SRC_BIOMECA.indexOf('\n', SRC_BIOMECA.indexOf('const ' + nom)) + 1
      );
    const corps = [
      objet('FICHES_SYSTEMES'),
      'let _exoBib = null;',
      'function _escHtml(s){return String(s);}',
      ligne('_EXO_PODO_EXCLUES'),
      ligne('_EXO_PATHO_SLUGS'),
      fonction('_exoSubsSecours'),
      fonction('_exoBibCats'),
      'return { _exoBibCats, FICHES_SYSTEMES };',
    ].join('\n');
    // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
    const g = new Function(corps)();
    // les trois catégories existent bien dans la bibliothèque de secours…
    expect(Object.keys(g.FICHES_SYSTEMES)).toEqual(
      expect.arrayContaining(['pathologies-genou', 'pathologies-hanche', 'pathologies-pied'])
    );
    // …mais aucun bilan ne les propose dans les listes des circuits
    for (const bilan of ['sport', 'posturo', 'podo'])
      expect(g._exoBibCats(bilan).filter((c) => /^pathologies-/.test(c.value))).toEqual([]);
    expect(g._exoBibCats('sport').length).toBeGreaterThan(5);
    expect(
      (SRC_BIOMECA.match(/\['(bit|fp|pubalgie|piriforme|fessier|achille|fibulaires)', /g) || [])
        .length
    ).toBe(7);
  });
});
