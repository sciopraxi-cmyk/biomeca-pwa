/* global Buffer -- utilisé seulement par l'outil de construction de la bibliothèque (Node), jamais dans le navigateur */
// Élément STL -> carte de hauteur locale (script §5.14). Fonctions pures (outil de construction + tests ; pas chargé par le navigateur).
// Le STL est orienté (base à z = 0, face fonctionnelle vers le haut) ; on rasterise la FACE HAUTE (hauteur max par nœud, pas de 0,5 mm),
// et on recadre sur l'emprise du STL (nœuds portant une face haute).
// Limite assumée (script) : le 2,5D écrase les contre-dépouilles.
//   - élément « en relief »  : relief = z − plancher_mm (0 : le STL tel quel)   (signe +1)
//   - décharge « en creux »  : le fichier est une PLAQUE d'épaisseur `plaque_mm` avec un creux : relief = plaque − z  (signe −1)
import { lireMaillage } from './lecteurs.js';

export const ECHELLE_RELIEF = 0.001; // mm par unité du Uint16 stocké dans la fiche
const SEUIL_RELIEF_MM = 1e-4;

export function rasteriserDessus({ positions, indices }, pas) {
  let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity, za = Infinity, zb = -Infinity;
  for (let v = 0; v < positions.length; v += 3) {
    if (positions[v] < xa) xa = positions[v]; if (positions[v] > xb) xb = positions[v];
    if (positions[v + 1] < ya) ya = positions[v + 1]; if (positions[v + 1] > yb) yb = positions[v + 1];
    if (positions[v + 2] < za) za = positions[v + 2]; if (positions[v + 2] > zb) zb = positions[v + 2];
  }
  const ox = Math.round(xa / pas) * pas, oy = Math.round(ya / pas) * pas;
  const nx = Math.round((xb - ox) / pas) + 1, ny = Math.round((yb - oy) / pas) + 1;
  const z = new Float32Array(nx * ny).fill(-Infinity);
  for (let t = 0; t < indices.length; t += 3) {
    const ia = 3 * indices[t], ib = 3 * indices[t + 1], ic = 3 * indices[t + 2];
    const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2], bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2], cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];
    const aireZ = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!(aireZ > 1e-9)) continue; // seulement les faces dont la normale pointe vers le HAUT (dessous et parois écartés)
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / pas - 1e-9)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / pas + 1e-9));
    const j0 = Math.max(0, Math.ceil((Math.min(ay, by, cy) - oy) / pas - 1e-9)), j1 = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - oy) / pas + 1e-9));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = ox + i * pas, y = oy + j * pas;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue;
      const h = l1 * az + l2 * bz + l3 * cz, k = j * nx + i;
      if (h > z[k]) z[k] = h;
    }
  }
  return { nx, ny, pas, ox, oy, z, dims: [xb - xa, yb - ya, zb - za], bbox: { x: [xa, xb], y: [ya, yb], z: [za, zb] } };
}

// meta : { id, fichier, libelle, zone, signe (1|-1), plancher_mm (E_MIN du fichier), plaque_mm (décharge), plancher_fixe_mm, ... } -> fiche (JSON)
// REBORD SUPPRIMÉ (décision de Joël 31/10) : pour un relief, le plancher de bord de 0,4 mm du fichier est retiré ET la hauteur est remise à l'échelle
// (relief = (z − plancher) × zmax / (zmax − plancher)) : le bord arrive à 0 (aucune marche), le sommet garde EXACTEMENT la hauteur du STL, l'emprise reste celle du STL.
export async function stlVersFiche(buffer, meta, { pas = 0.5 } = {}) {
  const maillage = await lireMaillage(buffer);
  const R = rasteriserDessus(maillage, pas);
  const signe = meta.signe === -1 ? -1 : 1;
  const ref = signe === -1 ? meta.plaque_mm : (meta.plancher_mm === undefined ? 0 : meta.plancher_mm);
  if (!Number.isFinite(ref)) throw new TypeError('fiche ' + meta.id + ' : plaque_mm (épaisseur de la plaque) requise pour une décharge');
  let zmax = 0; for (let k = 0; k < R.z.length; k++) if (R.z[k] > zmax) zmax = R.z[k];
  const echelle = signe === 1 && zmax > ref ? zmax / (zmax - ref) : 1;
  let i0 = Infinity, i1 = -1, j0 = Infinity, j1 = -1, rmax = 0;
  const relief = new Float32Array(R.z.length);
  for (let j = 0; j < R.ny; j++) for (let i = 0; i < R.nx; i++) {
    const k = j * R.nx + i, z = R.z[k];
    if (z === -Infinity) continue;
    const r = signe === -1 ? ref - z : Math.max(0, z - ref) * echelle;
    if (r > SEUIL_RELIEF_MM) { relief[k] = r; if (r > rmax) rmax = r; }
    if (r > SEUIL_RELIEF_MM || signe === 1) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; } // relief : emprise du STL ; creux : zone creusée
  }
  if (i1 < 0) throw new RangeError('fiche ' + meta.id + ' : aucun relief trouvé');
  const nx = i1 - i0 + 1, ny = j1 - j0 + 1;
  const u16 = new Uint16Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) u16[j * nx + i] = Math.min(65535, Math.round(relief[(j0 + j) * R.nx + (i0 + i)] / ECHELLE_RELIEF));
  return {
    ...meta, signe, pas, nx, ny, echelle_hauteur: +echelle.toFixed(6),
    plancher_fixe_mm: +(signe === 1 ? Math.max(0, (meta.plancher_fixe_mm || 0) - ref) * echelle : (meta.plancher_fixe_mm || 0)).toFixed(4),
    x0: R.ox + i0 * pas, y0: R.oy + j0 * pas, // origine du recadrage dans le repère du fichier (X > 0 = médial pour un pied DROIT)
    decalage_y_mm: R.oy + j0 * pas - R.bbox.y[0], // recul entre le bord arrière du fichier et le relief
    relief_b64: Buffer.from(u16.buffer).toString('base64'),
    hauteur_ref_mm: +rmax.toFixed(3), dims_stl_mm: R.dims.map((v) => +v.toFixed(2)),
  };
}
