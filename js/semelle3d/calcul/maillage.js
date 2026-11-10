// Carte de hauteur -> maillage fermé (solide).
// Face supérieure : 2 triangles par cellule valide. Face inférieure : plane (z = 0).
// Parois : le long du contour (bords de la zone de cellules valides), pas de la grille.
// Sommets partagés (indexation). Normales sortantes (sens trigonométrique vu de l'extérieur).
// Limite lot 0 : le contour suit les cellules de la grille (marches d'escalier de 0,5 mm).
import { estValide } from './grille.js';
import { EPSILON_HAUTEUR_MM } from '../constantes.js';

export function maillerCarte(g, { epsilon = EPSILON_HAUTEUR_MM } = {}) {
  const { nx, ny, pas, ox, oy, z } = g;
  const cellule = (i, j) => {
    if (i < 0 || j < 0 || i > nx - 2 || j > ny - 2) return false;
    return (
      estValide(z[j * nx + i]) &&
      estValide(z[j * nx + i + 1]) &&
      estValide(z[(j + 1) * nx + i]) &&
      estValide(z[(j + 1) * nx + i + 1])
    );
  };
  // 1) sommets utilisés
  const num = new Int32Array(nx * ny).fill(-1);
  const posTemp = [];
  let nbCellules = 0;
  const utiliser = (i, j) => {
    const k = j * nx + i;
    if (num[k] === -1) {
      const h = z[k];
      if (!(h > epsilon)) {
        throw new RangeError('maillage : hauteur <= ' + epsilon + ' mm en (' + i + ', ' + j + ')');
      }
      num[k] = posTemp.length / 6;
      posTemp.push(ox + i * pas, oy + j * pas, h, ox + i * pas, oy + j * pas, 0);
    }
  };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (!cellule(i, j)) continue;
      nbCellules++;
      utiliser(i, j);
      utiliser(i + 1, j);
      utiliser(i + 1, j + 1);
      utiliser(i, j + 1);
    }
  }
  if (nbCellules === 0) throw new RangeError('maillage : aucune cellule valide');
  const T = (i, j) => num[j * nx + i] * 2; // sommet haut
  const B = (i, j) => num[j * nx + i] * 2 + 1; // sommet bas
  const idx = [];
  const tri = (a, b, c) => idx.push(a, b, c);
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (!cellule(i, j)) continue;
      // a=(i,j) b=(i+1,j) c=(i+1,j+1) d=(i,j+1)
      tri(T(i, j), T(i + 1, j), T(i + 1, j + 1)); // haut
      tri(T(i, j), T(i + 1, j + 1), T(i, j + 1));
      tri(B(i, j), B(i + 1, j + 1), B(i + 1, j)); // bas (retourné)
      tri(B(i, j), B(i, j + 1), B(i + 1, j + 1));
      // parois : arête p->q (intérieur à gauche), extérieur à droite
      const paroi = (pi, pj, qi, qj) => {
        tri(T(pi, pj), B(pi, pj), B(qi, qj));
        tri(T(pi, pj), B(qi, qj), T(qi, qj));
      };
      if (!cellule(i, j - 1)) paroi(i, j, i + 1, j); // côté -y
      if (!cellule(i + 1, j)) paroi(i + 1, j, i + 1, j + 1); // côté +x
      if (!cellule(i, j + 1)) paroi(i + 1, j + 1, i, j + 1); // côté +y
      if (!cellule(i - 1, j)) paroi(i, j + 1, i, j); // côté -x
    }
  }
  return {
    positions: Float32Array.from(posTemp),
    indices: Uint32Array.from(idx),
    nbSommets: posTemp.length / 3,
    nbTriangles: idx.length / 3,
    nbCellules,
  };
}
