// Mannequin postural 3D — paramètres cliniques (données pures, sans WebGL).
// Convention des axes du modèle au repos : x = gauche du patient, y = haut, z = devant.
// Côtés : toujours ceux du PATIENT (la droite du patient est à gauche de l'écran en vue de face).
// Rotation autour de +z : le haut penche vers la droite du patient ; autour de +y : le devant tourne vers la
// gauche du patient ; autour de +x : le haut part vers l'avant (flexion).

export const VERSION_MODELE = 1;

// ─── Quaternions minimalistes [x,y,z,w] ───────────────────────────────────────────
const RAD = Math.PI / 180;
export function qAxe(axe, deg) {
  const h = (deg * RAD) / 2,
    s = Math.sin(h),
    c = Math.cos(h);
  return axe === 'x' ? [s, 0, 0, c] : axe === 'y' ? [0, s, 0, c] : [0, 0, s, c];
}
export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function qPow(q, t) {
  // q^t (même axe, angle × t) ; les puissances d'un même quaternion commutent
  const w = Math.max(-1, Math.min(1, q[3])),
    ang = 2 * Math.acos(w),
    sn = Math.sqrt(1 - w * w);
  if (sn < 1e-9) return [0, 0, 0, 1];
  const h = (ang * t) / 2,
    k = Math.sin(h) / sn;
  return [q[0] * k, q[1] * k, q[2] * k, Math.cos(h)];
}
export function qInv(a) {
  return [-a[0], -a[1], -a[2], a[3]];
}

// Colonne vertébrale du bas vers le haut (noms du squelette) et répartition des courbures
const RACHIS = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01'];
const COU = ['neck01', 'neck02', 'neck03'];

// Pose neutre « debout, bras le long du corps » (le modèle est livré bras écartés à 40°)
export const POSE_NEUTRE = [
  { os: 'upperarm01.L', axe: 'z', deg: -30 },
  { os: 'upperarm01.R', axe: 'z', deg: 30 },
  { os: 'lowerarm01.L', axe: 'x', deg: 6 },
  { os: 'lowerarm01.R', axe: 'x', deg: 6 },
  { os: 'upperleg01.L', axe: 'z', deg: -5 },
  { os: 'upperleg01.R', axe: 'z', deg: 5 },
];

const cote = (c) => (c === 'G' ? 1 : -1); // signe de x pour le côté du patient
const os = (n, c) => n + (c === 'G' ? '.L' : '.R');
const sd = (c) => (c === 'G' ? 'L' : 'R');

// ─── Curseurs ─────────────────────────────────────────────────────────────────────────
// ops(v) → opérations : {os, axe, deg} rotation d'un os ; {os, pos:[dx,dy,dz]} translation (m) ;
// {bassin:{axe,deg}} rotation du bassin autour des hanches (le haut du corps et les jambes ne suivent pas) ;
// {morph, w} déformation locale (blend shape, poids = valeur / unité) ; {twist, cote, deg} torsion de l'avant-bras.
// fin = libellés des extrémités (valeur négative → positive). qual = amplitudes léger/modéré/marqué/sévère (dictée).
function C(id, groupe, label, min, max, unite, fin, ops, extra = {}) {
  return Object.assign(
    { id, groupe, label, court: label, min, max, unite, fin, ops, pas: 1, defaut: 0 },
    extra
  );
}
// Version de la construction affichée dans l'interface (doit suivre CACHE_VERSION du service worker : test dédié)
export const BUILD = 'v303';
export const GROUPES = [
  ['tete', 'Tête et cou'],
  ['epaules', 'Épaules et ceinture scapulaire'],
  ['bras', 'Membres supérieurs'],
  ['tronc', 'Tronc et rachis'],
  ['bassin', 'Bassin'],
  ['jambes', 'Membres inférieurs'],
  ['pieds', 'Pieds'],
  ['global', 'Global : antériorisation / postériorisation du corps entier'],
];
export const CURSEURS = [];
const add = (c) => CURSEURS.push(c);
// curseur latéralisé : crée D et G ; « court » = libellé sans le côté (colonnes de l'interface)
function lat(base, groupe, court, min, max, unite, fin, opsDe, extra = {}) {
  for (const c of ['D', 'G'])
    add(
      C(
        base + '_' + c,
        groupe,
        court + ' ' + c,
        min,
        max,
        unite,
        fin,
        (v) => opsDe(v, c),
        Object.assign({ cote: c, court }, extra)
      )
    );
}

add(
  C('tete_incl', 'tete', 'Inclinaison de la tête', -20, 20, '°', ['G', 'D'], (v) =>
    COU.map((n) => ({ os: n, axe: 'z', deg: v / 3 }))
  )
);
add(
  C('tete_rot', 'tete', 'Rotation de la tête', -30, 30, '°', ['G', 'D'], (v) =>
    COU.map((n) => ({ os: n, axe: 'y', deg: -v / 3 }))
  )
);
add(
  C('tete_flex', 'tete', 'Flexion / extension', -20, 20, '°', ['extension', 'flexion'], (v) =>
    COU.map((n) => ({ os: n, axe: 'x', deg: v / 3 }))
  )
);
add(
  C(
    'tete_antep',
    'tete',
    'Antépulsion de la tête',
    -2,
    8,
    'cm',
    ['rétro', 'antépulsion'],
    (v) => [{ os: 'neck02', pos: [0, 0, v / 100] }],
    { qual: [1, 3, 5, 8] }
  )
);
add(
  C('tete_transl', 'tete', 'Translation latérale de la tête', -4, 4, 'cm', ['G', 'D'], (v) => [
    { os: 'neck02', pos: [-v / 100, 0, 0] },
  ])
);

// Ceinture scapulaire : les deux clavicules tournent ensemble ; la tête et le tronc ne bougent pas
add(
  C(
    'ceinture_incl',
    'epaules',
    'Inclinaison de la ceinture scapulaire',
    -10,
    10,
    '°',
    ['G (épaule G basse)', 'D (épaule D basse)'],
    (v) => ['clavicle.L', 'clavicle.R'].map((n) => ({ os: n, axe: 'z', deg: v }))
  )
);
add(
  C(
    'ceinture_rot',
    'epaules',
    'Rotation de la ceinture scapulaire',
    -20,
    20,
    '°',
    ['G', 'D'],
    (v) => ['clavicle.L', 'clavicle.R'].map((n) => ({ os: n, axe: 'y', deg: -v }))
  )
);
lat(
  'epaule_elev',
  'epaules',
  "Élévation de l'épaule",
  -10,
  10,
  '°',
  ['abaissée', 'élevée'],
  (v, c) => [{ os: os('clavicle', c), axe: 'z', deg: v * cote(c) }]
);
lat(
  'epaule_antep',
  'epaules',
  "Antépulsion de l'épaule",
  -20,
  20,
  '°',
  ['rétropulsion', 'antépulsion'],
  (v, c) => [{ os: os('clavicle', c), axe: 'y', deg: -v * cote(c) }]
);

lat('bras_abd', 'bras', 'Abduction du bras', -10, 45, '°', ['adduction', 'abduction'], (v, c) => [
  { os: os('upperarm01', c), axe: 'z', deg: v * cote(c) },
]);
lat(
  'bras_antep',
  'bras',
  'Antépulsion du bras',
  -20,
  30,
  '°',
  ['rétropulsion', 'antépulsion'],
  (v, c) => [{ os: os('upperarm01', c), axe: 'x', deg: -v }]
);
lat('bras_rot', 'bras', 'Rotation du bras', -45, 45, '°', ['RI', 'RE'], (v, c) => [
  { os: os('upperarm01', c), axe: 'y', deg: v * cote(c) },
]);
lat('coude_flex', 'bras', 'Flexion du coude', 0, 140, '°', ['', 'flexion'], (v, c) => [
  { os: os('lowerarm01', c), axe: 'x', deg: -v },
]);
// torsion pure de l'avant-bras et de la main autour de l'axe de l'avant-bras (le coude ne plie pas)
lat(
  'avbras_pron',
  'bras',
  'Pronation / supination',
  -60,
  60,
  '°',
  ['supination (paume)', 'pronation (dos de la main)'],
  (v, c) => [{ twist: true, cote: c, deg: v }]
);

add(
  C('tronc_incl', 'tronc', 'Inclinaison du tronc', -20, 20, '°', ['G', 'D'], (v) =>
    RACHIS.map((n) => ({ os: n, axe: 'z', deg: v / 5 }))
  )
);
add(
  C('tronc_rot', 'tronc', 'Rotation du tronc', -30, 30, '°', ['G', 'D'], (v) =>
    RACHIS.map((n) => ({ os: n, axe: 'y', deg: -v / 5 }))
  )
);
// courbures : déformation locale du dos uniquement, le reste du corps ne bouge pas
add(
  C(
    'tronc_cyphose',
    'tronc',
    'Hypercyphose dorsale',
    0,
    40,
    '°',
    ['', 'cyphose'],
    (v) => [{ morph: 'cyphose', w: v / 40 }],
    { qual: [8, 15, 25, 40] }
  )
);
add(
  C(
    'tronc_lordose',
    'tronc',
    'Hyperlordose lombaire',
    0,
    30,
    '°',
    ['', 'lordose'],
    (v) => [{ morph: 'lordose', w: v / 30 }],
    { qual: [8, 15, 22, 30] }
  )
);
add(
  C('tronc_antero', 'tronc', 'Antériorisation du thorax', -5, 10, 'cm', ['rétro', 'avant'], (v) => [
    { os: 'spine02', pos: [0, 0, v / 100] },
  ])
);
add(
  C('thorax_transl', 'tronc', 'Translation latérale du thorax', -5, 5, 'cm', ['G', 'D'], (v) => [
    { os: 'spine02', pos: [-v / 100, 0, 0] },
  ])
);

add(
  C(
    'bassin_bascule',
    'bassin',
    'Bascule du bassin (côté bas)',
    -10,
    10,
    '°',
    ['G bas', 'D bas'],
    (v) => [{ bassin: { axe: 'z', deg: v } }],
    { qual: [2, 4, 7, 10] }
  )
);
add(
  C('bassin_rot', 'bassin', 'Rotation du bassin', -15, 15, '°', ['G', 'D'], (v) => [
    { bassin: { axe: 'y', deg: -v } },
  ])
);
// antéversion : le haut du bassin part en avant, les fesses bombent, les lombaires se creusent ;
// rétroversion : l'inverse (fesses plus plates), sans flexion des genoux
add(
  C(
    'bassin_antev',
    'bassin',
    'Antéversion / rétroversion du bassin',
    -12,
    6,
    '°',
    ['rétroversion', 'antéversion'],
    (v) => [
      { bassin: { axe: 'x', deg: v } },
      { morph: 'fessiers', w: v > 0 ? v / 6 : v / 12 },
      { morph: 'lordose', w: v > 0 ? v / 6 : v / 12 },
    ],
    { qual: [2, 3, 5, 6] }
  )
);
add(
  C(
    'bassin_inegalite',
    'bassin',
    'Inégalité de longueur des jambes',
    -30,
    30,
    'mm',
    ['G plus courte', 'D plus courte'],
    (v) => [{ bassin: { axe: 'z', deg: Math.atan2(v, 220) / RAD } }]
  )
);

lat(
  'cuisse_abd',
  'jambes',
  'Abduction de la cuisse',
  -15,
  30,
  '°',
  ['adduction', 'abduction'],
  (v, c) => [{ os: os('upperleg01', c), axe: 'z', deg: v * cote(c) }]
);
lat('cuisse_rot', 'jambes', 'Rotation de la cuisse', -30, 30, '°', ['RI', 'RE'], (v, c) => [
  { os: os('upperleg01', c), axe: 'y', deg: v * cote(c) },
]);
// genou : seul l'angle du genou bouge (hanche et cheville fixes, le pied reste au sol)
lat(
  'genou_flex',
  'jambes',
  'Flessum / recurvatum du genou',
  -15,
  30,
  '°',
  ['recurvatum', 'flessum'],
  (v, c) => [{ morph: 'genou_flex_' + sd(c), w: v / 30 }]
);
lat(
  'genou_valgus',
  'jambes',
  'Valgus / varus du genou',
  -15,
  15,
  '°',
  ['varus', 'valgus'],
  (v, c) => [{ morph: 'genou_valgus_' + sd(c), w: v / 15 }],
  { qual: [3, 7, 11, 15] }
);
lat('tibia_rot', 'jambes', 'Rotation du tibia', -20, 20, '°', ['RI', 'RE'], (v, c) => [
  { os: os('lowerleg01', c), axe: 'y', deg: v * cote(c) },
]);
lat(
  'pied_ouverture',
  'pieds',
  'Ouverture du pas',
  -10,
  30,
  '°',
  ['en dedans', 'en dehors'],
  (v, c) => [{ os: os('foot', c), axe: 'y', deg: v * cote(c) }],
  { qual: [8, 15, 22, 30] }
);
lat('pied_valgus', 'pieds', 'Valgus / varus du pied', -15, 15, '°', ['varus', 'valgus'], (v, c) => [
  { os: os('foot', c), axe: 'z', deg: v * cote(c) },
]);

// Latéralisation globale induite par la répartition du poids : degrés d'inclinaison du corps entier (depuis les chevilles)
// par point de pourcentage d'écart ; le corps penche du côté le plus chargé (30 points → 7,5°).
export const LATERALISATION_PAR_POINT = 0.25;
// Répartition du poids G/D (appuis) : donnée clinique pour le rapport et les mécanismes (EIAP) ; incline tout le corps du côté chargé.
// valeur = points de pourcentage de plus sur le côté indiqué (+10 → 60 % D / 40 % G).
add(
  C(
    'poids_lr',
    'pieds',
    'Répartition du poids G/D',
    -30,
    30,
    '%',
    ['G', 'D'],
    (v) => [{ glob: 'z', deg: v * LATERALISATION_PAR_POINT }],
    {
      qual: [5, 10, 15, 25],
      decrit: (x) => 'Répartition du poids : ' + (50 - x) + ' % G / ' + (50 + x) + ' % D',
    }
  )
);

// Antériorisation / postériorisation GLOBALE : tout le corps au-dessus de l'articulation choisie bascule en bloc
// (aucune cassure au niveau du bassin) ; les segments situés en dessous restent fixes, les pieds restent à plat.
const GLOBAL_FIN = ['postériorisation', 'antériorisation'];
add(
  C(
    'glob_chev',
    'global',
    'Antériorisation globale depuis les chevilles',
    -10,
    10,
    '°',
    GLOBAL_FIN,
    (v) => [{ glob: 'a', deg: v }],
    { qual: [2, 4, 6, 9] }
  )
);
add(
  C(
    'glob_gen',
    'global',
    'Antériorisation globale depuis les genoux',
    -10,
    10,
    '°',
    GLOBAL_FIN,
    (v) => [{ glob: 'k', deg: v }],
    { qual: [2, 4, 6, 9] }
  )
);
add(
  C(
    'glob_bassin',
    'global',
    'Antériorisation globale depuis le bassin (hanches)',
    -10,
    10,
    '°',
    GLOBAL_FIN,
    (v) => [{ glob: 'h', deg: v }],
    { qual: [2, 4, 6, 9] }
  )
);

export const PAR_ID = Object.fromEntries(CURSEURS.map((c) => [c.id, c]));

// ─── Tableaux types ───────────────────────────────────────────────────────────────────────
// Tableaux types : points de départ INDICATIFS, à ajuster par le praticien (aucune valeur n'est une norme).
// Chaque valeur est une amplitude « moyenne » située dans la plage du curseur ; les niveaux léger / modéré / marqué /
// sévère de la dictée donnent d'autres amplitudes. `ref` : à compléter avec les sources cliniques.
const bil = (base, v) => ({ [base + '_D']: v, [base + '_G']: v });
export const TABLEAUX = {
  neutre: { label: 'Neutre', valeurs: {} },
  genu_valgum_bilat: {
    label: 'Genu valgum bilatéral',
    valeurs: {
      ...bil('genou_valgus', 9),
      ...bil('pied_valgus', 6),
      ...bil('cuisse_rot', -6),
      ...bil('tibia_rot', 6),
    },
  },
  genu_valgum_D: {
    label: 'Genu valgum unilatéral D',
    valeurs: {
      genou_valgus_D: 9,
      pied_valgus_D: 6,
      cuisse_rot_D: -6,
      tibia_rot_D: 6,
      bassin_bascule: -3,
    },
  },
  genu_valgum_G: {
    label: 'Genu valgum unilatéral G',
    valeurs: {
      genou_valgus_G: 9,
      pied_valgus_G: 6,
      cuisse_rot_G: -6,
      tibia_rot_G: 6,
      bassin_bascule: 3,
    },
  },
  genu_varum_bilat: {
    label: 'Genu varum bilatéral',
    valeurs: { ...bil('genou_valgus', -8), ...bil('pied_valgus', -5), ...bil('cuisse_rot', 5) },
  },
  recurvatum_bilat: {
    label: 'Genu recurvatum bilatéral',
    valeurs: { ...bil('genou_flex', -10), bassin_antev: 4 },
  },
  flessum_bilat: {
    label: 'Flessum de genou bilatéral',
    valeurs: { ...bil('genou_flex', 15), bassin_antev: 4, tronc_lordose: 8 },
  },
  pied_plat_valgus: {
    label: 'Pieds plats valgus bilatéraux',
    valeurs: {
      ...bil('pied_valgus', 10),
      ...bil('pied_ouverture', 15),
      ...bil('tibia_rot', -6),
      ...bil('genou_valgus', 4),
    },
  },
  pied_creux_varus: {
    label: 'Pieds creux varus bilatéraux',
    valeurs: { ...bil('pied_valgus', -8), ...bil('pied_ouverture', 3), ...bil('genou_valgus', -4) },
  },
  rotation_interne_mi: {
    label: 'Rotation interne des membres inférieurs (pieds en dedans)',
    valeurs: { ...bil('cuisse_rot', -12), ...bil('pied_ouverture', -8), ...bil('genou_valgus', 3) },
  },
  pied_en_dehors: {
    label: 'Pieds en dehors (ouverture du pas)',
    valeurs: { ...bil('pied_ouverture', 20), ...bil('cuisse_rot', 8) },
  },
  bascule_bassin_D: {
    label: 'Bascule du bassin, côté D bas',
    valeurs: { bassin_bascule: 6, tronc_incl: -4, ceinture_incl: -3, tete_incl: 3 },
  },
  bascule_bassin_G: {
    label: 'Bascule du bassin, côté G bas',
    valeurs: { bassin_bascule: -6, tronc_incl: 4, ceinture_incl: 3, tete_incl: -3 },
  },
  iml_D_courte: {
    label: 'Inégalité de longueur, jambe D courte (15 mm)',
    valeurs: { bassin_inegalite: 15, tronc_incl: -4, ceinture_incl: -3, tete_incl: 3 },
  },
  iml_G_courte: {
    label: 'Inégalité de longueur, jambe G courte (15 mm)',
    valeurs: { bassin_inegalite: -15, tronc_incl: 4, ceinture_incl: 3, tete_incl: -3 },
  },
  hyperlordose: {
    label: 'Hyperlordose avec antéversion',
    valeurs: { tronc_lordose: 18, bassin_antev: 5, tronc_antero: 2 },
  },
  dos_plat: {
    label: 'Dos plat (rétroversion du bassin)',
    valeurs: { bassin_antev: -8, tronc_lordose: 0, tronc_cyphose: 5 },
  },
  hypercyphose: {
    label: 'Hypercyphose dorsale (dos rond)',
    valeurs: { tronc_cyphose: 25, tete_antep: 4, ...bil('epaule_antep', 10) },
  },
  croise_sup: {
    label: 'Syndrome croisé supérieur (Janda)',
    valeurs: {
      tete_antep: 5,
      tete_flex: -6,
      tronc_cyphose: 20,
      ...bil('epaule_antep', 12),
      ...bil('epaule_elev', 3),
    },
  },
  croise_inf: {
    label: 'Syndrome croisé inférieur (Janda)',
    valeurs: { bassin_antev: 5, tronc_lordose: 16, tronc_antero: 2 },
  },
  attitude_scoliotique: {
    label: 'Attitude scoliotique (fonctionnelle)',
    valeurs: {
      tronc_incl: 6,
      thorax_transl: -2,
      ceinture_incl: 4,
      bassin_bascule: 3,
      tete_incl: -3,
    },
  },
  anteriorisation_chevilles: {
    label: 'Antériorisation globale depuis les chevilles',
    valeurs: { glob_chev: 5 },
  },
  anteriorisation_genoux: {
    label: 'Antériorisation globale depuis les genoux',
    valeurs: { glob_gen: 5 },
  },
  anteriorisation_bassin: {
    label: 'Antériorisation globale depuis le bassin (hanches)',
    valeurs: { glob_bassin: 5 },
  },
  posteriorisation_chevilles: {
    label: 'Postériorisation globale depuis les chevilles',
    valeurs: { glob_chev: -4 },
  },
  posteriorisation_genoux: {
    label: 'Postériorisation globale depuis les genoux',
    valeurs: { glob_gen: -4 },
  },
  posteriorisation_bassin: {
    label: 'Postériorisation globale depuis le bassin (hanches)',
    valeurs: { glob_bassin: -4 },
  },
};

// ─── Pose complète à partir des valeurs ────────────────────────────────────────────────────
// Renvoie { rot, pos, bassin, morph, twist }.
//  - rot  : {os → quaternion} ; pos : {os → [dx,dy,dz]} ;
//  - bassin : rotation du bassin ; le moteur la fait tourner AUTOUR DES HANCHES, remet la colonne en place
//    (le haut du corps ne suit pas) et laisse les jambes d'aplomb (rotation inverse sur pelvis.L/R) ;
//  - morph : {nom → poids} ; twist : {L,R} torsion de l'avant-bras en degrés.
export function poseDepuisValeurs(valeurs) {
  const rot = {},
    pos = {},
    morph = {},
    twist = { L: 0, R: 0 },
    glob = { a: 0, k: 0, h: 0, z: 0 };
  let bassin = [0, 0, 0, 1];
  const rotAdd = (nom, q) => {
    rot[nom] = qMul(q, rot[nom] || [0, 0, 0, 1]);
  };
  for (const o of POSE_NEUTRE) rotAdd(o.os, qAxe(o.axe, o.deg));
  for (const c of CURSEURS) {
    const v = Number(valeurs && valeurs[c.id]);
    if (!v || !isFinite(v)) continue;
    for (const o of c.ops(v)) {
      if (o.bassin) bassin = qMul(qAxe(o.bassin.axe, o.bassin.deg), bassin);
      else if (o.glob) glob[o.glob] += o.deg;
      else if (o.morph) morph[o.morph] = (morph[o.morph] || 0) + o.w;
      else if (o.twist) twist[sd(o.cote)] += o.deg;
      else if (o.pos) {
        const p = pos[o.os] || (pos[o.os] = [0, 0, 0]);
        p[0] += o.pos[0];
        p[1] += o.pos[1];
        p[2] += o.pos[2];
      } else rotAdd(o.os, qAxe(o.axe, o.deg));
    }
  }
  return { rot, pos, bassin, morph, twist, glob };
}

// Assemblage des rotations du squelette (fonction pure, testée ; le moteur ne fait que l'appliquer).
//  - root : rotation monde du bassin = rotation globale (axe x) × bascule/rotation/version du bassin ;
//  - contre-rotations (locales, à gauche de la rotation propre de l'os) :
//      colonne : le mouvement du bassin se fond progressivement le long du rachis (75 % / 50 % / 25 % / 8 % / 0 % du
//      mouvement restent à chaque niveau), épaules et tête ne bougent pas ;
//      cuisses : restent d'aplomb sauf si le corps bascule depuis les genoux ou les chevilles ;
//      jambes : fixes sauf si bascule depuis les chevilles ; pieds toujours à plat.
export const REPARTITION_RACHIS = [
  ['spine05', 0.25],
  ['spine04', 0.25],
  ['spine03', 0.25],
  ['spine02', 0.17],
  ['spine01', 0.08],
];
export function assemblage(P) {
  const { a, k, h, z } = P.glob;
  const g = qAxe('x', a + k + h);
  // latéralisation globale (z) : tout le corps penche en bloc de côté depuis les chevilles (rotation monde, en dernier)
  const root = qMul(qAxe('z', z), qMul(g, P.bassin));
  const counters = {};
  for (const [n, f] of REPARTITION_RACHIS) counters[n] = qInv(qPow(P.bassin, f));
  for (const c of ['L', 'R']) {
    counters['upperleg01.' + c] = qMul(qInv(P.bassin), qAxe('x', -h));
    counters['lowerleg01.' + c] = qAxe('x', -k);
    counters['foot.' + c] = qMul(qAxe('x', -a), qAxe('z', -z)); // pieds toujours à plat, malgré l'inclinaison
  }
  return { root, counters, global: g };
}

// Valeurs nettoyées (bornées, arrondies, zéros retirés) : ce qui est enregistré dans le bilan.
export function nettoyerValeurs(v) {
  const out = {};
  for (const c of CURSEURS) {
    let x = Number(v && v[c.id]);
    if (!isFinite(x) || x === 0) continue;
    x = Math.max(c.min, Math.min(c.max, Math.round(x * 10) / 10));
    if (x !== 0) out[c.id] = x;
  }
  return out;
}

// Compte rendu : une ligne par valeur non nulle (libellés côté patient)
export function decrire(valeurs) {
  const lignes = [];
  for (const c of CURSEURS) {
    const x = Number(valeurs && valeurs[c.id]);
    if (!x || !isFinite(x)) continue;
    if (c.decrit) {
      lignes.push(c.decrit(x));
      continue;
    }
    const mot = x < 0 ? c.fin[0] : c.fin[1];
    lignes.push(c.label + ' : ' + (mot ? mot + ' ' : '') + Math.abs(x) + ' ' + c.unite);
  }
  return lignes;
}

// Tableaux types cumulables : le tableau choisi s'AJOUTE aux valeurs déjà saisies (curseurs ou autres tableaux).
// Si un curseur est déjà réglé, la valeur du nouveau tableau le remplace ; « Neutre » remet tout à zéro.
export function appliquerTableau(valeurs, cle) {
  const t = TABLEAUX[cle];
  if (!t) return Object.assign({}, valeurs);
  if (!Object.keys(t.valeurs).length) return {};
  return Object.assign({}, valeurs, t.valeurs);
}
