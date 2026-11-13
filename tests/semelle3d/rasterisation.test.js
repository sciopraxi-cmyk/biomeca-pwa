import test from 'node:test';
import assert from 'node:assert/strict';
import { rasteriser } from '../../js/semelle3d/calcul/rasterisation.js';
import { compterValides } from '../../js/semelle3d/calcul/grille.js';

const maillage = (pts, tris) => ({ positions: Float64Array.from(pts.flat()), indices: Uint32Array.from(tris.flat()) });
const z = (g, x, y) => g.z[Math.round((y - g.oy) / g.pas) * g.nx + Math.round((x - g.ox) / g.pas)];

test('rasterisation : la hauteur d\'un plan incliné est exacte aux nœuds, à la bonne position (x, y)', () => {
  const f = (x, y) => 2 + 0.1 * x + 0.05 * y;
  const pts = [[3, 4], [23, 4], [23, 14], [3, 14]].map(([x, y]) => [x, y, f(x, y)]);
  const g = rasteriser(maillage(pts, [[0, 1, 2], [0, 2, 3]]), { pas: 0.5 });
  for (const [x, y] of [[3, 4], [10, 7], [12.5, 9.5], [22.5, 13.5], [23, 14]]) assert.ok(Math.abs(z(g, x, y) - f(x, y)) < 1e-4, `(${x},${y}) : ${z(g, x, y)} vs ${f(x, y)}`);
  assert.equal(g.ox % 0.5, 0);
  assert.equal(g.oy % 0.5, 0);
});

test('rasterisation : hors du contour = NaN, nombre exact de nœuds couverts, aucun trou sur l\'arête commune', () => {
  const pts = [[0, 0, 1], [10, 0, 1], [10, 10, 1], [0, 10, 1]];
  const g = rasteriser(maillage(pts, [[0, 1, 2], [0, 2, 3]]), { pas: 0.5, boite: { x_min: -2, x_max: 12, y_min: -2, y_max: 12 } });
  assert.equal(compterValides(g), 21 * 21); // la diagonale n'ouvre aucun trou
  assert.ok(Number.isNaN(z(g, -1, 5)));
  assert.ok(Number.isNaN(z(g, 5, 11)));
  assert.equal(z(g, 5, 5), 1);
});

test('rasterisation : rayon ascendant -> première surface par en dessous (face plantaire d\'un solide)', () => {
  const carre = (h) => [[0, 0, h], [10, 0, h], [10, 10, h], [0, 10, h]];
  const m = maillage([...carre(5), ...carre(1.5)], [[0, 1, 2], [0, 2, 3], [4, 5, 6], [4, 6, 7]]);
  const g = rasteriser(m, { pas: 0.5 });
  assert.equal(z(g, 5, 5), 1.5);
});

test('rasterisation : un triangle vertical est ignoré sans erreur', () => {
  const m = maillage([[0, 0, 0], [10, 0, 0], [10, 0, 5], [0, 0, 0], [10, 0, 0], [0, 10, 2]], [[0, 1, 2], [3, 4, 5]]);
  const g = rasteriser(m, { pas: 0.5 });
  assert.ok(compterValides(g) > 0);
});

test('rasterisation : la paroi raide d\'un solide épais est masquée (pas de pic le long du contour)', async () => {
  const { pose } = await import('./aides.js');
  const { recaler } = await import('../../js/semelle3d/calcul/recalage.js');
  const { minMax } = await import('../../js/semelle3d/calcul/grille.js');
  const { sc, mesh, L } = pose({ variante: 'solide', decalage: 0, roulis: 5 });
  const g = rasteriser(recaler(mesh, L));
  let reliefMax = 0;
  for (let y = 0; y < L; y += 0.5) for (let x = -60; x <= 60; x += 0.5) if (sc.modele.dedans(x, y)) reliefMax = Math.max(reliefMax, sc.modele.relief(x, y));
  const mm = minMax(g);
  assert.ok(mm.max <= reliefMax + 0.5, 'pic de ' + mm.max + ' mm pour un relief de ' + reliefMax);
  assert.ok(g.cellules_pente_raide >= 0);
});
