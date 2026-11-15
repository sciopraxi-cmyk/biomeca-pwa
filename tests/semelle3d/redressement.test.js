import test from 'node:test';
import assert from 'node:assert/strict';
import { clicRedressement, REDRESSEMENT, normaliserPoints, verifierPoints, planDes3Points, rotationVersZ, redresserPositions, pointsRedresses } from '../../js/semelle3d/calcul/redressement.js';
import { recaler } from '../../js/semelle3d/calcul/recalage.js';
import { analyserScan } from '../../js/semelle3d/calcul/modeA.js';
import { pose } from './aides.js';

const P = (x, y, z) => ({ x, y, z });
const BONS = { talon: P(0, 0, 0), m1: P(-30, 190, 0), m5: P(35, 170, 0) };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('points : trois points valides acceptés, plan horizontal si les z sont égaux', () => {
  assert.equal(verifierPoints(BONS).ok, true);
  const plan = planDes3Points(BONS);
  assert.ok(Math.abs(plan.inclinaison_deg) < 1e-9);
  assert.ok(Math.abs(plan.n[2] - 1) < 1e-12);
});

test('points : refus un par un (manquant, trop proches, alignés, M1/M5 derrière le talon)', () => {
  assert.equal(verifierPoints(null).ok, false);
  assert.equal(verifierPoints({ talon: BONS.talon, m1: BONS.m1 }).ok, false);
  assert.equal(verifierPoints({ ...BONS, m5: P(NaN, 1, 1) }).ok, false);
  assert.match(verifierPoints({ ...BONS, m5: P(-30, 200, 0) }).erreurs.join(' '), /trop proches/); // m1 et m5 à 10 mm
  assert.match(verifierPoints({ talon: P(0, 0, 0), m1: P(0, 100, 0), m5: P(0, 200, 0) }).erreurs.join(' '), /alignés/);
  assert.match(verifierPoints({ talon: P(0, 100, 0), m1: P(-30, 120, 0), m5: P(40, 130, 0) }).erreurs.join(' '), /devant le talon/);
  assert.throws(() => planDes3Points({ ...BONS, m5: P(-30, 200, 0) }), /redressement/);
  assert.throws(() => normaliserPoints({ talon: P(0, 0, 0) }), /m1/);
});

test('plan : un avant-pied relevé de 5° donne 5° ; au-delà de 25° refusé', () => {
  const dz = 190 * Math.tan((5 * Math.PI) / 180);
  const plan = planDes3Points({ talon: P(0, 0, 0), m1: P(-30, 190, dz), m5: P(35, 190, dz) });
  assert.ok(Math.abs(plan.inclinaison_deg - 5) < 1e-6, String(plan.inclinaison_deg));
  assert.ok(plan.n[2] > 0);
  const raide = 190 * Math.tan((30 * Math.PI) / 180);
  assert.throws(() => planDes3Points({ talon: P(0, 0, 0), m1: P(-30, 190, raide), m5: P(35, 190, raide) }), /incliné/);
  // normale retournée si les points sont donnés dans l'autre sens
  const plan2 = planDes3Points({ talon: P(0, 0, 0), m1: P(35, 190, dz), m5: P(-30, 190, dz) });
  assert.ok(plan2.n[2] > 0);
});

test('rotation : orthonormale, amène la normale sur +Z, talon fixe, distances conservées', () => {
  const n = (() => { const v = [0.1, -0.3, 0.9]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
  const R = rotationVersZ(n);
  const Rn = R.map((l) => l[0] * n[0] + l[1] * n[1] + l[2] * n[2]);
  assert.ok(Math.abs(Rn[0]) < 1e-12 && Math.abs(Rn[1]) < 1e-12 && Math.abs(Rn[2] - 1) < 1e-12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.ok(Math.abs(R[i][0] * R[j][0] + R[i][1] * R[j][1] + R[i][2] * R[j][2] - (i === j ? 1 : 0)) < 1e-12);
  const dz = 190 * Math.tan((6 * Math.PI) / 180);
  const pts = { talon: P(5, 3, 7), m1: P(-30, 190, 7 + dz), m5: P(35, 170, 7 + dz * 0.9) };
  const pos = new Float32Array([5, 3, 7, -30, 190, 7 + dz, 35, 170, 7 + dz * 0.9, 50, 80, 20]);
  const avant = [0, 1, 2, 3].map((i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
  const r = redresserPositions(pos, pts);
  assert.ok(r.angle_deg > 5 && r.angle_deg < 7);
  const apres = [0, 1, 2, 3].map((i) => [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
  assert.ok(dist(apres[0], [5, 3, 0]) < 1e-4, 'talon fixe en x,y et z = 0');
  assert.ok(Math.abs(apres[1][2]) < 1e-3 && Math.abs(apres[2][2]) < 1e-3, 'M1 et M5 dans le plan z = 0');
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(Math.abs(dist(avant[i], avant[j]) - dist(apres[i], apres[j])) < 1e-3, 'rotation rigide');
  const pr = pointsRedresses(pts);
  assert.ok(Math.abs(pr.m1.z) < 1e-9 && Math.abs(pr.m5.z) < 1e-9 && Math.abs(pr.talon.z) < 1e-9);
});

// --- intégration : même scan, avec et sans redressement ---
function sommetsPied(mesh, L) {
  const r0 = recaler(mesh, L);
  const pos = r0.positions, n = pos.length / 3;
  const choisir = (f) => { let b = -1, bs = -Infinity; for (let v = 0; v < n; v++) { const s = f(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]); if (s > bs) { bs = s; b = v; } } return b; };
  const talon = choisir((x, y, z) => -y - 0.01 * z);
  const m1 = choisir((x, y, z) => (y > 0.68 * L && y < 0.74 * L ? -x - 0.01 * z : -1e9));
  const m5 = choisir((x, y, z) => (y > 0.64 * L && y < 0.72 * L ? x - 0.01 * z : -1e9));
  const pt = (v) => P(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]);
  return { r0, idx: { talon, m1, m5 }, pts: { talon: pt(talon), m1: pt(m1), m5: pt(m5) } };
}

test('recalage : avec 3 points, ces 3 sommets du scan tombent dans le plan z = 0 ; sans points rien ne change', () => {
  const { mesh, L } = pose({});
  const { r0, idx, pts } = sommetsPied(mesh, L);
  const sans = recaler(mesh, L);
  assert.deepEqual(Array.from(sans.positions), Array.from(r0.positions), 'sans redressement : identique à l\'automatique');
  assert.equal(sans.redressement, null);
  // avant-pied « relevé » : les points cliqués sont 6 mm plus haut que la surface
  const haut = { talon: pts.talon, m1: { ...pts.m1, z: pts.m1.z + 6 }, m5: { ...pts.m5, z: pts.m5.z + 6 } };
  const r1 = recaler(mesh, L, { redressement: haut });
  assert.ok(r1.redressement.angle_deg > 0.5 && r1.redressement.angle_deg < 10);
  assert.ok(Math.abs(r1.boite.y_min) < 1e-3, 'talon en y = 0 conservé');
  assert.ok(Math.abs(r1.boite.x_min + r1.boite.x_max) < 1e-3, 'centré en x conservé');
  // les sommets d'origine : leur z a bougé de façon cohérente (rotation rigide : longueurs conservées entre deux sommets)
  const a = [0, 1, 2].map((k) => [r0.positions[3 * k], r0.positions[3 * k + 1], r0.positions[3 * k + 2]]);
  const b = [0, 1, 2].map((k) => [r1.positions[3 * k], r1.positions[3 * k + 1], r1.positions[3 * k + 2]]);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.abs(dist(a[i], a[j]) - dist(b[i], b[j])) < 1e-2);
  // points posés exactement sur la surface : z du sommet ~ identique pour les 3 après redressement
  const surf = recaler(mesh, L, { redressement: pts });
  const zs = ['talon', 'm1', 'm5'].map((k) => surf.positions[3 * idx[k] + 2]);
  assert.ok(Math.abs(zs[0] - zs[1]) < 0.05 && Math.abs(zs[0] - zs[2]) < 0.05, 'z des 3 sommets égaux : ' + zs);
  assert.ok(Math.abs(zs[0]) < 0.05, 'plan à z = 0');
});

test('analyserScan : le redressement passe dans le rapport, la grille est refaite, et un point invalide est refusé', () => {
  const { mesh, L } = pose({});
  const { pts } = sommetsPied(mesh, L);
  const auto = analyserScan(mesh, { longueur_mm: L });
  assert.equal(auto.rapport.redressement, null);
  const haut = { talon: pts.talon, m1: { ...pts.m1, z: pts.m1.z + 6 }, m5: { ...pts.m5, z: pts.m5.z + 6 } };
  const red = analyserScan(mesh, { longueur_mm: L, redressement: haut });
  assert.deepEqual(red.rapport.redressement.points, haut);
  assert.ok(red.rapport.redressement.angle_deg > 0.5);
  assert.notDeepEqual(Array.from(red.grille.z).slice(0, 2000), Array.from(auto.grille.z).slice(0, 2000));
  assert.throws(() => analyserScan(mesh, { longueur_mm: L, redressement: { talon: pts.talon, m1: pts.m1 } }), /redressement/);
  assert.equal(REDRESSEMENT.cles.length, 3);
});

test('pose des points : ordre talon, M1, M5 ; le 4e clic est ignoré', () => {
  let e = { points: {} };
  e = clicRedressement(e, { x: 1, y: 2, z: 3 });
  assert.deepEqual(Object.keys(e.points), ['talon']);
  e = clicRedressement(e, { x: 4, y: 5, z: 6 });
  e = clicRedressement(e, { x: 7, y: 8, z: 9 });
  assert.deepEqual(e.points, { talon: { x: 1, y: 2, z: 3 }, m1: { x: 4, y: 5, z: 6 }, m5: { x: 7, y: 8, z: 9 } });
  const apres = clicRedressement(e, { x: 100, y: 100, z: 100 });
  assert.deepEqual(apres.points, e.points, '4e clic sans effet');
});

test('rotation : points déjà dans un plan horizontal -> aucun mouvement, aucun NaN', () => {
  const pos = new Float32Array([0, 0, 0, -30, 190, 0, 35, 170, 0, 10, 50, 12]);
  const avant = Array.from(pos);
  const r = redresserPositions(pos, BONS);
  assert.equal(r.angle_deg, 0);
  assert.deepEqual(Array.from(pos), avant);
  assert.ok(Array.from(pos).every(Number.isFinite));
});

test('rotation : chaque coefficient de la matrice compte (rotation d\'un point connu autour de X et de Y)', () => {
  // plan incliné autour de l'axe X (avant-pied relevé) : le point (0, 100, 0) doit tourner dans le plan Y-Z
  const a = (7 * Math.PI) / 180, dz = 190 * Math.tan(a);
  const pos = new Float32Array([0, 100, 0, 50, 0, 0]);
  redresserPositions(pos, { talon: P(0, 0, 0), m1: P(-30, 190, dz), m5: P(35, 190, dz) });
  assert.ok(Math.abs(pos[1] - 100 * Math.cos(a)) < 1e-3 && Math.abs(pos[2] + 100 * Math.sin(a)) < 1e-3, 'rotation autour de X : ' + Array.from(pos).slice(0, 3));
  assert.ok(Math.abs(pos[3] - 50) < 1e-4 && Math.abs(pos[5]) < 1e-4, 'un point sur l\'axe de rotation ne bouge pas');
  // plan incliné autour de l'axe Y (côté interne relevé)
  const b = (5 * Math.PI) / 180, dz2 = 100 * Math.tan(b);
  const pos2 = new Float32Array([100, 0, 0]);
  redresserPositions(pos2, { talon: P(0, 0, 0), m1: P(100, 190, dz2), m5: P(100, 120, dz2) });
  assert.ok(Math.abs(pos2[0] - 100 * Math.cos(b)) < 1e-3 && Math.abs(pos2[2] + 100 * Math.sin(b)) < 1e-3, 'rotation autour de Y : ' + Array.from(pos2));
});
