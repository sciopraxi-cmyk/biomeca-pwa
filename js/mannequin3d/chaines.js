// Mannequin postural 3D — profil du patient et chaîne musculaire (fonctions pures, sans WebGL).
// À partir des valeurs des curseurs : zones du corps notées de 0 à 4, score de chaque chaîne musculaire, profil
// (postural, chaîniste/neuromusculaire, biomécanique/viscéral, ou combinaison) et entrée haute / basse / mixte.
// HYPOTHÈSE à confirmer par le praticien, jamais un diagnostic. Le contenu des chaînes vient UNIQUEMENT du cours
// de Joël (diapos citées) et de sa spécification du 28/10/2026 ; les seuils sont des paramètres à calibrer.
import { PAR_ID } from './parametres.js?v=v316';
import { seuilCabinet } from './mecanismes.js?v=v316';

export const APPELLATION_POSTURAL = 'Mézières / Myers';
export const APPELLATION_CHAINISTE = 'Busquet / GDS';

// ── Seuils réglables (valeurs par défaut validées par Joël le 28/10 ; à calibrer sur cas réels)
export const SEUILS_PROFIL_DEFAUT = {
  exprimee: 40, // score (%) à partir duquel une chaîne est « exprimée »
  ecartDominante: 15, // points d'écart avec la 2e chaîne pour parler de chaîne dominante
  petiteMax: 2, // niveau 1–2 = petite compensation
  grosse: 3, // niveau ≥ 3 = grosse compensation
  plusieurs: 3, // nombre de zones touchées pour parler de « plusieurs compensations »
  creditPlein: 2, // niveau à partir duquel un signe compte pour 100 % de son poids dans le score d'une chaîne
  unilateralMin: 2, // niveau à partir duquel un écart D/G présent d'UN SEUL côté (l'autre côté à 0) est une compensation locale
};
let SEUILS = { ...SEUILS_PROFIL_DEFAUT };
export function definirSeuilsProfil(t) {
  SEUILS = { ...SEUILS_PROFIL_DEFAUT };
  if (t && typeof t === 'object')
    for (const k of Object.keys(SEUILS_PROFIL_DEFAUT))
      if (typeof t[k] === 'number' && isFinite(t[k]) && t[k] > 0) SEUILS[k] = t[k];
}
export const seuilsProfil = () => ({ ...SEUILS });

// ── Niveaux 0–4 d'un curseur. Seuils de niveau = amplitudes « qual » du curseur (léger → sévère) ; à défaut,
// fractions de l'étendue du curseur dans le sens considéré. Le seuil « existe » (niveau 1) est celui du cabinet
// (Paramètres → Seuils — analyse posturale) quand il existe pour ce curseur.
const FRACTIONS = [0.15, 0.35, 0.6, 0.85];
const CLE_CABINET = {
  tete_incl: 'face.tete',
  tete_rot: 'face.tete',
  ceinture_incl: 'face.epaules',
  epaule_elev: 'face.epaules',
  bassin_bascule: 'face.bassin',
  genou_valgus: 'face.valgumVarum',
  genou_flex: 'neutralite.genou',
  tronc_incl: 'face.lateralisation',
  bassin_antev: 'neutralite.bassin',
  glob_chev: 'neutralite.anteriorisation',
  glob_gen: 'neutralite.anteriorisation',
  glob_bassin: 'neutralite.anteriorisation',
};
const baseId = (id) => id.replace(/_(D|G)$/, '');
function seuilsNiveaux(id, sens) {
  const c = PAR_ID[id];
  if (!c) return null;
  let t;
  if (Array.isArray(c.qual)) t = c.qual.slice();
  else {
    const borne = sens > 0 ? c.max : -c.min;
    if (!(borne > 0)) return null;
    t = FRACTIONS.map((f) => Math.round(borne * f * 100) / 100);
  }
  const cab = seuilCabinet(CLE_CABINET[baseId(id)]);
  if (cab != null && cab > 0) t[0] = cab;
  for (let i = 1; i < 4; i++) t[i] = Math.max(t[i], t[i - 1]);
  return t;
}
// niveau (0–4) d'une valeur dans le sens `sens` (+1 : côté positif du curseur, −1 : côté négatif)
export function niveauDe(id, valeur, sens) {
  const x = (Number(valeur) || 0) * sens;
  if (!(x > 0)) return 0;
  const t = seuilsNiveaux(id, sens);
  if (!t) return 0;
  let n = 0;
  for (const s of t) if (x >= s) n++;
  return n;
}
const val = (v, id) => Number(v && v[id]) || 0;
const niveauAbs = (v, id) => {
  const x = val(v, id);
  // coude : l'extension (valeur négative) ramène vers le bras tendu, ce n'est pas une compensation
  if (x < 0 && id.startsWith('coude_flex')) return 0;
  return x ? niveauDe(id, x, x > 0 ? 1 : -1) : 0;
};

// ── Zones du corps (moitié supérieure : tête, épaules, bras, tronc ; moitié inférieure : bassin, hanches, genoux, pieds)
const bil = (b) => [b + '_D', b + '_G'];
export const ZONES = [
  {
    id: 'tete',
    label: 'Tête et cou (mandibule comprise)',
    haut: true,
    ids: [
      'tete_incl',
      'tete_rot',
      'tete_flex',
      'tete_antep',
      'tete_transl',
      'mandi_transl',
      'mandi_antep',
    ],
  },
  {
    id: 'epaules',
    label: 'Épaules et ceinture scapulaire',
    haut: true,
    ids: ['ceinture_incl', 'ceinture_rot', ...bil('epaule_elev'), ...bil('epaule_antep')],
  },
  {
    id: 'bras',
    label: 'Membres supérieurs',
    haut: true,
    ids: [
      ...bil('bras_abd'),
      ...bil('bras_antep'),
      ...bil('bras_rot'),
      ...bil('coude_flex'),
      ...bil('avbras_pron'),
    ],
  },
  {
    id: 'tronc',
    label: 'Tronc et rachis',
    haut: true,
    ids: [
      'tronc_incl',
      'tronc_rot',
      'tronc_cyphose',
      'tronc_lordose',
      'tronc_antero',
      'thorax_transl',
    ],
  },
  {
    id: 'bassin',
    label: 'Bassin',
    haut: false,
    ids: ['bassin_bascule', 'bassin_rot', 'bassin_antev', 'bassin_avance', 'bassin_inegalite'],
  },
  {
    id: 'hanches',
    label: 'Hanches et cuisses',
    haut: false,
    ids: [...bil('cuisse_abd'), ...bil('cuisse_rot')],
  },
  {
    id: 'genoux',
    label: 'Genoux et jambes',
    haut: false,
    ids: [...bil('genou_flex'), ...bil('genou_valgus'), ...bil('tibia_rot')],
  },
  {
    id: 'pieds',
    label: 'Pieds et appui',
    haut: false,
    ids: [...bil('pied_ouverture'), ...bil('pied_valgus'), 'poids_lr'],
  },
];
const ZONE_DE = {};
for (const z of ZONES) for (const i of z.ids) ZONE_DE[i] = z.id;
const GLOBAUX = ['glob_chev', 'glob_gen', 'glob_bassin']; // antériorisation du corps entier : pas une « compensation »

// curseurs à signe latéral (valeur > 0 = côté D du patient, < 0 = côté G)
const LATERAL_SIGNE = new Set([
  'tete_incl',
  'tete_rot',
  'tete_transl',
  'mandi_transl',
  'ceinture_incl',
  'ceinture_rot',
  'tronc_incl',
  'tronc_rot',
  'thorax_transl',
  'bassin_bascule',
  'bassin_rot',
  'bassin_inegalite',
  'poids_lr',
]);
// curseurs impairs qui peuvent porter une GROSSE compensation locale (biomécanique / viscérale)
const LOCAUX_IMPAIRS = new Set(
  [...LATERAL_SIGNE].filter((i) => i !== 'poids_lr').concat(['mandi_antep'])
);
const coteDe = (id, v) => {
  const m = id.match(/_(D|G)$/);
  if (m) return m[1];
  return LATERAL_SIGNE.has(id) ? (v > 0 ? 'D' : 'G') : null;
};

// ── Définition des chaînes : signes retenus par Joël (spécification du 28/10) + rappels du cours (diapos).
// Signe : { id (ou base pour un curseur D/G moyenné sur les deux côtés), sens, txt } ; « ou » = le plus fort des curseurs.
const S = (id, sens, txt, extra = {}) => ({ id, sens, txt, ...extra });
const P = (base, sens, txt) => S(base, sens, txt, { paire: true });
const POST = APPELLATION_POSTURAL,
  CHAI = APPELLATION_CHAINISTE;

const mkPost = (o) => ({ famille: 'posturale', appellation: POST, ...o });
const mkChai = (o) => ({ famille: 'chainiste', appellation: CHAI, ...o });

export const CHAINES = [
  mkPost({
    id: 'grande_posterieure',
    nom: 'Grande chaîne postérieure (Mézières) = ligne postérieure superficielle (Myers)',
    principal: [
      S(null, 1, 'Antériorisation globale du corps depuis les chevilles ou les genoux', {
        ou: ['glob_chev', 'glob_gen'],
      }),
    ],
    secondaires: [
      S('tronc_lordose', 1, 'légère lordose'),
      S('tronc_cyphose', 1, 'légère cyphose'),
      S('tete_flex', -1, 'très légère extension de tête'),
    ],
    cours: [
      [
        'La chaîne la plus significative en terme d’étendue et d’implications ; elle cherche à projeter les épaules en arrière dans la lordose totale (Mézières)',
        '12',
      ],
      [
        'Raccourcissement : douleurs cervicales et lombaires fréquentes, risques accrus d’élongations, de claquages et de tendinites, inconfort de la voûte plantaire',
        '13',
      ],
      [
        'Ligne postérieure superficielle (Myers) : soutien en station verticale, prévient la flexion et favorise la posture droite',
        '27',
      ],
      [
        'Compensations : limitation de la flexion dorsale de cheville, hyperextension du genou, rétraction des ischio-jambiers, antéversion du bassin, lordose, hyperextension du rachis cervical supérieur',
        '27',
      ],
    ],
  }),
  mkPost({
    id: 'grande_anterieure',
    nom: 'Grande chaîne antérieure (Mézières) = ligne antérieure superficielle et profonde (Myers)',
    principal: [
      S(null, -1, 'Postériorisation globale du corps depuis les chevilles ou les genoux', {
        ou: ['glob_chev', 'glob_gen'],
      }),
    ],
    secondaires: [
      S('bassin_antev', -1, 'légère rétroversion du bassin'),
      S('tete_flex', 1, 'légère flexion de tête'),
    ],
    cours: [
      [
        'Ligne antérieure superficielle (Myers) : contrebalance et antagoniste de la ligne postérieure superficielle ; responsable de la flexion',
        '28',
      ],
      [
        'Compensations : limitation de la flexion plantaire de cheville, déplacement antérieur du bassin, restriction de la respiration dans les côtes antérieures, posture de la tête en avant',
        '28',
      ],
    ],
  }),
  ...['D', 'G'].map((c) => {
    const opp = c === 'D' ? 'G' : 'D',
      sg = c === 'D' ? -1 : 1; // ligne latérale D : poids et tronc vers la G (valeur négative)
    return mkPost({
      id: 'ligne_laterale_' + c,
      nom:
        'Ligne latérale ' +
        (c === 'D' ? 'droite' : 'gauche') +
        ' (Myers ; pas d’équivalent chez Mézières)',
      principal: [
        S('poids_lr', sg, 'Répartition du poids à ' + opp),
        S('tronc_incl', sg, 'inclinaison du tronc à ' + opp),
      ],
      secondaires: [
        S(
          'tete_incl',
          -sg,
          'légère inclinaison de la tête à ' + c + ' (pour garder le regard horizontal)'
        ),
      ],
      cours: [
        [
          'Compensations : pronation ou supination de la cheville, genou varum ou valgum, contraction chronique des adducteurs, inclinaison latérale lombaire, bascule de la cage thoracique sur le bassin, limitation d’épaule devant l’impératif de stabilisation de la tête',
          '29',
        ],
      ],
    });
  }),
  ...['D', 'G'].map((c) => {
    const sg = c === 'D' ? 1 : -1;
    return mkPost({
      id: 'ligne_spiralee_' + c,
      nom:
        'Ligne spiralée ' +
        (c === 'D' ? 'droite' : 'gauche') +
        ' (Myers ; pas d’équivalent chez Mézières)',
      principal: [
        S('tronc_rot', sg, 'Rotation du tronc à ' + c),
        S('bassin_rot', sg, 'rotation du bassin à ' + c),
        S('pied_ouverture_' + c, 1, 'ouverture du pas en dehors à ' + c),
      ],
      secondaires: [],
      cours: [
        [
          'Participe aux compensations en torsions, rotations ou bascules latérales ; une dysfonction affecte directement les autres lignes ; se divise en deux lignes de chaque côté de la ligne médiane',
          '30',
        ],
        [
          'Compensations : pronation ou supination de la cheville, rotation du genou, rotation pelvienne sur les pieds, rotation de la cage thoracique sur le bassin, surélévation ou inclinaison d’épaule, inclinaison ou rotation de la tête',
          '30',
        ],
      ],
    });
  }),
  mkChai({
    id: 'extension_PM',
    nom: 'Chaîne d’extension (Busquet) = PM, postéro-médiane (GDS)',
    signes: [
      S('tete_flex', -1, 'tête en légère extension'),
      S('tronc_antero', 1, 'antériorisation du thorax'),
      S('tronc_lordose', 1, 'hyperlordose lombaire'),
      P('genou_flex', -1, 'récurvatum des genoux'),
    ],
    cours: [
      ['Busquet — la chaîne d’extension encourage le redressement (chaîne longitudinale)', '40'],
      [
        'Sur-programmation : redressement, lordose et recurvatum, déploiement viscéral ; traitement : relâchement de la chaîne d’extension pour lutter contre la lordose',
        '41',
      ],
      [
        'Pathologies associées : récurvatum du genou, maladie d’Osgood-Schlatter, syndrome d’engagement de la rotule',
        '41',
      ],
      [
        'GDS PM — résidence : thorax ; fief : membres inférieurs ; pivot primaire : cheville (talo-crurale)',
        '59',
      ],
      [
        'Empreintes PM : déséquilibre du corps vers l’avant, bassin en antéversion, thorax et tête projetés vers l’avant, verticalisation du tibia jusqu’au recurvatum, EIPS resserrées (< 8 cm)',
        '61',
      ],
    ],
  }),
  mkChai({
    id: 'flexion_AM',
    nom: 'Chaîne de flexion (Busquet) = AM, antéro-médiane (GDS)',
    signes: [
      S('tete_flex', 1, 'tête en légère flexion'),
      S('tronc_cyphose', 1, 'hypercyphose dorsale'),
      S('tronc_lordose', 1, 'légère hyperlordose lombaire'),
      S('bassin_avance', -1, 'recul du bassin'),
      S('glob_bassin', 1, 'antériorisation globale du corps depuis le bassin'),
      P('genou_flex', 1, 'flessum des genoux'),
    ],
    cours: [
      [
        'Busquet — la chaîne de flexion encourage la flexion donc l’enroulement (chaîne longitudinale)',
        '38',
      ],
      [
        'Sur-programmation : enroulement, cyphose et flessum, reploiement viscéral ; traitement dans le sens de la posture et recherche du relâchement afin de diminuer les contraintes',
        '39',
      ],
      [
        'Pathologies associées : lésions des ligaments croisés, courbatures des ischio-jambiers, défaut de centrage de la tête humérale, tendinite du supra-épineux, épaule « gelée », périarthrite, épicondylite médiale, syndrome du canal carpien',
        '39',
      ],
      ['GDS AM — résidence : bassin ; fief : thorax ; pivot primaire : genou', '56'],
      ['Empreintes AM : sacrum bombé (verticalisé), ventre bombé, flexion des genoux', '58'],
    ],
  }),
  mkChai({
    id: 'AP',
    nom: 'AP, antéro-postérieure (GDS) = chaîne statique en expiration (Busquet)',
    signes: [
      S('tete_antep', 1, 'légère antépulsion de tête'),
      S('tronc_antero', -1, 'thorax en rétro (rétropulsion du thorax)'),
      P('epaule_elev', -1, 'abaissement des épaules'),
      P('epaule_antep', 1, 'antépulsion des épaules'),
      S('tronc_cyphose', 1, 'hypercyphose dorsale'),
      S('bassin_avance', 1, 'avancement du bassin'),
      P('genou_flex', -1, 'récurvatum des genoux'),
    ],
    cours: [
      ['GDS AP/PA — résidence : tête ; fief : cou ; pivot primaire : colonne vertébrale', '62'],
      [
        'Empreintes AP : cyphose thoracique, enfoncement du sternum (= légère cyphose + antépulsion des deux épaules), léger récurvatum des genoux, léger regard vers le bas',
        '64',
      ],
    ],
  }),
  mkChai({
    id: 'PA',
    nom: 'PA, postéro-antérieure (GDS) = chaîne statique en inspiration (Busquet)',
    signes: [
      S('tete_antep', -1, 'légère rétropulsion de tête'),
      P('epaule_elev', 1, 'élévation des épaules'),
      P('epaule_antep', -1, 'rétropulsion des épaules'),
      S('bassin_antev', -1, 'rétroversion du bassin'),
      P('genou_flex', -1, 'récurvatum des genoux'),
    ],
    cours: [
      ['GDS AP/PA — résidence : tête ; fief : cou ; pivot primaire : colonne vertébrale', '62'],
      [
        'Empreintes PA : érigée, longiligne, regard droit ; PA-AP : thorax bloqué en inspir, lordose lombaire exagérée à sommet ascensionné, bassin antébasculé, genoux en recurvatum',
        '64',
      ],
    ],
  }),
  mkChai({
    id: 'fermeture_AL',
    unilaterale: true,
    nom: 'Chaîne de fermeture (Busquet) = AL, antéro-latérale (GDS)',
    signes: [
      P('epaule_antep', 1, 'antépulsion des épaules'),
      P('bras_abd', -1, 'adduction des bras'),
      P('bras_rot', -1, 'rotation interne des bras'),
      P('avbras_pron', 1, 'pronation des membres supérieurs'),
      S('tronc_cyphose', 1, 'hypercyphose dorsale'),
      P('cuisse_rot', -1, 'rotation interne des cuisses'),
      P('pied_valgus', 1, 'pieds valgus'),
      P('pied_ouverture', -1, 'pieds en dedans'),
    ],
    cours: [
      ['Busquet — la chaîne de fermeture encourage l’enroulement (chaîne croisée)', '44'],
      [
        'Sur-programmation : pronation, rotation interne et adduction, reploiement viscéral du contenu ; traitement : relâchement de la chaîne de fermeture pour lutter contre le reploiement viscéral',
        '45',
      ],
      ['Pathologies associées : coxarthrose, syndrome fémoro-patellaire, valgisation', '45'],
      [
        'GDS AL — fief : ceinture scapulaire ; résidence : membres inférieur et supérieur ; pivot primaire : coxo-fémorale',
        '68',
      ],
      [
        'Empreintes AL : sujet replié dans les plans frontal et horizontal, hanche en flexion et rotation médiale, genoux en valgum, membres supérieurs repliés et épaules enroulées, cou tassé entre les épaules, l’AL domine à droite',
        '70',
      ],
    ],
  }),
  mkChai({
    id: 'ouverture_PL',
    unilaterale: true,
    nom: 'Chaîne d’ouverture (Busquet) = PL, postéro-latérale (GDS)',
    signes: [
      P('epaule_antep', -1, 'rétropulsion des épaules'),
      P('bras_abd', 1, 'abduction des bras'),
      P('bras_rot', 1, 'rotation externe des bras'),
      P('avbras_pron', -1, 'supination des membres supérieurs'),
      S('tronc_lordose', 1, 'hyperlordose lombaire'),
      P('cuisse_rot', 1, 'rotation externe des cuisses'),
      P('pied_valgus', -1, 'pieds neutres ou varus (pied creux = varus)'),
      P('pied_ouverture', 1, 'ouverture du pas en dehors'),
    ],
    cours: [
      ['Busquet — la chaîne d’ouverture encourage l’élargissement (chaîne croisée)', '42'],
      [
        'Sur-programmation : abduction, rotation externe et postérieure, supination, déploiement viscéral du contenu ; traitement : relâchement de la chaîne d’ouverture pour lutter contre le déploiement viscéral',
        '43',
      ],
      [
        'Pathologies associées : varum du genou, pied creux, entorse de cheville, épine calcanéenne',
        '43',
      ],
      [
        'GDS PL — fief : bassin ; résidence : membres supérieurs ; pivot primaire : coxo-fémorale',
        '65',
      ],
      [
        'Empreintes PL : corps déployé dans les plans frontaux et horizontaux, genoux en varum, hanches en abduction, extension et rotation latérale, épaules larges, arc sagittal à sommet coxo-fémoral, la PL domine souvent à gauche',
        '67',
      ],
    ],
  }),
];
export const CHAINE_PAR_ID = Object.fromEntries(CHAINES.map((c) => [c.id, c]));

// ── Crédit d'un signe (0–1) : le niveau divisé par le niveau « plein » (2 par défaut)
const credit = (niv) => Math.min(1, niv / SEUILS.creditPlein);
function evalSigne(valeurs, s, cote = null) {
  if (s.ou) {
    const niv = Math.max(...s.ou.map((i) => niveauDe(i, val(valeurs, i), s.sens)));
    return { ...s, niveau: niv, credit: credit(niv), ids: s.ou };
  }
  if (s.paire) {
    const nD = niveauDe(s.id + '_D', val(valeurs, s.id + '_D'), s.sens),
      nG = niveauDe(s.id + '_G', val(valeurs, s.id + '_G'), s.sens);
    const ids = cote ? [s.id + '_' + cote] : [s.id + '_D', s.id + '_G'];
    if (cote) {
      const n = cote === 'D' ? nD : nG;
      return { ...s, niveau: n, niveauD: nD, niveauG: nG, credit: credit(n), ids };
    }
    return {
      ...s,
      niveau: Math.round(((nD + nG) / 2) * 10) / 10,
      niveauD: nD,
      niveauG: nG,
      credit: (credit(nD) + credit(nG)) / 2,
      ids,
    };
  }
  const niv = niveauDe(s.id, val(valeurs, s.id), s.sens);
  return { ...s, niveau: niv, credit: credit(niv), ids: [s.id] };
}
const moy = (a) => (a.length ? a.reduce((x, y) => x + y.credit, 0) / a.length : 0);
export function scoreChaine(valeurs, ch) {
  if (ch.famille === 'posturale') {
    const principal = ch.principal.map((s) => evalSigne(valeurs, s)),
      secondaires = ch.secondaires.map((s) => evalSigne(valeurs, s));
    const p = moy(principal);
    // le signe principal est indispensable ; les petites compensations possibles complètent (20 %)
    const poids = secondaires.length ? 0.8 : 1;
    const score = Math.round(
      100 * (p * poids + (secondaires.length ? moy(secondaires) * (1 - poids) : 0))
    );
    return { signes: [...principal, ...secondaires], principalOk: p > 0, score: p > 0 ? score : 0 };
  }
  const calc = (cote) => {
    const signes = ch.signes.map((s) => evalSigne(valeurs, s, cote));
    return { signes, score: Math.round(100 * moy(signes)) };
  };
  const bilat = calc(null);
  if (!ch.unilaterale) return { signes: bilat.signes, principalOk: true, score: bilat.score };
  // AL et PL peuvent être unilatérales (spécification de Joël) : on retient la meilleure lecture (deux côtés, D seul,
  // G seul) ; le côté n'est indiqué que si un côté domine nettement l'autre
  const D = calc('D'),
    G = calc('G');
  const best = [
    { cote: null, ...bilat },
    { cote: 'D', ...D },
    { cote: 'G', ...G },
  ].sort((a, b) => b.score - a.score)[0];
  const unilat = best.cote && best.score > bilat.score;
  return {
    signes: unilat ? best.signes : bilat.signes,
    principalOk: true,
    score: best.score,
    cote: unilat ? best.cote : null,
  };
}

// ── Évaluation complète
export function zonesEtNiveaux(valeurs) {
  return ZONES.map((z) => {
    const items = [];
    for (const id of z.ids) {
      const x = val(valeurs, id);
      if (!x) continue;
      const niv = niveauAbs(valeurs, id);
      if (niv > 0)
        items.push({
          id,
          valeur: x,
          niveau: niv,
          cote: coteDe(id, x),
          label: PAR_ID[id] ? PAR_ID[id].court || PAR_ID[id].label : id,
        });
    }
    items.sort((a, b) => b.niveau - a.niveau);
    return {
      id: z.id,
      label: z.label,
      haut: z.haut,
      niveau: items.length ? items[0].niveau : 0,
      cote: items.length ? items[0].cote : null,
      items,
    };
  });
}

// grosses compensations LOCALES (biomécaniques / viscérales) : niveau ≥ seuil « grosse », d'un seul côté
// (un curseur D/G dont l'autre côté n'est pas aussi important et dans le même sens) ou impair latéral/rotatoire.
export function grossesLocales(valeurs, exclus = new Set()) {
  const out = [];
  for (const c of Object.keys(PAR_ID)) {
    const x = val(valeurs, c);
    if (!x) continue;
    const niv = niveauAbs(valeurs, c);
    const m = c.match(/^(.*)_(D|G)$/);
    if (niv >= SEUILS.grosse) {
      if (m) {
        if (!ZONE_DE[c]) continue;
        const autre = m[1] + '_' + (m[2] === 'D' ? 'G' : 'D'),
          xa = val(valeurs, autre),
          na = niveauAbs(valeurs, autre);
        if (na >= SEUILS.grosse && Math.sign(xa) === Math.sign(x)) continue; // bilatéral symétrique : chaîne, pas local
      } else if (!LOCAUX_IMPAIRS.has(c)) continue;
    } else {
      // écart moyen mais présent d'UN SEUL côté (l'autre à zéro) : compensation locale, sauf s'il fait partie des
      // signes d'une chaîne exprimée (ex. chaîne d'ouverture unilatérale)
      if (!m || !ZONE_DE[c] || niv < SEUILS.unilateralMin || exclus.has(c)) continue;
      if (niveauAbs(valeurs, m[1] + '_' + (m[2] === 'D' ? 'G' : 'D')) > 0) continue;
    }
    out.push({
      id: c,
      valeur: x,
      niveau: niv,
      cote: coteDe(c, x),
      zone: ZONE_DE[c],
      label: PAR_ID[c].court || PAR_ID[c].label,
    });
  }
  return out.sort((a, b) => b.niveau - a.niveau);
}

// Entrée du problème local : haute (chaîne descendante), basse (chaîne montante) ou mixte (haut d'un côté, bas de l'autre)
export function entreeLocale(grosses, valeurs, ctx = {}) {
  const hautId = new Set(ZONES.filter((z) => z.haut).map((z) => z.id));
  const haut = grosses.filter((g) => hautId.has(g.zone)),
    bas = grosses.filter((g) => !hautId.has(g.zone));
  const nh = haut.length ? haut[0].niveau : 0,
    nb = bas.length ? bas[0].niveau : 0;
  let type = null;
  if (nh && !nb) type = 'haute';
  else if (nb && !nh) type = 'basse';
  else if (nh && nb) {
    const ch = haut[0].cote,
      cb = bas[0].cote;
    if (ch && cb && ch !== cb) type = 'mixte';
    else type = nh > nb ? 'haute' : nb > nh ? 'basse' : 'mixte';
  }
  // indices d'entrée haute : visuel (axe des yeux non horizontal), vestibulaire (tête / haut du corps latéralisé, corps
  // entier latéralisé compris), mandibulaire (mandibule décalée)
  const seuilYeux = seuilCabinet('face.tete') ?? 2;
  const yeux = ctx && typeof ctx.yeux === 'number' ? ctx.yeux : null;
  const lateralises = [
    'tete_incl',
    'tete_transl',
    'tronc_incl',
    'thorax_transl',
    'ceinture_incl',
    'poids_lr',
  ]
    .filter((i) => niveauAbs(valeurs, i) >= 1)
    .map((i) => PAR_ID[i].court || PAR_ID[i].label);
  const mandi = ['mandi_transl', 'mandi_antep']
    .filter((i) => niveauAbs(valeurs, i) >= 1)
    .map((i) => PAR_ID[i].court || PAR_ID[i].label);
  const indices = {
    visuel: yeux != null && Math.abs(yeux) >= seuilYeux ? { angle: yeux } : null,
    vestibulaire: lateralises.length ? { curseurs: lateralises } : null,
    mandibulaire: mandi.length ? { curseurs: mandi } : null,
  };
  return { type, haut, bas, indices };
}

export const PROFILS_LIBELLE = {
  biomecanique: 'Biomécanique et/ou viscéral (local)',
  postural: 'Postural (global) — chaînes ' + APPELLATION_POSTURAL,
  chainiste: 'Chaîniste / neuromusculaire (régional) — chaînes ' + APPELLATION_CHAINISTE,
};

// evaluerProfil(valeurs, ctx) : ctx.yeux = inclinaison (°) de l'axe des yeux mesurée sur le mannequin (facultatif)
export function evaluerProfil(valeurs, ctx = {}) {
  const v = valeurs || {};
  const zones = zonesEtNiveaux(v);
  const chaines = CHAINES.map((ch) => {
    const r = scoreChaine(v, ch);
    return {
      id: ch.id,
      famille: ch.famille,
      appellation: ch.appellation,
      nom:
        ch.nom + (r.cote ? ', côté ' + (r.cote === 'D' ? 'droit' : 'gauche') + ' seulement' : ''),
      cours: ch.cours,
      ...r,
      exprimee: r.principalOk && r.score >= SEUILS.exprimee,
    };
  }).sort((a, b) => b.score - a.score);
  const exprimees = chaines.filter((c) => c.exprimee);
  // curseurs déjà expliqués par une chaîne exprimée (côté retenu pour une chaîne unilatérale)
  const exclus = new Set();
  for (const c of exprimees)
    for (const sg of c.signes) if (sg.credit > 0) for (const i of sg.ids || []) exclus.add(i);
  const grosses = grossesLocales(v, exclus);
  const idsGrosses = new Set(grosses.map((g) => g.id));
  const P_ = exprimees.filter((c) => c.famille === 'posturale'),
    C_ = exprimees.filter((c) => c.famille === 'chainiste');
  // zones touchées hors grosses compensations locales (qui relèvent du profil biomécanique)
  const zonesTouchees = zones.filter((z) => z.items.some((i) => !idsGrosses.has(i.id)));
  const nz = zonesTouchees.length;
  const chainiste = C_.length > 0 && (nz >= SEUILS.plusieurs || !P_.length);
  const postural = P_.length > 0 && !(C_.length > 0 && nz >= SEUILS.plusieurs);
  const profils = [];
  if (grosses.length) profils.push('biomecanique');
  if (postural) profils.push('postural');
  if (chainiste) profils.push('chainiste');
  // chaîne dominante parmi les chaînes exprimées
  let dominante = null,
    ecart = null;
  if (exprimees.length) {
    ecart = exprimees.length > 1 ? exprimees[0].score - exprimees[1].score : exprimees[0].score;
    if (ecart >= SEUILS.ecartDominante) dominante = exprimees[0];
  }
  const entree = grosses.length ? entreeLocale(grosses, v, ctx) : null;
  const mots = { biomecanique: 'biomécanique', postural: 'postural', chainiste: 'chaîniste' };
  const libelle = profils.length ? profils.map((p) => mots[p]).join(' + ') : '';
  const vide =
    !zones.some((z) => z.niveau > 0) &&
    !Object.keys(v).some((k) => GLOBAUX.includes(k) && val(v, k));
  return {
    zones,
    nbZonesTouchees: nz,
    grosses,
    chaines,
    exprimees,
    dominante,
    ecartDominante: ecart,
    profils,
    libelle,
    entree,
    vide,
  };
}

// ── HTML (panneau et rapport) — textes échappés
const esc = (t) =>
  String(t == null ? '' : t).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const NOM_COTE = { D: 'droit', G: 'gauche' };
const LIB_ENTREE = {
  haute: 'Entrée haute — adaptations en chaîne descendante (moitié supérieure du corps)',
  basse: 'Entrée basse — adaptations en chaîne montante (moitié inférieure du corps)',
  mixte: 'Entrée mixte — origine à la fois haute et basse (haut d’un côté, bas de l’autre)',
};
const barre = (n) => '■'.repeat(n) + '□'.repeat(4 - n);
function ligneItem(i) {
  const c = PAR_ID[i.id];
  const mot = c ? (i.valeur < 0 ? c.fin[0] : c.fin[1]) || '' : '';
  return esc(i.label) + (mot ? ' (' + esc(mot) + ')' : '') + ' — niveau ' + i.niveau + '/4';
}
function htmlChaine(c, ouvert) {
  const trouves = c.signes.filter((s) => s.credit > 0);
  const manquants = c.signes.filter((s) => s.credit === 0);
  const coursHtml = c.cours
    .map(
      (x) =>
        '<li>' +
        esc(x[0]) +
        ' <span style="color:#64748b">(cours, diapo ' +
        esc(x[1]) +
        ')</span></li>'
    )
    .join('');
  const corps =
    '<div style="font-size:11px;line-height:1.45;margin-top:4px">' +
    '<div><b>Signes retrouvés sur le mannequin :</b> ' +
    (trouves.length ? esc(trouves.map((s) => s.txt).join(', ')) : 'aucun') +
    '</div>' +
    (manquants.length
      ? '<div style="color:#64748b"><b>Non retrouvés :</b> ' +
        esc(manquants.map((s) => s.txt).join(', ')) +
        '</div>'
      : '') +
    '<div style="margin-top:3px"><b>Rappel du cours :</b></div><ul style="margin:2px 0 0 16px;padding:0">' +
    coursHtml +
    '</ul></div>';
  const titre =
    '<b>' + esc(c.nom) + '</b> · score ' + c.score + ' %' + (c.exprimee ? '' : ' (non exprimée)');
  return ouvert
    ? '<div style="border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;margin:6px 0;break-inside:avoid"><div style="font-size:12px">' +
        titre +
        '</div>' +
        corps +
        '</div>'
    : '<details class="m3d-hyp"><summary>' + titre + '</summary>' + corps + '</details>';
}
export function htmlProfil(p, { ouvert = false, coche = false, retenu = false } = {}) {
  const case_ = coche
    ? '<label class="m3d-inc" style="font-size:12px;display:block;margin:6px 0"><input type="checkbox" data-profil="1"' +
      (retenu ? ' checked' : '') +
      '> <b>Inclure au rapport</b> le profil et la chaîne musculaire</label>'
    : '';
  const prudence =
    '<div style="font-size:10.5px;color:#7c2d12;background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;padding:6px 8px;margin:6px 0"><b>Aide à la réflexion clinique, pas un diagnostic.</b> Hypothèse à confirmer par l’examen clinique du praticien ; les côtés sont ceux du patient.</div>';
  const legende =
    '<div style="font-size:11px;color:#475569;margin:2px 0">Postural (global) : chaînes <b>' +
    APPELLATION_POSTURAL +
    '</b> · Chaîniste / neuromusculaire (régional) : chaînes <b>' +
    APPELLATION_CHAINISTE +
    '</b> · Biomécanique / viscéral : problème local.</div>';
  if (p.vide || (!p.profils.length && !p.exprimees.length)) {
    return (
      '<div class="m3d-prof"><h4 style="margin:0 0 4px;font-size:13px;color:#1e3a8a">🧬 Profil du patient et chaîne musculaire (hypothèse)</h4>' +
      prudence +
      legende +
      '<div style="font-size:12px;color:#475569">' +
      (p.vide
        ? 'Mannequin neutre : aucun écart saisi.'
        : 'Aucun profil net avec les écarts actuels (aucune chaîne exprimée, aucune grosse compensation locale).') +
      '</div>' +
      (p.vide ? '' : htmlZones(p)) +
      '</div>'
    );
  }
  const lib = p.profils.map((k) => PROFILS_LIBELLE[k]).join('  +  ');
  let h =
    '<div class="m3d-prof"><h4 style="margin:0 0 4px;font-size:13px;color:#1e3a8a">🧬 Profil du patient et chaîne musculaire (hypothèse)</h4>' +
    prudence +
    legende +
    case_;
  h +=
    '<div style="font-size:12.5px;margin:6px 0;padding:6px 8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px"><b>Profil proposé :</b> ' +
    esc(lib) +
    '</div>';
  if (p.exprimees.length) {
    h +=
      '<div style="font-size:12px;margin:6px 0 2px"><b>Chaîne' +
      (p.exprimees.length > 1 ? 's' : '') +
      ' exprimée' +
      (p.exprimees.length > 1 ? 's' : '') +
      '</b>';
    if (p.exprimees.length > 1)
      h +=
        ' — ' +
        (p.dominante
          ? 'dominante : <b>' +
            esc(p.dominante.nom) +
            '</b> (' +
            p.ecartDominante +
            ' points d’avance)'
          : 'plusieurs chaînes sans dominante nette (écart ' + p.ecartDominante + ' points)');
    h += '</div>' + p.exprimees.map((c) => htmlChaine(c, ouvert)).join('');
  } else
    h +=
      '<div style="font-size:12px;color:#475569;margin:6px 0">Aucune chaîne musculaire n’atteint le seuil d’expression.</div>';
  if (p.grosses.length) {
    h +=
      '<div style="font-size:12px;margin:8px 0 2px"><b>Compensations locales, importantes ou d’un seul côté (biomécanique / viscérale) :</b></div><ul style="margin:2px 0 2px 16px;padding:0;font-size:11.5px">';
    h += p.grosses
      .map(
        (g) =>
          '<li>' +
          ligneItem(g) +
          (g.cote ? ' — côté ' + NOM_COTE[g.cote] : '') +
          (g.id === 'tronc_incl'
            ? ' <span style="color:#64748b">(rétraction viscérale possible du même côté)</span>'
            : '') +
          '</li>'
      )
      .join('');
    h += '</ul>';
    if (p.entree && p.entree.type)
      h +=
        '<div style="font-size:12px;margin:4px 0"><b>' +
        esc(LIB_ENTREE[p.entree.type]) +
        '</b></div>';
    const ind = p.entree && p.entree.indices;
    if (ind) {
      const l = [];
      if (ind.visuel)
        l.push(
          'visuelle : axe des yeux incliné de ' +
            Math.abs(ind.visuel.angle) +
            '° (regard non horizontal)'
        );
      if (ind.vestibulaire)
        l.push(
          'vestibulaire : ' +
            ind.vestibulaire.curseurs.join(', ') +
            ' (tête, haut du corps ou corps entier latéralisé)'
        );
      if (ind.mandibulaire) l.push('mandibulaire : ' + ind.mandibulaire.curseurs.join(', '));
      if (l.length)
        h +=
          '<div style="font-size:11.5px;margin:2px 0"><b>Entrées hautes possibles :</b> ' +
          esc(l.join(' ; ')) +
          '.</div>';
    }
  }
  h += htmlZones(p) + '</div>';
  return h;
}
function htmlZones(p) {
  const t = p.zones.filter((z) => z.niveau > 0);
  if (!t.length) return '';
  return (
    '<details style="margin-top:6px;font-size:11px;color:#334155"><summary>Zones du corps touchées (' +
    t.length +
    ') — niveau 0 à 4</summary><ul style="margin:4px 0 0 16px;padding:0">' +
    t
      .map(
        (z) =>
          '<li><b>' +
          esc(z.label) +
          '</b> (' +
          (z.haut ? 'haut' : 'bas') +
          ') : ' +
          barre(z.niveau) +
          ' ' +
          z.niveau +
          '/4' +
          (z.cote ? ' — côté ' + NOM_COTE[z.cote] : '') +
          '<br><span style="color:#64748b">' +
          z.items.map(ligneItem).join(' ; ') +
          '</span></li>'
      )
      .join('') +
    '</ul></details>'
  );
}
// Rapport : seulement si le praticien a retenu le profil ; chaîne vide sinon
export function htmlProfilRapport(valeurs, retenu, ctx = {}) {
  if (!retenu) return '';
  const p = evaluerProfil(valeurs, ctx);
  if (p.vide) return '';
  return htmlProfil(p, { ouvert: true });
}
