// Géométrie des poignées et du glisser-déposer (lot 4b). Fonctions PURES : la vue 3D (vue/edition3d.js) ne fait que lire un pointeur et dessiner.
// Repère : (X, Y) = plan du pied affiché (mm, comme les sommets de la 3D) ; rep = repère talon du rapport ; med = -1 (pied D) ou +1 (pied G).
// Repère local d'un élément : a = vers le médial (t), b = vers l'avant (u), origine = PIVOT = centre de l'élément ; la rotation `angle_plan_deg` (θ) tourne autour de lui :
//   plan = (med × (a cosθ + b sinθ), −a sinθ + b cosθ). θ > 0 : l'avant penche vers le médial, quel que soit le pied (le miroir est automatique).
import { ELEMENT_BORD, COIN_POSTERIEUR, SOUTIEN_VOUTE, POINT_CURSEUR, ROTATION_PLAN } from '../constantes.js';
import { ETIREMENT_IMPORTE } from './bibliotheque.js';

const rad = (d) => (d * Math.PI) / 180;
const arrondi = (v) => Math.round(v * 10) / 10;
const borner = (v, { min, max }) => Math.min(max, Math.max(min, v));
export const medial = (cote) => { if (cote !== 'D' && cote !== 'G') throw new TypeError('poignées : côté D ou G attendu'); return cote === 'D' ? -1 : 1; };

const coinAncre = (T, el) => !!T.coteHaut && el.ancrage !== 'libre';

// Ce qu'on peut faire à la souris avec un élément.
// Un bord médial ou latéral seul (voûte, flange, arche, aileron) : la poignée verte d'étendue tire vers l'AUTRE bord du pied. Cuvette (3 bords) et bord postérieur : sans.
export const bordUnique = (T) => !!T.bord && T.bords.length === 1 && T.bords[0] !== 'posterieur';
export function capacites(T, el) {
  if (!T || T.recouvrement) return { deplace: '', longueur: false, largeur: false, rotation: false, rayon: false };
  if (T.point) return { deplace: 'xy', longueur: false, largeur: false, rotation: false, rayon: true };
  if (T.bord) return { deplace: 'y', longueur: true, largeur: false, rotation: false, rayon: false, bord: true, largeurBord: bordUnique(T) };
  if (coinAncre(T, el)) return { deplace: 'y', longueur: true, largeur: false, rotation: false, rayon: false, bord: true, coinAncre: true };
  return { deplace: 'xy', longueur: true, largeur: true, rotation: !T.coteHaut, rayon: false };
}

// Bornes de taille (mm) d'un type d'élément : les mêmes que la validation du noyau.
export function bornesTaille(T) {
  if (T.point) return { rayon: POINT_CURSEUR.rayon_mm };
  if (T.bord) return { largeur: ELEMENT_BORD.largeur_mm, longueur: ELEMENT_BORD.longueur_mm };
  if (T.importe) return { largeur: { min: T.largeur_ref_mm * ETIREMENT_IMPORTE.facteur_min, max: T.largeur_ref_mm * ETIREMENT_IMPORTE.facteur_max }, longueur: { min: T.longueur_ref_mm * ETIREMENT_IMPORTE.facteur_min, max: T.longueur_ref_mm * ETIREMENT_IMPORTE.facteur_max } };
  if (T.coteHaut) return { largeur: COIN_POSTERIEUR.largeur_mm, longueur: COIN_POSTERIEUR.longueur_mm };
  return { largeur: SOUTIEN_VOUTE.largeur_mm, longueur: SOUTIEN_VOUTE.longueur_mm };
}

// ---- repère local <-> plan ----
export function localVersPlan(a, b, theta_deg, med) { const t = rad(theta_deg || 0), c = Math.cos(t), s = Math.sin(t); return { x: med * (a * c + b * s), y: -a * s + b * c }; }
export function planVersLocal(dX, dY, theta_deg, med) { const t = rad(theta_deg || 0), c = Math.cos(t), s = Math.sin(t), tt = med * dX; return { a: tt * c - dY * s, b: tt * s + dY * c }; }

// Décalage (en y, mm) entre le pivot et la valeur dy_mm de l'élément : dy = bord arrière d'un élément importé, début d'un coin ancré, milieu des autres.
const decalagePivotY = (T, el) => (T.importe || coinAncre(T, el) ? el.longueur_mm / 2 : 0);

// Pivot (centre) d'un élément dans le plan. Bord / coin ancré : x = repère talon (la vue cherche le vrai bord du pied sur le maillage).
export function pivotPlan(el, T, rep, med) {
  const dx = T.bord || coinAncre(T, el) ? 0 : el.dx_mm;
  return { x: rep.x_mm + med * dx, y: rep.y_mm + el.dy_mm + decalagePivotY(T, el) };
}
// Inverse : valeurs à écrire dans l'élément pour que son pivot soit en (X, Y). Seuls les axes permis par `capacites` sont modifiés.
export function reglagesPourPivot(el, T, rep, med, X, Y) {
  const cap = capacites(T, el), p = {};
  if (cap.deplace.includes('x')) p.dx_mm = arrondi(med * (X - rep.x_mm));
  if (cap.deplace.includes('y')) { let dy = arrondi(Y - rep.y_mm - decalagePivotY(T, el)); if (cap.coinAncre) dy = Math.max(0, dy); p.dy_mm = dy; }
  return p;
}

// Poignées d'un élément sélectionné, en repère local (a, b) depuis le pivot. `rot` : à RAYON_ROT_MM au-delà du bord avant.
export const RAYON_ROT_MM = 12;
export function poigneesLocales(el, T) {
  const cap = capacites(T, el), W = el.largeur_mm, L = el.longueur_mm, h = [];
  if (cap.rayon) h.push({ id: 'R', a: el.rayon_mm, b: 0 });
  if (cap.largeur) h.push({ id: 'W+', a: W / 2, b: 0 }, { id: 'W-', a: -W / 2, b: 0 });
  if (cap.largeurBord) h.push({ id: 'W+', a: 0, b: 0 }); // placée par la vue : sur la ligne perpendiculaire au bord, à `largeur_mm` du vrai bord du pied
  if (cap.coinAncre) h.push({ id: 'L+', a: 0, b: L / 2 });
  else if (cap.longueur) h.push({ id: 'L+', a: 0, b: L / 2 }, { id: 'L-', a: 0, b: -L / 2 });
  if (cap.rotation) h.push({ id: 'rot', a: 0, b: L / 2 + RAYON_ROT_MM });
  return h;
}

// Emprise dessinée (contour) en repère local : rectangle (4 coins) ou cercle (rayon).
export function contourLocal(el, T) {
  if (T.point) return { cercle: el.rayon_mm };
  const W = el.largeur_mm / 2, L = el.longueur_mm / 2;
  return { rect: [[-W, -L], [W, -L], [W, L], [-W, L]] };
}

// Le pointeur (X, Y) est-il dans l'élément ? (bords et coins ancrés : non, ils se saisissent par leur poignée)
export function contient(el, T, rep, med, X, Y) {
  const cap = capacites(T, el); if (cap.bord || !cap.deplace) return false;
  const c = pivotPlan(el, T, rep, med), { a, b } = planVersLocal(X - c.x, Y - c.y, el.angle_plan_deg || 0, med);
  if (T.point) return Math.hypot(a, b) <= el.rayon_mm;
  return Math.abs(a) <= el.largeur_mm / 2 && Math.abs(b) <= el.longueur_mm / 2;
}
export const aire = (el, T) => (T.point ? Math.PI * el.rayon_mm ** 2 : el.largeur_mm * el.longueur_mm);

// Effet du glisser d'une poignée (id) jusqu'au pointeur (X, Y). Renvoie les réglages à écrire ({} = rien).
// Étirement : le bord opposé reste FIXE (le centre se déplace de la moitié). Rayon et rotation : autour du pivot.
export function glisserPoignee(el, T, rep, med, id, X, Y, bornes = bornesTaille(T), { bordX } = {}) {
  if (!poigneesLocales(el, T).some((h) => h.id === id)) return {}; // poignée inexistante pour ce type
  const c = pivotPlan(el, T, rep, med), cap = capacites(T, el);
  const dX = X - c.x, dY = Y - c.y, th = el.angle_plan_deg || 0;
  if (id === 'R') return { rayon_mm: arrondi(borner(Math.hypot(dX, dY), bornes.rayon)) };
  if (id === 'rot') {
    let d = (Math.atan2(med * dX, dY) * 180) / Math.PI; // direction de l'axe avant
    const k = Math.round(d / 15) * 15; if (Math.abs(d - k) < 2) d = k; // aimantation tous les 15°
    return { angle_plan_deg: borner(Math.round(d), ROTATION_PLAN) };
  }
  if (id === 'W+' && cap.largeurBord) { // étendue d'un bord : distance du vrai bord du pied (bordX, mesuré par la vue) au pointeur, vers l'intérieur du pied ; le bord reste fixe
    if (!Number.isFinite(bordX)) return {};
    const versBord = T.bords[0] === 'medial' ? med : -med; // sens axe -> bord
    return { largeur_mm: arrondi(borner((X - bordX) * -versBord, bornes.largeur)) };
  }
  if (cap.coinAncre) { // seule la longueur change (début fixe)
    const y0 = rep.y_mm + el.dy_mm;
    return { longueur_mm: arrondi(borner(Y - y0, bornes.longueur)) };
  }
  if (cap.bord) { // bord : on tire l'extrémité avant ou arrière, l'autre reste ; dy = milieu
    const y0 = rep.y_mm + el.dy_mm, L = el.longueur_mm;
    const fixe = id === 'L+' ? y0 - L / 2 : y0 + L / 2, sens = id === 'L+' ? 1 : -1;
    const n = arrondi(borner((Y - fixe) * sens, bornes.longueur));
    return { longueur_mm: n, dy_mm: arrondi(fixe + (sens * n) / 2 - rep.y_mm) };
  }
  const { a, b } = planVersLocal(dX, dY, th, med);
  let W = el.largeur_mm, L = el.longueur_mm, sa = 0, sb = 0;
  if (id === 'W+' || id === 'W-') { const s = id === 'W+' ? 1 : -1, n = arrondi(borner(a * s + W / 2, bornes.largeur)); sa = (s * (n - W)) / 2; W = n; }
  else if (id === 'L+' || id === 'L-') { const s = id === 'L+' ? 1 : -1, n = arrondi(borner(b * s + L / 2, bornes.longueur)); sb = (s * (n - L)) / 2; L = n; }
  else return {};
  const dep = localVersPlan(sa, sb, th, med), neuf = { ...el, largeur_mm: W, longueur_mm: L };
  return { largeur_mm: W, longueur_mm: L, ...reglagesPourPivot(neuf, T, rep, med, c.x + dep.x, c.y + dep.y) };
}
