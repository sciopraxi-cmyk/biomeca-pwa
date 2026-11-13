// Écriture et relecture du STL BINAIRE (écrit à la main : pas de STLExporter).
// Format : 80 octets d'en-tête, uint32 nb triangles, puis 50 octets par triangle
// (normale 3 x float32, 3 sommets x 3 x float32, 2 octets d'attribut = 0). Little-endian.
// Unité : millimètre (le STL ne porte pas d'unité : à confirmer dans le trancheur).
import { SEUIL_TRIANGLE_DEGENERE_MM2 } from '../constantes.js';

export const ENTETE_STL = 'Verticy Semelle3D prototype - unite: mm'; // ne doit JAMAIS commencer par « solid »

export function ecrireSTLBinaire({ positions, indices }) {
  const nt = indices.length / 3;
  const buf = new ArrayBuffer(84 + 50 * nt);
  const dv = new DataView(buf);
  const entete = new TextEncoder().encode(ENTETE_STL);
  new Uint8Array(buf, 0, 80).set(entete.subarray(0, 80));
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = 3 * indices[3 * t], b = 3 * indices[3 * t + 1], c = 3 * indices[3 * t + 2];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (!(l / 2 > SEUIL_TRIANGLE_DEGENERE_MM2)) throw new RangeError('stl : triangle dégénéré n°' + t);
    nx /= l; ny /= l; nz /= l;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    o += 12;
    for (const s of [a, b, c]) {
      dv.setFloat32(o, positions[s], true); dv.setFloat32(o + 4, positions[s + 1], true); dv.setFloat32(o + 8, positions[s + 2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return buf;
}

export function lireSTLBinaire(buf) {
  if (buf.byteLength < 84) throw new RangeError('stl : fichier trop court');
  const dv = new DataView(buf);
  const nt = dv.getUint32(80, true);
  if (buf.byteLength !== 84 + 50 * nt) throw new RangeError('stl : taille incohérente avec le nombre de triangles');
  const entete = new TextDecoder().decode(new Uint8Array(buf, 0, 80));
  const normales = new Float32Array(3 * nt);
  const sommets = new Float32Array(9 * nt);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) normales[3 * t + k] = dv.getFloat32(o + 4 * k, true);
    for (let k = 0; k < 9; k++) sommets[9 * t + k] = dv.getFloat32(o + 12 + 4 * k, true);
    o += 50;
  }
  return { entete, nbTriangles: nt, normales, sommets };
}

// Soude les sommets identiques (coordonnées exactement égales) -> maillage indexé.
export function indexerSommets({ sommets, nbTriangles }) {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  const bits = (x) => { f32[0] = x; return u32[0]; };
  const map = new Map();
  const pos = [];
  const indices = new Uint32Array(3 * nbTriangles);
  for (let s = 0; s < 3 * nbTriangles; s++) {
    const x = sommets[3 * s], y = sommets[3 * s + 1], z = sommets[3 * s + 2];
    const key = bits(x) + '_' + bits(y) + '_' + bits(z);
    let id = map.get(key);
    if (id === undefined) { id = pos.length / 3; map.set(key, id); pos.push(x, y, z); }
    indices[s] = id;
  }
  return { positions: Float32Array.from(pos), indices };
}

// Nom : {ref_fictive}_{cote}_{date}.stl  (ref nettoyée, aucun identifiant réel attendu)
export function nomFichierSTL(refFictive, cote, dateISO) {
  if (cote !== 'D' && cote !== 'G') throw new RangeError('stl : côté D ou G obligatoire');
  const ref = String(refFictive).replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!ref) throw new RangeError('stl : référence vide');
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO);
  if (!m) throw new RangeError('stl : date ISO attendue');
  return ref + '_' + cote + '_' + m[1] + m[2] + m[3] + '.stl';
}
