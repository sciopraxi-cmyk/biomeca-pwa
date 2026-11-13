import test from 'node:test';
import assert from 'node:assert/strict';
import { decalagesEclatement, espaceValide, ECLATEMENT } from '../../js/semelle3d/calcul/apercu.js';

const el = (type, cellules = 10, visible = true) => ({ type, cellules, visible });
const ep = (...v) => v.map((x) => ({ epaisseur_max_mm: x }));

test('éclatement : espace borné 0-30, virgule acceptée, valeur invalide = défaut 12', () => {
  assert.equal(ECLATEMENT.defaut_mm, 12);
  assert.equal(espaceValide('7,5'), 7.5);
  assert.equal(espaceValide(-3), 0);
  assert.equal(espaceValide(99), 30);
  assert.equal(espaceValide('abc'), 12);
});

test('éclatement : chaque élément monte de l\'épaisseur des précédents + un espace par rang', () => {
  const d = decalagesEclatement([el('voute_bord'), el('flange_mediale')], ep(4, 3), 12);
  assert.deepEqual(d, [12, 12 + 4 + 12]);
});

test('éclatement : le recouvrement passe en dernier même s\'il est saisi en premier', () => {
  const d = decalagesEclatement([el('recouvrement'), el('voute_bord')], ep(2, 5), 10);
  assert.equal(d[1], 10, 'la voûte est au rang 1');
  assert.equal(d[0], 5 + 20, 'le recouvrement est au rang 2, au-dessus de la voûte');
  assert.ok(d[0] > d[1]);
});

test('éclatement : élément masqué ou vide = 0 et n\'occupe pas de rang', () => {
  const d = decalagesEclatement([el('voute_bord', 10, false), el('flange_mediale', 0), el('arche_externe')], ep(4, 3, 2), 12);
  assert.deepEqual(d, [0, 0, 12]);
});

test('éclatement : espace 0 = éléments empilés de leurs seules épaisseurs ; liste vide = tableau vide', () => {
  assert.deepEqual(decalagesEclatement([el('voute_bord'), el('flange_mediale')], ep(4, 3), 0), [0, 4]);
  assert.deepEqual(decalagesEclatement([], [], 12), []);
});

test('éclatement : sans épaisseurs fournies, seuls les espaces comptent (pas de NaN)', () => {
  const d = decalagesEclatement([el('voute_bord'), el('flange_mediale')], undefined, 12);
  assert.deepEqual(d, [12, 24]);
});

import { mesurer, texteMesure, clicMesure } from '../../js/semelle3d/calcul/mesure.js';

test('mesure : distance 3D et composantes (3-4-12 = 13)', () => {
  const m = mesurer({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 });
  assert.equal(m.distance_mm, 13); assert.equal(m.dx_mm, 3); assert.equal(m.dy_mm, 4); assert.equal(m.dz_mm, 12); assert.equal(m.plan_mm, 5);
});
test('mesure : le facteur Relief ×3 est retiré des hauteurs, jamais des x / y', () => {
  const m = mesurer({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 30 }, 3);
  assert.equal(m.dz_mm, 10); assert.equal(m.dx_mm, 10); assert.ok(Math.abs(m.distance_mm - Math.hypot(10, 10)) < 1e-9);
  assert.equal(mesurer({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 6 }, 0).dz_mm, 6, 'relief invalide = 1');
});
test('mesure : sens des points sans effet sur la distance ; signes conservés dans les écarts', () => {
  const a = { x: 1, y: 2, z: 3 }, b = { x: -4, y: 6, z: 0 };
  assert.equal(mesurer(a, b).distance_mm, mesurer(b, a).distance_mm);
  assert.equal(mesurer(a, b).dx_mm, -5); assert.equal(mesurer(b, a).dx_mm, 5);
});
test('mesure : point manquant ou non fini refusé', () => {
  assert.throws(() => mesurer(null, { x: 0, y: 0, z: 0 }), TypeError);
  assert.throws(() => mesurer({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }), TypeError);
  assert.throws(() => mesurer({ x: 0, y: 0 }, { x: 0, y: 0, z: 0 }), TypeError);
});
test('mesure : texte en français (virgule, mm, valeurs absolues)', () => {
  assert.equal(texteMesure(mesurer({ x: 0, y: 0, z: 0 }, { x: -3, y: 4, z: 12 })), '13,0 mm  (x 3,0 · y 4,0 · z 12,0)');
  assert.equal(texteMesure({ distance_mm: 0.04, dx_mm: -0.04, dy_mm: 0, dz_mm: 0 }), '0,0 mm  (x 0,0 · y 0,0 · z 0,0)');
});
test('mesure : 1er clic, 2e clic, le 3e recommence avec ce point', () => {
  const A = { x: 1, y: 1, z: 1 }, B = { x: 2, y: 2, z: 2 }, C = { x: 3, y: 3, z: 3 };
  let e = clicMesure(undefined, A); assert.deepEqual(e.points, [A]);
  e = clicMesure(e, B); assert.deepEqual(e.points, [A, B]);
  e = clicMesure(e, C); assert.deepEqual(e.points, [C]);
});

// ---------------------------------------------------------------- Miroir
import { miroirElements, apercuMiroir, autrePied } from '../../js/semelle3d/calcul/miroir.js';
import { TYPES_ELEMENTS as TYPES, appliquerElements } from '../../js/semelle3d/calcul/elements.js';
import { elementsPour } from '../../js/semelle3d/calcul/plan.js';

const E = (uid, portee, extra = {}) => ({ uid, portee, type: 'point_curseur', dx_mm: 10, dy_mm: 100, hauteur_mm: 2, rayon_mm: 8, teinte: 0, ...extra });

test('miroir : D vers G remplace les éléments propres au G, copie ceux du D juste après eux, laisse les communs', () => {
  const avant = [E('a', 'commun'), E('b', 'D', { dx_mm: 5 }), E('c', 'G', { dx_mm: 30 }), E('d', 'D', { dy_mm: 150 })];
  const copie = JSON.stringify(avant);
  const r = miroirElements(avant, 'D');
  assert.equal(JSON.stringify(avant), copie, 'la liste d\'origine n\'est pas modifiée');
  assert.deepEqual(r.map((e) => e.portee), ['commun', 'D', 'G', 'D', 'G']);
  assert.ok(!r.some((e) => e.uid === 'c'), 'l\'élément propre au G disparaît');
  assert.equal(r[2].dx_mm, 5); assert.equal(r[4].dy_mm, 150);
  assert.equal(new Set(r.map((e) => e.uid)).size, r.length, 'identifiants uniques');
  assert.equal(r[0], avant[0], 'le commun est le même objet');
});
test('miroir : G vers D (sens inverse) ; copie profonde (modifier la copie ne touche pas l\'original)', () => {
  const avant = [E('x', 'G', { rayon_mm: 6, source: { fichier: 'a.stl', reglages: [1, 2] } })];
  const r = miroirElements(avant, 'G'); assert.deepEqual(r.map((e) => e.portee), ['G', 'D']);
  r[1].rayon_mm = 99; r[1].source.fichier = 'autre.stl'; r[1].source.reglages.push(3);
  assert.equal(r[0].rayon_mm, 6); assert.equal(r[0].source.fichier, 'a.stl'); assert.deepEqual(r[0].source.reglages, [1, 2]);
});
test('miroir : aucun élément propre au pied source = les éléments propres à l\'autre pied sont retirés ; rien du tout = rien à faire', () => {
  const r = miroirElements([E('a', 'commun'), E('c', 'G')], 'D'); assert.deepEqual(r.map((e) => e.uid), ['a']);
  assert.deepEqual(apercuMiroir([E('a', 'commun')], 'D'), { de: 'D', vers: 'G', copies: 0, remplaces: 0, rien: true });
  assert.deepEqual(apercuMiroir([E('b', 'D'), E('d', 'D'), E('c', 'G')], 'D'), { de: 'D', vers: 'G', copies: 2, remplaces: 1, rien: false });
});
test('miroir : identifiant déjà pris évité ; pied invalide refusé', () => {
  const r = miroirElements([E('a', 'D'), E('am', 'commun')], 'D');
  assert.equal(new Set(r.map((e) => e.uid)).size, 3);
  assert.throws(() => autrePied('X'), TypeError); assert.throws(() => miroirElements([], 'commun'), TypeError);
});
test('miroir : les listes des 2 pieds sont identiques (même ordre) après le miroir, côté pipeline (elementsPour)', () => {
  const avant = [E('a', 'commun', { dx_mm: 1 }), E('b', 'D', { dx_mm: 5 }), E('c', 'G', { dx_mm: 30 }), E('d', 'commun', { dx_mm: 2 }), E('e', 'D', { dx_mm: 7 })];
  const plan = { base: {}, elements: miroirElements(avant, 'D') };
  assert.deepEqual(elementsPour(plan, 'G'), elementsPour(plan, 'D'));
});

// Preuve géométrique : la même valeur sur l'autre pied donne la forme SYMÉTRIQUE (x -> -x), pour tous les types qui ont une position/rotation.
function plaque({ h = 3 } = {}) {
  const nx = 241, ny = 401;
  return { nx, ny, pas: 0.5, ox: -60, oy: 0, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const couches = (el, cote) => appliquerElements(plaque(), [el], { cote, cat: { liste: [], parId: new Map() } });
function ecartMiroir(el) {
  const D = couches(el, 'D'), G = couches(el, 'G'), zD = D.couches[0].z, zG = G.couches[0].z, { nx, ny } = D;
  const cx = D.rapport_elements.repere_talon.x_mm, cxG = G.rapport_elements.repere_talon.x_mm;
  let pire = 0, somme = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = D.ox + i * D.pas, xm = 2 * cx - x, im = Math.round((xm - G.ox) / G.pas);
    if (im < 0 || im >= nx) continue;
    pire = Math.max(pire, Math.abs(zD[j * nx + i] - zG[j * nx + im])); somme += Math.abs(zD[j * nx + i]);
  }
  return { pire, somme, cx, cxG };
}
for (const [nom, el] of [
  ['point curseur décentré', { type: 'point_curseur', dx_mm: 12, dy_mm: 120, hauteur_mm: 2, rayon_mm: 9 }],
  ['coupole métatarsienne tournée de 20°', { type: 'coupole_metatarsienne', dx_mm: 8, dy_mm: 170, angle_plan_deg: 20 }],
  ['soutien de voûte tourné de -15°', { type: 'soutien_de_voute', dx_mm: 15, dy_mm: 90, angle_plan_deg: -15 }],
  ['appui cuboïdien tourné de 30°', { type: 'appui_cuboidien', dx_mm: -10, dy_mm: 110, angle_plan_deg: 30 }],
]) {
  test('miroir (géométrie) : ' + nom + ' — la couche du G est le symétrique exact de celle du D', () => {
    const r = ecartMiroir({ materiau_id: null, shore_a: null, visible: true, ...TYPES[el.type].defauts, ...el });
    assert.ok(r.somme > 1, 'l\'élément doit produire de la matière (sinon le test ne prouve rien)');
    assert.ok(r.pire < 1e-3, 'écart maximal ' + r.pire);
  });
}
test('miroir (garde-fou du test) : une rotation de signe inversé N\'EST PAS symétrique -> le test détecte une copie faussée', () => {
  const el = { materiau_id: null, shore_a: null, visible: true, ...TYPES.soutien_de_voute.defauts, type: 'soutien_de_voute', dx_mm: 15, dy_mm: 90, angle_plan_deg: -15 };
  const D = couches(el, 'D'), G = couches({ ...el, angle_plan_deg: 15 }, 'G'), { nx, ny } = D;
  const cx = D.rapport_elements.repere_talon.x_mm; let pire = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const im = Math.round((2 * cx - (D.ox + i * D.pas) - G.ox) / G.pas); if (im >= 0 && im < nx) pire = Math.max(pire, Math.abs(D.couches[0].z[j * nx + i] - G.couches[0].z[j * nx + im])); }
  assert.ok(pire > 0.05, 'une copie avec angle inversé doit être détectée (écart ' + pire + ')');
});

// ---------------------------------------------------------------- Pinceau
import { couchePinceau, validerCoups, coupsDuTrajet } from '../../js/semelle3d/calcul/pinceau.js';
import { PINCEAU } from '../../js/semelle3d/constantes.js';
import { surimpressions, strates } from '../../js/semelle3d/calcul/surimpression.js';
import { mesurerCoupe } from '../../js/semelle3d/calcul/elements.js';
import { epaisseurApplicable } from '../../js/semelle3d/calcul/materiau_auto.js';

function surfacePlane(h = 3, nx = 121, ny = 241) { return { nx, ny, pas: 0.5, ox: -30, oy: 0, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny) }; }
function bosse(s, cx, cy, hauteur, rayon) { for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) { const d = Math.hypot(s.ox + i * s.pas - cx, s.oy + j * s.pas - cy); if (d < rayon) s.haut[j * s.nx + i] += hauteur * (0.5 + 0.5 * Math.cos(Math.PI * d / rayon)); } return s; }
const REP = { x_mm: 0, y_mm: 30 }; // repère talon du test ; pied D : med = -1 (x = 0 + med × dx)
const coup = (extra = {}) => ({ dx_mm: 0, dy_mm: 0, rayon_mm: 12, mode: 'lisser', force: 0.5, ...extra });
const pin = (coups) => ({ type: 'pinceau', coups });
const idx = (s, x, y) => Math.round((y - s.oy) / s.pas) * s.nx + Math.round((x - s.ox) / s.pas);

test('pinceau : validation des passages (rayon 5-30, mode, force, nombre)', () => {
  assert.equal(PINCEAU.rayon_mm.min, 5); assert.equal(PINCEAU.rayon_mm.max, 30); assert.equal(PINCEAU.rayon_defaut_mm, 10);
  assert.throws(() => validerCoups([]), RangeError);
  assert.throws(() => validerCoups([coup({ rayon_mm: 4.9 })]), RangeError);
  assert.throws(() => validerCoups([coup({ rayon_mm: 30.1 })]), RangeError);
  assert.throws(() => validerCoups([coup({ mode: 'gommer' })]), RangeError);
  assert.throws(() => validerCoups([coup({ force: 0 })]), RangeError);
  assert.throws(() => validerCoups([coup({ force: 1.5 })]), RangeError);
  assert.throws(() => validerCoups([{ dy_mm: 3 }]), TypeError);
  assert.throws(() => validerCoups([coup({ dx_mm: NaN })]), TypeError);
  assert.throws(() => validerCoups(new Array(PINCEAU.max_coups + 1).fill(coup())), RangeError);
  assert.equal(validerCoups(new Array(PINCEAU.max_coups).fill(coup())).length, PINCEAU.max_coups);
  const v = validerCoups([{ dx_mm: 1.234, dy_mm: -2.26 }])[0];
  assert.deepEqual(v, { dx_mm: 1.2, dy_mm: -2.3, rayon_mm: 10, mode: 'lisser', force: 0.5 }, 'arrondi au 1/10 mm, valeurs par défaut');
});

test('pinceau : surface déjà plane = aucun changement (mais la zone est comptée)', () => {
  const s = surfacePlane(); const r = couchePinceau(s, pin([coup()]), REP, -1);
  assert.equal(Math.max(...r.z.map(Math.abs)), 0); assert.ok(r.cellules > 100);
});

test('pinceau : lisser abaisse un sommet, relève un creux, et ne touche rien hors du disque', () => {
  const s = bosse(surfacePlane(), 0, 60, 4, 6); const h0 = Float32Array.from(s.haut);
  const r = couchePinceau(s, pin([coup({ dx_mm: 0, dy_mm: 30, rayon_mm: 14 })]), REP, -1); // disque centré (0, 60)
  const k = idx(s, 0, 60); assert.ok(r.z[k] < -0.3, 'sommet abaissé : ' + r.z[k]);
  assert.ok(r.hauteur_min_mm < 0); assert.ok(r.hauteur_max_mm > 0, 'le pied de la bosse est relevé');
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) { const d = Math.hypot(s.ox + i * s.pas - 0, s.oy + j * s.pas - 60); if (d >= 14) assert.equal(r.z[j * s.nx + i], 0, 'hors du disque : couche nulle'); }
  assert.deepEqual([...s.haut], [...h0], 'la surface fournie n\'est pas modifiée');
  const creux = surfacePlane(); creux.haut[idx(creux, 0, 60)] -= 2;
  assert.ok(couchePinceau(creux, pin([coup({ dy_mm: 30 })]), REP, -1).z[idx(creux, 0, 60)] > 0.2, 'creux comblé en partie');
});

test('pinceau : remplir ne retire jamais de matière (couche >= 0) ; sommet inchangé, creux relevé', () => {
  const s = bosse(surfacePlane(), 0, 60, 4, 6); s.haut[idx(s, 8, 60)] -= 1.5;
  const r = couchePinceau(s, pin([coup({ dy_mm: 30, rayon_mm: 16, mode: 'remplir' })]), REP, -1);
  assert.ok(Math.min(...r.z) >= 0, 'aucune valeur négative'); assert.equal(r.z[idx(s, 0, 60)], 0, 'le sommet n\'est pas abaissé');
  assert.ok(r.z[idx(s, 8, 60)] > 0.1, 'le creux est relevé');
});

test('pinceau : le bord du disque est doux — même sur une bosse placée EXACTEMENT au bord, la couche tend vers 0 au bord (pas de marche)', () => {
  const s = bosse(surfacePlane(), 8, 60, 5, 6), r = 8;  // sommet de la bosse sur le bord du disque (centre (0, 60), rayon 8)
  const c = couchePinceau(s, pin([coup({ dy_mm: 30, rayon_mm: r, force: 1 })]), REP, -1);
  let bord = 0, interieur = 0;
  for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) { const d = Math.hypot(s.ox + i * s.pas - 0, s.oy + j * s.pas - 60); if (d >= r - 0.6 && d < r) bord = Math.max(bord, Math.abs(c.z[j * s.nx + i])); if (d < r - 3) interieur = Math.max(interieur, Math.abs(c.z[j * s.nx + i])); }
  assert.ok(bord < 0.12, 'au bord du disque : ' + bord.toFixed(3) + ' mm'); assert.ok(interieur > 0.3, 'mais bien lissé à l\'intérieur : ' + interieur.toFixed(3));
});

test('pinceau : jamais plus mince que l\'épaisseur minimale (0,9 mm) ni que la surface de départ', () => {
  const s = surfacePlane(1.2); s.haut[idx(s, 0, 60)] = 6; // pointe sur une base de 1,2 mm
  const r = couchePinceau(s, pin(new Array(40).fill(coup({ dy_mm: 30, force: 1 }))), REP, -1);
  for (let k = 0; k < s.haut.length; k++) assert.ok(s.haut[k] + r.z[k] >= Math.min(s.haut[k], s.bas[k] + 0.9) - 1e-5, 'épaisseur de ' + (s.haut[k] + r.z[k]));
  const fine = surfacePlane(0.5); const rf = couchePinceau(fine, pin([coup({ dy_mm: 30 })]), REP, -1); assert.equal(Math.min(...rf.z), 0, 'une zone déjà plus fine que 0,9 mm n\'est jamais amincie');
  // plateau de 3 mm de haut sur une base de 0,5 mm : la moyenne locale (~0,6) passerait SOUS 0,9 mm -> le plancher doit retenir à 0,9
  const p2 = surfacePlane(0.5); for (let j = 0; j < p2.ny; j++) for (let i = 0; i < p2.nx; i++) if (Math.hypot(p2.ox + i * p2.pas, p2.oy + j * p2.pas - 60) < 2) p2.haut[j * p2.nx + i] = 3;
  const r2 = couchePinceau(p2, pin(new Array(10).fill(coup({ dy_mm: 30, force: 1 }))), REP, -1), k2 = idx(p2, 0, 60);
  assert.ok(p2.haut[k2] + r2.z[k2] >= 0.9 - 1e-5, 'épaisseur finale ' + (p2.haut[k2] + r2.z[k2]) + ' mm'); assert.ok(r2.z[k2] < -1, 'le plateau a bien été abaissé jusqu\'au plancher');
});

test('pinceau : résultat indépendant de l\'ordre de balayage (entrée symétrique -> sortie symétrique)', () => {
  const s = bosse(surfacePlane(), 0, 60, 4, 8); const r = couchePinceau(s, pin([coup({ dy_mm: 30, rayon_mm: 15 })]), REP, -1);
  for (const [dx, dy] of [[3, 2], [7, 5], [10, 0]]) { const a = r.z[idx(s, dx, 60 + dy)], b = r.z[idx(s, -dx, 60 + dy)], c = r.z[idx(s, dx, 60 - dy)]; assert.ok(Math.abs(a - b) < 1e-5 && Math.abs(a - c) < 1e-5, 'symétrie ' + a + ' ' + b + ' ' + c); }
});

test('pinceau : plusieurs passages s\'accumulent (2 passages lissent plus qu\'un)', () => {
  const s = bosse(surfacePlane(), 0, 60, 4, 8), k = idx(s, 0, 60);
  const un = couchePinceau(s, pin([coup({ dy_mm: 30 })]), REP, -1).z[k], deux = couchePinceau(s, pin([coup({ dy_mm: 30 }), coup({ dy_mm: 30 })]), REP, -1).z[k];
  assert.ok(deux < un - 0.05, 'un passage ' + un + ', deux passages ' + deux);
});

test('pinceau : pied D et pied G — les mêmes passages donnent des couches SYMÉTRIQUES (repère médial)', () => {
  const s = bosse(surfacePlane(), -12, 60, 4, 9); // bosse à x = -12 : côté médial du pied D (med = -1, dx = +12)
  const D = couchePinceau(s, pin([coup({ dx_mm: 12, dy_mm: 30, rayon_mm: 14 })]), REP, -1);
  const sG = bosse(surfacePlane(), 12, 60, 4, 9), G = couchePinceau(sG, pin([coup({ dx_mm: 12, dy_mm: 30, rayon_mm: 14 })]), REP, 1);
  let pire = 0; for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) { const im = Math.round((0 - (s.ox + i * s.pas) - s.ox) / s.pas); pire = Math.max(pire, Math.abs(D.z[j * s.nx + i] - G.z[j * s.nx + im])); }
  assert.ok(pire < 1e-5, 'écart ' + pire); assert.ok(Math.min(...D.z) < -0.2);
});

test('pinceau : disque entièrement hors du pied (NaN) ou hors de la grille = aucune cellule comptée', () => {
  const s = surfacePlane(); s.haut.fill(NaN);
  assert.equal(couchePinceau(s, pin([coup({ dy_mm: 30 })]), REP, -1).cellules, 0);
  assert.equal(couchePinceau(surfacePlane(), pin([coup({ dx_mm: 500, dy_mm: 30 })]), REP, -1).cellules, 0);
});

test('pinceau : trou (NaN) dans le disque ignoré, jamais propagé', () => {
  const s = bosse(surfacePlane(), 0, 60, 4, 8); for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) if (i < 50) s.haut[j * s.nx + i] = NaN;
  const r = couchePinceau(s, pin([coup({ dy_mm: 30, rayon_mm: 20 })]), REP, -1);
  assert.ok([...r.z].every((v) => Number.isFinite(v))); assert.equal(r.z[idx(s, -28, 60)], 0);
});

test('pinceau : trajet -> passages espacés de 35 % du rayon, au plus 400, repère médial (D : x inversé)', () => {
  const trace = []; for (let x = 0; x <= 100; x += 0.5) trace.push({ x, y: 30 });
  const c = coupsDuTrajet(trace, REP, -1, { rayon_mm: 10 });
  assert.ok(c.length >= 28 && c.length <= 30, 'nombre de passages ' + c.length); assert.equal(c[0].dx_mm, 0);
  assert.equal(c[1].dx_mm - c[0].dx_mm < 0, true, 'pied D : x croissant = dx décroissant');
  assert.equal(coupsDuTrajet(trace, REP, 1, { rayon_mm: 10 })[1].dx_mm > 0, true, 'pied G : dx croissant');
  const long = []; for (let x = 0; x < 5000; x += 5) long.push({ x, y: 0 }); assert.equal(coupsDuTrajet(long, REP, -1, { rayon_mm: 5 }).length, PINCEAU.max_coups);
  assert.equal(coupsDuTrajet([{ x: NaN, y: 1 }], REP, -1).length, 0);
  assert.deepEqual(coupsDuTrajet([{ x: 5, y: 31 }], REP, -1, { rayon_mm: 8, mode: 'remplir', force: 0.7 })[0], { dx_mm: -5, dy_mm: 1, rayon_mm: 8, mode: 'remplir', force: 0.7 });
});

// ----- intégration dans appliquerElements
const ptC = { type: 'point_curseur', dx_mm: 0, dy_mm: 100, hauteur_mm: 4, rayon_mm: 12, materiau_id: null, shore_a: null, visible: true };
function finaleAvec(els) { return appliquerElements(plaque({ h: 3 }), els, { cote: 'D', cat: { liste: [], parId: new Map() } }); }
const pic = (f) => { let m = -Infinity; for (let k = 0; k < f.haut.length; k++) if (f.haut[k] > m) m = f.haut[k]; return m; };
const pinceauSurPoint = () => ({ type: 'pinceau', coups: [coup({ dx_mm: 0, dy_mm: 100 - 0, rayon_mm: 14 })], materiau_id: null, shore_a: null, visible: true });

test('pinceau (pipeline) : posé après un point curseur, il abaisse le sommet ; couche signée dans l\'ordre ; avant le recouvrement', () => {
  const sans = finaleAvec([ptC]), avec = finaleAvec([ptC, pinceauSurPoint()]);
  assert.ok(pic(avec) < pic(sans) - 0.3, 'sommet ' + pic(sans) + ' -> ' + pic(avec));
  assert.equal(avec.elements.length, 2); assert.ok(avec.couches[1].z.some((v) => v < 0) && avec.couches[1].z.some((v) => v > 0), 'couche signée');
  const rec = { type: 'recouvrement', hauteur_mm: 2, materiau_id: null, shore_a: null, visible: true };
  const avecRec = finaleAvec([rec, ptC, pinceauSurPoint()]);
  assert.deepEqual([...avecRec.couches[2].z], [...avec.couches[1].z], 'le recouvrement (saisi en 1er) passe en dernier : le pinceau lisse la surface SANS lui');
  assert.ok(Math.abs(pic(avecRec) - (pic(avec) + 2)) < 1e-4);
});

test('pinceau (pipeline) : posé AVANT le point curseur, il n\'a rien à lisser (le point arrive après)', () => {
  const avant = finaleAvec([pinceauSurPoint(), ptC]);
  assert.ok(Math.abs(pic(avant) - pic(finaleAvec([ptC]))) < 1e-4, 'même sommet que le point seul'); assert.equal(Math.max(...avant.couches[0].z.map(Math.abs)), 0);
});

test('pinceau (pipeline) : masqué = aucun effet ; passage entièrement hors du pied = erreur claire ; pas de matériau exigé ni d\'avertissement « matériau non choisi »', () => {
  const sans = finaleAvec([ptC]), masque = finaleAvec([ptC, pinceauSurPoint(), ]);
  const cache = finaleAvec([ptC, { ...pinceauSurPoint(), visible: false }]);
  assert.ok(Math.abs(pic(cache) - pic(sans)) < 1e-6); assert.ok(pic(masque) < pic(sans));
  assert.throws(() => finaleAvec([{ ...pinceauSurPoint(), coups: [coup({ dx_mm: 900, dy_mm: 100 })] }]), RangeError);
  const avec = finaleAvec([ptC, pinceauSurPoint()]); assert.ok(!avec.rapport_elements.avertissements.some((a) => /matériau non choisi/.test(a) && /el_002/.test(a)), 'pas d\'avertissement de matériau pour le pinceau');
});

test('pinceau (pipeline) : surimpression, strates et mesure de coupe ne plantent pas, la coupe note « retouche au pinceau »', () => {
  const f = finaleAvec([ptC, pinceauSurPoint()]);
  const s = surimpressions(f, 'D'); assert.equal(s.length, 2); strates(f);
  const m = mesurerCoupe(f, 'T', 100, 'D'); const e = m.elements.find((x) => x.type === 'pinceau');
  assert.ok(e && e.applicable === false && /pinceau/.test(e.raison));
});

test('pinceau (pipeline) : aucun avertissement parasite (raccord) pour un pinceau', () => {
  assert.deepEqual(finaleAvec([ptC, pinceauSurPoint()]).infos[1].avertissements.filter((a) => /raccord|matériau/.test(a)), []);
});

test('pinceau (pipeline) : épaisseur automatique jamais appliquée au pinceau', () => {
  assert.equal(epaisseurApplicable({ type: 'pinceau' }, { epaisseur_mm: 2 }), null);
});

test('pinceau : la force règle l\'intensité d\'un passage (0,2 < 0,5 < 0,9)', () => {
  const s = bosse(surfacePlane(), 0, 60, 4, 8), k = idx(s, 0, 60);
  const f = (force) => couchePinceau(s, pin([coup({ dy_mm: 30, force })]), REP, -1).z[k];
  assert.ok(f(0.2) > f(0.5) && f(0.5) > f(0.9), f(0.2) + ' ' + f(0.5) + ' ' + f(0.9)); assert.ok(f(0.9) < -0.5);
});
