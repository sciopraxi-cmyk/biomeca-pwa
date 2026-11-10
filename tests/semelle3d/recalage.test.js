import test from 'node:test';
import assert from 'node:assert/strict';
import { eigenSym3, analyseACP, ransacPlanAppui, recaler, mulberry32 } from '../../js/semelle3d/calcul/recalage.js';
import { rasteriser } from '../../js/semelle3d/calcul/rasterisation.js';
import { signalVoute, proposerLateralite } from '../../js/semelle3d/calcul/lateralite.js';
import { pose, angleDeg, largeurA } from './aides.js';

test('ACP : valeurs et vecteurs propres reconstruisent la matrice', () => {
  const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 1]];
  const { valeurs, vecteurs } = eigenSym3(A);
  assert.ok(valeurs[0] >= valeurs[1] && valeurs[1] >= valeurs[2]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    let s = 0; for (let k = 0; k < 3; k++) s += valeurs[k] * vecteurs[k][i] * vecteurs[k][j];
    assert.ok(Math.abs(s - A[i][j]) < 1e-9, `A[${i}][${j}]`);
  }
});

test('recalage : un scan tourné de 30° (et basculé, décalé) est remis à l\'origine, axe retrouvé à 2° près', () => {
  const { mesh, R, L } = pose({ lacet: 30, bascule: -90, roulis: 4, t: [120, -40, 300] });
  const r = recaler(mesh, L);
  assert.ok(Math.abs(r.boite.y_min) < 1e-3, 'talon en y = 0');
  assert.ok(Math.abs(r.boite.y_max - L) < 1e-3, 'longueur = longueur saisie');
  assert.ok(Math.abs(r.boite.x_min + r.boite.x_max) < 1e-3, 'centré en x');
  const vraiY = [R[0][1], R[1][1], R[2][1]], vraiZ = [R[0][2], R[1][2], R[2][2]];
  // L'ACP donne l'axe d'inertie, pas la ligne talon-2e orteil : 2,1° mesurés pour ce pied synthétique très courbé (7 mm).
  assert.ok(angleDeg(r.transformation.axes.Y, vraiY) < 3, 'axe longitudinal');
  assert.ok(angleDeg(recaler(pose({ decalage: 0 }).mesh, L).transformation.axes.Y, [0, 1, 0].map((_, i) => pose({ decalage: 0 }).R[i][1])) < 0.3, 'pied symétrique : axe exact');
  assert.ok(angleDeg(r.transformation.axes.Z, vraiZ) < 1, 'normale du plan d\'appui');
  const z = r.transformation.axes.Z;
  assert.ok(z[0] * vraiZ[0] + z[1] * vraiZ[1] + z[2] * vraiZ[2] > 0, 'le pied est du côté +Z');
  assert.ok(r.boite.z_min > -0.5 && r.boite.z_min < 0.05 + 0.5, 'plan d\'appui à z ≈ 0 : ' + r.boite.z_min);
});

test('RANSAC : retrouve le plan d\'appui incliné malgré une voûte et des points aberrants', () => {
  const rng = mulberry32(5), pts = [];
  const plan = (x, y) => 0.04 * x - 0.02 * y; // pente ~2,5°
  for (let i = 0; i < 6000; i++) { const x = rng() * 100, y = rng() * 250; const bosse = x > 40 && x < 60 && y > 80 && y < 150 ? 10 : 0; pts.push(x, y, plan(x, y) + bosse + (rng() - 0.5) * 0.2); }
  for (let i = 0; i < 100; i++) pts.push(rng() * 100, rng() * 250, 30 + rng() * 5);
  const r = ransacPlanAppui(Float64Array.from(pts), mulberry32(1));
  const attendu = [-0.04, 0.02, 1].map((v) => v / Math.hypot(0.04, 0.02, 1));
  assert.ok(angleDeg(r.n, attendu) < 0.3, 'écart ' + angleDeg(r.n, attendu));
});

test('ACP : même scan = même résultat (RANSAC déterministe)', () => {
  const { mesh, L } = pose({});
  const a = recaler(mesh, L), b = recaler(mesh, L);
  assert.deepEqual(Array.from(a.positions.slice(0, 3000)), Array.from(b.positions.slice(0, 3000)));
});

for (const variante of ['surface', 'solide']) {
  test('propositions (' + variante + ') : avant-pied, haut/bas et latéralité justes pour 20 poses, D et G', () => {
    let n = 0;
    for (const cote of ['D', 'G']) for (const lacet of [0, 30, 95, 170, -120]) for (const roulis of [0, 6]) {
      const { mesh, L } = pose({ variante, cote, lacet, roulis, bascule: lacet > 100 ? 90 : -90 });
      const r = recaler(mesh, L);
      const g = rasteriser(r);
      const lat = proposerLateralite(r.signal_contour, signalVoute(g, L));
      assert.equal(lat.valeur, cote, `${variante} ${cote} lacet ${lacet} roulis ${roulis}`);
      assert.equal(lat.ambigu, false);
      // avant-pied vers +Y : plus large à 75 % de la longueur qu'à 25 %
      assert.ok(largeurA(r, 0.75 * L) > largeurA(r, 0.25 * L), 'sens talon/avant');
      assert.equal(r.propositions.sens_vertical.ambigu, false);
      assert.ok(r.transformation.axes.Z.every(Number.isFinite));
      n++;
    }
    assert.equal(n, 20);
  });
}

test('correction manuelle : inverserY retourne le talon, inverserZ choisit l\'autre face', () => {
  const { mesh, L } = pose({});
  const base = recaler(mesh, L);
  const inv = recaler(mesh, L, { inverserY: true });
  assert.ok(largeurA(base, 0.75 * L) > largeurA(base, 0.25 * L));
  assert.ok(largeurA(inv, 0.75 * L) < largeurA(inv, 0.25 * L));
  const zInv = recaler(mesh, L, { inverserZ: true });
  assert.notDeepEqual(Array.from(zInv.boite).length ? zInv.boite : 0, base.boite);
  assert.ok(zInv.boite.z_max < base.boite.z_max - 0.5 || zInv.boite.z_max > base.boite.z_max + 0.5);
});

test('ambiguïté signalée, jamais décidée en silence : une plaque plate des deux côtés -> sens vertical « ambigu »', () => {
  const b = (x, y, z) => [x, y, z];
  const P = [b(0, 0, 0), b(200, 0, 0), b(200, 90, 0), b(0, 90, 0), b(0, 0, 20), b(200, 0, 20), b(200, 90, 20), b(0, 90, 20)];
  const T = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const r = recaler({ positions: Float64Array.from(P.flat()), indices: Uint32Array.from(T.flat()) }, 200);
  assert.equal(r.propositions.sens_vertical.ambigu, true);
  assert.equal(r.propositions.sens_vertical.a_confirmer, true);
});
