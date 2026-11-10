// Aides de tests (pas de test ici) : scans synthétiques en pose arbitraire.
import { scanPiedSurface, scanPiedSolide, transformerMaillage, rotX, rotY, rotZ, produit, deg } from '../../js/semelle3d/calcul/synthetique.js';

export function longueurY(m) { let a = Infinity, b = -Infinity; for (let v = 1; v < m.positions.length; v += 3) { a = Math.min(a, m.positions[v]); b = Math.max(b, m.positions[v]); } return b - a; }
export function pose({ variante = 'surface', cote = 'D', lacet = 30, bascule = -90, roulis = 4, facteur = 1, t = [120, -40, 300], decalage = 7, pas = 1 } = {}) {
  const sc = (variante === 'solide' ? scanPiedSolide : scanPiedSurface)({ cote, pas_mm: pas, decalage_medial_mm: decalage });
  const R = produit(rotZ(deg(lacet)), produit(rotX(deg(bascule)), rotY(deg(roulis))));
  const mesh = transformerMaillage(sc, { R, t, facteur });
  return { sc, R, mesh, L: longueurY(sc) };
}
export const coordsTriangles = (m) => { const o = new Float64Array(m.indices.length * 3); for (let i = 0; i < m.indices.length; i++) for (let k = 0; k < 3; k++) o[3 * i + k] = m.positions[3 * m.indices[i] + k]; return o; };
export const angleDeg = (a, b) => (Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)))) * 180) / Math.PI;
export function largeurA(mesh, y, demi = 8) { let a = Infinity, b = -Infinity; for (let v = 0; v < mesh.positions.length; v += 3) { const yy = mesh.positions[v + 1]; if (Math.abs(yy - y) <= demi) { a = Math.min(a, mesh.positions[v]); b = Math.max(b, mesh.positions[v]); } } return b - a; }
