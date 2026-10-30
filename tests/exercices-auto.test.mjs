// Chantier B lot 2 : exercices proposés dans les circuits Express (fonctions pures). Données fictives.
import { describe, it, expect } from 'vitest';
import {
  proposerExercices,
  resoudre,
  planifier,
  respirationPourLigne,
  piedValgusVarus,
} from '../js/mannequin3d/exercices-auto.js?v=v326';

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
  it('aucun canal coché MAIS une donnée vestibulaire dans le bilan → utricules ; section vide → rien', () => {
    expect(cles(proposerExercices({ bilan: 'posturo', neuro: {} }))).toEqual([]);
    const r = proposerExercices({ bilan: 'posturo', neuro: { 'vest-ant-n': true } }); // test fait, normal
    expect(cles(r)).toEqual(['vest-utricules']);
    expect(resoudre(r.propositions[0], CAT).defaut).toBe('utr');
    expect(cles(proposerExercices({ neuro: {}, vestibulaireRenseigne: true }))).toEqual([
      'vest-utricules',
    ]);
    expect(cles(proposerExercices({ neuro: {}, vestibulaireRenseigne: false }))).toEqual([]);
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
      .filter((p) => p.groupe === 'reflexe')
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
    // priorité : réflexes, puis vestibule, puis proprioception
    expect(p1.map((e) => [e.ligne, e.sub])).toEqual([
      [0, 'r2'],
      [1, 'ant'],
      [2, 'p'],
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
  it('plus de 8 principaux : les suivants passent en EMPLACEMENT 3 (rien de perdu) ; non placées seulement si tout est plein', () => {
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
    expect(plan.nonPlacees).toHaveLength(0);
    expect(plan.ecritures.filter((e) => e.slot === 2).map((e) => e.ligne)).toEqual([0, 1]);
    // emplacement 3 lui aussi plein : les propositions en trop restent listées, jamais perdues
    const pleins = vide();
    for (let i = 0; i < 8; i++) pleins[i][2] = { sys: 'autre', sub: 'z' + i };
    const plan2 = planifier(rr.filter(Boolean), pleins, cat, 'posturo');
    expect(plan2.nonPlacees).toHaveLength(2);
  });
  it('EXEMPLE 2 DU PRATICIEN : 4 réflexes + TC + vestibulaire NC8 + chaîne musculaire + chaîne articulaire + terrain = 9 → le TC est prioritaire, le 4e réflexe va en emplacement 3', () => {
    const catalogue = [
      { value: 'terrain-aerien', label: 'T', subs: [{ value: 't', label: 'A' }] },
      {
        value: 'reflexes-archaiques',
        label: 'R',
        subs: [
          { value: 'a', label: 'Réflexe de peur paralysante' },
          { value: 'b', label: 'Réflexe de MORO' },
          { value: 'c', label: 'Réflexe tendineux de protection' },
          { value: 'd', label: 'Réflexe de Babinski' },
        ],
      },
      {
        value: 'nc8-vestibulo-cochleaire',
        label: 'N8',
        subs: [{ value: 'l', label: 'Rééducation pour un canal semi circulaire latéral' }],
      },
      {
        value: 'tronc-cerebral',
        label: 'TC',
        subs: [
          { value: 'tcd', label: 'Fente iso max TC droit' },
          { value: 'tcg', label: 'Fente iso max TC gauche' },
        ],
      },
      {
        value: 'reeduc-posturale',
        label: 'P',
        subs: [{ value: 'el', label: 'Étirement patient latéralisé - latéral global' }],
      },
      { value: 'reeduc-articulaire', label: 'Art', subs: [{ value: 'x', label: 'X' }] },
    ];
    const r = proposerExercices({
      valeurs: { poids_lr: 12, tronc_incl: 8, tete_incl: -4, pied_valgus_D: 10 }, // chaîne musculaire + profil articulaire
      terrain: 'aerien',
      neuro: {
        'ref-rpp-o': true,
        'ref-moro-o': true,
        'ref-rtp-o': true,
        'ref-babinski-g': true,
        'vest-lat-d': true,
        'nc-nc8-d': true,
        'nc-nc1-d': true,
      },
    });
    const rr = r.propositions
      .filter((p) => p.cle !== 'pied' && p.cle !== 'nc-1')
      .map((p) => resoudre(p, catalogue))
      .filter(Boolean);
    expect(rr).toHaveLength(9);
    const plan = planifier(rr, vide(), catalogue, 'posturo');
    const s1 = plan.ecritures
      .filter((e) => e.slot === 0)
      .sort((a, b) => a.ligne - b.ligne)
      .map((e) => e.cle);
    expect(s1).toHaveLength(8);
    expect(s1).toContain('tronc-cerebral');
    expect(s1).toContain('vest-lat');
    expect(s1).not.toContain('ref-babinski');
    // l'ordre des lignes reste l'ordre d'affichage : chaîne, terrain, réflexes, vestibule, tronc cérébral
    expect(s1.slice(-2)).toEqual(['vest-lat', 'tronc-cerebral']);
    const s3 = plan.ecritures.filter((e) => e.slot === 2);
    expect(s3.map((e) => [e.ligne, e.cle])).toEqual([[0, 'ref-babinski']]);
    expect(plan.nonPlacees).toHaveLength(0);
  });
  it('respiration : Faim d’air sur les lignes paires, stress sur les impaires ; catégorie absente = rien', () => {
    expect(respirationPourLigne(0, CAT, 'posturo').sub).toBe('r4');
    expect(respirationPourLigne(3, CAT, 'posturo').sub).toBe('r3');
    expect(respirationPourLigne(0, CAT, 'sport')).toBeNull();
  });
  it('proposition dont la catégorie manque : non résolue (jamais inventée)', () => {
    const p = proposerExercices({ valeurs: { pied_valgus_D: 10 }, neuro: {} }).propositions[0];
    expect(resoudre(p, [])).toBeNull();
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
    expect(cles(proposerExercices({ bilan: 'posturo', neuro: { 'vest-lat-n': true } }))).toEqual([
      'vest-utricules',
    ]);
  });

  it('ordre des réflexes : RPP, Moro, RTP, puis Babinski, plantaire, RTAC, Perez, Galant, Landau, palmaire, Babkin, reptation', () => {
    const neuro = {};
    [
      'reptation',
      'babkin',
      'palmaire',
      'landau',
      'galant',
      'perez',
      'rtac',
      'plantaire',
      'babinski',
      'rtp',
      'moro',
      'rpp',
    ].forEach((k) => (neuro['ref-' + k + '-o'] = true));
    const r = proposerExercices({ neuro: { ...neuro, 'vest-ant-g': true } });
    expect(r.propositions.filter((p) => p.groupe === 'reflexe').map((p) => p.cle)).toEqual(
      [
        'rpp',
        'moro',
        'rtp',
        'babinski',
        'plantaire',
        'rtac',
        'perez',
        'galant',
        'landau',
        'palmaire',
        'babkin',
        'reptation',
      ].map((k) => 'ref-' + k)
    );
  });
  it('priorité des groupes : chaîne (posturale + articulaire), terrain, réflexes, vestibule, puis proprio, pied ; mandibule (emplacement 3) en dernier', () => {
    const r = proposerExercices({
      valeurs: { poids_lr: 12, tronc_incl: 8, tete_incl: -4, pied_valgus_D: 10 },
      neuro: { 'ref-moro-o': true, 'vest-ant-g': true, 'prop-lent-g': true },
      terrain: 'aerien',
      atm: ['serrage aggravé : ATM'],
    });
    // « chaîne » = chaîniste, posturale OU biomécanique/organique/articulaire (rééducation articulaire)
    expect(r.propositions.map((p) => p.groupe)).toEqual([
      'chaine',
      'chaine',
      'terrain',
      'reflexe',
      'vestibule',
      'proprio',
      'pied',
      'slot3',
    ]);
  });
  it('mandibule / ATM : exercice de la mâchoire placé en EMPLACEMENT 3, jamais en 1 ; rien si ATM non coché', () => {
    expect(cles(proposerExercices({ neuro: {}, atm: [] }))).not.toContain('mandibule');
    const rr = proposerExercices({ neuro: {}, atm: ['ATM'] })
      .propositions.map((p) =>
        resoudre(p, [
          ...CAT,
          {
            value: 'systeme-mandibulaire',
            label: 'Mandibule',
            subs: [{ value: 'm', label: '1. Rééducation de la mâchoire' }],
          },
        ])
      )
      .filter(Boolean);
    const m = rr.find((p) => p.cle === 'mandibule');
    expect(m.defaut).toBe('m');
    const plan = planifier(rr, vide(), CAT, 'posturo');
    expect(plan.ecritures.find((e) => e.cle === 'mandibule')).toMatchObject({ ligne: 0, slot: 2 });
    expect(plan.ecritures.filter((e) => e.slot === 0).map((e) => e.cle)).not.toContain('mandibule');
  });
  it('jamais deux exercices identiques dans une même ligne, même avec beaucoup de propositions', () => {
    const rr = proposerExercices({
      valeurs: { poids_lr: 12, tronc_incl: 8, tete_incl: -4, pied_valgus_D: 10 },
      neuro: { 'ref-moro-o': true, 'ref-rpp-o': true, 'vest-ant-g': true, 'prop-lent-g': true },
      terrain: 'aerien',
      atm: ['ATM'],
    })
      .propositions.map((p) => resoudre(p, CAT))
      .filter(Boolean);
    const plan = planifier(rr, vide(), CAT, 'posturo');
    const lignes = vide();
    plan.ecritures.forEach((e) => (lignes[e.ligne][e.slot] = e.sys + '|' + e.sub));
    lignes.forEach((l) => {
      const pris = l.filter(Boolean);
      expect(new Set(pris).size).toBe(pris.length);
    });
    // case « respiration » décochée : emplacement 2 laissé libre et proposé aux autres
    const sans = planifier(rr, vide(), CAT, 'posturo', {}, {}, { respi: false });
    expect(sans.ecritures.some((e) => e.slot === 1)).toBe(false);
    expect(sans.libres.filter((x) => x.slot === 1)).toHaveLength(8);
  });
  it('emplacements déjà choisis : retirés de la liste des libres pour les autres propositions', () => {
    const rr = proposerExercices({
      neuro: { 'ref-moro-o': true, 'ref-rpp-o': true, 'prop-lent-g': true },
    })
      .propositions.map((p) => resoudre(p, CAT))
      .filter(Boolean);
    const plan = planifier(rr, vide(), CAT, 'posturo', {}, { 'ref-moro': { ligne: 0, slot: 2 } });
    expect(plan.libres.some((x) => x.ligne === 0 && x.slot === 2)).toBe(false);
    // deux propositions qui visent le même emplacement : la seconde n'écrase pas, elle reste « non placée »
    const plan2 = planifier(
      rr,
      vide(),
      CAT,
      'posturo',
      {},
      { 'ref-moro': { ligne: 0, slot: 2 }, proprio: { ligne: 0, slot: 2 } }
    );
    expect(plan2.nonPlacees.map((p) => p.cle)).toContain('proprio');
    expect(plan2.ecritures.filter((e) => e.ligne === 0 && e.slot === 2)).toHaveLength(1);
  });

  it('une ligne qui contient déjà un exercice de respiration (n’importe quel emplacement) ne reçoit pas une seconde respiration', () => {
    const etat = vide();
    etat[0][0] = { sys: 'respi-posture', sub: 'r3' };
    etat[1][2] = { sys: 'respi-posture', sub: 'r4' };
    const plan = planifier([], etat, CAT, 'posturo');
    const l = plan.ecritures.filter((e) => e.slot === 1).map((e) => e.ligne);
    expect(l).not.toContain(0);
    expect(l).not.toContain(1);
    expect(l).toHaveLength(6);
  });

  const CAT_NC = [
    ...CAT,
    {
      value: 'systeme-visuel',
      label: 'Système visuel',
      subs: [
        { value: 'f', label: '1. Fixation' },
        { value: 'p', label: '2. Poursuite' },
      ],
    },
    ...[1, 2, 3, 5, 6, 7, 9, 10, 11, 12].map((k) => ({
      value: 'nc' + k + '-x',
      label: 'NC' + k,
      subs: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    })),
  ];
  it('nerfs crâniens : une case G ou D cochée → la catégorie du nerf ; « normal » ne déclenche rien', () => {
    const r = proposerExercices({
      neuro: { 'nc-nc3-g': true, 'nc-nc4-n': true, 'nc-nc11-d': true, 'nc-nc8-d': true },
    });
    const nc = r.propositions.filter((p) => p.cle.startsWith('nc-'));
    // 2 cases à droite (NC8, NC11) contre 1 à gauche (NC3) → TC droit : seuls les nerfs cochés à droite sont proposés
    expect(nc.map((p) => p.cle).sort()).toEqual(['nc-11', 'nc-8']);
    // à égalité : tous les nerfs cochés
    const egal = proposerExercices({ neuro: { 'nc-nc3-g': true, 'nc-nc4-d': true } });
    expect(egal.propositions.filter((p) => p.cle.startsWith('nc-')).map((p) => p.cle)).toEqual([
      'nc-3',
      'nc-4',
    ]);
    expect(egal.propositions.find((p) => p.cle === 'nc-3')).toMatchObject({
      groupe: 'slot3',
      slot3: true,
      sousVide: true,
    });
    expect(nc.find((p) => p.cle === 'nc-8')).toMatchObject({ groupe: 'vestibule', slot3: false });
    expect(nc.find((p) => p.cle === 'nc-11')).toMatchObject({ groupe: 'nerfs', slot3: false });
  });
  it('NC1-7, 9, 10, 12 → emplacement 3 ; NC8 et NC11 → emplacement 1 (emplacement 1 déjà plein : pas de débordement)', () => {
    const neuro = {};
    [1, 2, 3, 5, 6, 7, 9, 11].forEach((k) => (neuro['nc-nc' + k + '-g'] = true));
    const rr = proposerExercices({ neuro })
      .propositions.filter((p) => p.cle.startsWith('nc-'))
      .map((p) => {
        const k = +p.cle.slice(3);
        return resoudre({ ...p, cats: [{ code: 'nc' + k + '-x', exo: null }] }, CAT_NC);
      });
    const etat = vide();
    for (let i = 1; i < 8; i++) etat[i][0] = { sys: 'autre', sub: 'x' + i }; // 7 lignes déjà prises en emplacement 1
    const plan = planifier(rr, etat, CAT_NC, 'posturo');
    const place = (k) => plan.ecritures.find((e) => e.cle === 'nc-' + k);
    expect(place(11).slot).toBe(0);
    [1, 2, 3, 5, 6, 7, 9].forEach((k) => expect(place(k).slot).toBe(2));
    expect(place(3).sub).toBe(''); // exercice laissé au praticien
  });
  it('EXEMPLE DU PRATICIEN : chaîne, terrain, 3 réflexes, TC droit, 2 nerfs à droite en emplacement 1 ; les 2 autres nerfs en emplacement 3 des lignes 1 et 2', () => {
    const catalogue = [
      {
        value: 'terrain-terrien',
        label: 'Terrain terrien',
        subs: [{ value: 'tt', label: 'Terrien 1' }],
      },
      {
        value: 'reflexes-archaiques',
        label: 'Réflexes archaïques',
        subs: [
          { value: 'rpp', label: '1. Réflexe de peur paralysante' },
          { value: 'moro', label: '2. Réflexe de MORO' },
          { value: 'rtp', label: '3. Réflexe tendineux de protection' },
        ],
      },
      {
        value: 'tronc-cerebral',
        label: 'Tronc cérébral',
        subs: [
          { value: 'd', label: '1. Fente iso max TC droit' },
          { value: 'g', label: '2. Fente iso max TC gauche' },
        ],
      },
      ...[1, 2, 3, 4].map((k) => ({
        value: 'nc' + k + '-x',
        label: 'NC' + k,
        subs: [{ value: 'a', label: 'A' }],
      })),
      ...CAT_NC, // les définitions ci-dessus passent avant (la première occurrence d'une catégorie est gardée)
    ].filter((c, i, a) => a.findIndex((x) => x.value === c.value) === i);
    const r = proposerExercices({
      valeurs: { poids_lr: 12, tronc_incl: 8, tete_incl: -4 }, // une chaîne (ligne latérale)
      terrain: 'terrien',
      neuro: {
        'ref-rpp-o': true,
        'ref-moro-o': true,
        'ref-rtp-o': true,
        'nc-nc1-d': true,
        'nc-nc2-d': true,
        'nc-nc3-d': true,
        'nc-nc4-d': true,
      },
    });
    const rr = r.propositions
      .map((p) => {
        const k = /^nc-(\d+)$/.exec(p.cle);
        return resoudre(
          k ? { ...p, cats: [{ code: 'nc' + k[1] + '-x', exo: null }] } : p,
          catalogue
        );
      })
      // l'exemple du praticien ne parle pas du vestibulaire : on écarte la proposition « utricules » (aucun canal coché)
      .filter((p) => p && p.cle !== 'vest-utricules');
    const plan = planifier(rr, vide(), catalogue, 'posturo');
    const slot1 = plan.ecritures.filter((e) => e.slot === 0).sort((a, b) => a.ligne - b.ligne);
    expect(slot1.map((e) => e.cle)).toEqual([
      'myers-laterale',
      'terrain-terrien',
      'ref-rpp',
      'ref-moro',
      'ref-rtp',
      'tronc-cerebral',
      'nc-1',
      'nc-2',
    ]);
    expect(slot1.find((e) => e.cle === 'tronc-cerebral').sub).toBe('d'); // total plus important à droite → TC droit
    const slot3 = plan.ecritures.filter((e) => e.slot === 2).sort((a, b) => a.ligne - b.ligne);
    expect(slot3.map((e) => [e.ligne, e.cle])).toEqual([
      [0, 'nc-3'],
      [1, 'nc-4'],
    ]);
    expect(plan.libres.filter((x) => x.slot === 0)).toHaveLength(0); // les 8 premiers emplacements sont remplis
  });
  it('débordement : seuls les nerfs du côté du tronc cérébral sont proposés ; visuel et mandibule ne débordent jamais', () => {
    const r = proposerExercices({
      neuro: { 'nc-nc5-g': true, 'nc-nc2-d': true, 'nc-nc3-d': true, 'nc-nc7-d': true },
      visuel: ['défaut de convergence'],
      atm: ['ATM'],
    });
    const ordre = r.propositions.filter((p) => p.cle.startsWith('nc-')).map((p) => p.cle);
    // TC droit (3 à droite contre 1 à gauche) : le nerf 5 coché seulement à gauche n'est PAS proposé
    expect(ordre).toEqual(['nc-2', 'nc-3', 'nc-7']);
    const rr = r.propositions
      .map((p) => {
        const k = /^nc-(\d+)$/.exec(p.cle);
        return resoudre(k ? { ...p, cats: [{ code: 'nc' + k[1] + '-x', exo: null }] } : p, [
          ...CAT_NC,
          { value: 'nc7-x', label: 'NC7', subs: [{ value: 'a', label: 'A' }] },
          { value: 'systeme-mandibulaire', label: 'M', subs: [{ value: 'm', label: 'Mâchoire' }] },
        ]);
      })
      .filter(Boolean);
    const plan = planifier(rr, vide(), CAT_NC, 'posturo');
    expect(plan.ecritures.find((e) => e.cle === 'visuel').slot).toBe(2);
    expect(plan.ecritures.find((e) => e.cle === 'mandibule').slot).toBe(2);
  });
  it('tronc cérébral : le côté vient du total des nerfs crâniens (D > G → TC droit), puis du pattern ; égalité → le praticien choisit', () => {
    const tc = (neuro, extra = {}) =>
      proposerExercices({ neuro, ...extra }).propositions.find((x) => x.cle === 'tronc-cerebral');
    const d = tc({ 'nc-nc1-d': true, 'nc-nc2-d': true, 'nc-nc3-g': true });
    expect(d.raison).toMatch(/tronc cérébral droit.*2 contre 1/);
    expect(
      resoudre(d, [
        {
          value: 'tronc-cerebral',
          label: 'T',
          subs: [
            { value: 'd', label: 'Fente iso max TC droit' },
            { value: 'g', label: 'Fente iso max TC gauche' },
          ],
        },
      ]).defaut
    ).toBe('d');
    const g = tc({ 'nc-nc4-g': true, 'nc-recap-g': true, 'nc-nc1-d': true });
    expect(g.raison).toMatch(/tronc cérébral gauche/); // la recapillarisation compte dans le total
    expect(tc({ 'nc-nc1-d': true, 'nc-nc2-g': true }).sousVide).toBe(true); // égalité
    expect(tc({ 'apd-tronc-d': true }).raison).toMatch(/pattern tronc cérébral coché à droite/);
    expect(tc({ 'po-hypo-tronc': true }).sousVide).toBe(true);
    expect(tc({ 'nc-nc1-n': true })).toBeUndefined();
    expect(tc({ 'apd-tronc-n': true })).toBeUndefined();
    expect(tc({}, { hypoTronc: true })).toBeDefined();
    expect(
      cles(proposerExercices({ bilan: 'podo', neuro: { 'apd-tronc-g': true, 'nc-nc2-g': true } }))
    ).toEqual([]);
    const p = tc({ 'apd-tronc-d': true });
    expect(p.groupe).toBe('tronc');
    expect(p.slot3).toBeUndefined();
  });
  it('NC8 coché : les canaux vestibulaires visent NC8 (puis l’ancienne catégorie si l’exercice n’y est plus)', () => {
    const nc8 = {
      value: 'nc8-vestibulo-cochleaire',
      label: 'NC8',
      subs: [{ value: 'c', label: '3. Rééducation pour un canal antérieur' }],
    };
    const r = proposerExercices({ neuro: { 'vest-ant-g': true } });
    const p = r.propositions.find((x) => x.cle === 'vest-ant');
    expect(resoudre(p, [nc8, ...CAT]).sys).toBe('nc8-vestibulo-cochleaire');
    expect(resoudre(p, CAT).sys).toBe('systeme-vestibulaire');
  });
  it('exercice visuel : posturo et podo selon leurs cases, emplacement 3, rien si rien de coché (sport : jamais)', () => {
    expect(cles(proposerExercices({ neuro: {}, visuel: [] }))).not.toContain('visuel');
    const r = proposerExercices({
      neuro: {},
      visuel: ['entrée visuelle primaire', 'défaut de convergence'],
    });
    const p = r.propositions.find((x) => x.cle === 'visuel');
    expect(p).toMatchObject({ groupe: 'slot3', slot3: true, sousVide: true });
    expect(p.raison).toMatch(/entrée visuelle primaire, défaut de convergence/);
    const plan = planifier([resoudre(p, CAT_NC)], vide(), CAT_NC, 'posturo');
    expect(plan.ecritures.find((e) => e.cle === 'visuel')).toMatchObject({ ligne: 0, slot: 2 });
    expect(
      cles(
        proposerExercices({
          bilan: 'podo',
          neuro: {},
          visuel: ['rotation nucale, yeux fermés : aggravation'],
        })
      )
    ).toContain('visuel');
  });

  it('TC gauche : seuls les nerfs cochés à gauche ; un nerf coché des deux côtés compte à gauche comme à droite', () => {
    const nc = (neuro) =>
      proposerExercices({ neuro })
        .propositions.filter((p) => p.cle.startsWith('nc-'))
        .map((p) => p.cle);
    expect(nc({ 'nc-nc1-g': true, 'nc-nc2-g': true, 'nc-nc3-d': true })).toEqual(['nc-1', 'nc-2']);
    expect(nc({ 'nc-nc1-g': true, 'nc-nc1-d': true, 'nc-nc2-d': true, 'nc-nc3-d': true })).toEqual([
      'nc-1',
      'nc-2',
      'nc-3',
    ]);
    // côté tiré du pattern (totaux à égalité) : même restriction
    expect(nc({ 'nc-nc1-g': true, 'nc-nc2-d': true, 'apd-tronc-d': true })).toEqual(['nc-2']);
  });
  it('vestibule = canaux ET NC8 (même groupe, emplacement 1) ; mais jamais NC8 EN DOUBLE : le canal désigné prime', () => {
    // NC8 seul : proposition générale du nerf 8, exercice au choix du praticien
    const seul = proposerExercices({ neuro: { 'nc-nc8-d': true } });
    expect(seul.propositions.filter((p) => p.cle === 'nc-8').map((p) => p.groupe)).toEqual([
      'vestibule',
    ]);
    // NC8 + canal latéral coché : un seul exercice (le canal), la proposition générale disparaît
    const r = proposerExercices({
      neuro: { 'vest-lat-g': true, 'nc-nc8-g': true, 'nc-nc2-g': true },
    });
    const cl = r.propositions.map((p) => p.cle);
    expect(cl).toContain('vest-lat');
    expect(cl).not.toContain('nc-8');
    expect(cl).toContain('nc-2'); // les autres nerfs ne sont pas touchés
    expect(r.propositions.find((p) => p.cle === 'vest-lat').raison).toMatch(
      /NC8 coché : cet exercice prime/
    );
    // idem avec « utricules » (donnée vestibulaire sans canal coché)
    const u = proposerExercices({ neuro: { 'vest-ant-n': true, 'nc-nc8-d': true } });
    expect(u.propositions.map((p) => p.cle)).toEqual(['vest-utricules', 'tronc-cerebral']); // pas de nc-8
    // NC8 sans canal désigné ne supprime rien d'autre ; le tronc cérébral compte toujours le nerf 8 dans son total
    expect(r.propositions.find((p) => p.cle === 'tronc-cerebral').raison).toMatch(/2 contre 0/);
  });
});
