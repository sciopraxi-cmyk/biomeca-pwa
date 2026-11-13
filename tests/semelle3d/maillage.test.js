import test from 'node:test';
import assert from 'node:assert/strict';
import { creerGrille, remplir } from '../../js/semelle3d/calcul/grille.js';
import { maillerCarte } from '../../js/semelle3d/calcul/maillage.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { genererDome } from '../../js/semelle3d/calcul/synthetique.js';

const plaque = () => remplir(creerGrille(5, 4), () => 2); // 4 x 3 cellules, 2 mm d'épaisseur

test('maillage : plaque 4x3 cellules, comptes exacts', () => {
  const m = maillerCarte(plaque());
  // haut 2/cellule + bas 2/cellule + parois 2/arête de contour (2*(4+3) = 14)
  assert.equal(m.nbTriangles, 12 * 2 + 12 * 2 + 14 * 2);
  assert.equal(m.nbSommets, 2 * 5 * 4);
});

test('maillage : plaque fermée, volume = aire x épaisseur (2 x 1,5 x 2 = 6 mm3 ... 2,0 x 1,5 x 2)', () => {
  const v = verifierMaillage(maillerCarte(plaque()));
  assert.equal(v.ferme, true);
  assert.equal(v.aretesLibres, 0);
  assert.equal(v.degeneres, 0);
  // grille 5 x 4 sommets au pas 0,5 -> 2,0 mm x 1,5 mm ; hauteur 2 -> 6 mm3
  assert.ok(Math.abs(v.volume - 6) < 1e-9, 'volume ' + v.volume);
});

test('maillage : orientation, toutes les faces hautes regardent +z, les basses -z', () => {
  const m = maillerCarte(plaque());
  let haut = 0, bas = 0;
  for (let t = 0; t < m.nbTriangles; t++) {
    const [a, b, c] = [m.indices[3 * t], m.indices[3 * t + 1], m.indices[3 * t + 2]].map((i) => m.positions.subarray(3 * i, 3 * i + 3));
    const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const zs = [a[2], b[2], c[2]];
    if (zs.every((z) => z === 2)) { assert.ok(nz > 0); haut++; }
    if (zs.every((z) => z === 0)) { assert.ok(nz < 0); bas++; }
  }
  assert.equal(haut, 24);
  assert.equal(bas, 24);
});

test('maillage : dôme synthétique fermé, sans triangle dégénéré, volume = somme analytique', () => {
  const g = genererDome();
  const m = maillerCarte(g);
  const v = verifierMaillage(m);
  assert.equal(v.ferme, true, JSON.stringify(v));
  assert.equal(v.degeneres, 0);
  assert.ok(v.volume > 0);
  // volume sous une cellule coupée en 2 triangles = aire de cellule x moyenne des 4 coins
  let attendu = 0;
  const { nx, ny, z, pas } = g;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = z[j * nx + i], b = z[j * nx + i + 1], c = z[(j + 1) * nx + i], d = z[(j + 1) * nx + i + 1];
    if ([a, b, c, d].some(Number.isNaN)) continue;
    attendu += pas * pas * (a + b + c + d) / 4;
  }
  assert.ok(Math.abs(v.volume - attendu) / attendu < 1e-6, v.volume + ' vs ' + attendu);
});

test('maillage : hauteur nulle refusée (pas de triangle dégénéré silencieux)', () => {
  const g = remplir(creerGrille(4, 4), () => 2);
  g.z[5] = 0;
  assert.throws(() => maillerCarte(g), RangeError);
});

test('vérificateur : détecte un trou (un triangle retiré) et un triangle retourné', () => {
  const m = maillerCarte(plaque());
  const trou = { positions: m.positions, indices: m.indices.slice(3) };
  const v1 = verifierMaillage(trou);
  assert.equal(v1.ferme, false);
  assert.ok(v1.aretesLibres > 0);
  const inv = { positions: m.positions, indices: m.indices.slice() };
  [inv.indices[1], inv.indices[2]] = [inv.indices[2], inv.indices[1]];
  assert.equal(verifierMaillage(inv).ferme, false);
});
