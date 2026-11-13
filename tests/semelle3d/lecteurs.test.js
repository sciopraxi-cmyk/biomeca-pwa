import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { lireMaillage, detecterFormat, ErreurFormat } from '../../js/semelle3d/calcul/lecteurs.js';
import { ecrireSTLAscii, ecrireSTLBinaireScan, ecrireOBJ, ecrireOBJQuad, ecrirePLY, ecrire3MF } from '../../js/semelle3d/calcul/ecrivains_scans.js';
import { scanPiedSurface } from '../../js/semelle3d/calcul/synthetique.js';
import { coordsTriangles } from './aides.js';

const petit = scanPiedSurface({ cote: 'D', pas_mm: 8 }); // maillage OUVERT (surface) : quelques centaines de triangles
const ref = coordsTriangles(petit);
const proche = (a, b, tol) => { assert.equal(a.length, b.length); let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); assert.ok(m <= tol, 'écart max ' + m + ' > ' + tol); };

const cas = [
  ['stl_binaire', () => ecrireSTLBinaireScan(petit), 1e-4],
  ['stl_ascii', () => ecrireSTLAscii(petit), 0],
  ['obj', () => ecrireOBJ(petit), 0],
  ['obj', () => ecrireOBJ(petit, { negatifs: true }), 0],
  ['ply_ascii', () => ecrirePLY(petit, { format: 'ascii' }), 1e-4],
  ['ply_bin_little', () => ecrirePLY(petit, { format: 'binary_little_endian' }), 1e-4],
  ['ply_bin_big', () => ecrirePLY(petit, { format: 'binary_big_endian' }), 1e-4],
  ['3mf', () => ecrire3MF(petit), 0],
  ['3mf', () => ecrire3MF(petit, { compresseur: (u8) => new Uint8Array(deflateRawSync(u8)) }), 0],
];
for (const [format, fab, tol] of cas) {
  test('lecture ' + format + ' : les triangles relus sont ceux écrits (maillage ouvert, couleurs/normales ignorées)', async () => {
    let m;
    try { m = await lireMaillage(fab()); } catch (e) { assert.fail('lecture refusée : ' + e.message); }
    assert.equal(m.format, format);
    assert.equal(m.nbTriangles, petit.indices.length / 3);
    proche(coordsTriangles(m), ref, tol);
  });
}

test('STL binaire dont l\'en-tête commence par « solid » : lu comme binaire (la taille tranche)', async () => {
  const buf = ecrireSTLBinaireScan(petit, { entete: 'solid cree par un scanner' });
  assert.equal(new TextDecoder().decode(new Uint8Array(buf, 0, 5)), 'solid');
  assert.equal(detecterFormat(buf), 'stl_binaire');
  let m;
  try { m = await lireMaillage(buf); } catch (e) { assert.fail('lecture refusée : ' + e.message); }
  assert.equal(m.nbTriangles, petit.indices.length / 3);
});

test('polygones : un quadrilatère OBJ ou PLY donne 2 triangles (éventail) et un avertissement', async () => {
  const pts = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]];
  const o = await lireMaillage(ecrireOBJQuad(pts));
  assert.equal(o.nbTriangles, 2);
  assert.deepEqual([...o.indices], [0, 1, 2, 0, 2, 3]);
  assert.equal(o.avertissements.length, 1);
  const ply = 'ply\nformat ascii 1.0\nelement vertex 4\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n10 0 0\n10 10 0\n0 10 0\n4 0 1 2 3\n';
  const p = await lireMaillage(new TextEncoder().encode(ply).buffer);
  assert.deepEqual([...p.indices], [0, 1, 2, 0, 2, 3]);
});

test('3MF : la transformation de l\'élément de construction est appliquée', async () => {
  const tri = { positions: Float64Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: Uint32Array.from([0, 1, 2]) };
  const m = await lireMaillage(ecrire3MF(tri, { transform: '1 0 0 0 1 0 0 0 1 100 200 300' }));
  assert.deepEqual([...m.positions.slice(0, 3)], [100, 200, 300]);
  assert.deepEqual([...m.positions.slice(3, 6)], [110, 200, 300]);
});

test('fichiers invalides : tous refusés par ErreurFormat, jamais lus à moitié', async () => {
  const bin = ecrireSTLBinaireScan(petit);
  const asc = new TextDecoder().decode(ecrireSTLAscii(petit));
  const trois = new Uint8Array(ecrire3MF(petit));
  const trois2 = trois.slice(); trois2[Buffer.from(trois2).indexOf('<vertex x="') + 12] ^= 1; // un chiffre du modèle modifié : CRC faux
  const ply = ecrirePLY(petit, { format: 'binary_little_endian' });
  const invalides = {
    'STL binaire tronqué': bin.slice(0, bin.byteLength - 70),
    'STL ASCII avec NaN': new TextEncoder().encode(asc.replace(/vertex (\S+)/, 'vertex NaN')).buffer,
    'STL ASCII tronqué': new TextEncoder().encode(asc.slice(0, asc.lastIndexOf('vertex') - 3)).buffer,
    'OBJ indice hors limites': new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 9\n').buffer,
    'OBJ indice 0': new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 0 1 2\n').buffer,
    'PLY tronqué': ply.slice(0, ply.byteLength - 20),
    '3MF CRC faux': trois2.buffer,
    '3MF tronqué': trois.slice(0, 100).buffer,
    'octets quelconques': new Uint8Array(200).fill(7).buffer,
    'fichier vide': new ArrayBuffer(2),
  };
  for (const [nom, buf] of Object.entries(invalides)) {
    await assert.rejects(() => lireMaillage(buf), ErreurFormat, nom);
  }
});
