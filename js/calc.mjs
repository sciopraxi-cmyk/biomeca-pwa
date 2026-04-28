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
function isPlaced(p) {
  return p.x !== null && p.y !== null;
}

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
    if (Math.hypot(m.x - x, m.y - y) < r) return i;
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
  const placed = pts.filter(isPlaced);
  if (placed.length < 3) return null;
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
 * Avec ≥ 3 points placés : retourne +1 si le point central penche à gauche, −1 sinon.
 * Avec exactement 2 points placés : retourne +1 si bot.x > top.x, −1 sinon (fallback).
 * Avec moins de 2 points : retourne +1 par défaut.
 *
 * @param {Marker[]} pts  Liste de points, dont les non-placés ont x ou y à null.
 * @returns {1|-1}  Signe de l'angle.
 */
export function calcAngleSign(pts) {
  const placed = pts.filter(isPlaced);
  if (placed.length < 2) return 1;
  if (placed.length >= 3) {
    // Point central (Rotule pour KFPPA, CalcaSup pour AP)
    // Détecter si le point central est à droite ou gauche de la ligne top→bot
    const top = placed[0]; // EIAS ou Milieu mollet
    const mid = placed[1]; // Rotule ou Jonction musculo-tend.
    const bot = placed[placed.length - 1]; // Tarse ou CalcaInf
    // Position de mid par rapport à la ligne top→bot
    // Produit vectoriel : (bot-top) × (mid-top)
    // En coordonnées écran (y vers le bas), cross>0 = mid à droite
    const cross = (bot.x - top.x) * (mid.y - top.y) - (bot.y - top.y) * (mid.x - top.x);
    return cross < 0 ? 1 : -1; // cross<0 en écran = point à droite
  }
  const top = placed[0];
  const bot = placed[placed.length - 1];
  return bot.x > top.x ? 1 : -1;
}

/**
 * Applique la correction d'angle clinique selon le contexte du test.
 *
 * - testType 'mla'   : retourne l'angle brut (pas de correction).
 * - testType 'kfppa' : retourne 180 − rawAng (incl).
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
  // KFPPA : utiliser incl (180-rawAng) sans correction de signe latéral
  if (testType === 'kfppa') return incl;
  // Vue dos : utiliser le cross product pour détecter le sens réel
  // cross > 0 = calca penche à droite
  // Pied D : droite = inversion(+), gauche = éversion(-)
  // Pied G : droite = éversion(-), gauche = inversion(+)
  if (view === 'dos' && pts) {
    const sign = calcAngleSign(pts);
    // calcAngleSign: +1 = calca penche à gauche, -1 = calca penche à droite
    // Pied D : penche droite(-1) = inversion(+), penche gauche(+1) = éversion(-)
    // Pied G : penche gauche(+1) = inversion(+), penche droite(-1) = éversion(-)
    if (side === 'D') return -sign * incl; // D: droite(-1)=Inv(+) → inverser signe
    if (side === 'G') return sign * incl; // G: gauche(+1)=Inv(+) → même signe
    return incl;
  }
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
 * Couleur CSS (variable) selon score KFPPA.
 * Seuils cliniques validés (Sprint 0 — 2026-04-26) :
 *   p = |pct| × 100
 *   60 ≤ p ≤ 140       → vert  (norme)
 *   20 ≤ p < 60 ou 140 < p ≤ 180 → orange (valeur limite)
 *   p < 20 ou p > 180  → rouge (hors norme)
 *
 * @param {number|null|undefined} pct  Score signé normalisé (1.0 = 100 %) ; null/undefined/NaN → 'var(--mut)'.
 * @returns {string}  Nom de variable CSS : 'var(--red)' | 'var(--orange)' | 'var(--green)' | 'var(--mut)'.
 */
export function clrKfppa(pct) {
  if (pct == null || isNaN(pct)) return 'var(--mut)';
  const p = Math.abs(pct) * 100;
  if (p < 20 || p > 180) return 'var(--red)';
  if (p < 60 || p > 140) return 'var(--orange)';
  return 'var(--green)';
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
