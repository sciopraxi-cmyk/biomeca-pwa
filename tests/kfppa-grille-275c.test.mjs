import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as calc from '../js/calc.mjs';
import { RACINE } from './helpers/mirror-diff.mjs';
import { charger, envCapture } from './helpers/harnais-kfppa.mjs';
import { SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

// ═══════════════════════════════════════════════════════════════════
// #275-C — normes KFPPA, grille de U, classement de S, renommage USL
// ═══════════════════════════════════════════════════════════════════
//
// Grille validée par le praticien, avec min = normeMin, max = normeMax,
// m = (min + max) / 2, et U classé sur sa valeur AFFICHÉE (une décimale) :
//   U < −0,6 m          Varus excessif
//   −0,6 m ≤ U < −0,3 m Varus modéré
//   −0,3 m ≤ U < 0      Varus faible
//   0 ≤ U < min/2       Valgus faible
//   min/2 ≤ U < min     Valgus modéré (insuffisant)
//   min ≤ U ≤ max       Dans la norme
//   max < U ≤ max+0,3 m Valgus modéré (au-dessus de la norme)
//   U > max + 0,3 m     Valgus excessif
//
// Chaque attente est vérifiée sur les DEUX copies : js/calc.mjs et
// js/biomeca.js (celle du navigateur, extraite et exécutée).
//
// Chaque test a été vu ROUGE sur un sabotage ciblé, puis vert après
// restauration vérifiée par cmp.

const env = charger();
const COPIES = [
  ['calc.mjs', calc],
  ['biomeca.js', env],
];

const norme = (testId, civ) => {
  const n = calc.kfppaNormeApplicable(testId, civ);
  if (n.statut !== 'ok') throw new Error(`norme ${testId}/${civ} : ${n.statut}`);
  return n;
};

// [nom de la borne, valeur SUR la borne, classe attendue, valeur voisine, classe attendue]
const V = 'Valgus modéré (insuffisant)';
const N = 'Dans la norme';
const A = 'Valgus modéré (au-dessus de la norme)';
const GRILLES = [
  {
    cas: 'marche 3–7°',
    n: () => norme('kfppa-marche', ''),
    bornes: [
      ['−0,6 m', -3.0, 'Varus modéré', -3.1, 'Varus excessif'],
      ['−0,3 m', -1.5, 'Varus faible', -1.6, 'Varus modéré'],
      ['zéro', 0, 'Valgus faible', -0.1, 'Varus faible'],
      ['min/2', 1.5, V, 1.4, 'Valgus faible'],
      ['min', 3.0, N, 2.9, V],
      ['max', 7.0, N, 7.1, A],
      ['max + 0,3 m', 8.5, A, 8.6, 'Valgus excessif'],
    ],
  },
  {
    cas: 'saut hommes 1–9°',
    n: () => norme('kfppa-sldj', 'M.'),
    bornes: [
      ['−0,6 m', -3.0, 'Varus modéré', -3.1, 'Varus excessif'],
      ['−0,3 m', -1.5, 'Varus faible', -1.6, 'Varus modéré'],
      ['zéro', 0, 'Valgus faible', -0.1, 'Varus faible'],
      ['min/2', 0.5, V, 0.4, 'Valgus faible'],
      ['min', 1.0, N, 0.9, V],
      ['max', 9.0, N, 9.1, A],
      ['max + 0,3 m', 10.5, A, 10.6, 'Valgus excessif'],
    ],
  },
  {
    // m = 8,5 : −0,3 m = −2,55 et max + 0,3 m = 14,55 ne tombent pas sur une
    // valeur affichable ; on vérifie les deux valeurs qui les encadrent.
    cas: 'course 5–12°',
    n: () => norme('kfppa-course', ''),
    bornes: [
      ['−0,6 m', -5.1, 'Varus modéré', -5.2, 'Varus excessif'],
      ['−0,3 m', -2.5, 'Varus faible', -2.6, 'Varus modéré'],
      ['zéro', 0, 'Valgus faible', -0.1, 'Varus faible'],
      ['min/2', 2.5, V, 2.4, 'Valgus faible'],
      ['min', 5.0, N, 4.9, V],
      ['max', 12.0, N, 12.1, A],
      ['max + 0,3 m', 14.5, A, 14.6, 'Valgus excessif'],
    ],
  },
];

describe('#275-C — grille de U, une borne par test', () => {
  for (const g of GRILLES) {
    for (const [borne, sur, cSur, voisin, cVoisin] of g.bornes) {
      it(`C1 ${g.cas} — borne ${borne}`, () => {
        const { min, max } = g.n();
        for (const [nom, f] of COPIES) {
          expect(f.kfppaClasseU(sur, min, max), `${nom} ${sur}`).toBe(cSur);
          expect(f.kfppaClasseU(voisin, min, max), `${nom} ${voisin}`).toBe(cVoisin);
        }
      });
    }
  }

  it('C1 les normes utilisées sont bien celles décidées', () => {
    expect(norme('kfppa-marche', '')).toMatchObject({ min: 3, max: 7, sexe: null });
    expect(norme('kfppa-course', '')).toMatchObject({ min: 5, max: 12, sexe: null });
    expect(norme('kfppa-sldj', 'Mme')).toMatchObject({ min: 5, max: 12, sexe: 'femmes' });
    expect(norme('kfppa-sldj', 'M.')).toMatchObject({ min: 1, max: 9, sexe: 'hommes' });
  });

  it('C2. Bruit flottant : seuil calculé exactement (norme SYNTHÉTIQUE 0–6°)', () => {
    // Norme construite pour ce test, pas une norme clinique : −0,3 × 3 vaut
    // −0,8999999999999999 en virgule flottante. U = −0,9 est SUR la borne,
    // donc Varus faible ; sans correction du bruit il passerait en modéré.
    for (const [nom, f] of COPIES) {
      expect(f.kfppaClasseU(-0.9, 0, 6), nom).toBe('Varus faible');
    }
  });

  it('C2b. Classement sur la valeur AFFICHÉE : −3,04 s’affiche −3.0, classé comme −3.0', () => {
    // −3,05 vaut −3,0499… en binaire : toFixed l'affiche « −3.0 », il est donc
    // classé comme −3.0. C'est la cohérence voulue entre nombre et verdict.
    expect((-3.05).toFixed(1)).toBe('-3.0');
    expect((-3.06).toFixed(1)).toBe('-3.1');
    for (const [nom, f] of COPIES) {
      expect(f.kfppaClasseU(-3.04, 3, 7), nom).toBe('Varus modéré');
      expect(f.kfppaClasseU(-3.05, 3, 7), nom).toBe('Varus modéré');
      expect(f.kfppaClasseU(-3.06, 3, 7), nom).toBe('Varus excessif');
      expect(f.kfppaClasseU(-0.04, 3, 7), `${nom} : zéro négatif`).toBe('Valgus faible');
    }
  });

  it('C6. Cas réel du praticien : G −3.4° à la marche = Varus excessif', () => {
    const { min, max } = norme('kfppa-marche', '');
    for (const [nom, f] of COPIES)
      expect(f.kfppaClasseU(-3.4, min, max), nom).toBe('Varus excessif');
  });
});

describe('#275-C — classement de S', () => {
  it('C3a. Au-delà de +3° : Valgus constitutionnel (+3.0 reste Neutre)', () => {
    for (const [nom, f] of COPIES) {
      expect(f.kfppaClasseS(3.1), nom).toBe('Valgus constitutionnel');
      expect(f.kfppaClasseS(3.0), nom).toBe('Neutre');
    }
  });
  it('C3b. En dessous de −3° : Varus constitutionnel (−3.0 reste Neutre)', () => {
    for (const [nom, f] of COPIES) {
      expect(f.kfppaClasseS(-3.1), nom).toBe('Varus constitutionnel');
      expect(f.kfppaClasseS(-3.0), nom).toBe('Neutre');
    }
  });
  it('C3c. De −3° à +3° : Neutre', () => {
    for (const [nom, f] of COPIES) {
      for (const s of [0, 1.2, -1.2, -0.04, 2.9, -2.9])
        expect(f.kfppaClasseS(s), `${nom} ${s}`).toBe('Neutre');
    }
  });
});

describe('#275-C — norme selon le test et la civilité', () => {
  it('C4a. « Mme » → femmes 5–12° pour l’USL', () => {
    for (const [nom, f] of COPIES) {
      expect(f.kfppaNormeApplicable('kfppa-sldj', 'Mme'), nom).toMatchObject({
        statut: 'ok',
        min: 5,
        max: 12,
        sexe: 'femmes',
      });
    }
  });
  it('C4b. « M. » → hommes 1–9° pour l’USL', () => {
    for (const [nom, f] of COPIES) {
      expect(f.kfppaNormeApplicable('kfppa-sldj', 'M.'), nom).toMatchObject({
        statut: 'ok',
        min: 1,
        max: 9,
        sexe: 'hommes',
      });
    }
  });
  it('C4c. Civilité vide ou inconnue → norme non appliquée, pour l’USL', () => {
    for (const [nom, f] of COPIES) {
      for (const civ of ['', undefined, null, 'Madame', 'mme', 'M']) {
        expect(f.kfppaNormeApplicable('kfppa-sldj', civ), `${nom} ${civ}`).toEqual({
          statut: 'civilite',
        });
      }
    }
  });
  it('C4d. Marche et course : la civilité n’intervient pas', () => {
    for (const [nom, f] of COPIES) {
      for (const civ of ['', 'Mme', 'M.']) {
        expect(f.kfppaNormeApplicable('kfppa-marche', civ), `${nom} ${civ}`).toMatchObject({
          statut: 'ok',
          min: 3,
          max: 7,
          sexe: null,
        });
        expect(f.kfppaNormeApplicable('kfppa-course', civ), `${nom} ${civ}`).toMatchObject({
          statut: 'ok',
          min: 5,
          max: 12,
          sexe: null,
        });
      }
    }
  });
  it('C5. Norme incohérente, incomplète ou absente → norme non définie, jamais un défaut', () => {
    const src = 'test';
    const tables = [
      { x: { parSexe: false, min: 8, max: 3, source: src } },
      { x: { parSexe: false, min: 3, source: src } },
      { x: { parSexe: false, min: 3, max: NaN, source: src } },
      { x: { parSexe: false, min: '3', max: 7, source: src } },
      { x: { parSexe: true, femmes: { min: 5, max: 12 }, source: src } }, // hommes absent
    ];
    for (const [nom, f] of COPIES) {
      for (const [i, t] of tables.entries()) {
        const civ = i === 4 ? 'M.' : '';
        expect(f.kfppaNormeApplicable('x', civ, t), `${nom} table ${i}`).toEqual({
          statut: 'non-definie',
        });
      }
      expect(f.kfppaNormeApplicable('mobilite', ''), `${nom} test sans norme`).toEqual({
        statut: 'non-definie',
      });
    }
  });
  it('C5b. Les deux messages, texte exact', () => {
    for (const [nom, f] of COPIES) {
      expect(f.KFPPA_MSG_CIVILITE, nom).toBe('civilité non renseignée : norme non appliquée');
      expect(f.KFPPA_MSG_NORME_ND, nom).toBe('norme non définie');
    }
  });
});

describe('#275-C — valeur sans kfppaSigne', () => {
  it('C7. Magnitude seule, sans classe', () => {
    for (const [nom, f] of COPIES) {
      expect(f.kfppaTexteNonSigne(-7.8), nom).toBe('7.8° (sens valgus/varus non enregistré)');
      expect(f.kfppaTexteNonSigne(7.8), nom).toBe('7.8° (sens valgus/varus non enregistré)');
      expect(f.kfppaTexteNonSigne(null), nom).toBe('—');
    }
  });
});

describe('#275-C — les deux copies rendent exactement la même chose', () => {
  it('C8. Parité par exécution sur toute une plage', () => {
    const normes = [
      [3, 7],
      [5, 12],
      [1, 9],
      [0, 6],
      [2.5, 8.3],
    ];
    let n = 0;
    for (const [min, max] of normes) {
      for (let k = -200; k <= 250; k++) {
        const u = k / 10;
        expect(env.kfppaClasseU(u, min, max), `${u} ${min}–${max}`).toBe(
          calc.kfppaClasseU(u, min, max)
        );
        n++;
      }
    }
    for (let k = -100; k <= 100; k++) {
      expect(env.kfppaClasseS(k / 10)).toBe(calc.kfppaClasseS(k / 10));
      expect(env.kfppaTexteNonSigne(k / 10)).toBe(calc.kfppaTexteNonSigne(k / 10));
      n++;
    }
    for (const t of ['kfppa-marche', 'kfppa-course', 'kfppa-sldj', 'mobilite'])
      for (const c of ['', 'Mme', 'M.', undefined, 'x']) {
        expect(env.kfppaNormeApplicable(t, c)).toEqual(calc.kfppaNormeApplicable(t, c));
        n++;
      }
    expect(n).toBe(5 * 451 + 201 + 20);
  });
});

describe('#275-C — norme enregistrée avec le bilan', () => {
  it('C9a. {min, max, source, sexe} figés ; rien quand aucune norme ne s’applique', () => {
    expect(env._kfppaNormePourBilan('kfppa-marche', { civilite: '' })).toEqual({
      min: 3,
      max: 7,
      source: 'repère clinique de travail, pas de norme 2D publiée',
      sexe: null,
    });
    expect(env._kfppaNormePourBilan('kfppa-sldj', { civilite: 'Mme' })).toEqual({
      min: 5,
      max: 12,
      source:
        'Norme de référence : réception unipodale (Herrington & Munro, 2010) — mesure à la première réception',
      sexe: 'femmes',
    });
    expect(env._kfppaNormePourBilan('kfppa-sldj', { civilite: '' })).toBeNull();
    expect(env._kfppaNormePourBilan('kfppa-sldj', undefined)).toBeNull();
    expect(env._kfppaNormePourBilan('mobilite', { civilite: 'M.' })).toBeNull();
  });

  it('C9b. validateAndSave l’écrit dans le résultat du KFPPA (garde structurelle)', () => {
    // validateAndSave est asynchrone et dépend de tout l'écran de capture :
    // on vérifie ici que l'appel existe, une seule fois, DANS la branche KFPPA
    // de validateAndSave. C'est une garde de présence, pas une exécution.
    const debut = SRC_BIOMECA.indexOf('\nasync function validateAndSave() {');
    const fin = SRC_BIOMECA.indexOf('\n}\n', debut);
    const corps = SRC_BIOMECA.slice(debut, fin);
    const appel =
      'const _normeKfppa=_kfppaNormePourBilan(currentTestId, currentPatient);\n      if(_normeKfppa) result.kfppaNorme=_normeKfppa;';
    expect(corps.split(appel).length - 1).toBe(1);
    const branche = corps.indexOf('if(t.div!==undefined){');
    expect(branche).toBeGreaterThan(0);
    expect(corps.indexOf(appel)).toBeGreaterThan(branche);
    expect(corps.indexOf(appel) - branche).toBeLessThan(300);
  });
});

describe('#275-C — renommage du test kfppa-sldj (textes affichés)', () => {
  const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
  const carte = (() => {
    const i = HTML.indexOf(`onclick="launchTest('kfppa-sldj')"`);
    // Jusqu'à la fin de la carte, dernière </div> de la ligne du bas COMPRISE.
    return HTML.slice(i, HTML.indexOf('</div>\n    </div>', i) + '</div>'.length);
  })();
  const T = env.TESTS['kfppa-sldj'];
  const CAS = [
    ['C10a carte, titre', () => carte.includes('<div class="tcard-title">KFPPA USL</div>')],
    ['C10b carte, légende de l’icône', () => carte.includes('>Réception unipodale · 30 cm</text>')],
    [
      'C10c carte, ligne du bas',
      () => carte.includes('<div class="tcard-sub">Réception unipodale D+G</div>'),
    ],
    ['C10d TESTS.name', () => T.name === 'KFPPA USL'],
    [
      'C10e TESTS.note',
      () =>
        T.note ===
        "Descendre d'une marche de 30 cm et se réceptionner sur une jambe. Mesure à la première réception, au maximum de flexion du genou.",
    ],
    [
      'C10f libellé de la mesure',
      () => T.measures[0].label === 'KFPPA USL (valgus dynamique en réception unipodale)',
    ],
    ['C10g libellé de la frame', () => T.frameLabels[1] === 'Première réception unipodale'],
  ];
  for (const [nom, ok] of CAS) it(nom, () => expect(ok()).toBe(true));

  it('C10h plus aucune trace visible de « SLDJ » ni des anciens textes', () => {
    expect(carte.length).toBeGreaterThan(200);
    for (const vieux of ['SLDJ', 'Chute 30cm', 'Saut unipodal', 'drop jump', 'Réception saut']) {
      expect(HTML.includes(vieux), `index.html : ${vieux}`).toBe(false);
      expect(SRC_BIOMECA.includes(vieux), `biomeca.js : ${vieux}`).toBe(false);
    }
    // L'identifiant interne, lui, ne change pas.
    expect(HTML).toContain("launchTest('kfppa-sldj')");
  });
});

describe('#275-C — panneau Résultats : bloc de vérification de la grille', () => {
  // Valeurs de la vérification du praticien sur localhost : D +11,2°, G −3,4°,
  // statique à 0,0° des deux côtés.
  const slots = () => [
    {
      label: 'Station bipodale',
      side: '',
      dataUrl: 'data:b',
      angle: null,
      angleD: 0,
      angleG: 0,
      kfppaSigne: true,
    },
    { label: 'Unipodal G', side: 'G', dataUrl: 'data:g', angle: -3.4, kfppaSigne: true },
    { label: 'Unipodal D', side: 'D', dataUrl: 'data:d', angle: 11.2, kfppaSigne: true },
  ];
  const verdicts = (html) => [...html.matchAll(/class="kfppa-verdict">([^<]*)</g)].map((m) => m[1]);
  const nbDelta = (html, txt) => html.split(`Δ = U − S : <b>${txt}</b>`).length - 1;

  it('C11a. Marche : D Valgus excessif, G Varus excessif, norme 3–7° affichée', () => {
    const e = charger();
    const res = envCapture(e, 'kfppa-marche', slots());
    e.poser({ patient: { civilite: 'M.' } });
    e.updateResults();
    expect(verdicts(res.innerHTML)).toEqual(['Valgus excessif', 'Varus excessif']);
    expect(res.innerHTML).toContain('Norme : 3–7° · repère clinique de travail');
    expect(res.innerHTML).toContain('Statique S : <b>Valgus +0.0° — Neutre</b>');
    expect(res.innerHTML).not.toContain("d'après la civilité");
  });

  it('C11b. USL, civilité vide : aucun verdict, message affiché', () => {
    const e = charger();
    const res = envCapture(e, 'kfppa-sldj', slots());
    e.poser({ patient: { civilite: '' } });
    e.updateResults();
    expect(verdicts(res.innerHTML)).toEqual([
      'civilité non renseignée : norme non appliquée',
      'civilité non renseignée : norme non appliquée',
    ]);
  });

  it('C11c. USL, « M. » : norme hommes 1–9°, « (d’après la civilité) »', () => {
    const e = charger();
    const res = envCapture(e, 'kfppa-sldj', slots());
    e.poser({ patient: { civilite: 'M.' } });
    e.updateResults();
    expect(res.innerHTML).toContain(
      "Norme : 1–9° hommes (d'après la civilité) · Norme de référence"
    );
    expect(verdicts(res.innerHTML)).toEqual(['Valgus excessif', 'Varus excessif']);
  });

  it('C11d. Valeurs sans kfppaSigne (S et U) : magnitude seule, aucun sens, aucun verdict', () => {
    const e = charger();
    // Statique NON NUL pour que son texte soit discriminant : 2,1 et −1,3.
    const s = slots().map(({ kfppaSigne: _k, ...x }) => x);
    s[0].angleD = 2.1;
    s[0].angleG = -1.3;
    const res = envCapture(e, 'kfppa-marche', s);
    e.poser({ patient: { civilite: '' } });
    e.updateResults();
    const h = res.innerHTML;
    expect(verdicts(h)).toEqual(['—', '—']);
    expect(h).toContain('Statique S : <b>2.1° (sens valgus/varus non enregistré)</b>');
    expect(h).toContain('Statique S : <b>1.3° (sens valgus/varus non enregistré)</b>');
    expect(h).toContain('Unipodal U : <b>11.2° (sens valgus/varus non enregistré)</b>');
    expect(h).toContain('Unipodal U : <b>3.4° (sens valgus/varus non enregistré)</b>');
    expect(nbDelta(h, '—')).toBe(2);
    // Plus AUCUN « Valgus + » ni « Varus − » dans tout le panneau : ni les
    // anciennes lignes Bipodal/Unipodal, ni l'ancienne ligne « Valgus dyn. ».
    expect(h).not.toMatch(/Valgus \+|Varus [−-]/);
    expect(h).not.toMatch(/Bipodal:|Unipodal:|Valgus dyn\./);
    // Témoin : le même motif TROUVE bien « Varus − » quand la valeur est signée.
    const e2 = charger();
    const res2 = envCapture(e2, 'kfppa-marche', slots());
    e2.poser({ patient: { civilite: '' } });
    e2.updateResults();
    expect(res2.innerHTML).toMatch(/Valgus \+|Varus [−-]/);
  });

  it('C11e. S signé mais U non signé : Δ non calculé, pas de verdict', () => {
    const e = charger();
    const s = slots();
    delete s[1].kfppaSigne;
    const res = envCapture(e, 'kfppa-marche', s);
    e.poser({ patient: { civilite: '' } });
    e.updateResults();
    expect(verdicts(res.innerHTML)).toEqual(['Valgus excessif', '—']);
    expect(nbDelta(res.innerHTML, '—')).toBe(1);
  });
});
