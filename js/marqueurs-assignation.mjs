// ═══════════════════════════════════════════════════════════════════
// #272 étage B — assignation des taches détectées aux marqueurs
// ═══════════════════════════════════════════════════════════════════
//
// HORS DU FLUX DE PRODUCTION. Ce module n'est appelé par rien : il est écrit
// et éprouvé seul, parce qu'il est le seul étage du chantier #272 pour lequel
// on dispose de DONNÉES RÉELLES. Les étages A (acquisition multi-échelle),
// C (verrou manuel) et D (suivi) viendront après.
//
// CE QU'IL FAIT, ET CE QU'IL REFUSE DE FAIRE
// Il reçoit une liste de taches lumineuses et décide lesquelles sont les
// marqueurs. Il DOIT pouvoir rendre null : une assignation partielle produit
// un angle faux qui a l'air normal, et c'est pire que pas d'angle du tout.
// Sur un outil clinique, refuser en s'expliquant vaut mieux que deviner.
//
// AUCUNE CONSTANTE EN PIXELS. Le praticien ne maîtrise ni la taille de ses
// pastilles (8 ou 10 mm selon le fournisseur), ni la distance de sa caméra,
// ni son modèle. Toute tolérance est donc relative à la configuration trouvée
// — jamais à la largeur de l'image, qui n'est d'ailleurs pas un paramètre de
// cette fonction : elle ne peut pas être tentée de s'en servir.
//
// LA RÉGULARITÉ EST UN MOTIF DE REJET, pas de récompense. C'est l'inverse du
// contrôle en place aujourd'hui. Mesuré sur l'image réelle du praticien : les
// deux arêtes du montant de tapis donnent onze et dix points alignés, et le
// contrôle actuel les accepte — leurs écarts sont réguliers — tandis qu'il
// refuse l'anatomie, dont les écarts ne le sont pas. Aucune anatomie ne
// produit onze points alignés à pas constant ; un objet manufacturé, si.
//
// MAIS LA COLINÉARITÉ SEULE NE DISCRIMINE RIEN À TROIS POINTS. Mesuré sur les
// mêmes données : les trois marqueurs du côté G sont ALIGNÉS PLUS FINEMENT
// (résidu 0,09 px) que l'arête du tapis (1,55 px). Trois points sont presque
// toujours proches d'une droite. Ce n'est donc pas l'alignement qui trahit
// l'objet manufacturé, c'est LE NOMBRE de points alignés — d'où le seuil à
// cinq ci-dessous, et non à trois.

/** @typedef {{x:number, y:number, size?:number}} Tache */

// Nombre de marqueurs attendus par côté, par type de test. Dérivé du
// catalogue de js/biomeca.js ; `mla` n'a pas de latéralité et sort par null.
const ATTENDUS_PAR_COTE = {
  'genou-bi': 3,
  'ap-bi': 4,
};

// Une série est jugée manufacturée à partir de CINQ points alignés. En
// dessous, l'alignement n'est pas un signal (cf. en-tête).
const SERIE_MIN_POINTS = 5;
// Résidu maximal à la droite, rapporté à l'étendue verticale de la série.
// Mesuré sur les données réelles : arêtes de tapis à 0,0036 et 0,0262 ;
// groupe épars non aligné à 0,1397. Le seuil sépare les deux familles.
const SERIE_RESIDU_REL = 0.03;

// Écart latéral maximal d'un marqueur à l'axe de sa colonne, rapporté à la
// HAUTEUR de la colonne. C'est une propriété des membres, pas un réglage :
// des marqueurs posés le long d'une jambe s'écartent peu de son axe.
//
// POURQUOI CE CRITÈRE ET PAS UN ÉCART ENTRE ABSCISSES VOISINES. Mesuré sur
// l'image réelle, après retrait des séries : les écarts INTERNES aux jambes
// montent à 15 px, un parasite se présente à 39 px, et les deux jambes sont
// séparées de 184 px. Aucun seuil sur l'écart brut ne sépare 15 de 39 sans
// être choisi pour ces données-là — trois fois la médiane globale donne 45
// et avale le parasite, trois fois la médiane basse donne 9 et coupe la
// jambe D en deux. Rapporté à la hauteur, en revanche, le parasite est à
// 40,5/470 = 0,086 quand les vraies jambes sont à 0,036 et 0,015.
const COLONNE_ECART_REL = 0.05;

// Borne sur le nombre de taches acceptées en entrée.
//
// CHRONOMÉTRÉE, pas estimée, sur le cas le plus coûteux — N = 4, celui des
// tests de dos :
//     40 taches  ·  C(40,4) =  91 390  ·  16,5 ms
//     50 taches  ·  C(50,4) = 230 300  ·  40,3 ms
//     60 taches  ·  C(60,4) = 487 635  ·  86,1 ms
//
// La borne est posée à 40 parce que l'étage A appellera cette fonction EN
// DIRECT, image par image : 16,5 ms tient dans un intervalle de 60 images
// par seconde, 40 ms non. Au-delà, l'image compte plus de parasites que de
// signal et aucune décision n'y serait sûre : refuser est la bonne réponse,
// pas calculer plus longtemps.
//
// Pour mémoire, les comptes réels relevés en plein cadre : 66 taches au
// seuil 200, 189 au seuil 145. Les deux dépassent cette borne — c'est
// justement pourquoi l'étage A devra restreindre sa recherche avant
// d'appeler ici, et non l'inverse.
export const MAX_TACHES = 40;

// Les deux colonnes doivent se ressembler : hauteurs comparables et plages
// verticales largement superposées. Mesuré sur les jambes réelles : rapport
// de hauteurs 1,004 et recouvrement 100 %.
const PAIRE_RATIO_HAUTEUR = 2.0;
const PAIRE_RECOUVREMENT = 0.6;

/** Droite des moindres carrés x = f(y) ; rend le résidu maximal. */
function residuAlignement(pts) {
  const n = pts.length;
  if (n < 2) return 0;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    sxy += (p.x - mx) * (p.y - my);
    syy += (p.y - my) ** 2;
  }
  const a = syy ? sxy / syy : 0;
  let res = 0;
  for (const p of pts) res = Math.max(res, Math.abs(p.x - (mx + a * (p.y - my))));
  return res;
}

const etendueY = (pts) => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));

/**
 * Retire les séries manufacturées : tout ensemble d'au moins SERIE_MIN_POINTS
 * taches alignées finement. On cherche par paires de germes, on retient la
 * plus grande série trouvée, on la retire, et on recommence — une image peut
 * en contenir plusieurs (deux arêtes de tapis sur l'image réelle).
 */
export function retirerSeriesManufacturees(taches) {
  let restantes = taches.slice();
  const series = [];
  for (;;) {
    let meilleure = null;
    for (let i = 0; i < restantes.length; i++) {
      for (let j = i + 1; j < restantes.length; j++) {
        const a = restantes[i];
        const b = restantes[j];
        const dy = b.y - a.y;
        if (Math.abs(dy) < 1) continue; // germe horizontal : pas une colonne
        const pente = (b.x - a.x) / dy;
        const ext = Math.abs(dy);
        const tol = SERIE_RESIDU_REL * ext;
        const inliers = restantes.filter((p) => Math.abs(p.x - (a.x + pente * (p.y - a.y))) <= tol);
        if (inliers.length < SERIE_MIN_POINTS) continue;
        // Second passage : le résidu est recalculé sur la droite ajustée aux
        // inliers, pas sur le germe, pour ne pas retenir une série que seuls
        // deux points définissent.
        const extI = etendueY(inliers);
        if (extI <= 0) continue;
        if (residuAlignement(inliers) / extI > SERIE_RESIDU_REL) continue;
        if (!meilleure || inliers.length > meilleure.length) meilleure = inliers;
      }
    }
    if (!meilleure) break;
    series.push(meilleure);
    const dedans = new Set(meilleure);
    restantes = restantes.filter((p) => !dedans.has(p));
  }
  return { restantes, series };
}

/**
 * Colonnes plausibles de N taches, par ÉNUMÉRATION des sous-ensembles.
 *
 * POURQUOI PAS UN PARTITIONNEMENT PAR ÉCART. Une première version coupait la
 * liste triée en abscisse dès qu'un écart dépassait un multiple de l'écart
 * médian. Mesuré sur l'image réelle, aucun multiple ne convient : les écarts
 * internes aux jambes montent à 15 px, un parasite se présente à 39 px, les
 * deux jambes sont séparées de 184 px. Trois fois la médiane globale donne 45
 * et avale le parasite ; trois fois la médiane basse donne 9 et coupe une
 * jambe en deux. Tout seuil choisi ici l'aurait été POUR CES DONNÉES, et
 * aurait échoué au premier cadrage différent.
 *
 * L'énumération pose la vraie question — « existe-t-il N taches qui forment
 * une colonne ? » — au lieu d'un substitut. Le coût est négligeable : 220
 * sous-ensembles pour N=3 parmi douze taches, 495 pour N=4.
 *
 * Elle a un second mérite, décisif pour les tests de dos : un gabarit à
 * quatre points dont deux sont presque collés — calcanéums supérieur et
 * inférieur — n'a plus rien de périlleux, puisqu'on ne partitionne plus par
 * écart vertical ni horizontal.
 */
export function colonnesCandidates(taches, n) {
  const res = [];
  const m = taches.length;
  if (n < 2 || m < n) return res;
  const idx = new Array(n);
  const explorer = (debut, k) => {
    if (k === n) {
      const sous = idx.map((i) => taches[i]);
      if (colonnePlausible(sous)) res.push(sous);
      return;
    }
    for (let i = debut; i < m; i++) {
      idx[k] = i;
      explorer(i + 1, k + 1);
    }
  };
  explorer(0, 0);
  return res;
}

/** Une colonne plausible : verticale, et sans deux taches à la même hauteur. */
function colonnePlausible(pts) {
  const parY = pts.slice().sort((a, b) => a.y - b.y);
  for (let i = 1; i < parY.length; i++) {
    if (parY[i].y - parY[i - 1].y <= 0) return false; // superposées
  }
  const larg = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  const haut = etendueY(pts);
  if (haut <= 0) return false;
  return larg / haut <= COLONNE_ECART_REL;
}

/** Les deux colonnes forment-elles une paire de jambes plausible ? */
function paireValide(g, d) {
  const hg = etendueY(g);
  const hd = etendueY(d);
  if (hg <= 0 || hd <= 0) return false;
  const ratio = hg > hd ? hg / hd : hd / hg;
  if (ratio > PAIRE_RATIO_HAUTEUR) return false;
  const haut = Math.max(Math.min(...g.map((p) => p.y)), Math.min(...d.map((p) => p.y)));
  const bas = Math.min(Math.max(...g.map((p) => p.y)), Math.max(...d.map((p) => p.y)));
  const recouvrement = (bas - haut) / Math.min(hg, hd);
  if (recouvrement < PAIRE_RECOUVREMENT) return false;
  // Les colonnes doivent être DISJOINTES horizontalement : deux jambes ne se
  // chevauchent pas en abscisse.
  const gMax = Math.max(...g.map((p) => p.x));
  const dMin = Math.min(...d.map((p) => p.x));
  return dMin > gMax;
}

/**
 * Assigne les taches aux marqueurs, ou refuse.
 *
 * @param {Tache[]} taches  Taches détectées, dans n'importe quel ordre.
 * @param {string} typeTest  Clé `markers` du catalogue : 'genou-bi' | 'ap-bi'.
 * @param {'face'|'dos'} vue  Sens de la prise de vue.
 * @returns {{D: Tache[], G: Tache[]}|null}  Marqueurs triés de haut en bas
 *   par côté PATIENT, ou null si aucune configuration sûre n'est trouvée.
 */
export function assignerMarqueurs(taches, typeTest, vue) {
  const n = ATTENDUS_PAR_COTE[typeTest];
  if (!n) return null; // type inconnu, ou sans latéralité (mla)
  if (!Array.isArray(taches) || taches.length < 2 * n) return null;
  if (vue !== 'face' && vue !== 'dos') return null;

  // GARDE-FOU COMBINATOIRE : voir MAX_TACHES, dont la valeur est chronométrée.
  if (taches.length > MAX_TACHES) return null;

  const { restantes, series: seriesRetirees } = retirerSeriesManufacturees(taches);
  const cols = colonnesCandidates(restantes, n);
  if (cols.length < 2) return null;

  // Toutes les paires valides. S'il y en a PLUSIEURS, on refuse : choisir la
  // « meilleure » serait deviner, et l'erreur ne se verrait pas.
  // Deux colonnes qui partagent une tache ne sont pas une paire : un même
  // point ne peut pas être sur les deux jambes.
  const paires = [];
  for (let i = 0; i < cols.length; i++) {
    for (let j = 0; j < cols.length; j++) {
      if (i === j) continue;
      if (cols[i].some((p) => cols[j].includes(p))) continue;
      if (paireValide(cols[i], cols[j])) paires.push([cols[i], cols[j]]);
    }
  }
  if (paires.length !== 1) return null;

  // ─── GARDE DE VÉRIFICATION : regarder ce qu'on a jeté ───
  //
  // LE MODE D'ÉCHEC QU'ELLE INTERDIT. Le retrait des séries s'exécute en
  // premier et supprime. Mesuré : un seul point éloigné, posé sur l'axe d'une
  // jambe, gonfle l'étendue de la série donc sa tolérance, et la jambe entière
  // y entre. Si un faux candidat existe ailleurs dans l'image, il prend sa
  // place et la fonction rend DEUX CÔTÉS FAUX sans rien signaler — mesuré :
  // ce qui sort comme « D » est la vraie jambe G, et ce qui sort comme « G »
  // est un artefact. C'est une SUBSTITUTION, pas une amputation, et c'est le
  // seul mode d'échec de cette fonction qui produise un angle faux.
  //
  // LA GARDE NE DÉPEND D'AUCUN SEUIL DE SÉRIE. Si une série retirée était
  // MAJORITAIREMENT une colonne plausible, alors deux configurations
  // concurrentes existaient et l'une n'a été retenue qu'en détruisant l'autre.
  // On refuse. Quel que soit le réglage du critère de série, l'accident est
  // rattrapé ici.
  //
  // POURQUOI « MAJORITAIREMENT » ET PAS « CONTIENT ». Mesuré sur les données
  // réelles : les deux arêtes de tapis, onze et neuf points, contiennent 102
  // et 47 sous-ensembles de trois formant une colonne plausible — n'importe
  // quel tronçon d'une droite en est une. Une garde qui refuserait dès qu'une
  // série CONTIENT une colonne refuserait donc le cas réel. La part de la
  // série occupée sépare nettement : 3/11 = 0,27 et 3/9 = 0,33 pour les
  // rails, 4/5 = 0,80 pour l'accident.
  for (const serie of seriesRetirees) {
    if (n * 2 <= serie.length) continue; // la colonne ne peut pas y être majoritaire
    if (colonnesCandidates(serie, n).length > 0) return null;
  }

  const [gauche, droite] = paires[0];
  const parY = (c) => c.slice().sort((a, b) => a.y - b.y);
  // Latéralité : en vue de FACE, le côté DROIT du patient est à GAUCHE de
  // l'image ; en vue de DOS, l'inverse. C'est la convention corrigée en #267,
  // reprise telle quelle et non redécouverte.
  return vue === 'dos'
    ? { D: parY(droite), G: parY(gauche) }
    : { D: parY(gauche), G: parY(droite) };
}
