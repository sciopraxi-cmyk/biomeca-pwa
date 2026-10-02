/**
 * BioMéca — module de calculs cliniques purs
 *
 * Purpose : Module ESM regroupant les fonctions pures (sans DOM, sans API,
 *           sans état global mutable) qui calculent ou interprètent les
 *           mesures cliniques (angles, scores, seuils, badges).
 *
 * Created : 2026-04-26 (Sprint 0 / Phase 4)
 * Scope   : 11 fonctions extraites de js/biomeca.js — 7 calculs (catégorie A)
 *           + 4 helpers de seuils/formatage (catégorie B).
 *
 * ⚠ ATTENTION — STRATÉGIE STRANGLER ⚠
 *   Ces fonctions sont pour le moment DUPLIQUÉES avec js/biomeca.js pendant
 *   la phase de transition. Toute modification doit être faite AUX DEUX
 *   ENDROITS jusqu'à la migration de biomeca.js en ESM.
 *   Une dérive entre les deux copies serait un bug silencieux : la version
 *   active reste celle de biomeca.js tant que le bascule ESM n'est pas faite.
 */

// ============================================================================
// TYPES PARTAGÉS
// ============================================================================

/**
 * @typedef {Object} Marker
 * @property {number|null} x  Coordonnée x du marqueur (null si non placé).
 * @property {number|null} y  Coordonnée y du marqueur (null si non placé).
 */

/**
 * @typedef {Object} PlacedMarker
 * @property {number} x  Coordonnée x (non-null car marqueur placé).
 * @property {number} y  Coordonnée y (non-null car marqueur placé).
 */

/**
 * Type guard : vérifie qu'un marqueur a été placé sur le canvas
 * (coordonnées x et y toutes deux non-null).
 *
 * @param {Marker} p
 * @returns {p is PlacedMarker}
 */
// ─── #243 COORD — DÉBUT (copie de js/biomeca.js) ───
// Le runtime réel est _coord / _isPlacedPt / _normPt dans js/biomeca.js, entre
// les marqueurs #243 COORD. Modifier js/biomeca.js D'ABORD, ce miroir ensuite.
// La synchronisation n'est pas confiée à ce commentaire : le test différentiel
// de #132 extrait les deux blocs et exige des comportements identiques.
export function isPlaced(p) {
  return coord(p.x) !== null && coord(p.y) !== null;
}

// ═══════════════════════════════════════════════════════════════════
// #243 — coord() : normalise une coordonnée, ou rend null
// ═══════════════════════════════════════════════════════════════════
//
// L'ancien `p.x !== null` laissait passer TROIS familles de valeurs qui se
// coercent silencieusement en 0 dans le calcul, produisant un angle FAUX
// MAIS PLAUSIBLE — pas un NaN qui se verrait, une mesure crédible imprimée
// dans un rapport patient :
//
//   {x:100,y:200} {x:150,y:260} {x:200,y:null}  →  50,69°
//   les mêmes points avec y = 210 réellement mesuré  →  84,81°
//
// 34 degrés d'écart, sans aucun signal. `null - 210` vaut -210, pas NaN.
//
// La validation porte sur le TYPE avant toute coercition. Une garde du genre
// `Number.isFinite(Number(v))` réintroduirait le défaut en pire : Number(null),
// Number(''), Number(' '), Number(false) et Number([]) valent tous 0, donc
// passeraient pour une coordonnée valide au bord supérieur de l'image.
//
// Les chaînes numériques sont acceptées (relecture d'un JSON ancien), mais le
// calcul DOIT utiliser la valeur normalisée — sinon '210' ne tomberait juste
// que par coercition implicite, c'est-à-dire par accident.
//
// Recensement du 29/08/2026 sur les données réelles : 798 marqueurs examinés,
// 0 demi-état, 0 coordonnée en chaîne. Cette garde est donc une DÉFENSE, pas
// la correction d'un défaut actif — aucun chemin d'écriture ne produit
// aujourd'hui {x: valeur, y: null} (init, sérialisation et rechargement sont
// tous appariés ou gardés).
/**
 * Normalise une coordonnée brute, ou rend null si elle n'est pas exploitable.
 *
 * @param {unknown} v  Valeur brute lue d'un marqueur (nombre, chaîne, null…).
 * @returns {number|null}  La coordonnée en nombre fini, ou null.
 */
export function coord(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null; // null, undefined, booléen, objet, tableau…
}

// Rend un point aux coordonnées normalisées. À utiliser APRÈS filtrage par
// isPlaced : le calcul ne doit jamais consommer les valeurs brutes.
/**
 * Rend une copie du point avec ses coordonnées normalisées.
 *
 * PRÉCONDITION : n'appeler qu'APRÈS filtrage par isPlaced. Le type de retour
 * l'exprime — sans quoi `.filter(isPlaced).map(normaliser)` annulerait le
 * rétrécissement apporté par le type guard, et tsc perdrait la garantie que
 * les coordonnées sont des nombres.
 *
 * @param {Marker} p  Point à normaliser, déjà validé par isPlaced.
 * @returns {PlacedMarker}  Copie dont x et y sont des nombres finis.
 */
export function normaliser(p) {
  const x = coord(p.x),
    y = coord(p.y);
  // Précondition GARANTIE, pas seulement déclarée : isPlaced et normaliser
  // appellent la MÊME coord, donc un point ayant franchi le filtre ne peut pas
  // échouer ici. Un déclenchement signalerait un appel non filtré, c'est-à-dire
  // une erreur de programmation — qui doit se voir immédiatement plutôt que
  // produire une coordonnée nulle silencieuse.
  if (x === null || y === null) throw new Error('normaliser: point non placé');
  return { ...p, x, y };
}
// ─── #243 COORD — FIN ───

// ============================================================================
// CATÉGORIE A — Calculs cliniques
// ============================================================================

/**
 * Trouve l'index du marqueur le plus proche du point (x, y) dans une liste.
 * Le rayon de capture est adapté à la largeur du canvas (min 14 px, sinon cw/40).
 * Parcourt la liste à l'envers pour favoriser les marqueurs ajoutés en dernier.
 *
 * @param {number} x  Abscisse du clic en coordonnées canvas.
 * @param {number} y  Ordonnée du clic en coordonnées canvas.
 * @param {Marker[]} markers  Liste de marqueurs ; ceux non placés (x ou y null) sont ignorés.
 * @param {number} cw  Largeur du canvas en pixels (sert au calcul du rayon).
 * @returns {number}  Index du marqueur trouvé, ou −1 si aucun.
 *
 * @example
 *   findMarkerAt(120, 200, [{x:118,y:198},{x:50,y:50}], 800) // → 0
 */
export function findMarkerAt(x, y, markers, cw) {
  const r = Math.max(14, cw / 40);
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    if (!isPlaced(m)) continue;
    // #243 — le calcul consomme les valeurs NORMALISÉES, jamais les brutes.
    const n = normaliser(m);
    if (Math.hypot(n.x - x, n.y - y) < r) return i;
  }
  return -1;
}

/**
 * Calcule l'angle ABC en degrés à partir de 3 points placés (loi du cosinus).
 * Si la liste contient 4 points placés, utilise les 3 derniers (skip du premier).
 *
 * @param {Marker[]} pts  Liste de points, dont les non-placés ont x ou y à null.
 * @returns {number|null}  Angle en degrés (0–180), ou null si moins de 3 points placés ou points colinéaires confondus.
 *
 * @example
 *   calcAngle3([{x:0,y:0},{x:1,y:0},{x:1,y:1}]) // → 90
 */
export function calcAngle3(pts) {
  // #243 — filtre complet puis NORMALISATION : le calcul consomme les
  // valeurs normalisées, jamais les brutes.
  const placed = pts.filter(isPlaced).map(normaliser);
  if (placed.length < 3) return null;
  // ⚠️ CHOIX D'INDICES DÉLIBÉRÉ ET CLINIQUE — NE PAS « SIMPLIFIER ».
  // Sur un gabarit à 4 points (Milieu mollet, Jonction musculo-tendineuse,
  // Calca supérieur, Calca inférieur — Amorti/Propulsion Marche et Course,
  // mobilité AP, verrouillage AP), l'angle se mesure au sommet CALCA
  // SUPÉRIEUR, donc sur les TROIS POINTS INFÉRIEURS : [1], [2], [3].
  // Le premier point (Milieu mollet) sert au TRACÉ, pas à la mesure.
  // Prendre les trois premiers points ferait basculer toutes les mesures à
  // 4 points sur une autre articulation, silencieusement. Règle définie et
  // validée par le praticien.
  const [A, B, C] = placed.length >= 4 ? [placed[1], placed[2], placed[3]] : placed;
  const v1 = { x: A.x - B.x, y: A.y - B.y },
    v2 = { x: C.x - B.x, y: C.y - B.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.sqrt((v1.x ** 2 + v1.y ** 2) * (v2.x ** 2 + v2.y ** 2));
  return mag === 0 ? null : (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

/**
 * Détermine le signe d'un angle (+1 / −1) via produit vectoriel.
 * Sert à distinguer inversion/éversion (arrière-pied) ou valgus/varus (genou).
 *
 * En coordonnées écran (y vers le bas) :
 *   - cross > 0 = point central à gauche de la ligne top→bot
 *   - cross < 0 = point central à droite
 *
 * Avec ≥ 3 points placés : retourne +1 si le point central est à DROITE de la
 * ligne top→bot en repère écran, −1 s'il est à gauche. Cette ligne affirmait
 * l'inverse jusqu'au 19/09/2026 ; elle est désormais vérifiée par exécution
 * (tests/inv-ev-signe.test.mjs), pas déduite de la lecture du produit vectoriel.
 * Avec exactement 2 points placés : retourne +1 si bot.x > top.x, −1 sinon (fallback).
 * Avec moins de 2 points : retourne +1 par défaut.
 *
 * @param {Marker[]} pts  Liste de points, dont les non-placés ont x ou y à null.
 * @returns {1|-1}  Signe de l'angle.
 */
// ⚠️ LE TRIPLET UTILISÉ ICI DIFFÈRE VOLONTAIREMENT DE CELUI DE calcAngle3.
// calcAngle3 mesure l'ANGLE sur [1],[2],[3] (sommet Calca supérieur) ;
// calcAngleSign détermine le SENS sur [0],[1],[dernier]. Ce n'est pas une
// incohérence : le sens (valgus/varus en vue face, inversion/éversion en vue
// dos) suit des règles propres, définies par le praticien et VALIDÉES
// CLINIQUEMENT À L'USAGE sur des cas réels.
// NE PAS aligner ce triplet sur celui de calcAngle3 sans validation clinique
// explicite : on inverserait des constats, pas seulement des précisions.
//
// Le `return 1` ci-dessous est inatteignable TANT QUE `pts` est bien le
// tableau ayant produit l'angle : moins de trois points placés → calcAngle3
// rend null → computeCorrectedAngle sort avant d'appeler cette fonction.
// L'inatteignabilité tient donc à une propriété des APPELANTS, pas de cette
// fonction.
export function calcAngleSign(pts) {
  // #243 — filtre complet puis NORMALISATION : le calcul consomme les
  // valeurs normalisées, jamais les brutes.
  const placed = pts.filter(isPlaced).map(normaliser);
  if (placed.length < 2) return 1;
  if (placed.length >= 3) {
    // Point central (Rotule pour KFPPA, CalcaSup pour AP)
    // Détecter si le point central est à droite ou gauche de la ligne top→bot
    const top = placed[0]; // EIAS ou Milieu mollet
    const mid = placed[1]; // Rotule ou Jonction musculo-tend.
    const bot = placed[placed.length - 1]; // Tarse ou CalcaInf
    // Position de mid par rapport à la ligne top→bot
    // Produit vectoriel : (bot-top) × (mid-top)
    // En coordonnées écran (y vers le bas), cross<0 = mid à DROITE.
    // (Cette ligne disait « cross>0 = mid à droite » : c'était faux, et la
    // ligne suivante — elle, correcte — la contredisait deux caractères plus
    // loin. Deux commentaires opposés sur la même quantité, dans la même
    // fonction, c'est ce qui a rendu le défaut de signe illisible.)
    const cross = (bot.x - top.x) * (mid.y - top.y) - (bot.y - top.y) * (mid.x - top.x);
    return cross < 0 ? 1 : -1; // cross<0 en écran = point à droite ⇒ +1 = à DROITE
  }
  const top = placed[0];
  const bot = placed[placed.length - 1];
  return bot.x > top.x ? 1 : -1;
}

/**
 * Applique la correction d'angle clinique selon le contexte du test.
 *
 * - testType 'mla'   : retourne l'angle brut (pas de correction).
 * - testType 'kfppa' : retourne 180 − rawAng (incl), signé valgus (+) / varus (−)
 *     en vue 'face' avec points ; magnitude non signée sinon (#275-A).
 * - autres testTypes :
 *     vue 'dos'  : utilise calcAngleSign + côté pour le signe inversion/éversion.
 *     vue 'face' : utilise calcAngleSign + côté pour le signe valgus/varus.
 *     fallback  : retourne incl (180 − rawAng).
 *
 * @param {number|null} rawAng  Angle brut (en degrés) ; null pour propager null.
 * @param {'D'|'G'|''} side  Côté du membre.
 * @param {'face'|'dos'|string} view  Vue de la prise.
 * @param {'mla'|'kfppa'|string} testType  Type de test clinique.
 * @param {Array<{x:number|null,y:number|null}>} [pts]  Points utilisés pour déterminer le signe (optionnel).
 * @returns {number|null}  Angle corrigé en degrés (signé), ou null si rawAng null.
 */
export function computeCorrectedAngle(rawAng, side, view, testType, pts) {
  if (rawAng === null) return null;
  if (testType === 'mla') return rawAng;
  const incl = 180 - rawAng;
  // #275-A — signe du KFPPA : valgus positif, varus négatif, UNIQUEMENT en vue
  // de face avec points. Copie de js/biomeca.js, où la justification complète
  // est écrite ; l'accord des deux copies est vérifié par exécution dans
  // tests/inv-ev-signe.test.mjs et tests/kfppa-signe-275a.test.mjs.
  if (testType === 'kfppa' && view === 'face' && Array.isArray(pts)) {
    const sign = calcAngleSign(pts);
    if (side === 'D') return sign * incl;
    if (side === 'G') return -sign * incl;
    return incl;
  }
  // Tout autre KFPPA : magnitude non signée, jamais un signe inventé. Doit
  // précéder la branche dos.
  if (testType === 'kfppa') return incl;
  // ─── Vue dos : signe inversion / éversion ───
  //
  // CONVENTION CLINIQUE, établie par le praticien sur cas réel le 19/09/2026 :
  // en vue dos, la STATIQUE du pied droit telle qu'observée sur sa capture est
  // une ÉVERSION (−), et la POINTE une INVERSION (+). Le bandeau des tests
  // annonce « Inversion=+ Éversion=− » : c'est cette convention-là.
  //
  // CE QUI A ÉTÉ CORRIGÉ le 19/09/2026 : le signe était inversé, pour les deux
  // pieds et pour les quatre tests en vue dos. Les magnitudes étaient justes,
  // la fonction de qualification aussi — seul ce signe était faux.
  //
  // calcAngleSign rend +1 quand le point central est à DROITE en repère écran,
  // −1 quand il est à gauche. MESURÉ, pas déduit du produit vectoriel, et fixé
  // par tests/inv-ev-signe.test.mjs. Les deux commentaires qui vivaient ici
  // affirmaient l'inverse l'un de l'autre.
  //
  // Les deux pieds ont des signes opposés parce que la latéralité s'inverse en
  // vue dos : un même sens de bascule à l'écran correspond à des côtés
  // anatomiques opposés selon le pied.
  if (view === 'dos' && pts) {
    const sign = calcAngleSign(pts);
    if (side === 'D') return sign * incl;
    if (side === 'G') return -sign * incl;
    return incl;
  }
  // Repli SANS points : aucune géométrie n'est disponible, ce signe ne mesure
  // donc rien — il est posé sur le seul côté. VOLONTAIREMENT LAISSÉ INCHANGÉ
  // par la correction du 19/09/2026 : l'inverser reviendrait à remplacer une
  // valeur arbitraire par une autre, sans observation qui l'appuie. À trancher
  // séparément, idéalement en rendant null plutôt qu'un signe inventé.
  if (view === 'dos' && side === 'G') return -incl;
  // Vue face (KFPPA) : genou D pointe droite=valgus(+), genou G pointe droite=varus(-)
  if (view === 'face' && pts) {
    const sign = calcAngleSign(pts);
    if (side === 'D') return sign * incl;
    if (side === 'G') return -sign * incl;
  }
  return incl;
}

/**
 * Convertit un angle KFPPA signé en label lisible « Valgus +X.X° » / « Varus −X.X° ».
 * Convention : valeur positive = valgus pour les deux côtés (déjà corrigé en amont).
 *
 * Le paramètre `_side` est conservé pour cohérence avec les appelants existants
 * (les 6 sites d'appel dans biomeca.js passent toujours 'D' ou 'G'). Le préfixe
 * underscore signale qu'il est volontairement non utilisé dans le calcul actuel,
 * mais la signature est figée pour permettre une éventuelle différenciation
 * latérale future sans casser les call sites.
 *
 * @param {number|null} ang   Angle en degrés (signé) ; null retourne '—'.
 * @param {'D'|'G'|''} _side  Côté du genou (réservé pour usage futur — voir note ci-dessus).
 * @returns {string}  Label formaté.
 *
 * @example
 *   kfppaLabel(8.3, 'D')  // → 'Valgus +8.3°'
 *   kfppaLabel(-4, 'G')   // → 'Varus −4.0°'
 *   kfppaLabel(null, 'D') // → '—'
 */
export function kfppaLabel(ang, _side) {
  if (ang == null) return '—';
  const deg = Math.abs(ang).toFixed(1) + '°';
  // Convention incl : valeur positive = valgus pour les 2 côtés
  return ang >= 0 ? 'Valgus +' + deg : 'Varus −' + deg;
}

// ═══════════════════════════════════════════════════════════════════
// #275-C — KFPPA : normes, grille de U, classement de S
// ═══════════════════════════════════════════════════════════════════
//
// DÉCISIONS DU PRATICIEN (Scio) :
//   U = angle unipodal ABSOLU signé (valgus +, varus −) : c'est lui qui reçoit
//       le verdict, par la grille ancrée sur la norme applicable.
//   S = statique bipodal : classé Neutre / Valgus / Varus constitutionnel.
//   Δ = U − S est affiché pour expliquer, jamais classé.
//
// TÂCHE À VENIR — normes réglables dans les Paramètres : lot séparé, avec sa
// PROPRE clé app_config et une modification serveur validée à part. Elles ne
// doivent PAS aller dans posture_thresholds : _mergeThresholds n'y relit que
// ses cinq sections connues, et un client resté sur une version antérieure
// effacerait une section kfppa au premier seuil postural enregistré.
//
// Une norme absente ou incomplète rend « norme non définie » : JAMAIS de
// valeur par défaut substituée.
export const KFPPA_SOURCE_REPERE = 'repère clinique de travail, pas de norme 2D publiée';
export const KFPPA_SOURCE_USL =
  'Norme de référence : réception unipodale (Herrington & Munro, 2010) — mesure à la première réception';
export const KFPPA_NORMES = {
  'kfppa-marche': { parSexe: false, min: 3, max: 7, source: KFPPA_SOURCE_REPERE },
  'kfppa-course': { parSexe: false, min: 5, max: 12, source: KFPPA_SOURCE_REPERE },
  'kfppa-sldj': {
    parSexe: true,
    femmes: { min: 5, max: 12 },
    hommes: { min: 1, max: 9 },
    source: KFPPA_SOURCE_USL,
  },
};
export const KFPPA_MSG_CIVILITE = 'civilité non renseignée : norme non appliquée';
export const KFPPA_MSG_NORME_ND = 'norme non définie';

// Sexe d'après la civilité, seules valeurs reconnues : « Mme » et « M. »
// (les seules que produisent la fiche et l'import). Tout le reste → null.
/**
 * @param {string|null|undefined} civilite
 * @returns {'femmes'|'hommes'|null}
 */
export function kfppaSexeCivilite(civilite) {
  if (civilite === 'Mme') return 'femmes';
  if (civilite === 'M.') return 'hommes';
  return null;
}

// Norme applicable à un test pour une civilité.
//   { statut: 'ok', min, max, source, sexe }  — sexe null si la norme n'en dépend pas
//   { statut: 'civilite' }                     — norme par sexe, civilité inconnue
//   { statut: 'non-definie' }                  — test sans norme, ou norme incomplète
/**
 * @param {string} testId
 * @param {string|null|undefined} civilite
 * @param {Record<string, any>} [normes]
 * @returns {{statut: string, min?: number, max?: number, source?: string, sexe?: string|null}}
 */
export function kfppaNormeApplicable(testId, civilite, normes = KFPPA_NORMES) {
  const n = normes && normes[testId];
  if (!n) return { statut: 'non-definie' };
  let sexe = null;
  let b = n;
  if (n.parSexe) {
    sexe = kfppaSexeCivilite(civilite);
    if (!sexe) return { statut: 'civilite' };
    b = n[sexe];
  }
  if (!b || !Number.isFinite(b.min) || !Number.isFinite(b.max) || b.min > b.max) {
    return { statut: 'non-definie' };
  }
  return { statut: 'ok', min: b.min, max: b.max, source: n.source, sexe };
}

// Valeur telle qu'AFFICHÉE (une décimale) : le verdict doit correspondre au
// nombre imprimé. Sans cela, −3,04° s'afficherait « −3.0° » et serait classé
// comme en dessous de −3. Le « + 0 » supprime le zéro négatif.
/** @param {number} v */
function _kfppaArrondi(v) {
  return Number(v.toFixed(1)) + 0;
}
// Seuils calculés sans bruit flottant (0,3 × 8,5 ne vaut pas exactement 2,55).
/** @param {number} v */
function _kfppaSeuil(v) {
  return Math.round(v * 1e9) / 1e9;
}

// Grille de U, huit classes ancrées sur la norme : m = (min + max) / 2.
/**
 * @param {number|null|undefined} U
 * @param {number} min
 * @param {number} max
 * @returns {string|null}
 */
export function kfppaClasseU(U, min, max) {
  if (U == null || !Number.isFinite(U) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  const u = _kfppaArrondi(U);
  const m = (min + max) / 2;
  if (u < _kfppaSeuil(-0.6 * m)) return 'Varus excessif';
  if (u < _kfppaSeuil(-0.3 * m)) return 'Varus modéré';
  if (u < 0) return 'Varus faible';
  if (u < _kfppaSeuil(min / 2)) return 'Valgus faible';
  if (u < min) return 'Valgus modéré (insuffisant)';
  if (u <= max) return 'Dans la norme';
  if (u <= _kfppaSeuil(max + 0.3 * m)) return 'Valgus modéré (au-dessus de la norme)';
  return 'Valgus excessif';
}

// Statique bipodal : ±3° autour de zéro = neutre.
/**
 * @param {number|null|undefined} S
 * @returns {string|null}
 */
export function kfppaClasseS(S) {
  if (S == null || !Number.isFinite(S)) return null;
  const s = _kfppaArrondi(S);
  if (s > 3) return 'Valgus constitutionnel';
  if (s < -3) return 'Varus constitutionnel';
  return 'Neutre';
}

// Valeur sans kfppaSigne (capture sans points, bilan antérieur) : magnitude
// seule, aucun classement, aucun verdict.
/**
 * @param {number|null|undefined} v
 * @returns {string}
 */
export function kfppaTexteNonSigne(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return _kfppaMagnitudeTxt(v) + ' (sens valgus/varus non enregistré)';
}

// #275-D — PARTIE NUMÉRIQUE d'une valeur non signée, source unique : la
// phrase du genou (via kfppaTexteNonSigne), le grand chiffre U et la légende
// de la photo passent tous par elle, donc par le même arrondi (_kfppaArrondi).
/** @param {number} v @returns {string} */
function _kfppaMagnitudeTxt(v) {
  return Math.abs(_kfppaArrondi(v)).toFixed(1) + '°';
}
// ─── #275-C — FIN ───

// ═══════════════════════════════════════════════════════════════════
// #275-D — KFPPA : textes signés, Δ, couleurs, phrases du rapport
// ═══════════════════════════════════════════════════════════════════
//
// DÉCISIONS DU PRATICIEN (Scio) :
//   - plus aucun pourcentage ; des degrés signés, le mot en clair ;
//   - Δ = U − S n'a JAMAIS de verdict ni le mot Valgus/Varus comme état :
//     « +5.9° (vers le valgus) », « −4.8° (vers le varus) », « 0.0° » ;
//   - Δ et l'asymétrie sont calculés sur les valeurs AFFICHÉES (au dixième),
//     pour que le praticien retombe sur le même nombre en faisant la
//     soustraction lui-même ;
//   - un statique nul s'écrit « 0.0° — Neutre », jamais « Valgus +0.0° » ;
//   - une valeur sans kfppaSigne ne reçoit ni classe, ni verdict, ni Δ.
//
// Aucune de ces fonctions n'écrit quoi que ce soit : elles ne font que
// calculer et composer du texte (garde : tests/kfppa-affichage-275d.test.mjs).

// Valeur en DIXIÈMES entiers, depuis la valeur affichée : les sommes et
// différences se font sur des entiers, donc tombent juste.
/** @param {number} v @returns {number} */
function _kfppaDixiemes(v) {
  return Math.round(_kfppaArrondi(v) * 10);
}
/** @param {number} d @returns {string} */
function _kfppaTxtDixiemes(d) {
  if (d === 0) return '0.0°';
  return (d > 0 ? '+' : '−') + (Math.abs(d) / 10).toFixed(1) + '°';
}

// Valeur signée telle qu'affichée : « +9.3° », « −2.4° », « 0.0° ».
/** @param {number|null|undefined} v @returns {string} */
export function kfppaSigneTxt(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return _kfppaTxtDixiemes(_kfppaDixiemes(v));
}

// Δ = U − S, sur les valeurs affichées.
/**
 * @param {number|null|undefined} S
 * @param {number|null|undefined} U
 * @returns {number|null}
 */
export function kfppaDelta(S, U) {
  if (S == null || U == null || !Number.isFinite(S) || !Number.isFinite(U)) return null;
  return (_kfppaDixiemes(U) - _kfppaDixiemes(S)) / 10;
}

/** @param {number|null|undefined} d @returns {string} */
export function kfppaTexteDelta(d) {
  if (d == null || !Number.isFinite(d)) return '—';
  const t = _kfppaDixiemes(d);
  if (t === 0) return '0.0°';
  return _kfppaTxtDixiemes(t) + (t > 0 ? ' (vers le valgus)' : ' (vers le varus)');
}

// Statique : « +3.4° — Valgus constitutionnel », « 0.0° — Neutre ».
/**
 * @param {number|null|undefined} S
 * @param {boolean} signe
 * @returns {string}
 */
export function kfppaTexteS(S, signe) {
  if (S == null || !Number.isFinite(S)) return '—';
  if (!signe) return kfppaTexteNonSigne(S);
  return kfppaSigneTxt(S) + ' — ' + kfppaClasseS(S);
}

// Couleur d'une classe de U : 'vert' | 'orange' | 'rouge' | 'neutre'.
// Chaque affichage la traduit dans sa propre palette.
/** @param {string|null|undefined} classe @returns {'vert'|'orange'|'rouge'|'neutre'} */
export function kfppaCouleurClasse(classe) {
  if (classe === 'Dans la norme') return 'vert';
  if (classe === 'Varus excessif' || classe === 'Valgus excessif') return 'rouge';
  if (
    classe === 'Varus modéré' ||
    classe === 'Varus faible' ||
    classe === 'Valgus faible' ||
    classe === 'Valgus modéré (insuffisant)' ||
    classe === 'Valgus modéré (au-dessus de la norme)'
  ) {
    return 'orange';
  }
  return 'neutre';
}

// Norme d'un bilan ENREGISTRÉ : celle figée avec lui (result.kfppaNorme).
// Absente ou incohérente → « norme non définie » ; motif civilité conservé.
/** @param {any} data @returns {{statut: string, min?: number, max?: number, source?: string, sexe?: string|null}} */
export function kfppaNormeBilan(data) {
  const n = data && data.kfppaNorme;
  if (n && n.statut === 'civilite') return { statut: 'civilite' };
  if (!n || !Number.isFinite(n.min) || !Number.isFinite(n.max) || n.min > n.max) {
    return { statut: 'non-definie' };
  }
  return {
    statut: 'ok',
    min: n.min,
    max: n.max,
    source: n.source,
    sexe: n.sexe == null ? null : n.sexe,
  };
}

// « norme 5–12°, femmes », « norme 3–7° », ou le message.
/** @param {{statut: string, min?: number, max?: number, source?: string, sexe?: string|null}|null|undefined} norme @returns {string} */
export function kfppaTexteNorme(norme) {
  if (!norme || norme.statut === 'non-definie') return KFPPA_MSG_NORME_ND;
  if (norme.statut === 'civilite') return KFPPA_MSG_CIVILITE;
  return 'norme ' + norme.min + '–' + norme.max + '°' + (norme.sexe ? ', ' + norme.sexe : '');
}

// #279 étape 3f — photo NON ENVOYÉE : sa valeur reste affichée, avec ce
// motif, mais n'entre dans AUCUN calcul dérivé (classe, verdict, Δ,
// décomposition de l'asymétrie) tant qu'elle n'est pas recapturée.
export const KFPPA_EXCLU_BIP = 'photo bipodale non envoyée — à recapturer';
export const KFPPA_EXCLU_UNI = 'photo unipodale non envoyée — à recapturer';

// #279 étape 3f — pourquoi Δ n'est pas calculé pour ce genou, ou null.
/** @param {{sExclu?: boolean, uExclu?: boolean}} a @returns {string|null} */
export function kfppaMotifDelta(a) {
  if (a.sExclu && a.uExclu) return 'photos bipodale et unipodale non envoyées — à recapturer';
  if (a.sExclu) return KFPPA_EXCLU_BIP;
  if (a.uExclu) return KFPPA_EXCLU_UNI;
  return null;
}

// Analyse d'un genou. Une valeur non signée garde sa magnitude mais ne porte
// ni classe, ni verdict, ni Δ. #279 étape 3f — une valeur EXCLUE (photo non
// envoyée) non plus : sExclu / uExclu le disent à chaque affichage.
/**
 * @param {{S?: number|null, U?: number|null, sSigne?: boolean, uSigne?: boolean, sExclu?: boolean, uExclu?: boolean, norme?: {statut: string, min?: number, max?: number, source?: string, sexe?: string|null}}} e
 * @returns {{S: number|null, U: number|null, sSigne: boolean, uSigne: boolean, sExclu?: boolean, uExclu?: boolean, norme: {statut: string, min?: number, max?: number, source?: string, sexe?: string|null}, classeS: string|null, classeU: string|null, delta: number|null, couleur: string}}
 */
export function kfppaAnalyseGenou(e) {
  /** @param {any} v @returns {v is number} */
  const ok = (v) => v != null && Number.isFinite(v);
  const S = ok(e.S) ? e.S : null;
  const U = ok(e.U) ? e.U : null;
  const sSigne = S != null && !!e.sSigne;
  const uSigne = U != null && !!e.uSigne;
  const sExclu = S != null && !!e.sExclu;
  const uExclu = U != null && !!e.uExclu;
  const n0 = e.norme || { statut: 'non-definie' };
  // VÉRIFICATION, pas promesse : un statut 'ok' sans bornes numériques
  // cohérentes est traité comme une norme non définie, sans verdict.
  const mn = n0.min,
    mx = n0.max;
  const normeValide =
    n0.statut === 'ok' &&
    typeof mn === 'number' &&
    typeof mx === 'number' &&
    Number.isFinite(mn) &&
    Number.isFinite(mx) &&
    mn <= mx;
  const norme = normeValide || n0.statut === 'civilite' ? n0 : { statut: 'non-definie' };
  const classeU = uSigne && !uExclu && normeValide ? kfppaClasseU(U, mn, mx) : null;
  return {
    S,
    U,
    sSigne,
    uSigne,
    sExclu,
    uExclu,
    norme,
    classeS: sSigne && !sExclu ? kfppaClasseS(S) : null,
    classeU,
    delta: sSigne && uSigne && !sExclu && !uExclu ? kfppaDelta(S, U) : null,
    couleur: kfppaCouleurClasse(classeU),
  };
}

// #279 étape 3f — texte d'une valeur exclue : la valeur, puis le motif.
/**
 * @param {number} v
 * @param {boolean} signe
 * @param {string} motif
 * @returns {string}
 */
function _kfppaValeurExclue(v, signe, motif) {
  return (
    (signe ? kfppaSigneTxt(v) : kfppaTexteNonSigne(v)) +
    ' — valeur exclue des calculs (' +
    motif +
    ')'
  );
}

/** @param {string|null} s @returns {string|null} */
function _kfppaMinuscule(s) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

// « valeur unipodale −2.4° : varus faible (norme 5–12°, femmes) », ou, sans
// norme appliquée, « valeur unipodale −2.4° (norme non définie) ». Partie de
// kfppaPhraseGenou, isolée pour la ligne d'un genou dont le statique manque.
/**
 * @param {{S: number|null, U: number|null, sSigne: boolean, uSigne: boolean, sExclu?: boolean, uExclu?: boolean, norme: {statut: string, min?: number, max?: number, source?: string, sexe?: string|null}, classeS: string|null, classeU: string|null, delta: number|null, couleur: string}} a
 * @returns {string}
 */
export function kfppaTexteUnipodal(a) {
  if (a.U == null) return 'valeur unipodale —';
  if (a.uExclu) return 'valeur unipodale ' + _kfppaValeurExclue(a.U, a.uSigne, KFPPA_EXCLU_UNI); // #279 étape 3f
  if (!a.uSigne) return 'valeur unipodale ' + kfppaTexteNonSigne(a.U);
  if (a.classeU) {
    return (
      'valeur unipodale ' +
      kfppaSigneTxt(a.U) +
      ' : ' +
      _kfppaMinuscule(a.classeU) +
      ' (' +
      kfppaTexteNorme(a.norme) +
      ')'
    );
  }
  return 'valeur unipodale ' + kfppaSigneTxt(a.U) + ' (' + kfppaTexteNorme(a.norme) + ')';
}

// « Genou gauche : statique +2.4° (neutre), composante dynamique −4.8° (vers
// le varus), valeur unipodale −2.4° : varus faible (norme 5–12°, femmes). »
/**
 * @param {'D'|'G'} cote
 * @param {{S: number|null, U: number|null, sSigne: boolean, uSigne: boolean, sExclu?: boolean, uExclu?: boolean, norme: {statut: string, min?: number, max?: number, source?: string, sexe?: string|null}, classeS: string|null, classeU: string|null, delta: number|null, couleur: string}} a
 * @returns {string}
 */
export function kfppaPhraseGenou(cote, a) {
  const nom = cote === 'D' ? 'Genou droit' : 'Genou gauche';
  const st =
    a.S == null
      ? 'statique —'
      : a.sExclu
        ? 'statique ' + _kfppaValeurExclue(a.S, a.sSigne, KFPPA_EXCLU_BIP) // #279 étape 3f
        : a.sSigne
          ? 'statique ' + kfppaSigneTxt(a.S) + ' (' + _kfppaMinuscule(a.classeS) + ')'
          : 'statique ' + kfppaTexteNonSigne(a.S);
  // #279 étape 3f — Δ non calculé à cause d'une exclusion : le motif, en clair.
  const motif = kfppaMotifDelta(a);
  const dyn =
    a.delta != null
      ? 'composante dynamique ' + kfppaTexteDelta(a.delta)
      : motif
        ? 'composante dynamique non calculée (' + motif + ')'
        : 'composante dynamique —';
  return nom + ' : ' + st + ', ' + dyn + ', ' + kfppaTexteUnipodal(a) + '.';
}

// « Asymétrie D − G : +11.7° en unipodal, dont +1.0° de statique et +10.7° de
// dynamique. » Calculée en dixièmes sur les valeurs affichées : la somme des
// deux parts vaut EXACTEMENT l'écart unipodal. null si une des quatre valeurs
// manque ou n'est pas signée : pas d'asymétrie sur une magnitude.
/**
 * @param {{S: number|null, U: number|null, sSigne: boolean, uSigne: boolean, sExclu?: boolean, uExclu?: boolean, norme: {statut: string, min?: number, max?: number, source?: string, sexe?: string|null}, classeS: string|null, classeU: string|null, delta: number|null, couleur: string}|null|undefined} aD
 * @param {{S: number|null, U: number|null, sSigne: boolean, uSigne: boolean, sExclu?: boolean, uExclu?: boolean, norme: {statut: string, min?: number, max?: number, source?: string, sexe?: string|null}, classeS: string|null, classeU: string|null, delta: number|null, couleur: string}|null|undefined} aG
 * @returns {string|null}
 */
export function kfppaPhraseAsymetrie(aD, aG) {
  // #279 étape 3f — U exclu d'un côté : aucune asymétrie, le motif. S exclu :
  // l'écart unipodal (U valides), SANS décomposition statique / dynamique.
  if (!aD || !aG || !aD.uSigne || !aG.uSigne) return null;
  if (aD.uExclu || aG.uExclu) return 'Asymétrie D − G non calculée (' + KFPPA_EXCLU_UNI + ').';
  // sSigne/uSigne vrais impliquent S et U numériques (kfppaAnalyseGenou).
  const dU =
    _kfppaDixiemes(/** @type {number} */ (aD.U)) - _kfppaDixiemes(/** @type {number} */ (aG.U));
  if (aD.sExclu || aG.sExclu) {
    return (
      'Asymétrie D − G : ' +
      _kfppaTxtDixiemes(dU) +
      ' en unipodal ; décomposition statique / dynamique non calculée (' +
      KFPPA_EXCLU_BIP +
      ').'
    );
  }
  if (!aD.sSigne || !aG.sSigne) return null;
  const dS =
    _kfppaDixiemes(/** @type {number} */ (aD.S)) - _kfppaDixiemes(/** @type {number} */ (aG.S));
  const dDyn = dU - dS;
  return (
    'Asymétrie D − G : ' +
    _kfppaTxtDixiemes(dU) +
    ' en unipodal, dont ' +
    _kfppaTxtDixiemes(dS) +
    ' de statique et ' +
    _kfppaTxtDixiemes(dDyn) +
    ' de dynamique.'
  );
}
// ─── #275-D — FIN ───

/**
 * Classifie un score KFPPA (ratio) par rapport aux seuils physiologiques.
 * Retourne uniquement la zone factuelle ; ne formule aucun jugement clinique.
 * Seuils alignés sur clrKfppa :
 *   v = p × 100
 *   60 ≤ v ≤ 140       → 'dans la norme'
 *   20 ≤ v ≤ 180       → 'valeur limite'
 *   v < 20 ou v > 180  → 'hors norme'
 *
 * @param {number|null} p  Score normalisé (1.0 = 100 %) ; null retourne '—'.
 * @returns {string}  Classification factuelle.
 */
export function interpretKfppa(p) {
  if (p === null) return '—';
  const v = p * 100;
  if (v >= 60 && v <= 140) return 'dans la norme';
  if (v >= 20 && v <= 180) return 'valeur limite';
  return 'hors norme';
}

/**
 * Classifie un score générique (non-KFPPA) par rapport aux seuils.
 * Retourne uniquement la zone factuelle ; ne formule aucun jugement clinique.
 * Seuils : ≥ 66 % = norme · ≥ 33 % = limite · sinon hors norme.
 *
 * @param {number|null} p  Score normalisé (1.0 = 100 %) ; null retourne '—'.
 * @returns {string}  Classification factuelle.
 */
export function interpretGen(p) {
  if (p === null) return '—';
  const v = p * 100;
  if (v >= 66) return 'dans la norme';
  if (v >= 33) return 'valeur limite';
  return 'hors norme';
}

// ============================================================================
// CATÉGORIE B — Helpers seuils / formatage (UI clinique)
// ============================================================================

/**
 * #275-D — couleur CSS (variable) selon la CLASSE de U, et non plus selon un
 * pourcentage (le KFPPA n'en affiche plus aucun) : vert « Dans la norme »,
 * orange pour les classes faibles et modérées, rouge pour les deux excessifs,
 * neutre sans classe (valeur non signée, norme non appliquée).
 * Copie de js/biomeca.js ; accord vérifié par exécution.
 *
 * @param {string|null|undefined} classe  Classe rendue par kfppaClasseU.
 * @returns {string}  'var(--green)' | 'var(--orange)' | 'var(--red)' | 'var(--mut)'.
 */
export function clrKfppa(classe) {
  return {
    vert: 'var(--green)',
    orange: 'var(--orange)',
    rouge: 'var(--red)',
    neutre: 'var(--mut)',
  }[kfppaCouleurClasse(classe)];
}

/**
 * Couleur hex pour le rapport imprimable selon score (deux barèmes).
 * Branche genou alignée sur interpretKfppa/clrKfppa (Sprint 0 — fix 2026-04-26) :
 *   genou=true  : 60–140 vert · 20–180 orange (hors norme) · sinon rouge
 *   genou=false : ≥ 66 vert  · ≥ 33 orange · sinon rouge
 *
 * @param {number|null|undefined} p  Score normalisé (1.0 = 100 %) ; null/undefined → '#aaa'.
 * @param {boolean} genou  true = barème genou (KFPPA), false = barème générique.
 * @returns {string}  Couleur hex : '#1a7a3e' | '#856404' | '#b30021' | '#aaa'.
 */
export function rp_cssColor(p, genou) {
  if (p === null || p === undefined) return '#aaa';
  const v = p * 100;
  if (genou) return v >= 60 && v <= 140 ? '#1a7a3e' : v >= 20 && v <= 180 ? '#856404' : '#b30021';
  return v >= 66 ? '#1a7a3e' : v >= 33 ? '#856404' : '#b30021';
}

/**
 * Classe CSS de badge ('rp-badge-g/o/r') selon score, mêmes seuils que rp_cssColor.
 * Branche genou alignée sur les normes KFPPA (60–140 / 20–180).
 *
 * @param {number|null|undefined} p  Score normalisé.
 * @param {boolean} genou  true = barème genou, false = générique.
 * @returns {'rp-badge-g'|'rp-badge-o'|'rp-badge-r'}  Classe CSS.
 */
export function rp_badgeCls(p, genou) {
  if (p === null || p === undefined) return 'rp-badge-r';
  const v = p * 100;
  if (genou)
    return v >= 60 && v <= 140 ? 'rp-badge-g' : v >= 20 && v <= 180 ? 'rp-badge-o' : 'rp-badge-r';
  return v >= 66 ? 'rp-badge-g' : v >= 33 ? 'rp-badge-o' : 'rp-badge-r';
}

/**
 * Texte de badge ('Normal' / 'Limite' / 'Hors norme') selon score, mêmes seuils.
 * Branche genou alignée sur les normes KFPPA (60–140 / 20–180).
 *
 * @param {number|null|undefined} p  Score normalisé.
 * @param {boolean} genou  true = barème genou, false = générique.
 * @returns {string}  'Normal' | 'Limite' | 'Hors norme' | '—' (si p null/undefined).
 */
export function rp_badgeTxt(p, genou) {
  if (p === null || p === undefined) return '—';
  const v = p * 100;
  if (genou) return v >= 60 && v <= 140 ? 'Normal' : v >= 20 && v <= 180 ? 'Limite' : 'Hors norme';
  return v >= 66 ? 'Normal' : v >= 33 ? 'Limite' : 'Hors norme';
}
