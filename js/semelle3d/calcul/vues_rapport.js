// B3 : vues FIGÉES de l'image du rapport (projection orthographique, même échelle pour toutes les vues).
// Fonctions pures : la scène 3D ne fait que les appliquer (vue/image_rapport.js). Repère : x = côté du patient, y = longueur (talon à 0), z = hauteur.
// Convention : le côté médial d'un pied DROIT est en -X (voir lateralite.js).
import { IMAGE_RAPPORT as P } from '../constantes.js';

const rad = (d) => (d * Math.PI) / 180;
const prod = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norme = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const VUES_RAPPORT = ['dessus', 'trois-quarts-medial'];

// Direction (de la cible vers la caméra) et « haut » écran de chaque vue.
export function directionVue(vue, cote) {
  if (cote !== 'D' && cote !== 'G') throw new Error('côté invalide : ' + cote);
  const medial = cote === 'G' ? 1 : -1; // signe de x du côté médial
  if (vue === 'dessus') return { dir: [0, 0, 1], haut: [0, 1, 0] }; // avant-pied en haut
  if (vue === 'trois-quarts-medial') {
    const el = rad(P.elevation_deg), az = rad(P.azimut_deg);
    // caméra du côté médial, relevée de « elevation », décalée vers l'arrière (talon plus près de l'œil)
    return { dir: norme([medial * Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), Math.sin(el)]), haut: [0, 0, 1] };
  }
  throw new Error('vue inconnue : ' + vue);
}

function base(dir, haut) {
  const avant = [-dir[0], -dir[1], -dir[2]]; // direction du regard
  let droite = prod(avant, haut);
  droite = norme(droite);
  const h = norme(prod(droite, avant));
  return { droite, haut: h, avant };
}

// Coordonnées écran (mm, repère droite/haut de la vue) d'un point 3D, par rapport à la cible.
export function projeter(vue, cote, point, cible = [0, 0, 0]) {
  const { dir, haut } = directionVue(vue, cote), b = base(dir, haut);
  const d = [point[0] - cible[0], point[1] - cible[1], point[2] - cible[2]];
  return { x: dot(d, b.droite), y: dot(d, b.haut) };
}

const coins = (b) => { const L = []; for (const x of [b.x_min, b.x_max]) for (const y of [b.y_min, b.y_max]) for (const z of [b.z_min, b.z_max]) L.push([x, y, z]); return L; };

// boite = { x_min, x_max, y_min, y_max, z_min, z_max } de ce qu'on photographie (semelle + éléments, relief ×1).
// Rend, par vue : position/cible/haut de la caméra, taille de l'image en pixels et demi-fenêtre orthographique en mm.
// Même échelle (px par mm) pour toutes les vues : la perspective fabriquerait de fausses asymétries.
export function vuesRapport(boite, cote, { pxParMm = P.px_par_mm, vues = VUES_RAPPORT } = {}) {
  for (const k of ['x_min', 'x_max', 'y_min', 'y_max', 'z_min', 'z_max']) if (!Number.isFinite(boite[k])) throw new Error('boîte invalide : ' + k);
  if (!(pxParMm > 0)) throw new Error('échelle invalide');
  const c = [(boite.x_min + boite.x_max) / 2, (boite.y_min + boite.y_max) / 2, (boite.z_min + boite.z_max) / 2];
  const diag = Math.hypot(boite.x_max - boite.x_min, boite.y_max - boite.y_min, boite.z_max - boite.z_min);
  return vues.map((vue) => {
    const { dir, haut } = directionVue(vue, cote), b = base(dir, haut);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of coins(boite)) { const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], u = dot(d, b.droite), v = dot(d, b.haut); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    const marge = P.marge_mm, larg = x1 - x0 + 2 * marge, haut_mm = y1 - y0 + 2 * marge;
    const cible = c; // une boîte est symétrique par rapport à son centre : sa projection l'est aussi, la vue est déjà centrée
    const distance = diag * 2 + 100; // loin : orthographique, la distance ne change pas l'échelle
    return {
      vue, cote, haut, cible, position: [cible[0] + dir[0] * distance, cible[1] + dir[1] * distance, cible[2] + dir[2] * distance], distance,
      demi_largeur_mm: larg / 2, demi_hauteur_mm: haut_mm / 2, px_par_mm: pxParMm,
      largeur_px: Math.round(larg * pxParMm), hauteur_px: Math.round(haut_mm * pxParMm),
    };
  });
}
