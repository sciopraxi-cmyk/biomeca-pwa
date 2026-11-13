// Carte de hauteur 2,5D : z = f(x, y) sur une grille régulière (Float32Array).
// Origine (ox, oy) = position du sommet (0, 0). X transversal, Y longitudinal.
// Une valeur NaN = hors contour (masque).
import { PAS_GRILLE_MM } from '../constantes.js';

export function creerGrille(nx, ny, pas = PAS_GRILLE_MM, ox = 0, oy = 0) {
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 2 || ny < 2) {
    throw new RangeError('grille : nx et ny doivent être des entiers >= 2');
  }
  if (!(pas > 0)) throw new RangeError('grille : pas > 0 requis');
  return { nx, ny, pas, ox, oy, z: new Float32Array(nx * ny) };
}

export const indice = (g, i, j) => j * g.nx + i;
export const estValide = (v) => Number.isFinite(v);

// fn(x_mm, y_mm) -> hauteur (mm) ou NaN pour « hors contour ».
export function remplir(g, fn) {
  for (let j = 0; j < g.ny; j++) {
    const y = g.oy + j * g.pas;
    for (let i = 0; i < g.nx; i++) {
      g.z[j * g.nx + i] = fn(g.ox + i * g.pas, y);
    }
  }
  return g;
}

export function compterValides(g) {
  let n = 0;
  for (let k = 0; k < g.z.length; k++) if (estValide(g.z[k])) n++;
  return n;
}

export function minMax(g) {
  let mn = Infinity;
  let mx = -Infinity;
  for (let k = 0; k < g.z.length; k++) {
    const v = g.z[k];
    if (!estValide(v)) continue;
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return compterValides(g) === 0 ? null : { min: mn, max: mx };
}

// Échantillonnage bilinéaire. NaN si hors grille ou si un des 4 coins est masqué.
export function echantillonner(g, x, y) {
  const fx = (x - g.ox) / g.pas;
  const fy = (y - g.oy) / g.pas;
  if (!(fx >= 0 && fy >= 0 && fx <= g.nx - 1 && fy <= g.ny - 1)) return NaN;
  const i = Math.min(Math.floor(fx), g.nx - 2);
  const j = Math.min(Math.floor(fy), g.ny - 2);
  const tx = fx - i;
  const ty = fy - j;
  const a = g.z[j * g.nx + i];
  const b = g.z[j * g.nx + i + 1];
  const c = g.z[(j + 1) * g.nx + i];
  const d = g.z[(j + 1) * g.nx + i + 1];
  if (!(estValide(a) && estValide(b) && estValide(c) && estValide(d))) return NaN;
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}
