import test from 'node:test';
import assert from 'node:assert/strict';
import { maillerBase } from '../../js/semelle3d/calcul/maillage_base.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { aireContour, facesHautesRetournees } from './aides_base.js';

// plaque 5 x 4 nœuds au pas 0,5 -> 2,0 x 1,5 mm
const plaque = (haut, bas, dxy = null) => {
  const n = 20, h = new Float32Array(n), b = new Float32Array(n);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) { h[j * 5 + i] = haut(i * 0.5, j * 0.5); b[j * 5 + i] = bas(i * 0.5, j * 0.5); }
  return { nx: 5, ny: 4, pas: 0.5, ox: 0, oy: 0, haut: h, bas: b, ...(dxy || {}) };
};

test('base : plaque à dessous plat décalé (haut 2, bas 0,5) -> fermée, volume 1,5 x 3 = 4,5 mm3', () => {
  const v = verifierMaillage(maillerBase(plaque(() => 2, () => 0.5)));
  assert.equal(v.ferme, true); assert.equal(v.degeneres, 0);
  assert.ok(Math.abs(v.volume - 4.5) < 1e-6, 'volume ' + v.volume);
});

test('base : dessous incliné (bas = 0,1 x) -> fermé, volume exact 3 x 3 - 0,1 x 1 x 3 = 8,7 mm3', () => {
  const m = maillerBase(plaque(() => 3, (x) => 0.1 * x));
  const v = verifierMaillage(m);
  assert.equal(v.ferme, true);
  assert.ok(Math.abs(v.volume - 8.7) < 1e-5, 'volume ' + v.volume);
});

test('base : faces hautes vers +z, faces basses vers -z (dessous incliné)', () => {
  const m = maillerBase(plaque(() => 3, (x, y) => 0.2 * x + 0.1 * y));
  let bas = 0;
  for (let t = 0; t < m.nbTriangles; t++) {
    const [a, b, c] = [m.indices[3 * t], m.indices[3 * t + 1], m.indices[3 * t + 2]];
    if (a % 2 === 1 && b % 2 === 1 && c % 2 === 1) {
      const P = (i) => m.positions.subarray(3 * i, 3 * i + 3);
      const nz = (P(b)[0] - P(a)[0]) * (P(c)[1] - P(a)[1]) - (P(b)[1] - P(a)[1]) * (P(c)[0] - P(a)[0]);
      assert.ok(nz < 0, 'face basse tournée vers le haut'); bas++;
    }
  }
  assert.equal(bas, 24);
  assert.equal(facesHautesRetournees(m), 0);
});

test('base : épaisseur nulle ou négative refusée (le dessous ne peut jamais toucher le dessus)', () => {
  assert.throws(() => maillerBase(plaque(() => 2, (x) => (x === 1 ? 2 : 0))), RangeError);
  assert.throws(() => maillerBase(plaque(() => 2, () => 2.5)), RangeError);
});

test('base : contour déplacé (dx, dy) -> toujours fermé, aire du contour lue sur le maillage = aire attendue', () => {
  const dx = new Float32Array(20), dy = new Float32Array(20);
  for (let j = 0; j < 4; j++) { dx[j * 5] = -0.1; dx[j * 5 + 4] = 0.1; }
  const m = maillerBase(plaque(() => 2, () => 0, { dx, dy }));
  assert.equal(verifierMaillage(m).ferme, true);
  assert.ok(Math.abs(aireContour(m) - 2.2 * 1.5) < 1e-6, 'aire ' + aireContour(m));
});
