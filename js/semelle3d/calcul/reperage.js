// Repère du talon (pur) : sorti d'elements.js pour que l'axe de Henke puisse l'utiliser sans import circulaire.
import { estValide } from './grille.js';
import { ELEMENTS } from '../constantes.js';

export function reperTalon(base) {
  const { nx, ny, pas, ox, oy, haut } = base;
  let j0 = -1;
  for (let j = 0; j < ny && j0 < 0; j++) for (let i = 0; i < nx; i++) if (estValide(haut[j * nx + i])) { j0 = j; break; }
  if (j0 < 0) throw new RangeError('repère talon : empreinte vide');
  const jr = Math.min(ny - 1, j0 + Math.round(ELEMENTS.reperage_talon_mm / pas));
  for (let j = jr; j >= j0; j--) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < nx; i++) if (estValide(haut[j * nx + i])) { a = Math.min(a, i); b = Math.max(b, i); }
    if (a <= b) return { x_mm: ox + ((a + b) / 2) * pas, y_mm: oy + j0 * pas };
  }
  throw new RangeError('repère talon : empreinte vide');
}
