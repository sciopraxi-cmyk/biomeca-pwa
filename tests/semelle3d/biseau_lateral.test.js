// Biseau LATÉRAL de la base intermédiaire (demande de Joël, 14/11/2026) : même règle que le biseau médial (45° par défaut),
// avec le contour latéral comme source. Talon et avant-pied inchangés. 0 = aucun biseau latéral.
import test from 'node:test';
import assert from 'node:assert/strict';
import { construireBase, validerParametresBase } from '../../js/semelle3d/calcul/base.js';
import { BASE_DEFAUTS } from '../../js/semelle3d/constantes.js';
import { analyserScan } from '../../js/semelle3d/calcul/modeA.js';
import { pose } from './aides.js';

// Le sabotage ne reconnaît que les AssertionError : toute autre erreur est convertie.
const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } };

const scanPose = (cote) => { const { mesh } = pose({ cote, lacet: 20, t: [80, -10, 300], variante: 'surface' }); return analyserScan(mesh, { longueur_mm: 265 }).grille; };
const base = (g, cote, extra = {}) => construireBase(g, { type: 'pleine_dessous', taux: 1, cote, contour_lisse: false, ...extra }, null);
// bande biseautée = cellules dont le dessous est au-dessus de 0 mais sous le dessous thermoformé ; on mesure son x moyen et sa taille
const bande = (g, b, th) => { let sx = 0, n = 0; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; if (Number.isFinite(b.haut[k]) && b.bas[k] > 1e-3 && b.bas[k] < th.bas[k] - 1e-3) { sx += g.ox + i * g.pas; n++; } } return { n, x: n ? sx / n : 0 }; };

test('défaut : biseau latéral 45° (comme le médial) ; 0 = aucun ; hors 15..75° refusé', () => garde(() => {
  assert.equal(BASE_DEFAUTS.biseau_lateral_deg, 45);
  assert.doesNotThrow(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_lateral_deg: 0 }));
  assert.doesNotThrow(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_lateral_deg: 30 }));
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_lateral_deg: 10 }), /latéral/);
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_lateral_deg: 80 }), /latéral/);
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_lateral_deg: 'x' }), /nombre/);
}));

for (const [cote, signeMedial] of [['D', -1], ['G', 1]]) {
  test('biseau latéral : pied ' + cote + ' -> une bande biseautée du côté LATÉRAL (x moyen du côté opposé au médial), en plus de la bande médiale', () => garde(() => {
    const g = scanPose(cote);
    const th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false }, null);
    const med = base(g, cote, { biseau_lateral_deg: 0 }), tout = base(g, cote);
    const bm = bande(g, med, th), bt = bande(g, tout, th);
    assert.ok(bm.n > 200 && bm.x * signeMedial > 8, 'sans biseau latéral : bande médiale seule (x ' + bm.x.toFixed(1) + ')');
    assert.ok(bt.n > bm.n * 1.3, 'avec biseau latéral la bande est plus grande : ' + bm.n + ' -> ' + bt.n);
    // la part ajoutée est du côté latéral : le x moyen se déplace vers le côté latéral
    assert.ok(bt.x * signeMedial < bm.x * signeMedial - 3, 'x moyen ' + bm.x.toFixed(1) + ' -> ' + bt.x.toFixed(1) + ' : la bande ajoutée est latérale');
    assert.ok(tout.rapport.biseau.lateral && tout.rapport.biseau.lateral.angle_deg === 45 && tout.rapport.biseau.lateral.largeur_max_mm > 2, 'rapport : biseau latéral');
    assert.equal(med.rapport.biseau.lateral, null);
  }));
}

test('biseau latéral : le dessus et le contour sont inchangés ; le dessous reste dans [dessous médial seul ; dessous thermoformé] ; jamais sous z = 0, épaisseur >= minimum', () => garde(() => {
  const g = scanPose('D');
  const th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false }, null);
  const med = base(g, 'D', { biseau_lateral_deg: 0 }), tout = base(g, 'D');
  for (let k = 0; k < tout.haut.length; k++) {
    assert.equal(Number.isFinite(tout.haut[k]), Number.isFinite(med.haut[k]));
    if (!Number.isFinite(tout.haut[k])) continue;
    assert.equal(tout.haut[k], med.haut[k]);
    assert.ok(tout.bas[k] >= med.bas[k] - 1e-6, 'le biseau latéral ne descend jamais le dessous');
    assert.ok(tout.bas[k] <= th.bas[k] + 1e-6, 'jamais plus haut que le dessous thermoformé');
    assert.ok(tout.bas[k] >= 0 && tout.haut[k] - tout.bas[k] >= 1.5 - 1e-5, 'épaisseur');
  }
}));

test('biseau latéral : l\'angle compte (30° plus large que 60°, valeur de largeur proportionnelle à 1/tan) et se règle indépendamment du médial', () => garde(() => {
  const g = scanPose('D');
  const l30 = base(g, 'D', { biseau_lateral_deg: 30 }).rapport.biseau, l60 = base(g, 'D', { biseau_lateral_deg: 60 }).rapport.biseau;
  assert.ok(l30.lateral.largeur_max_mm > l60.lateral.largeur_max_mm * 1.3, '30° : ' + l30.lateral.largeur_max_mm.toFixed(1) + ' mm ; 60° : ' + l60.lateral.largeur_max_mm.toFixed(1) + ' mm');
  assert.equal(l30.largeur_max_mm, l60.largeur_max_mm, 'le biseau médial ne bouge pas quand on change le latéral');
  const m30 = base(g, 'D', { biseau_deg: 30, biseau_lateral_deg: 60 }).rapport.biseau;
  assert.ok(m30.largeur_max_mm > m30.lateral.largeur_max_mm, 'médial 30° plus large que latéral 60°');
}));

test('biseau latéral : le milieu du talon (normale du contour dans l\'axe du pied) n\'est pas biseauté ; les flancs latéral et médial le sont ; au bout des orteils seul le flanc latéral du petit orteil est ajouté', () => garde(() => {
  const g = scanPose('D');
  const th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false }, null);
  const b = base(g, 'D');
  const bis = (k) => b.bas[k] > 1e-3 && b.bas[k] < th.bas[k] - 1e-3;
  let j0 = Infinity, j1 = -Infinity;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (Number.isFinite(b.haut[j * g.nx + i])) { if (j < j0) j0 = j; if (j > j1) j1 = j; }
  const etendue = (j) => { let a = Infinity, z = -Infinity; for (let i = 0; i < g.nx; i++) if (Number.isFinite(b.haut[j * g.nx + i])) { if (i < a) a = i; if (i > z) z = i; } return [a, z]; };
  const testBandeCentrale = (j, nom) => {
    const [a, z] = etendue(j), c = Math.round((a + z) / 2), demi = Math.round(8 / g.pas); // ±8 mm autour du milieu de la rangée
    for (let i = c - demi; i <= c + demi; i++) assert.ok(!bis(j * g.nx + i), nom + ' : cellule biseautée au milieu (rangée ' + (j - j0) + ', i ' + i + ')');
  };
  testBandeCentrale(j0 + 3, 'talon');
  // cellules AJOUTÉES par le biseau latéral (par rapport au médial seul) : toutes du côté latéral (x du côté opposé au médial pour un pied droit : +X)
  const med = base(g, 'D', { biseau_lateral_deg: 0 });
  let ajoutees = 0, ajouteesMediales = 0;
  for (let j = j0; j <= j1; j++) { const [a, z] = etendue(j), c = (a + z) / 2; for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; if (Number.isFinite(b.haut[k]) && b.bas[k] > med.bas[k] + 1e-3) { ajoutees++; if (i < c - 0.15 * (z - a)) ajouteesMediales++; } } }
  assert.ok(ajoutees > 1000, 'cellules ajoutées : ' + ajoutees);
  assert.ok(ajouteesMediales < 0.05 * ajoutees, 'cellules ajoutées côté médial (pied droit : -X) : ' + ajouteesMediales + ' / ' + ajoutees);
  // les flancs sont biseautés des deux côtés sur le milieu du pied (rangées de 20 % à 60 %) : le biseau n'existe que là où le dessous thermoformé est au-dessus de z = 0
  let gauche = 0, droite = 0;
  for (let j = Math.round(j0 + 0.2 * (j1 - j0)); j <= Math.round(j0 + 0.6 * (j1 - j0)); j++) { const [a, z] = etendue(j); for (let i = a; i <= z; i++) if (bis(j * g.nx + i)) { if (i < (a + z) / 2) gauche++; else droite++; } }
  assert.ok(gauche > 100 && droite > 100, 'flancs biseautés des deux côtés : ' + gauche + ' / ' + droite);
}));

test('biseau latéral : symétrie D/G — le pied gauche et le pied droit (même forme en miroir) donnent la même largeur de biseau latéral à 1,5 mm près', () => garde(() => {
  const d = base(scanPose('D'), 'D').rapport.biseau, gch = base(scanPose('G'), 'G').rapport.biseau;
  assert.ok(Math.abs(d.lateral.largeur_max_mm - gch.lateral.largeur_max_mm) < 1.5, 'D ' + d.lateral.largeur_max_mm.toFixed(1) + ' / G ' + gch.lateral.largeur_max_mm.toFixed(1));
  assert.ok(Math.abs(d.largeur_max_mm - gch.largeur_max_mm) < 1.5, 'médial D ' + d.largeur_max_mm.toFixed(1) + ' / G ' + gch.largeur_max_mm.toFixed(1));
}));

test('biseau latéral : sans effet sur la base thermoformée et la base plate (le champ n\'existe que pour l\'intermédiaire)', () => garde(() => {
  const g = scanPose('D');
  for (const type of ['thermoformee', 'plate']) {
    const a = construireBase(g, { type, taux: 1, contour_lisse: false, biseau_lateral_deg: 0 }, null), b = construireBase(g, { type, taux: 1, contour_lisse: false, biseau_lateral_deg: 60 }, null);
    for (let k = 0; k < a.haut.length; k += 7) { assert.equal(Object.is(a.bas[k], b.bas[k]) || a.bas[k] === b.bas[k], true); assert.equal(Object.is(a.haut[k], b.haut[k]) || a.haut[k] === b.haut[k], true); }
    assert.equal(a.rapport.biseau, null);
  }
}));
