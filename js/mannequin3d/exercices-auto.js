// Chantier B — exercices proposés automatiquement dans les circuits Express (fonctions pures, sans DOM).
// Règles dictées par le praticien le 30/10/2026 (voir documents/Chantier_B_regles_de_Joel_2026-10-30.md) :
// rien n'est inventé hors de ces règles ; la sélection est PROPOSÉE (aperçu), jamais appliquée d'office.
import { PAR_ID } from './parametres.js?v=v318';
import { evaluerProfil, niveauDe } from './chaines.js?v=v318';
import { calculerReprise } from './reprise-4vues.js?v=v318';

// ── Réflexes archaïques du bilan neuro-fonctionnel (id sans préfixe) → mot qui identifie la fiche du même nom
export const REFLEXES = {
  'ref-rpp': { nom: 'RPP', fiche: 'peur paralysante' },
  'ref-rtp': { nom: 'RTP', fiche: 'tendineux de protection' },
  'ref-moro': { nom: 'Moro', fiche: 'moro' },
  'ref-perez': { nom: 'Perez', fiche: 'perez' },
  'ref-landau': { nom: 'Landau', fiche: 'landau' },
  'ref-reptation': { nom: 'Reptation', fiche: 'reptation' },
  'ref-rtac': { nom: 'RTAC', fiche: 'asym[ée]trique du cou' },
  'ref-galant': { nom: 'Galant', fiche: 'galant' },
  'ref-babinski': { nom: 'Babinski', fiche: 'babinski' },
  'ref-plantaire': { nom: 'Plantaire', fiche: 'plantaire' },
  'ref-palmaire': { nom: 'Palmaire', fiche: 'palmaire' },
  'ref-babkin': { nom: 'Babkin', fiche: 'babkin' },
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
  if (!canaux.ant && !canaux.post && !canaux.lat)
    ajoute({
      cle: 'vest-utricules',
      groupe: 'neuro',
      cats: [{ code: 'systeme-vestibulaire', exo: 'utricule' }],
      raison: 'vestibulaire : aucun canal semi-circulaire coché → utricules',
    });
  else
    for (const [k, , lib, re] of CSC)
      if (canaux[k])
        ajoute({
          cle: 'vest-' + k,
          groupe: 'neuro',
          cats: [{ code: 'systeme-vestibulaire', exo: re.source }],
          raison: 'vestibulaire : ' + lib + ' coché',
        });

  // 2) Proprioception : une case ou plus de la section → « Stimulation du système proprioceptif »
  const propCoche = Object.keys(n).some((k) => /^prop-/.test(k) && n[k] && !/-n$/.test(k));
  if (propCoche)
    ajoute({
      cle: 'proprio',
      groupe: 'neuro',
      cats: [{ code: 'systeme-somesthesique', exo: 'proprioceptif' }],
      raison: 'proprioception : case(s) cochée(s) dans le bilan neuro-fonctionnel',
    });

  // 3) Réflexes archaïques cochés : une fiche du même nom par réflexe
  for (const [id, r] of Object.entries(REFLEXES))
    if (coche(n, id, COLS_REFLEXE))
      ajoute({
        cle: id,
        groupe: 'neuro',
        cats: [{ code: 'reflexes-archaiques', exo: r.fiche }],
        raison: 'réflexe archaïque ' + r.nom + ' coché',
      });

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
        cats: [{ code: 'reeduc-posturale', exo: 'ant[ée]rieur' }],
        raison: 'patient antériorisé = ligne postérieure de Myers' + dom,
      });
    else if (ch.id === 'grande_anterieure')
      ajoute({
        cle: 'myers-' + ch.id,
        groupe: 'chaine',
        cats: [{ code: 'reeduc-posturale', exo: 'post[ée]rieur' }],
        raison: 'patient postériorisé = ligne antérieure de Myers' + dom,
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

  // 6) Valgus / varus du pied : un exercice de « Rééducation du pied » préselectionné + programme du pied coché
  const pv = piedValgusVarus(v, c && c.analyseVues);
  let programmePied = null;
  if (pv.length) {
    const txt = pv.map((p) => p.sens + ' ' + COTE[p.cote] + ' (' + p.source + ')').join(', ');
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
      groupe: 'articulaire',
      cats: [{ code: 'reeduc-articulaire', exo: null }],
      sousVide: true,
      raison: 'profil biomécanique / organique / articulaire : choisissez l’exercice',
    });

  return { propositions: prop, programmePied, notes };
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
export function planifier(resolues, etat, catalogue, bilan, choix = {}, dest = {}) {
  const ecritures = [];
  const dejaPresentes = [];
  const nonPlacees = [];
  const occ = etat.map((l) => l.map((s) => (s && s.sys ? s : null)));
  const present = (sys, sub) =>
    occ.some((l) => l.some((s) => s && s.sys === sys && (!sub || s.sub === sub)));
  const subDe = (p) =>
    Object.prototype.hasOwnProperty.call(choix, p.cle) ? choix[p.cle] : p.defaut;
  const traitees = new Set();
  // 1) destinations choisies par le praticien (n'importe quel emplacement libre)
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
  // 2) les autres : emplacement 1 des lignes libres, dans l'ordre de priorité
  let l1 = 0;
  for (const p of resolues) {
    if (traitees.has(p.cle)) continue;
    const sub = subDe(p);
    if (sub ? present(p.sys, sub) : false) {
      dejaPresentes.push(p);
      continue;
    }
    while (l1 < 8 && occ[l1][0]) l1++;
    if (l1 >= 8) {
      nonPlacees.push({ ...p, sub });
      continue;
    }
    ecritures.push({ ligne: l1, slot: 0, sys: p.sys, sysLib: p.sysLib, sub, cle: p.cle });
    occ[l1][0] = { sys: p.sys, sub };
    l1++;
  }
  // 3) respiration en emplacement 2 de chaque ligne où il est libre
  for (let i = 0; i < 8; i++) {
    if (occ[i][1]) continue;
    const r = respirationPourLigne(i, catalogue, bilan);
    if (!r) continue;
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

export const LIBELLE_LIGNE = (i) =>
  i < 4 ? 'Express 1 — ex. ' + (i + 1) : 'Express 2 — ex. ' + (i - 3);
