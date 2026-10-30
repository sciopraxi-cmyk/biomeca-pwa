// Chantier B — exercices proposés automatiquement dans les circuits Express (fonctions pures, sans DOM).
// Règles dictées par le praticien le 30/10/2026 (voir documents/Chantier_B_regles_de_Joel_2026-10-30.md) :
// rien n'est inventé hors de ces règles ; la sélection est PROPOSÉE (aperçu), jamais appliquée d'office.
import { PAR_ID } from './parametres.js?v=v327';
import { evaluerProfil, niveauDe } from './chaines.js?v=v327';
import { calculerReprise } from './reprise-4vues.js?v=v327';

// ── Réflexes archaïques du bilan neuro-fonctionnel (id sans préfixe) → mot qui identifie la fiche du même nom
export const REFLEXES = {
  // ORDRE DE PRIORITÉ dicté par le praticien : d'abord RPP, MORO, RTP ; puis Babinski, plantaire, RTAC, Perez, Galant,
  // Landau, palmaire, Babkin, reptation (la fin de la liste = réflexes propres à la podopédiatrie)
  'ref-rpp': { nom: 'RPP', fiche: 'peur paralysante' },
  'ref-moro': { nom: 'Moro', fiche: 'moro' },
  'ref-rtp': { nom: 'RTP', fiche: 'tendineux de protection' },
  'ref-babinski': { nom: 'Babinski', fiche: 'babinski' },
  'ref-plantaire': { nom: 'Plantaire', fiche: 'plantaire' },
  'ref-rtac': { nom: 'RTAC', fiche: 'asym[ée]trique du cou' },
  'ref-perez': { nom: 'Perez', fiche: 'perez' },
  'ref-galant': { nom: 'Galant', fiche: 'galant' },
  'ref-landau': { nom: 'Landau', fiche: 'landau' },
  'ref-palmaire': { nom: 'Palmaire', fiche: 'palmaire' },
  'ref-babkin': { nom: 'Babkin', fiche: 'babkin' },
  'ref-reptation': { nom: 'Reptation', fiche: 'reptation' },
  'ref-succion': { nom: 'Succion', fiche: 'succion' },
  'ref-rtsc': { nom: 'RTSC', fiche: '(?<![aA])sym[ée]trique du cou' },
  'ref-tonique-labyrinthique': { nom: 'Tonique labyrinthique', fiche: 'labyrinthique' },
};
// Rang de priorité dans l'EMPLACEMENT 1 des 8 lignes (décision du 30/10) : chaîne musculaire, terrain aérien/terrien,
// réflexes archaïques, vestibule, nerfs crâniens (à venir), tronc cérébral (à venir) ; ensuite les autres règles.
// Visuel et mandibule (ATM) vont dans l'EMPLACEMENT 3.
export const RANG_GROUPE = {
  // « chaîne » (30/10) = chaîniste (flexion, extension, ouverture, fermeture, AP, PA) OU posturale (rééducation
  // posturale) OU biomécanique/organique/articulaire (rééducation articulaire)
  chaine: 0,
  terrain: 1,
  reflexe: 2,
  vestibule: 3, // dont NC8 vestibulo-cochléaire
  nerfs: 4, // NC11 accessoire
  tronc: 5, // tronc cérébral (13)
  proprio: 6,
  pied: 7,
  // emplacement 3 : visuel, mandibule (ATM) et nerfs crâniens 1-7, 9, 10, 12
  slot3: 9,
};
// Quand il y a plus de propositions « emplacement 1 » que de lignes libres, on garde d'abord les plus PRIORITAIRES (ordre de
// sélection ci-dessous) ; les lignes sont ensuite remplies dans l'ordre d'affichage (RANG_GROUPE). Le tronc cérébral et le
// vestibulaire passent avant les réflexes : le dernier réflexe (4e…) est alors proposé en EMPLACEMENT 3 (décision du 30/10).
export const RANG_SELECTION = {
  chaine: 0,
  terrain: 1,
  vestibule: 2,
  tronc: 3,
  nerfs: 4,
  reflexe: 5,
  proprio: 6,
  pied: 7,
};
// Nerfs crâniens (NC1…NC12) : catégories d'exercices créées le 30/10/2026. Emplacement 3 sauf NC8, NC11 (et tronc cérébral)
// qui vont en emplacement 1. Déclencheur : une case « gauche » ou « droite » cochée dans le tableau des nerfs crâniens.
export const NERFS = [
  { k: 1, code: 'nc1-olfactif', nom: 'NC1 olfactif', slot3: true },
  { k: 2, code: 'nc2-optique', nom: 'NC2 optique', slot3: true },
  { k: 3, code: 'nc3-oculomoteur', nom: 'NC3 oculomoteur', slot3: true },
  { k: 4, code: 'nc4-trochleaire', nom: 'NC4 trochléaire', slot3: true },
  { k: 5, code: 'nc5-trijumeau', nom: 'NC5 trijumeau', slot3: true },
  { k: 6, code: 'nc6-abducens', nom: 'NC6 abducens', slot3: true },
  { k: 7, code: 'nc7-facial', nom: 'NC7 facial', slot3: true },
  {
    k: 8,
    code: 'nc8-vestibulo-cochleaire',
    nom: 'NC8 vestibulo-cochléaire',
    slot3: false,
    groupe: 'vestibule',
  },
  { k: 9, code: 'nc9-glosso-pharyngien', nom: 'NC9 glosso-pharyngien', slot3: true },
  { k: 10, code: 'nc10-vague', nom: 'NC10 vague', slot3: true },
  { k: 11, code: 'nc11-accessoire', nom: 'NC11 accessoire', slot3: false, groupe: 'nerfs' },
  { k: 12, code: 'nc12-hypoglosse', nom: 'NC12 hypoglosse', slot3: true },
];

// réflexes cochés sans fiche dans la bibliothèque : listés « sans fiche », jamais inventés
export const REFLEXES_SANS_FICHE = {
  'ref-allongement-croise': 'allongement croisé',
  'ref-optocinetique': 'optocinétique',
  'ref-parachute': 'parachute',
};
const COLS_REFLEXE = ['o', 'g', 'd']; // « n » = normal : pas un réflexe à rééduquer

// Chaînes de Busquet / GDS → catégorie d'exercices (la base les a découpées ; l'ancienne liste de secours les regroupe)
const CHAINE_CATEGORIE = {
  flexion_AM: { code: 'chaine-flexion', ancien: ['reeduc-chaines', 'flexion'] },
  extension_PM: { code: 'chaine-extension', ancien: ['reeduc-chaines', 'extension'] },
  fermeture_AL: { code: 'chaine-fermeture', ancien: ['reeduc-chaines', 'fermeture'] },
  ouverture_PL: { code: 'chaine-ouverture', ancien: ['reeduc-chaines', 'ouverture'] },
  AP: { code: 'chaine-statique-expiration', ancien: ['reeduc-chaines', 'statique en expi'] },
  PA: { code: 'chaine-statique-inspiration', ancien: ['reeduc-chaines', 'statique en inspi'] },
};
const COTE = { D: 'droit', G: 'gauche' };

const coche = (c, id, cols) => cols.some((k) => !!(c && c[id + '-' + k]));

/**
 * Valgus / varus du pied : mannequin 3D (curseurs pied_valgus_D/G) ET captures 4 vues (angle calcanéen dos).
 * @returns {{cote:string, sens:'valgus'|'varus', source:string}[]}
 */
export function piedValgusVarus(valeurs, analyseVues) {
  const out = [];
  const vus = new Set();
  const poser = (cote, x, source) => {
    const cle = cote + (x > 0 ? 'valgus' : 'varus');
    if (vus.has(cle)) return;
    vus.add(cle);
    out.push({ cote, sens: x > 0 ? 'valgus' : 'varus', source });
  };
  for (const cote of ['D', 'G']) {
    const x = Number(valeurs && valeurs['pied_valgus_' + cote]) || 0;
    if (
      x &&
      PAR_ID['pied_valgus_' + cote] &&
      niveauDe('pied_valgus_' + cote, x, x > 0 ? 1 : -1) > 0
    )
      poser(cote, x, 'mannequin 3D');
  }
  const r = calculerReprise(analyseVues || null);
  for (const p of r.propositions)
    if (/^pied_valgus_[DG]$/.test(p.id)) poser(p.id.slice(-1), p.valeur, 'captures 4 vues');
  return out;
}

/**
 * @param {object} c
 *  - bilan: 'sport' | 'posturo'
 *  - valeurs: valeurs des curseurs du mannequin (ou null)
 *  - analyseVues: bilan._postureAnalysis (ou null)
 *  - neuro: objet plat { 'vest-ant-g': true, 'ref-moro-o': true, … } (cases du bilan neuro-fonctionnel, sans préfixe)
 *  - canauxVestibulaire: { ant, lat, post } cases de la section vestibulaire dédiée (posturo), facultatif
 *  - terrain: 'aerien' | 'terrien' | null
 * @returns {{propositions: object[], programmePied: object|null, notes: string[]}}
 */
export function proposerExercices(c) {
  const n = (c && c.neuro) || {};
  const prop = [];
  const notes = [];
  const ajoute = (p) => {
    if (!prop.some((x) => x.cle === p.cle)) prop.push(p);
  };

  // 1) Vestibulaire : aucun canal coché → utricules ; sinon l'exercice du canal (antérieur / postérieur / latéral)
  const cv = (c && c.canauxVestibulaire) || {};
  const canaux = {
    ant: coche(n, 'vest-ant', ['g', 'd']) || !!cv.ant,
    post: coche(n, 'vest-post', ['g', 'd']) || !!cv.post,
    lat: coche(n, 'vest-lat', ['g', 'd']) || !!cv.lat,
  };
  const CSC = [
    ['ant', 'canal antérieur', 'canal semi-circulaire antérieur', /canal ant[ée]rieur/],
    ['post', 'canal postérieur', 'canal semi-circulaire postérieur', /canal post[ée]rieur/],
    [
      'lat',
      'canal latéral',
      'canal semi-circulaire latéral',
      /canal semi circulaire lat[ée]ral|canal lat[ée]ral/,
    ],
  ];
  // la podopédiatrie n'a ni section vestibulaire ni neuro-fonctionnel : aucune proposition vestibulaire ni proprioceptive
  const podo = !!(c && c.bilan === 'podo');
  if (podo) {
    /* pas de données vestibulaires dans ce bilan */
  } else if (!canaux.ant && !canaux.post && !canaux.lat) {
    // « utricules » seulement si le bilan contient au moins une donnée vestibulaire (case du tableau vestibulaire, même
    // « normal », ou renseignement de la section dédiée) : une section vide ne propose rien (décision du 30/10)
    const donneeVest =
      Object.keys(n).some((k) => /^vest-/.test(k) && n[k]) || !!(c && c.vestibulaireRenseigne);
    if (donneeVest)
      ajoute({
        cle: 'vest-utricules',
        groupe: 'vestibule',
        cats: [
          { code: 'nc8-vestibulo-cochleaire', exo: 'utricule' },
          { code: 'systeme-vestibulaire', exo: 'utricule' },
        ],
        raison: 'vestibulaire : aucun canal semi-circulaire coché → utricules',
      });
  } else
    for (const [k, , lib, re] of CSC)
      if (canaux[k])
        ajoute({
          cle: 'vest-' + k,
          groupe: 'vestibule',
          cats: [
            { code: 'nc8-vestibulo-cochleaire', exo: re.source },
            { code: 'systeme-vestibulaire', exo: re.source },
          ],
          raison: 'vestibulaire : ' + lib + ' coché',
        });

  // 2) Proprioception : une case ou plus de la section → « Stimulation du système proprioceptif »
  const propCoche = Object.keys(n).some((k) => /^prop-/.test(k) && n[k] && !/-n$/.test(k));
  if (propCoche && !podo)
    ajoute({
      cle: 'proprio',
      groupe: 'proprio',
      cats: [{ code: 'systeme-somesthesique', exo: 'proprioceptif' }],
      raison: 'proprioception : case(s) cochée(s) dans le bilan neuro-fonctionnel',
    });

  // 3) Réflexes archaïques cochés : une fiche du même nom par réflexe
  for (const [id, r] of Object.entries(REFLEXES))
    if (coche(n, id, COLS_REFLEXE))
      ajoute({
        cle: id,
        groupe: 'reflexe',
        cats: [{ code: 'reflexes-archaiques', exo: r.fiche }],
        raison: 'réflexe archaïque ' + r.nom + ' coché',
      });

  const sansFiche = [];
  for (const [id, nom] of Object.entries(REFLEXES_SANS_FICHE))
    if (coche(n, id, COLS_REFLEXE))
      sansFiche.push('réflexe ' + nom + ' coché : aucune fiche d’exercice dans la bibliothèque');
  if (sansFiche.length) notes.push(...sansFiche);

  // 4) Chaînes (profil du mannequin) : Myers (posturales) puis Busquet / GDS (chaînistes)
  const v = (c && c.valeurs) || null;
  const profil = v ? evaluerProfil(v) : null;
  const exprimees = profil ? profil.exprimees : [];
  for (const ch of exprimees) {
    const dom = profil.dominante && profil.dominante.id === ch.id ? ' (dominante)' : '';
    if (ch.id === 'grande_posterieure')
      ajoute({
        cle: 'myers-' + ch.id,
        groupe: 'chaine',
        cats: [{ code: 'reeduc-posturale', exo: 'post[ée]rieur' }],
        raison: 'patient antériorisé = ligne postérieure de Myers → étirement postérieur' + dom,
      });
    else if (ch.id === 'grande_anterieure')
      ajoute({
        cle: 'myers-' + ch.id,
        groupe: 'chaine',
        cats: [{ code: 'reeduc-posturale', exo: 'ant[ée]rieur' }],
        raison: 'patient postériorisé = ligne antérieure de Myers → étirement antérieur' + dom,
      });
    else if (/^ligne_laterale_/.test(ch.id))
      ajoute({
        cle: 'myers-laterale',
        groupe: 'chaine',
        cats: [{ code: 'reeduc-posturale', exo: 'lat[ée]ral' }],
        raison:
          'patient latéralisé (charge du corps) = ligne latérale ' +
          (ch.id.endsWith('_D') ? 'droite' : 'gauche') +
          ' de Myers → étirement latéral' +
          dom,
      });
    else if (CHAINE_CATEGORIE[ch.id]) {
      const m = CHAINE_CATEGORIE[ch.id];
      ajoute({
        cle: 'chaine-' + ch.id,
        groupe: 'chaine',
        cats: [
          { code: m.code, exo: null },
          { code: m.ancien[0], exo: m.ancien[1] },
        ],
        raison: 'chaîne exprimée : ' + ch.nom.split(' = ')[0] + dom,
      });
    }
  }
  if (!v) notes.push('Mannequin 3D non rempli : aucune chaîne à proposer.');

  // 5) Terrain aérien / terrien (posturo : préférences motrices ; sport : synthèse terrain)
  if (c && (c.terrain === 'aerien' || c.terrain === 'terrien'))
    ajoute({
      cle: 'terrain-' + c.terrain,
      groupe: 'terrain',
      cats: [
        { code: 'terrain-' + c.terrain, exo: null },
        { code: 'reeduc-terrain', exo: c.terrain === 'aerien' ? 'a[ée]rien' : 'terrien' },
      ],
      raison: 'terrain ' + (c.terrain === 'aerien' ? 'aérien' : 'terrien'),
    });

  // Totaux de la colonne « nerfs crâniens » du tableau neuro-fonctionnel (mêmes cases que les totaux affichés, dont la
  // recapillarisation) : le côté qui a le plus de cases cochées donne le tronc cérébral (« TC droit » / « TC gauche »).
  const NC_IDS = ['nc-recap', ...NERFS.map((x) => 'nc-nc' + x.k)];
  const totG = NC_IDS.filter((id) => !!n[id + '-g']).length;
  const totD = NC_IDS.filter((id) => !!n[id + '-d']).length;
  const patG = !!n['apd-tronc-g'];
  const patD = !!n['apd-tronc-d'];
  const hypoTC = !!n['po-hypo-tronc'] || !!n['hypo-tronc'] || !!(c && c.hypoTronc);
  // côté du tronc cérébral : total des nerfs crâniens, à défaut côté du pattern ; sinon (égalité) le praticien choisit
  let coteTC = totD > totG ? 'D' : totG > totD ? 'G' : null;
  let origineTC = coteTC
    ? 'total des nerfs crâniens plus important à ' +
      (coteTC === 'D' ? 'droite' : 'gauche') +
      ' (' +
      Math.max(totD, totG) +
      ' contre ' +
      Math.min(totD, totG) +
      ')'
    : '';
  if (!coteTC && patD !== patG) {
    coteTC = patD ? 'D' : 'G';
    origineTC = 'pattern tronc cérébral coché à ' + (patD ? 'droite' : 'gauche');
  }
  const cs = coteTC ? coteTC.toLowerCase() : null;
  // Nerfs crâniens : une case cochée → catégorie du nerf (le praticien choisit l'exercice parmi ceux du nerf).
  // Si le tronc cérébral est « droit », SEULS les nerfs cochés à DROITE sont proposés (idem à gauche) ; à égalité, tous.
  // Les nerfs qui vont normalement en emplacement 3 peuvent DÉBORDER dans l'emplacement 1 quand il reste des lignes libres
  // (les 8 premiers emplacements doivent être remplis).
  if (!podo)
    for (const nc of NERFS) {
      const id = 'nc-nc' + nc.k;
      if (!coche(n, id, cs ? [cs] : ['g', 'd'])) continue;
      const cote =
        n[id + '-d'] && n[id + '-g'] ? 'les deux côtés' : n[id + '-d'] ? 'droit' : 'gauche';
      ajoute({
        cle: 'nc-' + nc.k,
        groupe: nc.groupe || 'slot3',
        slot3: nc.slot3,
        debordable: nc.slot3,
        ordre: nc.k,
        cats: [{ code: nc.code, exo: null }],
        sousVide: true,
        raison: nc.nom + ' (' + cote + ') : case cochée dans le tableau des nerfs crâniens',
      });
    }
  // Tronc cérébral : proposé dès qu'un nerf crânien est coché (ou pattern / hypothèse tronc cérébral). Emplacement 1.
  if (!podo && (totG + totD > 0 || patG || patD || hypoTC))
    ajoute({
      cle: 'tronc-cerebral',
      groupe: 'tronc',
      cats: [
        {
          code: 'tronc-cerebral',
          exo: coteTC ? 'TC ' + (coteTC === 'D' ? 'droit' : 'gauche') : null,
        },
      ],
      sousVide: !coteTC,
      raison: coteTC
        ? 'tronc cérébral ' + (coteTC === 'D' ? 'droit' : 'gauche') + ' : ' + origineTC
        : 'tronc cérébral : nerfs crâniens ou pattern cochés des deux côtés (à égalité) — choisissez le côté',
    });
  // Exercice visuel (« au niveau des yeux ») : règles propres à chaque bilan, motif = ce qui est coché ; emplacement 3
  if (c && Array.isArray(c.visuel) && c.visuel.length)
    ajoute({
      cle: 'visuel',
      groupe: 'slot3',
      slot3: true,
      cats: [{ code: 'systeme-visuel', exo: null }],
      sousVide: true,
      raison: 'visuel : ' + c.visuel.join(', '),
    });

  // Mandibule / ATM cochée dans le bilan (buccal) : exercice de la mâchoire, EMPLACEMENT 3
  if (c && Array.isArray(c.atm) && c.atm.length)
    ajoute({
      cle: 'mandibule',
      groupe: 'slot3',
      slot3: true,
      cats: [{ code: 'systeme-mandibulaire', exo: null }],
      raison: 'mandibule / ATM : ' + c.atm.join(', '),
    });

  // 6) Valgus / varus du pied : un exercice de « Rééducation du pied » préselectionné + programme du pied coché
  const pv = piedValgusVarus(v, c && c.analyseVues);
  for (const x of (c && c.pieds) || [])
    if (!pv.some((y) => y.cote === x.cote && y.sens === x.sens)) pv.push(x);
  let programmePied = null;
  if (pv.length) {
    const txt = pv
      .map((p) => p.sens + (p.sansCote ? '' : ' ' + COTE[p.cote]) + ' (' + p.source + ')')
      .join(', ');
    ajoute({
      cle: 'pied',
      groupe: 'pied',
      cats: [{ code: 'reeduc-pied', exo: null }],
      premier: true,
      raison: 'pied : ' + txt,
    });
    programmePied = { raison: 'pied : ' + txt };
  }

  // 7) Profil biomécanique / organique / articulaire : catégorie « Rééducation articulaire » présélectionnée (posturo)
  if (profil && profil.profils.includes('biomecanique'))
    ajoute({
      cle: 'articulaire',
      groupe: 'chaine',
      cats: [{ code: 'reeduc-articulaire', exo: null }],
      sousVide: true,
      raison: 'profil biomécanique / organique / articulaire : choisissez l’exercice',
    });

  // NC8 (nerf vestibulo-cochléaire) et canaux semi-circulaires = la même catégorie d'exercices : quand le bilan désigne un canal
  // (ou un exercice vestibulaire précis), c'est CET exercice qui prime (décision du 30/10) ; la proposition générique « NC8 » disparaît
  const vestPrecis = prop.filter((p) => /^vest-/.test(p.cle));
  if (vestPrecis.length) {
    const i8 = prop.findIndex((p) => p.cle === 'nc-8');
    if (i8 >= 0) {
      prop.splice(i8, 1);
      for (const v of vestPrecis)
        v.raison += ' (NC8 coché : cet exercice prime sur la proposition générale du nerf 8)';
    }
  }
  const rang = (p) => (RANG_GROUPE[p.groupe] == null ? 99 : RANG_GROUPE[p.groupe]);
  const triees = prop
    .map((p, i) => [p, i])
    .sort((x, y) => rang(x[0]) - rang(y[0]) || (x[0].ordre || 0) - (y[0].ordre || 0) || x[1] - y[1])
    .map((x) => x[0]);
  return { propositions: triees, programmePied, notes };
}

// ── Résolution d'une proposition dans la liste réelle de catégories du bilan (libellés, pas de codes devinés)
// catalogue : [{ value, label, subs: [{ value, label }] }]
export function resoudre(p, catalogue) {
  for (const alt of p.cats) {
    const cat = (catalogue || []).find((x) => x.value === alt.code);
    if (!cat) continue;
    const re = alt.exo ? new RegExp(alt.exo, 'i') : null;
    const subs = cat.subs || [];
    const trouves = re ? subs.filter((s) => re.test(s.label)) : subs;
    if (re && !trouves.length) continue;
    const candidats = re ? trouves : subs;
    return {
      ...p,
      sys: cat.value,
      sysLib: cat.label,
      candidats,
      // exercice par défaut : le seul qui correspond, ou le premier (pied) ; vide si le praticien doit choisir
      defaut: p.sousVide
        ? ''
        : candidats.length === 1 || (candidats.length && (re || p.premier))
          ? candidats[0].value
          : '',
    };
  }
  return null;
}

/** Exercice de respiration d'une ligne (0 à 7) : « Faim d'air » et « Respiration pour le stress » en alternance. */
export function respirationPourLigne(ligne, catalogue, bilan) {
  const cat = (catalogue || []).find(
    (x) => x.value === (bilan === 'sport' ? 'respi-sport' : 'respi-posture')
  );
  if (!cat) return null;
  const re = ligne % 2 === 0 ? /faim d.air/i : /stress/i;
  const s = (cat.subs || []).find((x) => re.test(x.label));
  return s ? { sys: cat.value, sysLib: cat.label, sub: s.value, subLib: s.label } : null;
}

/**
 * Plan d'écriture dans les 8 lignes Express (lignes 0-3 = Express 1, 4-7 = Express 2).
 * @param {object[]} resolues   propositions résolues et cochées, dans l'ordre de priorité
 * @param {Array<Array<{sys:string,sub:string}|null>>} etat  8 lignes × 3 emplacements (null = vide)
 * Règles : emplacement 1 = exercice principal du bilan (lignes libres dans l'ordre) ; emplacement 2 = respiration ;
 * l'emplacement 3 n'est jamais rempli d'office. Rien d'existant n'est écrasé ; un exercice déjà présent n'est pas dupliqué.
 */
export function planifier(resolues, etat, catalogue, bilan, choix = {}, dest = {}, options = {}) {
  const ecritures = [];
  const dejaPresentes = [];
  const nonPlacees = [];
  const occ = etat.map((l) => l.map((s) => (s && s.sys ? s : null)));
  const present = (sys, sub) =>
    occ.some((l) => l.some((s) => s && s.sys === sys && (!sub || s.sub === sub)));
  const subDe = (p) =>
    Object.prototype.hasOwnProperty.call(choix, p.cle) ? choix[p.cle] : p.defaut;
  const traitees = new Set();
  // 1) destinations choisies par le praticien : chaque emplacement ne sert qu'UNE fois (premier choix retenu)
  for (const p of resolues) {
    const d = dest[p.cle];
    if (!d) continue;
    const sub = subDe(p);
    traitees.add(p.cle);
    if (sub ? present(p.sys, sub) : false) {
      dejaPresentes.push(p);
      continue;
    }
    if (!(d.ligne >= 0 && d.ligne < 8 && d.slot >= 0 && d.slot < 3) || occ[d.ligne][d.slot]) {
      nonPlacees.push({ ...p, sub });
      continue;
    }
    ecritures.push({ ligne: d.ligne, slot: d.slot, sys: p.sys, sysLib: p.sysLib, sub, cle: p.cle });
    occ[d.ligne][d.slot] = { sys: p.sys, sub };
  }
  // 2) les autres. Emplacement 1 des lignes libres, dans l'ordre de priorité, jusqu'à remplir les 8 premiers emplacements :
  //    d'abord les propositions « emplacement 1 » ; ensuite, s'il reste des lignes libres, les nerfs crâniens qui vont
  //    normalement en emplacement 3 (« débordement ») ; le reste, et le visuel / la mandibule, vont en emplacement 3.
  const place = (p, slot) => {
    const sub = subDe(p);
    if (sub ? present(p.sys, sub) : false) {
      dejaPresentes.push(p);
      return true;
    }
    let l = 0;
    while (l < 8 && occ[l][slot]) l++;
    if (l >= 8) return false;
    ecritures.push({
      ligne: l,
      slot,
      sys: p.sys,
      sysLib: p.sysLib,
      sub,
      cle: p.cle,
      deborde: slot === 0 && !!p.slot3,
    });
    occ[l][slot] = { sys: p.sys, sub };
    return true;
  };
  const restantes = resolues.filter((p) => !traitees.has(p.cle));
  const naturelles = restantes.filter((x) => !x.slot3);
  const libresSlot1 = occ.filter((l) => !l[0]).length;
  // sélection : les plus prioritaires gardent l'emplacement 1 ; les autres passent en emplacement 3 (jamais perdues)
  const parPriorite = naturelles
    .map((p, i) => [p, i])
    .sort(
      (a, b) =>
        (RANG_SELECTION[a[0].groupe] ?? 99) - (RANG_SELECTION[b[0].groupe] ?? 99) || a[1] - b[1]
    )
    .map((x) => x[0]);
  const gardees = new Set(
    parPriorite.slice(0, Math.max(0, libresSlot1 + dejaPresentesSlot1(naturelles, subDe, present)))
  );
  const aPlacer3 = [];
  for (const p of naturelles) {
    if (gardees.has(p)) {
      if (!place(p, 0)) aPlacer3.push(p);
    } else aPlacer3.push(p);
  }
  for (const p of restantes.filter((x) => x.slot3)) {
    const libre1 = occ.some((l) => !l[0]);
    if (p.debordable && libre1) {
      if (!place(p, 0)) aPlacer3.push(p);
    } else aPlacer3.push(p);
  }
  for (const p of aPlacer3) if (!place(p, 2)) nonPlacees.push({ ...p, sub: subDe(p) });
  // 3) respiration en emplacement 2 de chaque ligne où il est libre
  if (options.respi !== false)
    for (let i = 0; i < 8; i++) {
      if (occ[i][1]) continue;
      const r = respirationPourLigne(i, catalogue, bilan);
      if (!r) continue;
      // jamais deux exercices de respiration dans la même ligne (même catégorie déjà présente dans un emplacement)
      if (occ[i].some((x) => x && x.sys === r.sys)) continue;
      ecritures.push({
        ligne: i,
        slot: 1,
        sys: r.sys,
        sysLib: r.sysLib,
        sub: r.sub,
        subLib: r.subLib,
        cle: 'respiration',
      });
      occ[i][1] = { sys: r.sys, sub: r.sub };
    }
  const libres = [];
  for (let i = 0; i < 8; i++)
    for (let s = 0; s < 3; s++) if (!occ[i][s]) libres.push({ ligne: i, slot: s });
  return { ecritures, dejaPresentes, nonPlacees, libres };
}

// nombre de propositions « emplacement 1 » déjà présentes dans les circuits (elles ne prennent pas de ligne)
function dejaPresentesSlot1(naturelles, subDe, present) {
  return naturelles.filter((p) => {
    const sub = subDe(p);
    return sub ? present(p.sys, sub) : false;
  }).length;
}
export const LIBELLE_LIGNE = (i) =>
  i < 4 ? 'Express 1 — ex. ' + (i + 1) : 'Express 2 — ex. ' + (i - 3);

// ── Programmes de réathlétisation (chantier B, lot 4) : cases « Programme du patient », cochées d'après les TEXTES du bilan ──
// `cle` = suffixe de la case `{pref}-prog-pat-{cle}` ; `code` = code de la fiche dans la bibliothèque (catégorie|libellé).
export const PATHOLOGIES = [
  {
    cle: 'bit',
    label: 'Syndrome de la bandelette ilio-tibiale',
    code: "pathologies-genou|1. Programme de réathlétisation d'un syndrome de la bandelette ilio tibiale",
    re: /bandelette\s+ilio[\s-]*tibiale|essuie[\s-]*glace/,
  },
  {
    cle: 'fp',
    label: 'Syndrome fémoro-patellaire',
    code: "pathologies-genou|2. Programme de réathlétisation d'un syndrome fémoro-patellaire",
    re: /femoro[\s-]*patellaire/,
  },
  {
    cle: 'pubalgie',
    label: 'Pubalgie',
    code: "pathologies-hanche|1. Programme de réathlétisation d'une pubalgie",
    re: /pubalgie/,
  },
  {
    cle: 'piriforme',
    label: 'Syndrome du piriforme',
    code: "pathologies-hanche|2. Programme de réathlétisation d'un syndrome du piriforme",
    re: /piriforme|piriformis|syndrome\s+(du\s+)?(muscle\s+)?pyramidal/,
  },
  {
    cle: 'fessier',
    label: 'Tendinopathie du moyen fessier',
    code: "pathologies-hanche|3. Programme de réathlétisation d'une tendinopathie du moyen fessier",
    re: /(tendinopath\w*|tendinite|tendinose)[^.;\n]{0,30}(moyen\s+fessier|moyen\s+glute\w*|glute\w*\s+moyen|gluteal\w*)|(moyen\s+fessier|moyen\s+glute\w*)[^.;\n]{0,15}(tendinopath\w*|tendinite|tendinose)/,
  },
  {
    cle: 'achille',
    label: "Tendinopathie d'Achille",
    code: "pathologies-pied|1. Programme de réathlétisation d'une tendinopathie d'Achille",
    re: /(tendinopath\w*|tendinite|tendinose|peritenonite)[^.;\n]{0,30}achill\w*|achill\w*[^.;\n]{0,12}(tendinopath\w*|tendinite|tendinose)/,
  },
  {
    cle: 'fibulaires',
    label: 'Tendinopathie des fibulaires',
    code: "pathologies-pied|2. Programme de réathlétisation d'une tendinopathie des fibulaires",
    re: /(tendinopath\w*|tendinite|tendinose)[^.;\n]{0,30}(fibulaire\w*|peronier\w*|peroneus|peroneaux)|(fibulaires?|peroniers?)[^.;\n]{0,15}(tendinopath\w*|tendinite|tendinose)/,
  },
];
const _sansAccent = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019\u2018`]/g, "'")
    .toLowerCase();
const _NEGATION =
  /\b(pas\s+d[e']|pas\s+de|aucun\w*|sans|absence|absent\w*|ni|non|exclu\w*|eliminer?|ecart\w*)\b/;
/**
 * Cherche les termes de pathologie dans tous les textes du bilan (anamnèse, motif, diagnostic, conclusion, texte libre).
 * Variantes courantes acceptées (accents, majuscules, tendinite/tendinopathie, achilléenne, péroniers…). Une phrase qui nie
 * la pathologie (« pas de tendinopathie d'Achille ») ne coche rien. Renvoie [{ cle, label, code, raison }], une par programme,
 * avec la PHRASE trouvée comme raison (le praticien décoche s'il n'est pas d'accord).
 */
export function detecterPathologies(textes) {
  const trouvees = new Map();
  for (const brut of Array.isArray(textes) ? textes : []) {
    if (typeof brut !== 'string' || !brut.trim() || brut.length > 20000) continue;
    for (const phrase of brut.split(/(?<=[.!?])\s+|\n+|;/)) {
      const n = _sansAccent(phrase);
      if (!n.trim()) continue;
      for (const pa of PATHOLOGIES) {
        if (trouvees.has(pa.cle)) continue;
        const m = pa.re.exec(n);
        if (!m) continue;
        if (_NEGATION.test(n.slice(Math.max(0, m.index - 40), m.index))) continue;
        const raison = phrase.trim().replace(/\s+/g, ' ');
        trouvees.set(pa.cle, {
          cle: pa.cle,
          label: pa.label,
          code: pa.code,
          raison: '« ' + (raison.length > 160 ? raison.slice(0, 157) + '…' : raison) + ' »',
        });
      }
    }
  }
  return PATHOLOGIES.filter((pa) => trouvees.has(pa.cle)).map((pa) => trouvees.get(pa.cle));
}
