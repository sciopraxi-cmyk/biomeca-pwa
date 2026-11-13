import test from 'node:test';
import assert from 'node:assert/strict';
import { creerGrille, remplir, compterValides, minMax, echantillonner } from '../../js/semelle3d/calcul/grille.js';

test('grille : dimensions, Float32Array, pas par défaut 0,5 mm', () => {
  const g = creerGrille(10, 6);
  assert.ok(g.z instanceof Float32Array);
  assert.equal(g.z.length, 60);
  assert.equal(g.pas, 0.5);
  assert.throws(() => creerGrille(1, 5), RangeError);
});

test('grille : le masque NaN est compté et ignoré par minMax', () => {
  const g = creerGrille(4, 4);
  remplir(g, (x, y) => (x >= 1 ? NaN : 2 + y));
  // x = 0, 0.5 valides (i = 0,1) ; 4 lignes -> 8 valides
  assert.equal(compterValides(g), 8);
  assert.deepEqual(minMax(g), { min: 2, max: 3.5 });
});

test('grille : échantillonnage bilinéaire exact sur un plan z = 2x + 3y + 1', () => {
  const g = creerGrille(21, 21);
  remplir(g, (x, y) => 2 * x + 3 * y + 1);
  for (const [x, y] of [[0.3, 0.7], [4.9, 9.1], [10, 10], [0, 0], [7.25, 2.75]]) {
    assert.ok(Math.abs(echantillonner(g, x, y) - (2 * x + 3 * y + 1)) < 1e-4, 'en ' + x + ',' + y);
  }
});

test('grille : échantillonnage hors grille ou sur le masque = NaN', () => {
  const g = creerGrille(5, 5);
  remplir(g, (x, y) => (x > 1 ? NaN : 1));
  assert.ok(Number.isNaN(echantillonner(g, -0.1, 0.5)));
  assert.ok(Number.isNaN(echantillonner(g, 0.5, 2.1)));
  assert.ok(Number.isNaN(echantillonner(g, 1.2, 0.5))); // coin masqué
  assert.equal(echantillonner(g, 0.5, 0.5), 1);
});
