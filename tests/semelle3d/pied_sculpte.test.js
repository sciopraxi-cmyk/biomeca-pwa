// Pied sculpté (mode sans empreinte) : volume fermé, dimensions anatomiques, 5 ongles, miroir D/G.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerPiedSculpte } from '../../js/semelle3d/calcul/pied_sculpte.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';

const boite = (p) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p.positions[i + a]); mx[a] = Math.max(mx[a], p.positions[i + a]); } return { mn, mx }; };
const D = creerPiedSculpte({ cote: 'D', pas_mm: 2 }), G = creerPiedSculpte({ cote: 'G', pas_mm: 2 });
test('pied sculpté : un seul volume fermé, sans arête libre, orienté vers l\'extérieur', () => {
  const v = verifierMaillage({ positions: D.positions, indices: D.indices, nbSommets: D.nbSommets, nbTriangles: D.nbTriangles });
  assert.equal(v.ferme, true); assert.equal(v.aretesLibres, 0); assert.equal(v.nonManifold, 0); assert.ok(v.volume > 0.8e6 && v.volume < 1.4e6, 'volume ' + v.volume);
});
test('pied sculpté : longueur ~ 265 mm, plante plane au sol, coupe haute à ~135 mm, avant-pied plus large que le talon', () => {
  const b = boite(D); assert.ok(b.mx[1] - b.mn[1] > 255 && b.mx[1] - b.mn[1] < 272, 'longueur ' + (b.mx[1] - b.mn[1])); assert.ok(Math.abs(b.mn[2]) < 1.5, 'sol ' + b.mn[2]); assert.ok(b.mx[2] > 130 && b.mx[2] < 140);
  const larg = (y) => { let a = 1e9, c = -1e9; for (let i = 0; i < D.positions.length; i += 3) if (Math.abs(D.positions[i + 1] - y) < 2 && D.positions[i + 2] < 15) { a = Math.min(a, D.positions[i]); c = Math.max(c, D.positions[i]); } return c - a; };
  assert.ok(larg(185) > larg(30) + 20, 'avant-pied ' + larg(185) + ' / talon ' + larg(30));
});
test('pied sculpté : 5 ongles (un par orteil) et pied G = miroir du pied D', () => {
  assert.ok(D.ongles.indices.length > 5 * 100, 'ongles : ' + D.ongles.indices.length / 3 + ' triangles'); assert.equal(creerPiedSculpte({ details: false, pas_mm: 2 }).ongles.indices.length, 0); const bd = boite(D), bg = boite(G); assert.ok(Math.abs(bd.mn[0] + bg.mx[0]) < 1.5 && Math.abs(bd.mx[0] + bg.mn[0]) < 1.5, 'miroir');
});
test('pied sculpté : longueur invalide -> erreur claire ; échelle proportionnelle', () => {
  assert.throws(() => creerPiedSculpte({ longueur_mm: 50 }), /longueur/);
  const b = boite(creerPiedSculpte({ longueur_mm: 230, pas_mm: 2 })); assert.ok(b.mx[1] - b.mn[1] > 218 && b.mx[1] - b.mn[1] < 238);
});
test('pied sculpté : orteils modelés (étranglement puis bulbe au bout), pas de cylindres ; pas de marche sur le dessus du pied', async () => {
  const { champDuPied } = await import('../../js/semelle3d/calcul/pied_sculpte.js'), { F } = champDuPied({ med: -1, details: true });
  const larg = (y) => { let a = -9.5, b = -9.5; while (F(a - 0.25, y, 8) > 0 && a > -40) a -= 0.25; while (F(b + 0.25, y, 8) > 0 && b < 20) b += 0.25; return b - a; };
  assert.ok(larg(228) + 0.4 < larg(246) || larg(236) + 0.4 < larg(250), 'étranglement/bulbe du 2e orteil : ' + [228, 236, 246, 250].map((y) => larg(y).toFixed(1)).join(' / '));
  assert.ok(larg(236) + 0.5 < larg(228), 'étranglement sous le bulbe : ' + larg(236).toFixed(1) + ' contre ' + larg(228).toFixed(1) + ' plus bas');
  const haut = (x, y) => { let a = 0, b = 100; for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (F(x, y, m) > 0) a = m; else b = m; } return a; };
  for (const x of [-15, 5]) for (let y = 120; y <= 234; y++) { const d2 = haut(x, y - 1) - 2 * haut(x, y) + haut(x, y + 1); assert.ok(Math.abs(d2) < 2.5, 'cassure de pente à x=' + x + ', y=' + y + ' : ' + d2.toFixed(2)); }
});
