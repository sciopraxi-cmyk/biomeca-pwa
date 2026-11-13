// Lot 4 bis, étape 5 : pied mannequin (noyau pur) — maillage fermé, rotation exacte, couplage triplan, flèches.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/semelle3d/calcul/mannequin.js';
import { angleFrontal, rotationAutourAxe, versHenke } from '../../js/semelle3d/calcul/axe-henke.js';
import { MANNEQUIN, HENKE } from '../../js/semelle3d/constantes.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { modelePiedRealiste } from '../../js/semelle3d/calcul/pied_realiste.js';

const axe = { inclinaison_deg: 42, deviation_deg: 16, p0: { x: -7, y: 13 } };
const RAD = Math.PI / 180, rep = { x_mm: 3, y_mm: 7 };
const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message) }); a.cause = e; throw a; } };
const T = (nom, f) => test(nom, () => garde(f));
const grilleD = () => M.grilleDuModele(modelePiedRealiste({ longueur_mm: 265, cote: 'D', voute_mm: 15 }));

T('champs plantaires : distance signée (dedans > 0), plante prolongée sans trou, étendue du pied', () => {
  const nx = 40, ny = 60, z = new Float32Array(nx * ny).fill(NaN); for (let j = 10; j < 50; j++) for (let i = 10; i < 30; i++) z[j * nx + i] = 3;
  const c = M.champsPlantaires({ nx, ny, pas: 1, ox: 0, oy: 0, z });
  assert.ok(Math.abs(c.d[30 * nx + 20] - 9.5) < 2.2, 'au milieu : ' + c.d[30 * nx + 20]); assert.ok(c.d[30 * nx + 5] < 0 && Math.abs(c.d[30 * nx + 5] + 4.5) < 0.8); assert.ok(c.d[30 * nx + 10] > 0 && c.d[30 * nx + 10] < 1);
  assert.ok(c.bas.every((v) => Number.isFinite(v))); assert.equal(c.bas[30 * nx + 2], 3); assert.equal(c.ymin, 10); assert.equal(c.ymax, 49);
  assert.throws(() => M.champsPlantaires({ nx: 5, ny: 5, pas: 1, ox: 0, oy: 0, z: new Float32Array(25).fill(NaN) }), /vide/);
});
T('tétraèdres marchants : une sphère donne un maillage fermé, tourné vers l\'extérieur, de volume 4/3 π r³ à 3 % près', () => {
  const n = 41, h = 1, F = new Float32Array(n * n * n); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) F[(k * n + j) * n + i] = 15 - Math.hypot(i - 20, j - 20, k - 20);
  const m = M.maillerChamp(F, n, n, n, h, 0, 0, 0), v = verifierMaillage(m);
  assert.equal(v.ferme, true); assert.equal(v.nonManifold, 0); assert.ok(v.volume > 0, 'orientation vers l\'extérieur'); assert.ok(Math.abs(v.volume / (4 / 3 * Math.PI * 3375) - 1) < 0.03, 'volume ' + v.volume);
  for (let q = 0; q < m.positions.length; q += 3) assert.ok(Math.abs(Math.hypot(m.positions[q] - 20, m.positions[q + 1] - 20, m.positions[q + 2] - 20) - 15) < 0.6);
});
T('rotation : identique à rotationAutourAxe du module Henke, D et G (repères convertis)', () => {
  const P = Float32Array.from([30, 80, 20, -20, 150, 5, 0, 13, 0]);
  for (const c of ['D', 'G']) for (const phi of [-12, -3, 0.5, 7, 15]) {
    const R = M.poserPied(P, axe, phi, rep, c, 0);
    for (let v = 0; v < P.length; v += 3) { const h = versHenke({ x: P[v], y: P[v + 1] }, rep, c), q = rotationAutourAxe({ x: h.x, y: h.y, z: P[v + 2] }, axe, phi, 0), sx = c === 'D' ? -1 : 1; assert.ok(Math.abs(R[v] - (rep.x_mm + sx * q.x)) < 1e-3 && Math.abs(R[v + 1] - (rep.y_mm + q.y)) < 1e-3 && Math.abs(R[v + 2] - q.z) < 1e-3, c + ' phi ' + phi + ' point ' + v / 3); }
  }
});
T('rotation : phi = 0 ne bouge rien, l\'entrée n\'est pas modifiée, un point de l\'axe reste en place, les distances sont conservées', () => {
  const P = Float32Array.from([30, 80, 20, -20, 150, 5]), copie = Float32Array.from(P);
  assert.deepEqual(Array.from(M.poserPied(P, axe, 0, rep, 'D')), Array.from(P));
  const R = M.poserPied(P, axe, 9, rep, 'D'); assert.deepEqual(Array.from(P), Array.from(copie));
  const piv = M.pivotAxe(axe, rep, 'D', 0), A = Float32Array.from(piv), Rp = M.poserPied(A, axe, 9, rep, 'D'); for (let q = 0; q < 3; q++) assert.ok(Math.abs(Rp[q] - piv[q]) < 1e-4);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); assert.ok(Math.abs(d([R[0], R[1], R[2]], [R[3], R[4], R[5]]) - d([P[0], P[1], P[2]], [P[3], P[4], P[5]])) < 1e-3);
});
T('supination (phi > 0) : le côté médial MONTE, pied D comme pied G ; pronation : il descend ; miroir D/G exact', () => {
  for (const c of ['D', 'G']) {
    const med = c === 'D' ? -1 : 1, P = Float32Array.from([rep.x_mm + med * 40, 60, 0, rep.x_mm - med * 40, 60, 0]);
    const S = M.poserPied(P, axe, 8, rep, c), Pr = M.poserPied(P, axe, -8, rep, c);
    assert.ok(S[2] > 0.5 && S[5] < -0.5, c + ' supination : médial vers le haut'); assert.ok(Pr[2] < -0.5 && Pr[5] > 0.5, c + ' pronation : médial vers le bas');
  }
  const P = Float32Array.from([30, 80, 20]), mir = (a) => Float32Array.from([2 * rep.x_mm - a[0], a[1], a[2]]);
  const D = M.poserPied(P, axe, 6, rep, 'D'), G = M.poserPied(mir(P), axe, 6, rep, 'G'); const gm = mir(G); for (let q = 0; q < 3; q++) assert.ok(Math.abs(gm[q] - D[q]) < 1e-3);
});
T('pente frontale exacte : même signe et même ordre de grandeur que atan(tan φ cos λ cos δ) (écart petits angles < 2 %), D = G', () => {
  for (const phi of [2, 5, 10, -5, -10]) {
    const e = M.penteFrontaleExacte(axe, phi, 'D'), g = M.penteFrontaleExacte(axe, phi, 'G'), f = angleFrontal(phi, axe);
    assert.ok(Math.abs(e - g) < 1e-9, 'D = G'); assert.ok(Math.sign(e) === Math.sign(f)); assert.ok(Math.abs(e - f) < 0.03 * Math.abs(f) + 0.02 * Math.abs(phi) * Math.abs(phi) / 10, `phi ${phi} : ${e} contre ${f}`);
  }
  assert.equal(M.penteFrontaleExacte(axe, 0, 'D'), 0);
});
T('triplan : composantes = phi × cosλ cosδ, sinλ, cosλ sinδ ; signes et noms de mouvement ; 0 = neutre', () => {
  const l = 42 * RAD, d = 16 * RAD, t = M.composantesTriplan(5, axe);
  assert.ok(Math.abs(t.frontal.deg - 5 * Math.cos(l) * Math.cos(d)) < 1e-9); assert.ok(Math.abs(t.transversal.deg - 5 * Math.sin(l)) < 1e-9); assert.ok(Math.abs(t.sagittal.deg - 5 * Math.cos(l) * Math.sin(d)) < 1e-9);
  assert.deepEqual([t.frontal.sens, t.transversal.sens, t.sagittal.sens, t.mouvement], ['inversion', 'adduction', 'flexion plantaire', 'supination']);
  const n = M.composantesTriplan(-5, axe); assert.deepEqual([n.frontal.sens, n.transversal.sens, n.sagittal.sens, n.mouvement], ['éversion', 'abduction', 'flexion dorsale', 'pronation']);
  assert.equal(M.composantesTriplan(0, axe).mouvement, 'neutre');
  const q = Math.hypot(t.frontal.deg, t.transversal.deg, t.sagittal.deg); assert.ok(Math.abs(q - 5) < 1e-9, 'norme conservée (vecteur unitaire)');
  assert.throws(() => M.composantesTriplan(NaN, axe), TypeError);
});
T('texte : « Supination de 5,0° = inversion 3,6° + adduction 3,3° + flexion plantaire 1,0° » ; pronation ; neutre ; virgule décimale', () => {
  assert.equal(M.texteTriplan(5, axe), 'Supination de 5,0° = inversion 3,6° + adduction 3,3° + flexion plantaire 1,0°');
  assert.equal(M.texteTriplan(-5, axe), 'Pronation de 5,0° = éversion 3,6° + abduction 3,3° + flexion dorsale 1,0°');
  assert.equal(M.texteTriplan(0, axe), 'Pied au neutre (phi = 0°).');
  assert.ok(M.texteTriplan(7.5, { ...axe, deviation_deg: 30 }).includes('flexion plantaire 2,8°'));
});
T('flèches : 3 plans, axes de rotation long / vertical / médio-latéral, longueur proportionnelle (minimum 6 mm), nulle à phi = 0, sens positif en supination', () => {
  const f = M.fleches(5, axe); assert.deepEqual(f.map((x) => x.plan), ['frontal', 'transversal', 'sagittal']); assert.deepEqual(f.map((x) => x.direction_henke), [[0, 1, 0], [0, 0, 1], [1, 0, 0]]);
  assert.ok(f.every((x) => x.longueur_mm >= 6 && x.sens_positif)); assert.ok(f[0].longueur_mm > f[1].longueur_mm - 1e-9 || f[1].longueur_mm >= f[0].longueur_mm * 0.5);
  const g = M.fleches(10, axe); assert.ok(g[0].longueur_mm > f[0].longueur_mm, 'plus phi grandit, plus la flèche s\'allonge');
  assert.ok(M.fleches(0, axe).every((x) => x.longueur_mm === 0));
  assert.ok(M.fleches(-5, axe).every((x) => !x.sens_positif));
});
T('niveau de phi : ok jusqu\'à 6°, orange de 6 à 10°, rouge au-delà de 10°, borne à ±15°', () => {
  assert.equal(M.niveauPhiMannequin(6).niveau, 'ok'); assert.equal(M.niveauPhiMannequin(6.5).niveau, 'orange'); assert.equal(M.niveauPhiMannequin(-10).niveau, 'orange'); assert.equal(M.niveauPhiMannequin(10.5).niveau, 'rouge');
  const b = M.niveauPhiMannequin(-20); assert.equal(b.borne, -HENKE.phi.blocage_deg); assert.equal(b.borne_atteinte, true); assert.equal(M.niveauPhiMannequin(15).borne_atteinte, false);
});
T('poseGPU : même rotation que poserPied (axe unitaire, angle, pivot) ; phi = 0 sans rotation', () => {
  const g = M.poseGPU(axe, 7, rep, 'D'), p = Float32Array.from([30, 80, 20]), r = M.poserPied(p, axe, 7, rep, 'D');
  const k = g.axe, c = Math.cos(g.angle_rad), s = Math.sin(g.angle_rad), v = [p[0] - g.pivot[0], p[1] - g.pivot[1], p[2] - g.pivot[2]], d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
  const cr = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
  for (let q = 0; q < 3; q++) assert.ok(Math.abs(g.pivot[q] + v[q] * c + cr[q] * s + k[q] * d * (1 - c) - r[q]) < 1e-3);
  assert.equal(M.poseGPU(axe, 0, rep, 'D').angle_rad, 0); assert.ok(Math.abs(Math.hypot(...g.axe) - 1) < 1e-9);
  assert.throws(() => M.vecteurRotation(axe, 5, 'X'), TypeError);
});
