import test from 'node:test';
import assert from 'node:assert/strict';
import { construireBase, validerParametresBase, biseauMedial, extraireCoupe, lisserGauss } from '../../js/semelle3d/calcul/base.js';
import { distanceAuxSources } from '../../js/semelle3d/calcul/contour.js';
import { BASE_DEFAUTS, EPAISSEUR_BASE_MIN_MM } from '../../js/semelle3d/constantes.js';
import { grilleFn, miroirGrille } from './aides_base.js';
import { pose } from './aides.js';
import { importerScan, analyserScan } from '../../js/semelle3d/calcul/modeA.js';
import { ecrireSTLBinaireScan } from '../../js/semelle3d/calcul/ecrivains_scans.js';

// Grande plaque 100 x 100 mm (grille 201 x 201) : empreinte « bosse gaussienne » de 8 mm, sigma 12 mm, centrée.
const A = 8, S0 = 12;
const bosse = () => grilleFn(201, 201, (x, y) => 0.5 + A * Math.exp(-((x - 50) ** 2 + (y - 50) ** 2) / (2 * S0 * S0)));
const centre = (g) => 100 * g.nx + 100;

test('décisions de Joël : défauts = thermoformée, 50 %, 1,5 mm, lissage 3 mm (31/10 soir), biseau 45° ; épaisseur minimale 0,9 mm', () => {
  assert.equal(BASE_DEFAUTS.type, 'thermoformee'); assert.equal(BASE_DEFAUTS.taux, 0.5);
  assert.equal(BASE_DEFAUTS.epaisseur_mm, 1.5); assert.equal(BASE_DEFAUTS.lissage_mm, 3); assert.equal(BASE_DEFAUTS.biseau_deg, 45);
  assert.equal(EPAISSEUR_BASE_MIN_MM, 0.9);
});

test('validation : épaisseur 0,9 et 1,5 acceptées, 0,89 refusée (résines Flex/Flux 0,9 mm) ; au-delà du maximum refusée', () => {
  assert.doesNotThrow(() => validerParametresBase({ epaisseur_mm: 0.9 }));
  assert.doesNotThrow(() => validerParametresBase({ epaisseur_mm: 1.5 }));
  assert.throws(() => validerParametresBase({ epaisseur_mm: 0.89 }), RangeError);
  assert.throws(() => validerParametresBase({ epaisseur_mm: 10.5 }), RangeError);
  assert.throws(() => validerParametresBase({ epaisseur_mm: NaN }), TypeError);
});

test('validation : taux 0..1, lissage 2..6 mm, type connu, latéralité obligatoire pour l\'intermédiaire, angle de biseau borné', () => {
  assert.doesNotThrow(() => validerParametresBase({ taux: 0 })); assert.doesNotThrow(() => validerParametresBase({ taux: 1 }));
  assert.throws(() => validerParametresBase({ taux: 1.01 }), RangeError); assert.throws(() => validerParametresBase({ taux: -0.01 }), RangeError);
  assert.doesNotThrow(() => validerParametresBase({ lissage_mm: 2 })); assert.doesNotThrow(() => validerParametresBase({ lissage_mm: 6 }));
  assert.throws(() => validerParametresBase({ lissage_mm: 1.9 }), RangeError); assert.throws(() => validerParametresBase({ lissage_mm: 6.1 }), RangeError);
  assert.throws(() => validerParametresBase({ type: 'carree' }), TypeError);
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous' }), /latéralité/);
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous', cote: 'X' }), /latéralité/);
  assert.doesNotThrow(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D' }));
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_deg: 10 }), RangeError);
  assert.throws(() => validerParametresBase({ type: 'pleine_dessous', cote: 'D', biseau_deg: 80 }), RangeError);
});

test('moulage 0 % : la face supérieure est plane à l\'épaisseur demandée, quelle que soit l\'empreinte', () => {
  for (const ep of [0.9, 1.5, 3]) {
    const b = construireBase(bosse(), { type: 'thermoformee', taux: 0, epaisseur_mm: ep, contour_lisse: false });
    let n = 0;
    for (const h of b.haut) { if (!Number.isFinite(h)) continue; assert.ok(Math.abs(h - ep) < 1e-5, 'haut ' + h); n++; }
    assert.equal(n, 201 * 201);
  }
});

test('moulage 100 % : la face supérieure suit l\'empreinte lissée (calcul analytique : crête A·s²/(s²+σ²))', () => {
  const g = bosse();
  for (const sigma of [2, 4, 6]) {
    const b = construireBase(g, { type: 'thermoformee', taux: 1, epaisseur_mm: 1.5, lissage_mm: sigma, contour_lisse: false });
    const crete = b.haut[centre(g)] - 1.5; // H_base − épaisseur = G_σ(H) − min(H)
    const attendu = A * (S0 * S0) / (S0 * S0 + sigma * sigma); // min(H) = ~0,5 loin du centre ; H(centre) = 0,5 + A
    const min = b.rapport.hauteur_plantaire_min_mm;
    const mesure = crete + min - 0.5; // on retire le plancher 0,5
    assert.ok(Math.abs(mesure / attendu - 1) < 0.01, 'σ=' + sigma + ' crête ' + mesure + ' attendue ' + attendu);
  }
});

test('moulage 100 % : sur une pente, le lissage ne change rien (H_base − épaisseur + min = H partout loin du bord)', () => {
  const g = grilleFn(201, 201, (x, y) => 1 + 0.1 * y);
  const b = construireBase(g, { type: 'thermoformee', taux: 1, epaisseur_mm: 2, lissage_mm: 4, contour_lisse: false });
  for (let j = 30; j < 170; j++) for (let i = 30; i < 170; i++) { const k = j * 201 + i; assert.ok(Math.abs(b.haut[k] - 2 - (g.z[k] - 1)) < 2e-4, 'k=' + k); }
});

test('moulage : le taux est linéaire (50 % = moyenne de 0 % et 100 %) et l\'épaisseur s\'ajoute telle quelle', () => {
  const g = bosse();
  const f = (taux) => construireBase(g, { type: 'thermoformee', taux, epaisseur_mm: 2.2, contour_lisse: false }).haut;
  const h0 = f(0), h5 = f(0.5), h1 = f(1);
  for (let k = 0; k < h0.length; k += 37) assert.ok(Math.abs(h5[k] - (h0[k] + h1[k]) / 2) < 1e-4);
  assert.ok(h1[centre(g)] > h0[centre(g)] + 5, 'à 100 % la crête doit dépasser nettement le plateau');
});

test('type 1 « plate » : dessus et dessous plats, épaisseur constante, le taux est ignoré', () => {
  const g = bosse();
  const a = construireBase(g, { type: 'plate', taux: 1, epaisseur_mm: 1.8, contour_lisse: false });
  for (let k = 0; k < a.haut.length; k++) { assert.ok(Math.abs(a.haut[k] - 1.8) < 1e-5); assert.equal(a.bas[k], 0); }
  assert.equal(a.rapport.taux_effectif, 0);
});

test('type 2 « thermoformée » : épaisseur CONSTANTE (dessous = dessus − épaisseur), dessous qui suit l\'empreinte', () => {
  const g = bosse();
  const b = construireBase(g, { type: 'thermoformee', taux: 1, epaisseur_mm: 1.5, contour_lisse: false });
  let bmax = 0;
  for (let k = 0; k < b.haut.length; k++) { assert.ok(Math.abs(b.haut[k] - b.bas[k] - 1.5) < 1e-4, 'épaisseur ' + (b.haut[k] - b.bas[k])); bmax = Math.max(bmax, b.bas[k]); }
  assert.ok(bmax > 5, 'le dessous doit suivre la bosse (max ' + bmax + ')');
  assert.ok(b.rapport.epaisseur_max_mm - b.rapport.epaisseur_min_mm < 1e-4);
});

// ---------- type 3 « intermédiaire » ----------
test('type 3 : dessus identique à la thermoformée, dessous plan (z = 0) hors du biseau, jamais au-dessus du dessous thermoformé', () => {
  const g = bosse(); // sans contour utile : on regarde le centre
  const th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false });
  const pl = construireBase(g, { type: 'pleine_dessous', taux: 1, cote: 'D', contour_lisse: false });
  for (let k = 0; k < th.haut.length; k += 3) {
    assert.equal(pl.haut[k], th.haut[k]);
    assert.ok(pl.bas[k] <= th.bas[k] + 1e-6, 'dessous plus haut que la thermoformée');
    assert.ok(pl.haut[k] - pl.bas[k] >= 1.5 - 1e-5, 'épaisseur sous le minimum');
  }
  assert.equal(pl.bas[centre(g)], 0, 'sous la crête, la base est PLEINE (dessous à z = 0)');
});

test('biseau : le dessous remonte vers le contour médial selon l\'angle (30°, 45°, 60°), valeur exacte', () => {
  const nx = 60, ny = 20, pas = 0.5;
  const haut = new Float32Array(nx * ny).fill(7); // dessus à 7 mm, épaisseur 1,5 -> dessous thermoformé à 5,5
  const src = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) src[j * nx] = 1; // contour médial = colonne i = 0
  const d = distanceAuxSources(nx, ny, pas, src);
  for (const ang of [30, 45, 60]) {
    const bas = biseauMedial(haut, 1.5, d, ang);
    for (const i of [0, 2, 4, 8, 12, 40]) {
      const attendu = Math.max(0, 5.5 - i * pas * Math.tan((ang * Math.PI) / 180));
      assert.ok(Math.abs(bas[10 * nx + i] - attendu) < 1e-4, `angle ${ang}° i=${i} : ${bas[10 * nx + i]} vs ${attendu}`);
    }
    assert.ok(Math.abs(bas[10 * nx] - 5.5) < 1e-6, 'au contour, le dessous vaut celui de la thermoformée');
  }
});

const scanPose = (cote) => { // empreinte du pied synthétique (D ou G), recalée
  const { mesh } = pose({ cote, lacet: 20, t: [80, -10, 300], variante: 'surface' });
  return analyserScan(mesh, { longueur_mm: 265 }).grille;
};
test('biseau MÉDIAL : pied droit -> bande biseautée du côté -X, pied gauche -> côté +X', () => {
  for (const [cote, signe] of [['D', -1], ['G', 1]]) {
    const g = scanPose(cote);
    const th = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: false });
    const b = construireBase(g, { type: 'pleine_dessous', taux: 1, cote, contour_lisse: false, biseau_lateral_deg: 0 }); // biseau médial seul (le latéral a ses propres tests : biseau_lateral.test.js)
    let sx = 0, n = 0;
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const k = j * g.nx + i;
      if (Number.isFinite(b.haut[k]) && b.bas[k] > 1e-3 && b.bas[k] < th.bas[k] - 1e-3) { sx += g.ox + i * g.pas; n++; } // bande biseautée
    }
    assert.ok(n > 200, 'bande biseautée trop petite : ' + n);
    assert.ok((sx / n) * signe > 8, `pied ${cote} : x moyen de la bande ${(sx / n).toFixed(1)} mm`);
    assert.ok(b.rapport.biseau.largeur_max_mm > 2, 'largeur du biseau ' + b.rapport.biseau.largeur_max_mm);
  }
});

test('symétrie : le pied gauche et son image miroir en X donnent la même base (au miroir près) -> la logique D/G est exacte', () => {
  const g = scanPose('D');
  const gm = miroirGrille(g);
  const a = construireBase(g, { type: 'pleine_dessous', taux: 1, cote: 'D', contour_lisse: true });
  const b = construireBase(gm, { type: 'pleine_dessous', taux: 1, cote: 'G', contour_lisse: true });
  let ecart = 0, ecartContour = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i, km = j * g.nx + (g.nx - 1 - i);
    if (Number.isNaN(a.haut[k])) { assert.ok(Number.isNaN(b.haut[km])); continue; }
    ecart = Math.max(ecart, Math.abs(a.haut[k] - b.haut[km]), Math.abs(a.bas[k] - b.bas[km]));
    ecartContour = Math.max(ecartContour, Math.abs(a.dx[k] + b.dx[km]), Math.abs(a.dy[k] - b.dy[km]));
  }
  assert.ok(ecart < 2e-3, 'écart miroir des hauteurs ' + ecart); // une inversion du côté médial donnerait plusieurs mm
  // le contour (correction des retournements, ordre de parcours) n'est symétrique qu'à ~0,1 mm près
  assert.ok(ecartContour < 0.15, 'écart miroir du contour ' + ecartContour);
});

test('lissage : plus σ est grand, plus le relief du dessus est adouci (crête décroissante) ; l\'entrée n\'est jamais modifiée', () => {
  const g = bosse();
  const avant = Float32Array.from(g.z);
  const crete = (s) => construireBase(g, { type: 'thermoformee', taux: 1, lissage_mm: s, contour_lisse: false }).haut[centre(g)];
  assert.ok(crete(2) > crete(4) && crete(4) > crete(6), 'crêtes ' + [crete(2), crete(4), crete(6)]);
  assert.deepEqual(g.z, avant);
});

test('lisserGauss : conserve le masque et ne crée pas de valeur hors de l\'intervalle des données', () => {
  const g = grilleFn(60, 60, (x, y) => (x > 5 && x < 25 ? 1 + x / 10 + (y > 15 ? 1 : 0) : NaN));
  const o = lisserGauss(g, 3);
  let mn = Infinity, mx = -Infinity; for (const v of g.z) if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  for (let k = 0; k < g.z.length; k++) { assert.equal(Number.isNaN(o.z[k]), Number.isNaN(g.z[k])); if (Number.isFinite(o.z[k])) assert.ok(o.z[k] >= mn - 1e-5 && o.z[k] <= mx + 1e-5); }
});

test('coupe : la coupe transversale redonne exactement les valeurs de la grille à la position demandée', () => {
  const g = bosse();
  const b = construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: true });
  const c = extraireCoupe(b, g, 'T', 50);
  const j = 100;
  assert.equal(c.coord.length, 201); assert.equal(c.position_mm, 50);
  for (let i = 0; i < 201; i += 7) { assert.equal(c.haut[i], b.haut[j * 201 + i]); assert.equal(c.bas[i], b.bas[j * 201 + i]); assert.equal(c.scan[i], g.z[j * 201 + i]); }
  const l = extraireCoupe(b, g, 'L', 20);
  assert.equal(l.haut[100], b.haut[100 * 201 + 40]);
  assert.throws(() => extraireCoupe(b, g, 'Z', 1), TypeError);
});

test('intégration : import STL synthétique -> analyse -> base des trois types, tous contrôlés', async () => {
  const { mesh } = pose({ cote: 'D' });
  const buf = ecrireSTLBinaireScan(mesh);
  const { mesh: m2 } = await importerScan(buf, 'x.stl');
  const g = analyserScan(m2, { longueur_mm: 265 }).grille;
  for (const type of ['plate', 'thermoformee', 'pleine_dessous']) {
    const b = construireBase(g, { type, cote: 'D' });
    assert.ok(b.rapport.epaisseur_min_mm >= 1.5 - 1e-4, type + ' : épaisseur min ' + b.rapport.epaisseur_min_mm);
  }
});
