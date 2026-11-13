// Vérification d'un maillage indexé : fermeture, orientation, volume, dégénérés.
import { SEUIL_TRIANGLE_DEGENERE_MM2 } from '../constantes.js';

export function verifierMaillage({ positions, indices }) {
  const nv = positions.length / 3;
  const nt = indices.length / 3;
  const dirigees = new Map(); // a*nv+b -> nombre
  let volume6 = 0;
  let degeneres = 0;
  const bbox = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let k = 0; k < positions.length; k += 3) {
    for (let a = 0; a < 3; a++) {
      bbox.min[a] = Math.min(bbox.min[a], positions[k + a]);
      bbox.max[a] = Math.max(bbox.max[a], positions[k + a]);
    }
  }
  for (let t = 0; t < nt; t++) {
    const a = indices[3 * t];
    const b = indices[3 * t + 1];
    const c = indices[3 * t + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p * nv + q;
      dirigees.set(key, (dirigees.get(key) || 0) + 1);
    }
    const A = positions.subarray(3 * a, 3 * a + 3);
    const B = positions.subarray(3 * b, 3 * b + 3);
    const C = positions.subarray(3 * c, 3 * c + 3);
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
    const aire = 0.5 * Math.hypot(nx, ny, nzz);
    if (a === b || b === c || a === c || aire < SEUIL_TRIANGLE_DEGENERE_MM2) degeneres++;
    volume6 += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  let aretesLibres = 0; // arête sans partenaire de sens inverse
  let orientationIncoherente = 0; // même arête dirigée utilisée plusieurs fois
  let nonManifold = 0;
  for (const [key, n] of dirigees) {
    const p = Math.floor(key / nv);
    const q = key - p * nv;
    const inverse = dirigees.get(q * nv + p) || 0;
    if (n > 1) orientationIncoherente++;
    if (inverse === 0) aretesLibres++;
    if (n + inverse > 2) nonManifold++;
  }
  return {
    nbSommets: nv,
    nbTriangles: nt,
    ferme: aretesLibres === 0 && orientationIncoherente === 0 && nonManifold === 0,
    aretesLibres,
    orientationIncoherente,
    nonManifold,
    degeneres,
    volume: volume6 / 6, // > 0 si les normales sortent
    bbox,
  };
}
