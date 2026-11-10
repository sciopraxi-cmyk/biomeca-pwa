import test from 'node:test';
import assert from 'node:assert/strict';
import { genererDome } from '../../js/semelle3d/calcul/synthetique.js';
import { maillerCarte } from '../../js/semelle3d/calcul/maillage.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { ecrireSTLBinaire, lireSTLBinaire, indexerSommets, nomFichierSTL } from '../../js/semelle3d/calcul/stl.js';

const g = genererDome();
const mesh = maillerCarte(g);
const stl = ecrireSTLBinaire(mesh);
const relu = lireSTLBinaire(stl);

test('STL : taille = 84 + 50 x triangles, en-tête sans « solid »', () => {
  assert.equal(stl.byteLength, 84 + 50 * mesh.nbTriangles);
  assert.equal(relu.nbTriangles, mesh.nbTriangles);
  assert.ok(!relu.entete.trimStart().toLowerCase().startsWith('solid'));
});

test('STL : normales unitaires et conformes au sens des sommets', () => {
  for (let t = 0; t < relu.nbTriangles; t += 97) {
    const n = relu.normales.subarray(3 * t, 3 * t + 3);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-5);
    const s = relu.sommets.subarray(9 * t, 9 * t + 9);
    const u = [s[3] - s[0], s[4] - s[1], s[5] - s[2]], v = [s[6] - s[0], s[7] - s[1], s[8] - s[2]];
    const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const dot = (c[0] * n[0] + c[1] * n[1] + c[2] * n[2]) / Math.hypot(...c);
    assert.ok(dot > 0.99999, 'triangle ' + t);
  }
});

test('STL relu (pas le maillage mémoire) : fermé, volume signé > 0, aucun dégénéré', () => {
  const v = verifierMaillage(indexerSommets(relu));
  assert.equal(v.ferme, true, JSON.stringify(v));
  assert.equal(v.aretesLibres, 0);
  assert.equal(v.degeneres, 0);
  assert.ok(v.volume > 0);
  const v0 = verifierMaillage(mesh);
  assert.ok(Math.abs(v.volume - v0.volume) / v0.volume < 1e-9);
});

test('STL relu : dimensions attendues et épaisseur minimale respectée', () => {
  const v = verifierMaillage(indexerSommets(relu));
  assert.equal(v.bbox.min[2], 0); // dessous plat à z = 0
  const largeur = v.bbox.max[0] - v.bbox.min[0];
  const longueur = v.bbox.max[1] - v.bbox.min[1];
  assert.ok(Math.abs(largeur - 90) < 1.5, 'largeur ' + largeur); // ellipse 2 x 45 mm ; contour en marches de 0,5 mm : jusqu'à ~1 mm de moins
  assert.ok(Math.abs(longueur - 250) < 1.5, 'longueur ' + longueur); // ellipse 2 x 125 mm
  assert.ok(Math.abs(v.bbox.max[2] - 11) < 0.05, 'hauteur max ' + v.bbox.max[2]); // 3 + 8
  // épaisseur = z des sommets hauts (le dessous est à 0) : min >= 3 mm
  let mn = Infinity;
  for (let k = 2; k < relu.sommets.length; k += 3) if (relu.sommets[k] > 0) mn = Math.min(mn, relu.sommets[k]);
  assert.ok(mn >= 3 - 1e-6, 'épaisseur min ' + mn);
});

test('STL : fichier tronqué ou incohérent refusé', () => {
  assert.throws(() => lireSTLBinaire(stl.slice(0, stl.byteLength - 10)), RangeError);
  assert.throws(() => lireSTLBinaire(new ArrayBuffer(50)), RangeError);
});

test('STL : écriture déterministe (mêmes octets à chaque fois)', () => {
  const b = ecrireSTLBinaire(maillerCarte(genererDome()));
  assert.deepEqual(new Uint8Array(b), new Uint8Array(stl));
});

test('STL : nom de fichier {ref}_{côté}_{date}.stl', () => {
  assert.equal(nomFichierSTL('Patient Fictif 01', 'D', '2026-10-31T10:00:00Z'), 'Patient-Fictif-01_D_20261031.stl');
  assert.throws(() => nomFichierSTL('x', 'X', '2026-10-31T10:00:00Z'), RangeError);
  assert.throws(() => nomFichierSTL('///', 'G', '2026-10-31T10:00:00Z'), RangeError);
  assert.throws(() => nomFichierSTL('x', 'G', 'hier'), RangeError);
});
