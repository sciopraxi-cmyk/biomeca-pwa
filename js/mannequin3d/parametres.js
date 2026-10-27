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

// ─── Curseurs ─────────────────────────────────────────────────────────────────────────
// ops(v, c) → liste d'opérations {os, axe, deg} (rotation) ou {os, pos:[dx,dy,dz]} (m) ou {bassin:{axe,deg}}.
// fin = libellés des extrémités (valeur négative → positive).
function C(id, groupe, label, min, max, unite, fin, ops, extra = {}) {
  return Object.assign({ id, groupe, label, min, max, unite, fin, ops, pas: 1, defaut: 0 }, extra);
}
export const GROUPES = [
  ['tete', 'Tête et cou'],
  ['epaules', 'Épaules'],
  ['bras', 'Membres supérieurs'],
  ['tronc', 'Tronc et rachis'],
  ['bassin', 'Bassin'],
  ['jambes', 'Membres inférieurs'],
  ['pieds', 'Pieds'],
];
export const CURSEURS = [];
const add = (c) => CURSEURS.push(c);

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
  C('tete_antep', 'tete', 'Antépulsion de la tête', -2, 8, 'cm', ['rétro', 'antépulsion'], (v) => [
    { os: 'neck02', pos: [0, 0, v / 100] },
  ])
);
add(
  C('tete_transl', 'tete', 'Translation latérale de la tête', -4, 4, 'cm', ['G', 'D'], (v) => [
    { os: 'neck02', pos: [-v / 100, 0, 0] },
  ])
);

for (const c of ['D', 'G']) {
  add(
    C(
      'epaule_elev_' + c,
      'epaules',
      'Élévation épaule ' + c,
      -10,
      10,
      '°',
      ['abaissée', 'élevée'],
      (v) => [{ os: os('clavicle', c), axe: 'z', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'epaule_antep_' + c,
      'epaules',
      'Antépulsion épaule ' + c,
      -20,
      20,
      '°',
      ['rétropulsion', 'antépulsion'],
      (v) => [{ os: os('clavicle', c), axe: 'y', deg: -v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'bras_abd_' + c,
      'bras',
      'Abduction du bras ' + c,
      -10,
      45,
      '°',
      ['adduction', 'abduction'],
      (v) => [{ os: os('upperarm01', c), axe: 'z', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'bras_antep_' + c,
      'bras',
      'Antépulsion du bras ' + c,
      -20,
      30,
      '°',
      ['rétropulsion', 'antépulsion'],
      (v) => [{ os: os('upperarm01', c), axe: 'x', deg: -v }],
      { cote: c }
    )
  );
  add(
    C(
      'bras_rot_' + c,
      'bras',
      'Rotation du bras ' + c,
      -45,
      45,
      '°',
      ['RI', 'RE'],
      (v) => [{ os: os('upperarm01', c), axe: 'y', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'coude_flex_' + c,
      'bras',
      'Flexion du coude ' + c,
      0,
      140,
      '°',
      ['', 'flexion'],
      (v) => [{ os: os('lowerarm01', c), axe: 'x', deg: -v }],
      { cote: c }
    )
  );
  add(
    C(
      'avbras_pron_' + c,
      'bras',
      'Pronation / supination ' + c,
      -60,
      60,
      '°',
      ['supination', 'pronation'],
      (v) => [{ os: os('lowerarm02', c), axe: 'y', deg: v * cote(c) * -1 }],
      { cote: c }
    )
  );
}

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
add(
  C('tronc_cyphose', 'tronc', 'Hypercyphose dorsale', 0, 40, '°', ['', 'cyphose'], (v) =>
    [
      ['spine03', 0.25],
      ['spine02', 0.35],
      ['spine01', 0.4],
    ].map(([n, k]) => ({ os: n, axe: 'x', deg: v * k }))
  )
);
// courbe, pas cassure : l'extension lombaire est rattrapée au-dessus pour que le tronc reste vertical
add(
  C('tronc_lordose', 'tronc', 'Hyperlordose lombaire', 0, 30, '°', ['', 'lordose'], (v) =>
    [].concat(
      [
        ['spine05', 0.5],
        ['spine04', 0.5],
      ].map(([n, k]) => ({ os: n, axe: 'x', deg: -v * k })),
      [
        ['spine03', 0.34],
        ['spine02', 0.33],
        ['spine01', 0.33],
      ].map(([n, k]) => ({ os: n, axe: 'x', deg: v * k }))
    )
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
    (v) => [{ bassin: { axe: 'z', deg: v } }]
  )
);
add(
  C('bassin_rot', 'bassin', 'Rotation du bassin', -15, 15, '°', ['G', 'D'], (v) => [
    { bassin: { axe: 'y', deg: -v } },
  ])
);
add(
  C(
    'bassin_antev',
    'bassin',
    'Antéversion du bassin',
    -15,
    25,
    '°',
    ['rétroversion', 'antéversion'],
    (v) => [{ bassin: { axe: 'x', deg: v } }]
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

for (const c of ['D', 'G']) {
  add(
    C(
      'cuisse_abd_' + c,
      'jambes',
      'Abduction de la cuisse ' + c,
      -15,
      30,
      '°',
      ['adduction', 'abduction'],
      (v) => [{ os: os('upperleg01', c), axe: 'z', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'cuisse_rot_' + c,
      'jambes',
      'Rotation de la cuisse ' + c,
      -30,
      30,
      '°',
      ['RI', 'RE'],
      (v) => [{ os: os('upperleg01', c), axe: 'y', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'genou_flex_' + c,
      'jambes',
      'Flessum / recurvatum du genou ' + c,
      -15,
      30,
      '°',
      ['recurvatum', 'flessum'],
      (v) => [{ os: os('lowerleg01', c), axe: 'x', deg: v }],
      { cote: c }
    )
  );
  add(
    C(
      'genou_valgus_' + c,
      'jambes',
      'Valgus / varus du genou ' + c,
      -15,
      15,
      '°',
      ['varus', 'valgus'],
      (v) => [{ os: os('lowerleg01', c), axe: 'z', deg: v * cote(c) * -1 }],
      { cote: c }
    )
  );
  add(
    C(
      'tibia_rot_' + c,
      'jambes',
      'Rotation du tibia ' + c,
      -20,
      20,
      '°',
      ['RI', 'RE'],
      (v) => [{ os: os('lowerleg01', c), axe: 'y', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'pied_ouverture_' + c,
      'pieds',
      'Ouverture du pas ' + c,
      -10,
      30,
      '°',
      ['en dedans', 'en dehors'],
      (v) => [{ os: os('foot', c), axe: 'y', deg: v * cote(c) }],
      { cote: c }
    )
  );
  add(
    C(
      'pied_valgus_' + c,
      'pieds',
      'Valgus / varus du pied ' + c,
      -15,
      15,
      '°',
      ['varus', 'valgus'],
      (v) => [{ os: os('foot', c), axe: 'z', deg: v * cote(c) }],
      { cote: c }
    )
  );
}

export const PAR_ID = Object.fromEntries(CURSEURS.map((c) => [c.id, c]));

// ─── Tableaux types ───────────────────────────────────────────────────────────────────────
export const TABLEAUX = {
  neutre: { label: 'Neutre', valeurs: {} },
  bascule_bassin: {
    label: 'Bascule du bassin',
    valeurs: {
      bassin_bascule: 6,
      tronc_incl: -4,
      tete_incl: 3,
      epaule_elev_D: -3,
      epaule_elev_G: 3,
    },
  },
  iml: {
    label: 'Inégalité de longueur (D courte)',
    valeurs: { bassin_inegalite: 15, tronc_incl: -4, tete_incl: 3 },
  },
  genu_valgum: {
    label: 'Genu valgum bilatéral',
    valeurs: { genou_valgus_D: 9, genou_valgus_G: 9, pied_valgus_D: 6, pied_valgus_G: 6 },
  },
  hyperlordose: { label: 'Hyperlordose', valeurs: { tronc_lordose: 18, bassin_antev: 12 } },
  hypercyphose: {
    label: 'Hypercyphose',
    valeurs: { tronc_cyphose: 25, tete_antep: 4, epaule_antep_D: 10, epaule_antep_G: 10 },
  },
};

// ─── Pose complète à partir des valeurs ────────────────────────────────────────────────────
// Renvoie { rot: {os:[x,y,z,w]}, pos: {os:[dx,dy,dz]}, bassin:[x,y,z,w] }.
// Le bassin est appliqué à l'os « root » ; les jambes (pelvis.L/R) reçoivent la rotation inverse :
// le bassin bascule sur des jambes qui restent verticales (la résolution « pieds au sol » est faite par le moteur).
export function poseDepuisValeurs(valeurs) {
  const rot = {},
    pos = {};
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
      else if (o.pos) {
        const p = pos[o.os] || (pos[o.os] = [0, 0, 0]);
        p[0] += o.pos[0];
        p[1] += o.pos[1];
        p[2] += o.pos[2];
      } else rotAdd(o.os, qAxe(o.axe, o.deg));
    }
  }
  rot.root = bassin;
  const inv = qInv(bassin);
  rotAdd('pelvis.L', inv);
  rotAdd('pelvis.R', inv);
  return { rot, pos, bassin };
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
    const mot = x < 0 ? c.fin[0] : c.fin[1];
    const cote_ = c.cote ? '' : '';
    lignes.push(c.label + ' : ' + (mot ? mot + ' ' : '') + Math.abs(x) + ' ' + c.unite + cote_);
  }
  return lignes;
}
