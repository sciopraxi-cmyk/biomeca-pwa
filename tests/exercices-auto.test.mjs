// Chantier B lot 2 : exercices proposés dans les circuits Express (fonctions pures). Données fictives.
import { describe, it, expect } from 'vitest';
import {
  proposerExercices,
  resoudre,
  planifier,
  respirationPourLigne,
  piedValgusVarus,
} from '../js/mannequin3d/exercices-auto.js?v=v320';

const CAT = [
  {
    value: 'systeme-vestibulaire',
    label: 'Système vestibulaire',
    subs: [
      { value: 'lat', label: '1. Rééducation pour un canal semi circulaire latéral' },
      { value: 'post', label: '2. Rééducation pour un Moro ou un canal postérieur' },
      { value: 'ant', label: '3. Rééducation pour un canal antérieur' },
      { value: 'sacc', label: '4. Rééducation pour les saccules' },
      { value: 'utr', label: '5. Rééducation pour les utricules' },
    ],
  },
  {
    value: 'systeme-somesthesique',
    label: 'Système somesthésique',
    subs: [{ value: 'p', label: '1. Stimulation du système proprioceptif' }],
  },
  {
    value: 'reflexes-archaiques',
    label: 'Réflexes archaïques',
    subs: [
      { value: 'r1', label: '1. Réflexe de peur paralysante' },
      { value: 'r2', label: '2. Réflexe de MORO' },
      { value: 'r6', label: '6. Réflexe Tonique Asymétrique du Cou RTAC' },
      { value: 'r12', label: "12. Réflexe d'agrippement palmaire" },
    ],
  },
  {
    value: 'reeduc-posturale',
    label: 'Rééducation posturale',
    subs: [
      { value: 'ea', label: 'Étirement antérieur — Planche murale' },
      { value: 'ep', label: 'Étirement postérieur — Procu global' },
      { value: 'el', label: 'Étirement latéral — Lat global' },
    ],
  },
  { value: 'terrain-aerien', label: 'Terrain aérien', subs: [{ value: 'ta', label: 'Aérien 1' }] },
  {
    value: 'reeduc-terrain',
    label: 'Terrain moteur (ancienne liste)',
    subs: [
      { value: 'o1', label: "1. Rééducation d'un patient en excès de schéma aérien" },
      { value: 'o2', label: "2. Rééducation d'un patient en excès de schéma terrien" },
    ],
  },
  {
    value: 'reeduc-pied',
    label: 'Rééducation du pied',
    subs: [
      { value: 'pa', label: 'Pied A' },
      { value: 'pb', label: 'Pied B' },
    ],
  },
  {
    value: 'reeduc-articulaire',
    label: 'Rééducation articulaire',
    subs: [{ value: 'ar', label: 'Art 1' }],
  },
  {
    value: 'respi-posture',
    label: 'Respiration (posture)',
    subs: [
      { value: 'r3', label: '3. Respiration pour le stress' },
      { value: 'r4', label: "4. Faim d'air" },
    ],
  },
];
const cles = (r) => r.propositions.map((p) => p.cle);
const vide = () => Array.from({ length: 8 }, () => [null, null, null]);

describe('vestibulaire', () => {
  it('aucun canal coché → utricules', () => {
    const r = proposerExercices({ bilan: 'posturo', neuro: {} });
    expect(cles(r)).toEqual(['vest-utricules']);
    expect(resoudre(r.propositions[0], CAT).defaut).toBe('utr');
  });
  it('canal coché → exercice du canal (pas les utricules) ; plusieurs canaux = plusieurs exercices', () => {
    const r = proposerExercices({ neuro: { 'vest-ant-g': true, 'vest-lat-d': true } });
    expect(cles(r)).toEqual(['vest-ant', 'vest-lat']);
    expect(r.propositions.map((p) => resoudre(p, CAT).defaut)).toEqual(['ant', 'lat']);
    const p = proposerExercices({ neuro: { 'vest-post-g': true } });
    expect(resoudre(p.propositions[0], CAT).defaut).toBe('post');
  });
  it('la colonne « normal » ne compte pas ; la section vestibulaire dédiée compte', () => {
    expect(cles(proposerExercices({ neuro: { 'vest-ant-n': true } }))).toEqual(['vest-utricules']);
    expect(cles(proposerExercices({ neuro: {}, canauxVestibulaire: { post: true } }))).toEqual([
      'vest-post',
    ]);
  });
});

describe('proprioception et réflexes', () => {
  it('une case du bloc proprioception → stimulation du système proprioceptif', () => {
    const r = proposerExercices({ neuro: { 'prop-golgi-d': true, 'vest-ant-g': true } });
    expect(cles(r)).toContain('proprio');
    expect(
      resoudre(
        r.propositions.find((p) => p.cle === 'proprio'),
        CAT
      ).defaut
    ).toBe('p');
  });
  it("pas de proprioception cochée (ni l'axe du cervelet) → pas de proposition", () => {
    const r = proposerExercices({ neuro: { 'proprio-axe-tete': true, 'prop-lent-n': true } });
    expect(cles(r)).not.toContain('proprio');
  });
  it('un réflexe coché = la fiche du même nom ; « normal » non', () => {
    const r = proposerExercices({
      neuro: { 'ref-moro-o': true, 'ref-rtac-g': true, 'ref-palmaire-d': true, 'ref-rpp-n': true },
    });
    const fiches = r.propositions
      .filter((p) => p.groupe === 'neuro' && /^ref-/.test(p.cle))
      .map((p) => resoudre(p, CAT).defaut);
    expect(fiches).toEqual(['r2', 'r6', 'r12']);
    expect(cles(r)).not.toContain('ref-rpp');
  });
});

describe('terrain, pied, chaînes', () => {
  it('terrain aérien : catégorie découpée ou ancienne liste', () => {
    const r = proposerExercices({ terrain: 'aerien', neuro: {} });
    const p = r.propositions.find((x) => x.cle === 'terrain-aerien');
    expect(resoudre(p, CAT).sys).toBe('terrain-aerien');
    const ancien = CAT.filter((c) => c.value !== 'terrain-aerien');
    const q = resoudre(p, ancien);
    expect(q.sys).toBe('reeduc-terrain');
    expect(q.defaut).toBe('o1');
  });
  it('valgus / varus du pied : mannequin, puis captures 4 vues', () => {
    expect(piedValgusVarus({ pied_valgus_D: 10 }, null)).toEqual([
      { cote: 'D', sens: 'valgus', source: 'mannequin 3D' },
    ]);
    expect(piedValgusVarus({ pied_valgus_G: -9 }, null)[0].sens).toBe('varus');
    const v = piedValgusVarus(null, { dos: { angles: { angleCalcaneenD: 8 } } });
    expect(v).toEqual([{ cote: 'D', sens: 'valgus', source: 'captures 4 vues' }]);
    expect(piedValgusVarus({ pied_valgus_D: 0 }, null)).toEqual([]);
  });
  it('valgus → exercice « Rééducation du pied » présélectionné + programme du pied à cocher', () => {
    const r = proposerExercices({ valeurs: { pied_valgus_D: 10 }, neuro: {} });
    expect(r.programmePied).not.toBeNull();
    const p = resoudre(
      r.propositions.find((x) => x.cle === 'pied'),
      CAT
    );
    expect(p.sys).toBe('reeduc-pied');
    expect(p.defaut).toBe('pa');
  });
  it('pas de valgus ni varus → ni exercice du pied ni programme', () => {
    const r = proposerExercices({ valeurs: { genou_valgus_D: 1 }, neuro: {} });
    expect(r.programmePied).toBeNull();
    expect(cles(r)).not.toContain('pied');
  });
  it('sans mannequin : une note, aucune chaîne', () => {
    const r = proposerExercices({ neuro: {} });
    expect(r.notes.join(' ')).toMatch(/Mannequin 3D non rempli/);
  });
});

describe('placement dans les circuits', () => {
  const res = (cs, extra = {}) =>
    proposerExercices({ neuro: {}, ...extra }).propositions.concat(
      proposerExercices({ neuro: cs }).propositions
    );
  it('principaux dans l’emplacement 1 des lignes, respiration en 2 en alternance, 3 jamais rempli', () => {
    const rr = proposerExercices({
      neuro: { 'vest-ant-g': true, 'prop-lent-g': true, 'ref-moro-o': true },
    }).propositions.map((p) => resoudre(p, CAT));
    const plan = planifier(rr, vide(), CAT, 'posturo');
    const p1 = plan.ecritures.filter((e) => e.slot === 0);
    expect(p1.map((e) => [e.ligne, e.sub])).toEqual([
      [0, 'ant'],
      [1, 'p'],
      [2, 'r2'],
    ]);
    const p2 = plan.ecritures.filter((e) => e.slot === 1);
    expect(p2).toHaveLength(8);
    expect(p2.map((e) => e.sub)).toEqual(['r4', 'r3', 'r4', 'r3', 'r4', 'r3', 'r4', 'r3']);
    expect(plan.ecritures.some((e) => e.slot === 2)).toBe(false);
    expect(plan.libres.filter((x) => x.slot === 2)).toHaveLength(8);
  });
  it('rien ne s’écrase : lignes occupées sautées, exercice déjà présent non dupliqué', () => {
    const etat = vide();
    etat[0][0] = { sys: 'systeme-somesthesique', sub: 'p' }; // déjà là
    etat[1][0] = { sys: 'reeduc-pied', sub: 'pb' };
    etat[0][1] = { sys: 'respi-posture', sub: 'r3' };
    const rr = proposerExercices({
      neuro: { 'prop-lent-g': true, 'ref-moro-o': true },
    }).propositions.map((p) => resoudre(p, CAT));
    const plan = planifier(rr, etat, CAT, 'posturo');
    expect(plan.dejaPresentes.map((p) => p.cle)).toContain('proprio');
    const e = plan.ecritures.filter((x) => x.slot === 0);
    expect(e.map((x) => x.ligne)).not.toContain(0);
    expect(e.map((x) => x.ligne)).not.toContain(1);
    expect(plan.ecritures.filter((x) => x.slot === 1).map((x) => x.ligne)).not.toContain(0);
  });
  it('plus de 8 principaux : les suivants sont listés « non placées », rien de perdu', () => {
    const neuro = {};
    [
      'rpp',
      'rtp',
      'moro',
      'perez',
      'landau',
      'reptation',
      'rtac',
      'galant',
      'babinski',
      'plantaire',
    ].forEach((k) => (neuro['ref-' + k + '-o'] = true));
    const cat = [
      {
        value: 'reflexes-archaiques',
        label: 'R',
        subs: [
          'peur paralysante',
          'tendineux de protection',
          'moro',
          'perez',
          'landau',
          'reptation',
          'asymétrique du cou',
          'galant',
          'babinski',
          'plantaire',
        ].map((s, i) => ({ value: 'x' + i, label: 'Réflexe ' + s })),
      },
    ];
    const rr = proposerExercices({ neuro }).propositions.map((p) => resoudre(p, cat));
    expect(rr.filter(Boolean)).toHaveLength(10); // + utricules : catégorie absente ici, non résolue
    const plan = planifier(rr.filter(Boolean), vide(), cat, 'posturo');
    expect(plan.ecritures.filter((e) => e.slot === 0)).toHaveLength(8);
    expect(plan.nonPlacees).toHaveLength(2);
  });
  it('respiration : Faim d’air sur les lignes paires, stress sur les impaires ; catégorie absente = rien', () => {
    expect(respirationPourLigne(0, CAT, 'posturo').sub).toBe('r4');
    expect(respirationPourLigne(3, CAT, 'posturo').sub).toBe('r3');
    expect(respirationPourLigne(0, CAT, 'sport')).toBeNull();
  });
  it('proposition dont la catégorie manque : non résolue (jamais inventée)', () => {
    const p = proposerExercices({ valeurs: { pied_valgus_D: 10 }, neuro: {} }).propositions[0];
    expect(resoudre(p, [])).toBeNull();
    expect(res({}).length).toBeGreaterThan(0);
  });

  it('destination choisie par le praticien : emplacement 3 de la ligne voulue, sans écraser', () => {
    const rr = proposerExercices({ neuro: { 'prop-lent-g': true, 'ref-moro-o': true } })
      .propositions.map((p) => resoudre(p, CAT))
      .filter(Boolean);
    const etat = vide();
    etat[4][2] = { sys: 'reeduc-pied', sub: 'pb' };
    const plan = planifier(
      rr,
      etat,
      CAT,
      'posturo',
      {},
      {
        'ref-moro': { ligne: 5, slot: 2 },
        proprio: { ligne: 4, slot: 2 }, // occupé
      }
    );
    expect(plan.ecritures.find((e) => e.cle === 'ref-moro')).toMatchObject({ ligne: 5, slot: 2 });
    expect(plan.nonPlacees.map((p) => p.cle)).toContain('proprio');
    expect(plan.ecritures.filter((e) => e.slot === 0).map((e) => e.cle)).not.toContain('ref-moro');
  });

  it('Myers : antériorisé = ligne postérieure = étirement postérieur ; postériorisé = antérieur ; latéralisé = latéral', () => {
    const lab = (v) => {
      const r = proposerExercices({ valeurs: v, neuro: {} });
      const p = r.propositions.find((x) => x.cle.startsWith('myers-'));
      return p ? resoudre(p, CAT).defaut : null;
    };
    expect(lab({ glob_chev: 10, glob_gen: 6, tronc_lordose: 6 })).toBe('ep');
    expect(lab({ glob_chev: -10, glob_gen: -6 })).toBe('ea');
    expect(lab({ poids_lr: 12, tronc_incl: 8, tete_incl: -4 })).toBe('el');
    expect(lab({})).toBeNull();
  });

  it('podopédiatrie : pieds cochés par le praticien, réflexes propres au bilan, réflexes sans fiche listés', () => {
    const r = proposerExercices({
      bilan: 'podo',
      neuro: {
        'ref-succion-o': true,
        'ref-rtsc-o': true,
        'ref-parachute-o': true,
        'ref-rtac-o': true,
      },
      pieds: [{ cote: 'G', sens: 'varus', source: 'morphostatique' }],
    });
    expect(r.programmePied.raison).toMatch(/varus gauche \(morphostatique\)/);
    expect(r.notes.join(' ')).toMatch(/parachute.*aucune fiche/);
    const cat = [
      {
        value: 'reflexes-archaiques',
        label: 'R',
        subs: [
          { value: 'a', label: '4. Réflexe de succion' },
          { value: 'b', label: '7. Réflexe Tonique Symétrique du Cou RTSC' },
          { value: 'c', label: '6. Réflexe Tonique Asymétrique du Cou RTAC' },
        ],
      },
    ];
    const get = (cle) =>
      resoudre(
        r.propositions.find((p) => p.cle === cle),
        cat
      ).defaut;
    expect(get('ref-succion')).toBe('a');
    expect(get('ref-rtsc')).toBe('b'); // « Asymétrique » ne doit pas être pris pour « Symétrique »
    expect(get('ref-rtac')).toBe('c');
  });
  it('diagnostic valgus sans côté : pas de côté inventé dans le motif', () => {
    const r = proposerExercices({
      neuro: {},
      pieds: [{ cote: 'D', sens: 'valgus', source: 'diagnostic', sansCote: true }],
    });
    expect(r.programmePied.raison).toBe('pied : valgus (diagnostic)');
  });

  it('podopédiatrie : jamais de proposition vestibulaire ni proprioceptive (pas de données dans ce bilan)', () => {
    expect(cles(proposerExercices({ bilan: 'podo', neuro: {} }))).toEqual([]);
    expect(cles(proposerExercices({ bilan: 'podo', neuro: { 'prop-lent-g': true } }))).toEqual([]);
    expect(cles(proposerExercices({ bilan: 'posturo', neuro: {} }))).toEqual(['vest-utricules']);
  });
});
