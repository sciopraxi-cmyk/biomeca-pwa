// Rasterisation d'un maillage (repère final, mm) en carte de hauteur 2,5D : un rayon vertical ascendant
// par nœud de grille ; on garde la PREMIÈRE surface rencontrée par en dessous (la face plantaire).
// Sans intersection -> NaN (masque). Écrite par nous, sans dépendance, sans BVH.
import { creerGrille } from './grille.js';
import { PAS_GRILLE_MM } from '../constantes.js';

const EPS_BORD = 1e-7; // tolérance barycentrique : deux triangles voisins couvrent aussi leur arête commune
// Une surface plus raide que ~80° n'est pas une face plantaire (paroi d'un scan épais) : la cellule est masquée.
export const COS_PENTE_MAX = Math.cos((80 * Math.PI) / 180);

export function rasteriser({ positions, indices }, { pas = PAS_GRILLE_MM, boite } = {}) {
  const nv = positions.length / 3;
  const nt = indices.length / 3;
  let b = boite;
  if (!b) {
    b = { x_min: Infinity, x_max: -Infinity, y_min: Infinity, y_max: -Infinity };
    for (let i = 0; i < indices.length; i++) {
      const v = indices[i];
      const x = positions[3 * v], y = positions[3 * v + 1];
      if (x < b.x_min) b.x_min = x; if (x > b.x_max) b.x_max = x; if (y < b.y_min) b.y_min = y; if (y > b.y_max) b.y_max = y;
    }
  }
  const ox = Math.floor((b.x_min + 1e-6) / pas) * pas;
  const oy = Math.floor((b.y_min + 1e-6) / pas) * pas;
  const nx = Math.ceil((b.x_max - ox - 1e-6) / pas) + 1;
  const ny = Math.ceil((b.y_max - oy - 1e-6) / pas) + 1;
  const g = creerGrille(Math.max(nx, 2), Math.max(ny, 2), pas, ox, oy);
  const z = g.z;
  z.fill(Infinity);
  const raide = new Uint8Array(z.length);
  void nv;
  for (let t = 0; t < nt; t++) {
    const ia = 3 * indices[3 * t], ib = 3 * indices[3 * t + 1], ic = 3 * indices[3 * t + 2];
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
    const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
    const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue; // triangle vertical ou dégénéré : sans surface vue d'en bas
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nn = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const estRaide = Math.abs(ux * vy - uy * vx) / nn < COS_PENTE_MAX ? 1 : 0;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / pas - 1e-9));
    const i1 = Math.min(g.nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / pas + 1e-9));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / pas - 1e-9));
    const j1 = Math.min(g.ny - 1, Math.floor((Math.max(ay, by, cy) - oy) / pas + 1e-9));
    for (let j = j0; j <= j1; j++) {
      const y = oy + j * pas;
      for (let i = i0; i <= i1; i++) {
        const x = ox + i * pas;
        const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
        const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -EPS_BORD || l2 < -EPS_BORD || l3 < -EPS_BORD) continue;
        const h = l1 * az + l2 * bz + l3 * cz;
        const k = j * g.nx + i;
        if (h < z[k]) { z[k] = h; raide[k] = estRaide; }
      }
    }
  }
  let masquees = 0;
  for (let k = 0; k < z.length; k++) {
    if (z[k] === Infinity) z[k] = NaN;
    else if (raide[k]) { z[k] = NaN; masquees++; }
  }
  g.cellules_pente_raide = masquees;
  return g;
}
