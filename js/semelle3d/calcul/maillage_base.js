// Base -> maillage fermé avec DESSOUS VARIABLE et contour déplacé (lot 2).
// Même convention que maillage.js (lot 0) : haut CCW vu de +z, bas retourné, parois arête p->q intérieur à gauche.
// Entrée : { nx, ny, pas, ox, oy, haut (Float32Array, NaN = hors contour), bas (Float32Array), dx?, dy? (déplacement du contour) }.
import { estValide } from './grille.js';
import { EPSILON_HAUTEUR_MM } from '../constantes.js';

export function maillerBase(b, { epsilon = EPSILON_HAUTEUR_MM } = {}) {
  const { nx, ny, pas, ox, oy, haut, bas, dx, dy } = b;
  const cellule = (i, j) => {
    if (i < 0 || j < 0 || i > nx - 2 || j > ny - 2) return false;
    return estValide(haut[j * nx + i]) && estValide(haut[j * nx + i + 1]) && estValide(haut[(j + 1) * nx + i]) && estValide(haut[(j + 1) * nx + i + 1]);
  };
  const num = new Int32Array(nx * ny).fill(-1);
  const pos = [];
  let nbCellules = 0;
  const utiliser = (i, j) => {
    const k = j * nx + i;
    if (num[k] !== -1) return;
    const h = haut[k], z0 = bas[k];
    if (!(h - z0 > epsilon)) throw new RangeError('maillage : épaisseur <= ' + epsilon + ' mm en (' + i + ', ' + j + ')');
    const x = ox + i * pas + (dx ? dx[k] : 0), y = oy + j * pas + (dy ? dy[k] : 0);
    num[k] = pos.length / 6;
    pos.push(x, y, h, x, y, z0);
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!cellule(i, j)) continue;
    nbCellules++;
    utiliser(i, j); utiliser(i + 1, j); utiliser(i + 1, j + 1); utiliser(i, j + 1);
  }
  if (nbCellules === 0) throw new RangeError('maillage : aucune cellule valide');
  const T = (i, j) => num[j * nx + i] * 2;
  const B = (i, j) => num[j * nx + i] * 2 + 1;
  const idx = [];
  const tri = (a, c, d) => idx.push(a, c, d);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!cellule(i, j)) continue;
    tri(T(i, j), T(i + 1, j), T(i + 1, j + 1));
    tri(T(i, j), T(i + 1, j + 1), T(i, j + 1));
    tri(B(i, j), B(i + 1, j + 1), B(i + 1, j));
    tri(B(i, j), B(i, j + 1), B(i + 1, j + 1));
    const paroi = (pi, pj, qi, qj) => {
      tri(T(pi, pj), B(pi, pj), B(qi, qj));
      tri(T(pi, pj), B(qi, qj), T(qi, qj));
    };
    if (!cellule(i, j - 1)) paroi(i, j, i + 1, j);
    if (!cellule(i + 1, j)) paroi(i + 1, j, i + 1, j + 1);
    if (!cellule(i, j + 1)) paroi(i + 1, j + 1, i, j + 1);
    if (!cellule(i - 1, j)) paroi(i, j + 1, i, j);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), nbSommets: pos.length / 3, nbTriangles: idx.length / 3, nbCellules };
}
