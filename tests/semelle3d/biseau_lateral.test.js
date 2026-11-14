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

test('biseau latéral : les flancs latéral et médial sont biseautés ; au bout des orteils seul le flanc latéral du petit orteil est ajouté (le talon : voir les tests « talon »)', () => garde(() => {
  const g = scanPose('D');
  const th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false }, null);
  const b = base(g, 'D');
  const bis = (k) => b.bas[k] > 1e-3 && b.bas[k] < th.bas[k] - 1e-3;
  let j0 = Infinity, j1 = -Infinity;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (Number.isFinite(b.haut[j * g.nx + i])) { if (j < j0) j0 = j; if (j > j1) j1 = j; }
  const etendue = (j) => { let a = Infinity, z = -Infinity; for (let i = 0; i < g.nx; i++) if (Number.isFinite(b.haut[j * g.nx + i])) { if (i < a) a = i; if (i > z) z = i; } return [a, z]; };
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

// TALON (retour de Joël, 14/11/2026 : « le biseau médial va jusqu'au milieu du talon, idem le latéral : on doit voir un talon qui a le biseau »).
// Empreinte synthétique : ellipse plate à 15 mm sauf une cellule à 0 mm loin devant (le niveau de référence) : sans biseau, la paroi du talon fait ~ 17 mm.
const ellipse = () => {
  const nx = 120, ny = 240, pas = 0.5, z = new Float32Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = (i - 60) * pas, y = (j - 120) * pas; if ((x / 25) ** 2 + (y / 55) ** 2 <= 1) z[j * nx + i] = 15; }
  z[170 * nx + 60] = 0;
  return { nx, ny, pas, ox: -30, oy: -60, z };
};
// épaisseur de la base (haut − bas) aux 5 positions 0, 1/4, 1/2, 3/4, 1 de la rangée dj du talon (de -X à +X)
const profilTalon = (b, dj) => {
  let jmin = Infinity; for (let k = 0; k < b.haut.length; k++) if (Number.isFinite(b.haut[k])) jmin = Math.min(jmin, Math.floor(k / b.nx));
  const j = jmin + dj, ks = []; for (let i = 0; i < b.nx; i++) if (Number.isFinite(b.haut[j * b.nx + i])) ks.push(j * b.nx + i);
  const e = (k) => b.haut[k] - b.bas[k], m = ks.length;
  return [e(ks[0]), e(ks[Math.floor(m / 4)]), e(ks[Math.floor(m / 2)]), e(ks[Math.floor((3 * m) / 4)]), e(ks[m - 1])];
};
const baseE = (cote, extra = {}) => construireBase(ellipse(), { type: 'pleine_dessous', taux: 1, cote, contour_lisse: false, ...extra }, null);
for (const cote of ['D', 'G']) {
  test('talon : pied ' + cote + ' -> avec les deux biseaux le talon est biseauté sur TOUT son pourtour (paroi arrière ~ épaisseur minimum, symétrique), les deux biseaux se rejoignent au milieu', () => garde(() => {
    const b = baseE(cote), t = b.rapport.biseau.talon;
    assert.ok(t.noeuds_medial > 50 && t.noeuds_lateral > 50, 'nœuds du talon : médial ' + t.noeuds_medial + ', latéral ' + t.noeuds_lateral);
    assert.ok(Math.abs(t.noeuds_medial - t.noeuds_lateral) <= 0.15 * t.noeuds_medial, 'chaque biseau va jusqu\'au MILIEU du talon (moitiés égales)');
    for (const v of profilTalon(b, 1)) assert.ok(v < 3.5, 'paroi arrière du talon (rangée 1) : ' + v.toFixed(1) + ' mm au lieu de ~ 17');
    const p6 = profilTalon(b, 6); assert.ok(p6[2] > p6[0] + 1, 'la pente monte vers l\'intérieur (rangée 6)');
    assert.ok(Math.abs(p6[1] - p6[3]) < 0.6, 'symétrie médial/latéral de part et d\'autre du milieu');
  }));
  test('talon : pied ' + cote + ' -> latéral = 0 : seule la moitié MÉDIALE du talon est biseautée ; la moitié latérale garde sa paroi', () => garde(() => {
    const b = baseE(cote, { biseau_lateral_deg: 0 }), t = b.rapport.biseau.talon;
    assert.ok(t.noeuds_medial > 50 && t.noeuds_lateral === 0);
    const p = profilTalon(b, 1), [med, lat] = cote === 'G' ? [p[4], p[0]] : [p[0], p[4]]; // G : médial = +X
    assert.ok(med < 3.5 && lat > 4.5, 'bord médial ' + med.toFixed(1) + ' mm ; bord latéral ' + lat.toFixed(1) + ' mm');
    const p20 = profilTalon(b, 20), lat20 = cote === 'G' ? p20[0] : p20[4];
    assert.ok(lat20 > 12, 'plus en avant, la paroi latérale reste haute : ' + lat20.toFixed(1) + ' mm');
  }));
}
test('talon : le biseau du talon n\'enlève rien : dessus et contour inchangés, dessous jamais plus bas qu\'avant, épaisseur >= minimum', () => garde(() => {
  const g = ellipse(), th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false }, null), b = baseE('D');
  for (let k = 0; k < b.haut.length; k++) {
    assert.equal(Number.isFinite(b.haut[k]), Number.isFinite(th.haut[k]));
    if (!Number.isFinite(b.haut[k])) continue;
    assert.equal(b.haut[k], th.haut[k]);
    assert.ok(b.bas[k] >= 0 && b.bas[k] <= th.bas[k] + 1e-6 && b.haut[k] - b.bas[k] >= 1.5 - 1e-5);
  }
}));

// BORDS DENTELÉS (retour de Joël, 14/11/2026) : sur une empreinte creusée, les pointes de contour (dents du scan) retirées par la régularisation
// laissaient des trous dans le champ du lissage (ni pied ni mur) : la hauteur du bord sautait d'environ 2 mm d'une cellule à la suivante (×3 avec le relief).
test('bords : empreinte creusée avec contour en dents -> la hauteur du bord arrière est continue (pas de saut entre cellules voisines)', () => garde(() => {
  const nx = 120, ny = 240, pas = 0.5, z = new Float32Array(nx * ny).fill(NaN), murs = new Float32Array(nx * ny).fill(NaN);
  const dedans = (i, j, r) => (((i - 60) * pas) / (25 + r)) ** 2 + (((j - 120) * pas) / (55 + r)) ** 2 <= 1;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const pointe = !dedans(i, j, 0) && dedans(i, j, 1.2) && (i + 2 * j) % 3 === 0; // cellules isolées au-delà du contour : dents du scan
    if (dedans(i, j, 0) || pointe) z[j * nx + i] = 15 - 3 * Math.max(0, (j - 20) / 220);
    else if (dedans(i, j, 6)) murs[j * nx + i] = 22; // mur gardé autour du pied (jamais sur une cellule du pied)
  }
  z[170 * nx + 60] = 0;
  const g = { nx, ny, pas, ox: -30, oy: -60, z, murs };
  for (const type of ['thermoformee', 'pleine_dessous']) {
    const b = construireBase(g, { type, taux: 0.5, cote: 'D', contour_lisse: true }, null);
    let jmin = Infinity; for (let k = 0; k < b.haut.length; k++) if (Number.isFinite(b.haut[k])) jmin = Math.min(jmin, Math.floor(k / nx));
    let saut = 0, n = 0, prev = null;
    for (let i = 20; i < 100; i++) { // 1re cellule valide de chaque colonne dans les 25 premières rangées (bord arrière)
      let v = null; for (let j = jmin; j < jmin + 25; j++) { const k = j * nx + i; if (Number.isFinite(b.haut[k])) { v = b.haut[k]; break; } }
      if (v !== null && prev !== null) { saut = Math.max(saut, Math.abs(v - prev)); n++; }
      prev = v;
    }
    assert.ok(n > 40);
    assert.ok(saut < 0.6, type + ' : plus grand saut de hauteur entre cellules voisines du bord = ' + saut.toFixed(2) + ' mm (dents si > 0,6)');
  }
}));

// BORD OBLIQUE (retour de Joël : « les bords sont dentelés », après correction des trous) : le long d'un bord oblique, la hauteur des nœuds du contour
// montait par marches (chaque nœud glisse vers le vrai bord mais gardait la hauteur de sa cellule). Pied incliné en X, contour en ellipse inclinée.
test('bords : bord oblique sur un moulage en pente -> la hauteur le long du contour est continue (pas de marches)', () => garde(() => {
  const nx = 160, ny = 240, pas = 0.5, z = new Float32Array(nx * ny).fill(NaN), a = 0.5;
  const dedans = (x, y) => { const u = x * Math.cos(a) + y * Math.sin(a), v = -x * Math.sin(a) + y * Math.cos(a); return (u / 28) ** 2 + (v / 60) ** 2 <= 1; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = (i - 80) * pas, y = (j - 120) * pas; if (dedans(x, y)) z[j * nx + i] = 15 + 0.3 * x; }
  const g = { nx, ny, pas, ox: -40, oy: -60, z };
  const b = construireBase(g, { type: 'thermoformee', taux: 1, cote: 'D', contour_lisse: true, lissage_mm: 2 }, null);
  let pire = 0, n = 0;
  for (const cote of [0, 1]) {
    const hs = [];
    for (let j = 60; j < ny - 60; j++) { const idx = [...Array(nx).keys()]; if (cote) idx.reverse(); for (const i of idx) { const k = j * nx + i; if (Number.isFinite(b.haut[k])) { hs.push(b.haut[k]); break; } } }
    for (let i = 1; i < hs.length - 1; i++) { pire = Math.max(pire, Math.abs(hs[i + 1] - 2 * hs[i] + hs[i - 1])); n++; }
  }
  assert.ok(n > 200);
  assert.ok(pire < 0.12, 'plus grande marche (2e différence) de la hauteur le long du contour = ' + pire.toFixed(3) + ' mm (marches si > 0,12)');
}));
