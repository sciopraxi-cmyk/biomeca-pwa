import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES_ELEMENTS as TYPES, appliquerElements as appliquerBrut, mesurerCoupe, decomposerEpaisseur } from '../../js/semelle3d/calcul/elements.js';
import { PALETTE_ELEMENTS, SEUIL_EMPRISE_MM, POINTS_ISTHME, teinteSuivante, couleurTeinte, masqueElement, surimpressions, surimpressionDeMasque, strates, ordreEmpilement, ligneIsthme, hauteursLigne, pointsDeControle, ligneCorrigee } from '../../js/semelle3d/calcul/surimpression.js';
import { readFileSync, existsSync } from 'node:fs';
import { chargerMateriaux, couleurDuTitre, COULEURS_TITRE } from '../../js/semelle3d/calcul/materiaux.js';
import { epaisseurApplicable, epaisseurBaseApplicable } from '../../js/semelle3d/calcul/materiau_auto.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
const materiaux = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));

function plaque({ x0 = -60, x1 = 60, y1 = 200, h = 2 } = {}) {
  const nx = Math.round((x1 - x0) / 0.5) + 1, ny = Math.round(y1 / 0.5) + 1;
  return { nx, ny, pas: 0.5, ox: x0, oy: 0, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } };
const appliquer = (...a) => garde(() => appliquerBrut(...a));
const calc = (els, cote = 'D', base = plaque()) => appliquer(base, els, { cote, cat: { liste: [], parId: new Map() } });
const pt = (extra = {}) => ({ type: 'point_curseur', dx_mm: 0, dy_mm: 100, hauteur_mm: 2, rayon_mm: 10, ...extra });
const nbMasque = (m) => m.reduce((s, v) => s + v, 0);

test('palette : 10 couleurs toutes différentes ; teinte suivante = la plus petite libre, jamais une teinte déjà prise', () => {
  assert.equal(PALETTE_ELEMENTS.length, 10);
  assert.equal(new Set(PALETTE_ELEMENTS).size, 10);
  assert.equal(teinteSuivante([]), 0);
  assert.equal(teinteSuivante([{ teinte: 0 }, { teinte: 1 }]), 2);
  assert.equal(teinteSuivante([{ teinte: 0 }, { teinte: 2 }]), 1, 'la teinte libérée par un élément retiré est réutilisée');
  assert.equal(teinteSuivante([{ teinte: 3 }]), 0);
  assert.equal(couleurTeinte(4), PALETTE_ELEMENTS[4]);
  assert.equal(couleurTeinte(undefined, 12), PALETTE_ELEMENTS[2], 'sans teinte : couleur selon le rang');
});

test('emprise d\'un point : disque du rayon réglé (même à 0 mm, la surface ne change pas)', () => {
  const b = plaque(), r = calc([pt({ hauteur_mm: 0 })], 'D', b);
  const m = masqueElement(r, 0, 'D'), n = nbMasque(m), attendu = Math.PI * 100 / 0.25;
  assert.ok(Math.abs(n - attendu) / attendu < 0.03, 'aire du disque à 3 % près : ' + n + ' / ' + attendu.toFixed(0));
  const i = Math.round((0 - b.ox) / 0.5), j = Math.round(100 / 0.5);
  assert.equal(m[j * b.nx + i], 1, 'centre dans l\'emprise');
  assert.equal(m[j * b.nx + i + 22], 0, 'à 11 mm : hors emprise');
});

test('emprise d\'un élément à relief = cellules où la couche dépasse le seuil ; élément masqué = vide', () => {
  const b = plaque(), r = calc([{ type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100 }, pt({ dy_mm: 150, visible: false })], 'D', b);
  const m = masqueElement(r, 0, 'D'), z = r.couches[0].z;
  for (let k = 0; k < m.length; k++) assert.equal(m[k], Math.abs(z[k]) > SEUIL_EMPRISE_MM ? 1 : 0);
  assert.ok(nbMasque(m) > 100);
  assert.equal(nbMasque(masqueElement(r, 1, 'D')), 0, 'élément masqué : aucune emprise');
});

test('surimpression : triangles et liseré ; liseré fermé (chaque nœud touché un nombre pair de fois), aire cohérente', () => {
  const b = plaque(), r = calc([pt({ hauteur_mm: 2 })], 'D', b);
  const [s] = surimpressions(r, 'D');
  assert.ok(s.cellules > 500 && s.indices.length === 6 * s.cellules);
  assert.ok(Math.abs(s.aire_mm2 - Math.PI * 100) / (Math.PI * 100) < 0.05, 'aire ~ pi r² : ' + s.aire_mm2);
  const compte = new Map();
  for (let q = 0; q < s.contour.length; q += 3) { const c = s.contour[q].toFixed(2) + '/' + s.contour[q + 1].toFixed(2); compte.set(c, (compte.get(c) || 0) + 1); }
  for (const [c, v] of compte) assert.equal(v % 2, 0, 'contour ouvert en ' + c);
  for (let q = 0; q < s.positions.length; q += 3) assert.ok(Math.abs(s.positions[q + 2] - r.haut[Math.round(s.positions[q + 1] / 0.5) * b.nx + Math.round((s.positions[q] - b.ox) / 0.5)]) < 1e-5, 'sommet posé sur la surface finale');
});

test('délimitation précise : deux éléments ne se mélangent pas, le chevauchement est dans les deux emprises', () => {
  const b = plaque(), r = calc([pt({ dy_mm: 100, hauteur_mm: 2 }), pt({ dy_mm: 112, hauteur_mm: 1.5 })], 'D', b);
  const a = masqueElement(r, 0, 'D'), c = masqueElement(r, 1, 'D');
  let seulA = 0, seulC = 0, deux = 0;
  for (let k = 0; k < a.length; k++) { if (a[k] && c[k]) deux++; else if (a[k]) seulA++; else if (c[k]) seulC++; }
  assert.ok(seulA > 0 && seulC > 0 && deux > 0, 'A seul ' + seulA + ', B seul ' + seulC + ', commun ' + deux);
});

test('surimpression : teinte conservée ; la partie hors contour n\'est jamais recouverte', () => {
  const b = plaque();
  for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) if (i > 100) b.haut[j * b.nx + i] = NaN; // contour : x <= -10
  const r = calc([pt({ dx_mm: 0, hauteur_mm: 2, teinte: 4, rayon_mm: 12 })], 'D', b);
  const [s] = surimpressions(r, 'D');
  assert.equal(s.teinte, 4);
  assert.ok(s.cellules > 0);
  for (let q = 0; q < s.positions.length; q += 3) assert.ok(Number.isFinite(s.positions[q + 2]) && s.positions[q] <= -10 + 1e-6, 'aucun sommet hors contour');
});

test('aucun élément : aucune surimpression', () => {
  assert.deepEqual(surimpressions(calc([]), 'D'), []);
});

// ---- ligne de l'isthme : limite d'appui estimée en charge (30 % les plus externes de la zone sans appui touchent le sol) ----
function empreinte({ nx = 120, ny = 400, pas = 0.5, ox = -30, oy = 0, avecVoute = true, cote = 'D', f0 = 0.25, f1 = 0.55, zAppui = 0 } = {}) { // pied « sablier » ; voûte : zone sans appui (z = 6 mm) du bord médial jusqu'à x = 5 (D) entre 25 % et 55 %
  const valide = new Uint8Array(nx * ny), z = new Float32Array(nx * ny).fill(NaN), med = cote === 'D' ? -1 : 1;
  for (let j = 0; j < ny; j++) {
    const f = j / (ny - 1), demi = 25 - 8 * Math.exp(-(((f - 0.35) / 0.12) ** 2)); // mm
    for (let i = 0; i < nx; i++) {
      const x = ox + i * pas; if (!(Math.abs(x) <= demi && f < 0.98)) continue;
      valide[j * nx + i] = 1; z[j * nx + i] = zAppui;
      if (avecVoute && f >= f0 && f <= f1 && (x - 5) * med >= 0) z[j * nx + i] = 6; // sans appui entre le bord médial et x = 5
    }
  }
  return { nx, ny, pas, ox, oy, valide, z };
}
const largeur = (e, j) => { let a = Infinity, b = -Infinity; for (let i = 0; i < e.nx; i++) if (e.valide[j * e.nx + i]) { a = Math.min(a, e.ox + i * 0.5); b = Math.max(b, e.ox + i * 0.5); } return [a, b]; };
test('ligne d\'appui : à 30 % de la zone SANS appui, mesurés depuis le côté externe (pas depuis le médial), pieds D et G', () => {
  for (const cote of ['D', 'G']) {
    const e = empreinte({ cote }), I = ligneIsthme(e, cote), med = cote === 'D' ? -1 : 1;
    assert.equal(I.methode, 'appui'); assert.equal(I.a_confirmer, false); assert.equal(I.part, 0.3);
    let n = 0;
    for (let q = 0; q < I.points.length; q += 2) {
      const [a, b] = largeur(e, Math.round(I.points[q + 1] / 0.5)), med0 = med < 0 ? a : b;
      const f = I.points[q + 1] / (e.ny * 0.5);
      if (f < 0.33 || f > 0.47) continue; // plein milieu de la voûte (hors lissage des extrémités)
      const xext = 5, attendu = xext + (med0 - xext) * 0.3; // limite externe de la zone sans appui = x 5 ; ligne à 30 % de là vers le médial
      assert.ok(Math.abs(I.points[q] - attendu) < 0.6, 'cote ' + cote + ' y ' + I.points[q + 1] + ' : ' + I.points[q] + ' attendu ' + attendu.toFixed(2)); n++;
    }
    assert.ok(n > 20);
  }
});
test('ligne d\'appui : limitée aux rangées où la voûte existe (≈ 25 % à 55 % ici), du talon vers l\'avant', () => {
  const e = empreinte(), I = ligneIsthme(e, 'D'), L = e.ny * 0.5;
  assert.ok(I.y_de >= 0.25 * L - 1 && I.y_de < 0.3 * L + 8 && I.y_a <= 0.55 * L + 1 && I.y_a > 0.5 * L - 8, I.y_de + ' / ' + I.y_a);
  for (let q = 2; q < I.points.length; q += 2) assert.ok(I.points[q + 1] > I.points[q - 1]);
});
test('ligne d\'appui : le seuil compte (une face plantaire à 0,8 mm du sol touche, à 1,2 mm elle ne touche pas)', () => {
  const e = empreinte(); for (let k = 0; k < e.z.length; k++) if (e.z[k] === 6) e.z[k] = 0.8;
  assert.equal(ligneIsthme(e, 'D').methode, 'theorique', 'sous 1 mm : tout est appui, pas de voûte');
  const f = empreinte(); for (let k = 0; k < f.z.length; k++) if (f.z[k] === 6) f.z[k] = 1.2;
  assert.equal(ligneIsthme(f, 'D').methode, 'appui');
});
test('ligne d\'appui : un appui isolé plus court que 2 mm (bruit) ne coupe pas la zone sans appui', () => {
  const e = empreinte(), j = 140;
  for (let i = 0; i < e.nx; i++) if (e.z[j * e.nx + i] === 6 && Math.abs(e.ox + i * 0.5 + 15) < 0.4) e.z[j * e.nx + i] = 0; // 1 colonne d'appui au milieu
  const I = ligneIsthme(e, 'D'), ref = ligneIsthme(empreinte(), 'D');
  const xA = (L, y) => { for (let q = 0; q < L.points.length; q += 2) if (Math.abs(L.points[q + 1] - y) < 0.3) return L.points[q]; };
  assert.ok(Math.abs(xA(I, 70) - xA(ref, 70)) < 1, 'rangée bruitée : même limite');
});
test('repli THÉORIQUE (aucune voûte) : appui = 1/3 de la plus grande largeur, côté externe, courbe qui rejoint le médial aux extrémités, marqué « à confirmer »', () => {
  const e = empreinte({ avecVoute: false }), I = ligneIsthme(e, 'D');
  assert.equal(I.methode, 'theorique'); assert.equal(I.a_confirmer, true); assert.match(I.raison, /théorique/);
  const wmax = 50, L = e.ny * 0.5; let milieu = null;
  for (let q = 0; q < I.points.length; q += 2) { const [a, b] = largeur(e, Math.round(I.points[q + 1] / 0.5)); const f = I.points[q + 1] / L; if (Math.abs(f - 0.35) < 0.005) milieu = b - I.points[q]; assert.ok(I.points[q] >= a - 0.01 && I.points[q] <= b); }
  assert.ok(Math.abs(milieu - wmax / 3) < 1.5, 'au milieu l\'appui mesure ' + milieu + ' mm (1/3 de ' + wmax + ' = ' + (wmax / 3).toFixed(1) + ')');
  const premier = largeur(e, Math.round(I.points[1] / 0.5)); assert.ok(I.points[0] - premier[0] < 5, 'au début la ligne est près du bord médial');
});
test('ligne de l\'isthme : latéralité obligatoire, part invalide et empreinte vide refusées', () => {
  assert.throws(() => ligneIsthme(empreinte(), null), /latéralité/);
  assert.throws(() => ligneIsthme(empreinte(), 'D', { part: 0 }), /part externe/);
  assert.throws(() => ligneIsthme({ nx: 10, ny: 10, pas: 1, ox: 0, oy: 0, valide: new Uint8Array(100) }, 'D'), /vide/);
});
test('points curseurs de la ligne : 7 points, extrémités incluses ; sans décalage la ligne est celle du scan', () => {
  const l = ligneIsthme(empreinte(), 'D'), c = pointsDeControle(l);
  assert.equal(c.length, POINTS_ISTHME);
  assert.equal(c[0].r, 0); assert.equal(c[c.length - 1].r, l.points.length / 2 - 1);
  assert.deepEqual([...ligneCorrigee(l, null)], [...l.points]);
  assert.deepEqual([...ligneCorrigee(l, new Array(7).fill(0))], [...l.points]);
});
test('points curseurs de la ligne : déplacer un point déplace la ligne autour de lui seulement (x), y inchangé', () => {
  const l = ligneIsthme(empreinte(), 'D'), dec = new Array(7).fill(0); dec[3] = 5;
  const o = ligneCorrigee(l, dec), c = pointsDeControle(l);
  assert.ok(Math.abs(o[2 * c[3].r] - (l.points[2 * c[3].r] + 5)) < 1e-4, 'le point déplacé de 5 mm');
  assert.equal(o[0], l.points[0], 'le début ne bouge pas');
  assert.equal(o[o.length - 2], l.points[l.points.length - 2], 'la fin ne bouge pas');
  for (let q = 1; q < o.length; q += 2) assert.equal(o[q], l.points[q]);
  const mi = Math.round((c[2].r + c[3].r) / 2);
  assert.ok(o[2 * mi] > l.points[2 * mi] && o[2 * mi] < l.points[2 * mi] + 5, 'interpolation linéaire entre points voisins');
});

// ---- pipeline (worker) : la surimpression et la ligne sortent avec la base ----
async function prepare(scenario) {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  const r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  assert.equal(r.type, 'recale');
  await traiterMessageA({ type: 'materiaux', json: materiaux }, etat);
  return { etat, cote: d.cote_reel };
}
test('pipeline : base + 2 éléments -> 2 surimpressions colorées (teinte conservée) et la ligne d\'appui estimée (30 % externes), pied D et pied G', async () => {
  for (const scenario of ['droit_stl_mm', 'gauche_obj_mm']) {
    const { etat, cote } = await prepare(scenario);
    const els = [{ type: 'point_curseur', dx_mm: 0, dy_mm: 60, hauteur_mm: 1, rayon_mm: 8, teinte: 3 }, { type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 3, teinte: 7 }];
    const r = await traiterMessageA({ type: 'base', cote, params: { cote, type: 'plate' }, elements: els }, etat);
    assert.equal(r.surimpressions.length, 2);
    assert.deepEqual(r.surimpressions.map((s) => s.teinte), [3, 7]);
    for (const s of r.surimpressions) assert.ok(s.cellules > 20 && s.contour.length > 0 && s.indices.length === 6 * s.cellules);
    assert.ok(r.isthme && r.isthme.cote === cote && r.isthme.points.length >= 8);
    const xs = r.isthme.points.filter((_, q) => q % 2 === 0);
    let mn = Infinity, mx = -Infinity; for (let q = 0; q < r.positions.length; q += 3) { mn = Math.min(mn, r.positions[q]); mx = Math.max(mx, r.positions[q]); }
    const bordMed = cote === 'D' ? mn : mx, bordLat = cote === 'D' ? mx : mn;
    assert.equal(r.isthme.methode, 'appui');
    for (const x of xs) assert.ok(Math.abs(x - bordMed) > 3 && Math.abs(x - bordLat) > 3 && x > mn && x < mx, 'la ligne est à l\'intérieur du pied, entre les deux bords : x=' + x);
    const lat = xs.reduce((m, x) => m + Math.abs(x - bordLat), 0) / xs.length, med = xs.reduce((m, x) => m + Math.abs(x - bordMed), 0) / xs.length;
    assert.ok(lat < med, 'l\'appui estimé (côté latéral) est plus étroit que la zone sans appui : ' + lat.toFixed(1) + ' / ' + med.toFixed(1));
    const r2 = await traiterMessageA({ type: 'elements', cote, elements: [] }, etat);
    assert.deepEqual(r2.surimpressions, []);
    assert.ok(r2.isthme, 'la ligne ne dépend pas des éléments');
  }
});
test('surimpressionDeMasque : masque vide = rien', () => {
  const b = plaque(), r = calc([pt()], 'D', b);
  const s = surimpressionDeMasque(r, new Uint8Array(b.nx * b.ny));
  assert.equal(s.cellules, 0); assert.equal(s.positions.length, 0); assert.equal(s.contour.length, 0);
});

test('emprise d\'une décharge (couche en creux) : les cellules en creux comptent aussi', () => {
  const b = plaque({ h: 6 }), r = calc([{ type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, signe: -1, hauteur_mm: 1 }], 'D', b);
  const m = masqueElement(r, 0, 'D'), z = r.couches[0].z;
  let creux = 0, marquees = 0; for (let k = 0; k < z.length; k++) if (z[k] < -0.05) { creux++; if (m[k]) marquees++; }
  assert.ok(creux > 100 && marquees === creux, 'creux ' + creux + ', marquées ' + marquees);
});
test('hauteurs le long de la ligne : hauteur de la surface au nœud le plus proche, décalée de c·pas ; NaN hors contour (grille décalée oy ≠ 0)', () => {
  const nx = 80, ny = 120, pas = 0.5, ox = -40, oy = 7, haut = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) haut[j * nx + i] = i + 1000 * j;
  haut[(60) * nx + 40] = NaN;
  const finale = { nx, ny, pas, ox, oy, haut }, ligne = { points: Float32Array.from([-10, oy + 30 * pas, -10, oy + 60 * pas]) };
  const h = hauteursLigne(finale, ligne, 2);
  assert.equal(h.n, 9); assert.equal(h.pas, 0.5);
  const i0 = Math.round((-10 - ox) / pas); // 60
  for (let c = 0; c < 9; c++) assert.equal(h.z[c], (i0 - 4 + c) + 1000 * 30, 'rangée 0, colonne ' + c);
  assert.equal(h.z[9 + 4], (i0) + 1000 * 60, 'rangée 1, colonne centrale');
  const nan = hauteursLigne({ ...finale, haut: Float32Array.from(haut, (v, k) => (k === 60 * nx + i0 ? NaN : v)) }, ligne, 2);
  assert.ok(Number.isNaN(nan.z[9 + 4]) && Number.isFinite(nan.z[9 + 3]));
});

test('ligne d\'appui : la partie externe « touche » jusqu\'à 1 mm (appui léger à 0,8 mm = appui), pas seulement à 0', () => {
  const ref = ligneIsthme(empreinte(), 'D'), I = ligneIsthme(empreinte({ zAppui: 0.8 }), 'D');
  assert.equal(I.methode, 'appui'); assert.equal(I.points.length, ref.points.length);
  for (let q = 0; q < I.points.length; q++) assert.ok(Math.abs(I.points[q] - ref.points[q]) < 1e-4);
});
test('voûte trop courte (< 10 % de la longueur du pied) : pas de ligne d\'appui, repli théorique à confirmer', () => {
  const I = ligneIsthme(empreinte({ f0: 0.40, f1: 0.44 }), 'D');
  assert.equal(I.methode, 'theorique'); assert.equal(I.a_confirmer, true);
});

// ---- couleur dans le titre du matériau / épaisseur reprise du titre ----
const cat = chargerMateriaux(materiaux);
test('couleur du titre : les 18 recouvrements colorés du tableau ont la bonne couleur, aucun autre matériau n\'en a', () => {
  const att = { N: 'Noir', B: 'Bleu', R: 'Rose', G: 'Gris', M: 'Marron' };
  let colores = 0;
  for (const m of cat.liste) {
    const mot = /(Noir|Bleu|Rose|Gris|Marron|Beige)/i.exec(m.libelle);
    if (!mot) { assert.equal(m.couleur_hex, null, m.id + ' : pas de couleur dans le titre'); continue; }
    colores++;
    const marbre = /marbr/i.test(m.libelle) && /^(noir|gris|bleu|rose)$/i.test(mot[1]);
    assert.equal(m.couleur_nom.toLowerCase(), marbre ? mot[1].toLowerCase() + ' marbré' : mot[1].toLowerCase(), m.id + ' : « ' + m.libelle.trim() + ' »');
    assert.equal(m.texture, marbre ? 'marbre-' + mot[1].toLowerCase() : null, m.id + ' : texture seulement pour les 4 marbrés');
    assert.match(m.couleur_hex, /^#[0-9a-f]{6}$/);
  }
  assert.equal(colores, 18); void att;
  assert.equal(new Set(COULEURS_TITRE.map((c) => c.hex)).size, 6, '6 couleurs d\'affichage distinctes');
  for (const f of ['marbre-noir', 'marbre-gris', 'marbre-bleu', 'marbre-rose']) assert.ok(existsSync(new URL('../../assets/semelle3d/' + f + '.jpg', import.meta.url)), 'photo ' + f + '.jpg présente dans assets/');
  assert.equal(new Set(PALETTE_ELEMENTS).size, 10);
  for (const c of COULEURS_TITRE) assert.ok(!PALETTE_ELEMENTS.includes(c.hex), 'la palette des éléments ne reprend pas la couleur « ' + c.nom + ' »');
});
test('couleur du titre : mot entier seulement, casse et accents indifférents, aucune confusion', () => {
  assert.equal(couleurDuTitre('Recouvrement EVA Micro-perforé Marbré BLEU ').nom, 'Bleu marbré');
  assert.equal(couleurDuTitre('Recouvrement Poly-éthylène micro-perforé 2.0mm 36S Bleu').nom, 'Bleu', 'bleu uni');
  assert.equal(couleurDuTitre('Recouvrement micro-fibre Marron Micro-perforé').nom, 'Marron');
  assert.equal(couleurDuTitre('Recouvrement PE/EVA Micro-perforé Marbré NOIR').nom, 'Noir marbré');
  assert.equal(couleurDuTitre('Poly-éthylène 4.0mm 60S'), null);
  assert.equal(couleurDuTitre('Marbré'), null, 'marbré n\'est pas une couleur');
  assert.equal(couleurDuTitre('Resine rosetta'), null, '« rose » dans un autre mot : pas une couleur');
  assert.equal(couleurDuTitre(null), null);
  assert.equal(couleurDuTitre('Recouvrement EVA Micro-perforé Marbré Noir').texture, 'marbre-noir');
  assert.equal(couleurDuTitre('Recouvrement PE/EVA Micro-perforé Marbré GRIS').texture, 'marbre-gris');
  assert.equal(couleurDuTitre('Recouvrement micro-fibre Noir Micro-perforé').texture, undefined, 'noir uni : pas de texture');
  assert.equal(couleurDuTitre('Recouvrement EVA Micro-perforé Marbré BLEU').texture, 'marbre-bleu');
  assert.equal(couleurDuTitre('Recouvrement Poly-éthylène micro-perforé 2.0mm 36S Bleu').texture, undefined, 'bleu uni : pas de texture');
  assert.equal(couleurDuTitre('Recouvrement EVA Micro-perforé Marbré ROSE').texture, 'marbre-rose');
  assert.equal(couleurDuTitre('Recouvrement EVA Micro-perforé Marbré ROSE').hex, '#e85681');
  assert.equal(couleurDuTitre('Recouvrement Poly-éthylène micro-perforé 3.0mm 36S Rose').texture, undefined, 'rose uni : pas de texture');
});
test('épaisseur du titre -> hauteur : recouvrement, bords, importés ; jamais pour un point, un coin ni un creux', () => {
  const mat = (id) => cat.parId.get(id);
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, mat('EVA-REC-MP-B')), 2);
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, mat('MF-CUIR-MP-N')), 0.7, 'micro-fibre : « 0,7mm » (virgule)');
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, mat('PE-REC-MP-3.0-R')), 3);
  assert.equal(epaisseurApplicable({ type: 'soutien_de_voute' }, mat('PE-4.0-70S')), 4);
  assert.equal(epaisseurApplicable({ type: 'voute_bord', signe: 1 }, mat('EVA-6.0-30S')), 6);
  assert.equal(epaisseurApplicable({ type: 'point_curseur' }, mat('PE-4.0-70S')), null, 'un point : hauteur tirée à la souris');
  assert.equal(epaisseurApplicable({ type: 'coin_pronateur_posterieur' }, mat('PE-4.0-70S')), null, 'un coin : en degrés');
  assert.equal(epaisseurApplicable({ type: 'soutien_de_voute', signe: -1 }, mat('PE-4.0-70S')), null, 'un creux : profondeur voulue');
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, null), null);
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, { epaisseur_mm: 0 }), null, 'épaisseur nulle');
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, { epaisseur_mm: -2 }), null, 'épaisseur négative');
  assert.equal(epaisseurApplicable({ type: 'recouvrement' }, { epaisseur_mm: null }), null, 'épaisseur absente');
  assert.equal(epaisseurApplicable({ type: 'inconnu' }, mat('PE-4.0-70S')), null);
  const creux = Object.keys(TYPES).find((k) => TYPES[k].signe_defaut === -1);
  assert.equal(epaisseurApplicable({ type: creux }, mat('PE-4.0-70S')), null, 'élément de la bibliothèque en creux : ' + creux);
  const coinBib = Object.keys(TYPES).find((k) => TYPES[k].fiche && TYPES[k].fiche.coin);
  if (coinBib) assert.equal(epaisseurApplicable({ type: coinBib }, mat('PE-4.0-70S')), null);
  const imp = Object.keys(TYPES).find((k) => TYPES[k].importe && TYPES[k].signe_defaut !== -1 && !(TYPES[k].fiche && TYPES[k].fiche.coin));
  assert.equal(epaisseurApplicable({ type: imp }, mat('PE-4.0-70S')), 4, 'importé : ' + imp);
});

test('épaisseur de la base reprise du titre du matériau : valeur du tableau (virgule comprise), rien si absente ou nulle', () => {
  assert.equal(epaisseurBaseApplicable(cat.parId.get('PE-4.0-70S')), 4);
  assert.equal(epaisseurBaseApplicable(cat.parId.get('RES-FLEX-1.3')), 1.3, 'résine 1.3 mm');
  assert.equal(epaisseurBaseApplicable(cat.parId.get('RES-FLUX-0.9')), 0.9);
  assert.equal(epaisseurBaseApplicable(cat.parId.get('MF-CUIR-MP-N')), 0.7, '« 0,7mm »');
  assert.equal(epaisseurBaseApplicable(cat.parId.get('PE-8.0-70S')), 8);
  assert.equal(epaisseurBaseApplicable(null), null);
  assert.equal(epaisseurBaseApplicable({ epaisseur_mm: null }), null);
  assert.equal(epaisseurBaseApplicable({ epaisseur_mm: 0 }), null);
  const tous = cat.liste.filter((m) => epaisseurBaseApplicable(m) === null);
  assert.equal(tous.length, 0, 'tous les matériaux du tableau ont une épaisseur : ' + tous.map((m) => m.id).join());
});

// ---- strates (tranche colorée de chaque matériau, vue médiale) ----
const recouv = (h, extra = {}) => ({ type: 'recouvrement', hauteur_mm: h, ...extra });
const zParoi = (S) => { const v = []; for (let q = 2; q < S.positions.length; q += 3) v.push(S.positions[q]); return v; };
test('strates : deux recouvrements empilés dans l\'ordre de saisie, chacun occupe sa tranche exacte (2 puis 1 mm) au-dessus de la base', () => {
  const b = plaque({ h: 2 }), r = calc([recouv(2), recouv(1)], 'D', b), S = strates(r);
  assert.equal(S.length, 2);
  const z0 = zParoi(S[0]), z1 = zParoi(S[1]);
  assert.ok(Math.min(...z0) === 2 && Math.max(...z0) === 4, 'recouvrement 1 : de 2 à 4 mm : ' + Math.min(...z0) + ' / ' + Math.max(...z0));
  assert.ok(Math.min(...z1) === 4 && Math.max(...z1) === 5, 'recouvrement 2 : de 4 à 5 mm');
  assert.ok(Math.abs(S[0].epaisseur_max_mm - 2) < 1e-5 && Math.abs(S[1].epaisseur_max_mm - 1) < 1e-5);
});
test('strates : le recouvrement passe TOUJOURS en dernier (au-dessus), même saisi en premier', () => {
  const b = plaque({ h: 2 }), r = calc([recouv(1), { type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, hauteur_mm: 3 }], 'D', b);
  assert.deepEqual(ordreEmpilement(r.elements), [1, 0]);
  const S = strates(r), top = Math.max(...zParoi(S[0]));
  assert.ok(Math.abs(top - 3) < 1e-5, 'sommet du recouvrement = dessus final de la paroi (2 + 1) : ' + top);
  assert.ok(Math.min(...zParoi(S[0])) >= 2 - 1e-5);
});
test('strates : un élément masqué ou sans matière sur la paroi n\'a pas de géométrie ; aucun élément = aucune strate', () => {
  const b = plaque({ h: 2 });
  assert.deepEqual(strates(calc([], 'D', b)), []);
  const S = strates(calc([recouv(2, { visible: false }), pt({ hauteur_mm: 2 })], 'D', b));
  assert.equal(S[0].positions.length, 0, 'recouvrement masqué');
  assert.equal(S[1].positions.length, 0, 'point au milieu de la plaque : pas de paroi');
});
test('strates : sur chaque nœud de la paroi, les strates restent entre le dessous et le dessus et ne se chevauchent jamais (bord médial biseauté compris)', () => {
  const b = plaque({ h: 2 }), r = calc([{ type: 'voute_bord', hauteur_mm: 6, largeur_mm: 20, longueur_mm: 60, dy_mm: 70 }, recouv(2)], 'D', b), S = strates(r);
  assert.ok(S[0].positions.length > 0 && S[1].positions.length > 0);
  const par = new Map();
  for (const A of S) for (let q = 0; q < A.indices.length; q += 6) {
    const v0 = A.indices[q], v = [v0, v0 + 1, v0 + 2, v0 + 3]; // sommets d'un quad : p bas, p haut, q haut, q bas
    for (const [lo, hi] of [[v[0], v[1]], [v[3], v[2]]]) { const k = A.positions[3 * lo].toFixed(3) + '/' + A.positions[3 * lo + 1].toFixed(3), a = A.positions[3 * lo + 2], c = A.positions[3 * hi + 2]; assert.ok(c >= a - 1e-6, 'intervalle inversé'); if (c - a > 1e-4) { const L = par.get(k) || par.set(k, []).get(k); if (!L.some((e) => e[2] === A.index && Math.abs(e[0] - a) < 1e-5 && Math.abs(e[1] - c) < 1e-5)) L.push([a, c, A.index]); } } // un nœud est partagé par 2 quads voisins : on ne le compte qu'une fois
  }
  assert.ok(par.size > 20);
  const nx = b.nx;
  for (const [k, L] of par) {
    const [x, y] = k.split('/').map(Number), j = Math.round((y - b.oy) / 0.5), i = Math.round((x - b.ox) / 0.5), n = j * nx + i;
    L.sort((p, q) => p[0] - q[0]);
    assert.ok(L[0][0] >= r.bas[n] - 1e-4 && L[L.length - 1][1] <= r.haut[n] + 1e-4, 'strates hors de [dessous, dessus] en ' + k);
    for (let m = 1; m < L.length; m++) assert.ok(L[m][0] >= L[m - 1][1] - 1e-4, 'chevauchement en ' + k + ' : ' + JSON.stringify(L));
  }
  assert.ok(S[0].epaisseur_max_mm <= 6.0001 && S[0].epaisseur_max_mm > 1);
});

// ---- épaisseur réelle de chaque coupe (min / max, détail par matériau) ----
test('coupe : sans élément, épaisseur réelle = celle de la base (min = max, une seule couche « Base »)', () => {
  const b = plaque({ h: 1.8 }), r = calc([], 'D', b);
  for (const mode of ['T', 'L']) {
    const m = mesurerCoupe(r, mode, 100, 'D');
    assert.ok(Math.abs(m.epaisseur_min_mm - 1.8) < 1e-5 && Math.abs(m.epaisseur_max_mm - 1.8) < 1e-5, mode);
    assert.equal(m.epaisseur_max_detail.length, 1); assert.equal(m.epaisseur_max_detail[0].nom, 'Base');
  }
});
test('coupe : épaisseur maximale réelle = base + chaque élément, détail dans l\'ordre d\'empilement (recouvrement en dernier), position du point le plus épais', () => {
  const b = plaque({ h: 1.5 }), r = calc([recouv(2), { type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, hauteur_mm: 5, largeur_mm: 30, longueur_mm: 40 }], 'D', b);
  for (const [mode, pos] of [['T', 100], ['L', -5]]) {
    const m = mesurerCoupe(r, mode, pos, 'D');
    // maximum cherché indépendamment, dans le test, sur la même ligne de la grille
    let ref = -1, refPos = 0; const n = mode === 'T' ? b.nx : b.ny;
    for (let a = 0; a < n; a++) { const k = mode === 'T' ? Math.round(pos / 0.5) * b.nx + a : a * b.nx + Math.round((pos - b.ox) / 0.5); const e = r.haut[k] - r.bas[k]; if (e > ref + 1e-6) { ref = e; refPos = mode === 'T' ? b.ox + a * 0.5 : a * 0.5; } }
    assert.ok(Math.abs(m.epaisseur_max_mm - ref) < 2e-4, mode + ' : max réel ' + ref + ', obtenu ' + m.epaisseur_max_mm);
    assert.ok(ref > 8 && ref < 8.6, mode + ' : base 1,5 + soutien (≈ 6,5 au sommet) + recouvrement 2 = ' + ref);
    assert.ok(Math.abs(m.epaisseur_max_pos_mm - refPos) < 4, mode + ' : point le plus épais près de ' + refPos + ' (centre du sommet) ; obtenu ' + m.epaisseur_max_pos_mm);
    assert.deepEqual(m.epaisseur_max_detail.map((q) => q.nom), ['Base', 'Soutien de voûte', 'Matériau de recouvrement (toute la semelle)']);
    const somme = m.epaisseur_max_detail.reduce((t, q) => t + q.epaisseur_mm, 0);
    assert.ok(Math.abs(somme - m.epaisseur_max_mm) < 2e-4, 'la somme des couches = l\'épaisseur totale : ' + somme + ' / ' + m.epaisseur_max_mm);
    assert.ok(m.epaisseur_min_mm < m.epaisseur_max_mm - 1, 'min < max sur une coupe qui traverse l\'élément');
  }
});
test('coupe : une coupe qui ne traverse pas les éléments garde une épaisseur max = base + recouvrement seulement', () => {
  const b = plaque({ h: 1.5 }), r = calc([recouv(2), { type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, hauteur_mm: 5, largeur_mm: 30, longueur_mm: 40 }], 'D', b);
  const m = mesurerCoupe(r, 'L', 40, 'D'); // x = 40 : hors du soutien (x de -15 à 15)
  assert.ok(Math.abs(m.epaisseur_max_mm - 3.5) < 1e-4, '1,5 + 2 : ' + m.epaisseur_max_mm);
  assert.deepEqual(m.epaisseur_max_detail.map((q) => q.index), [null, 0], 'base, puis le recouvrement (indice 0 de la liste)');
});
test('coupe : épaisseur sous un élément de bord (dessous biseauté) : la base compte pour moins, la somme des couches = épaisseur réelle', () => {
  const b = plaque({ h: 2 }), r = calc([{ type: 'voute_bord', hauteur_mm: 6, largeur_mm: 20, longueur_mm: 60, dy_mm: 100 }, recouv(2)], 'D', b);
  const m = mesurerCoupe(r, 'T', 100, 'D');
  const somme = m.epaisseur_max_detail.reduce((t, q) => t + q.epaisseur_mm, 0);
  assert.ok(Math.abs(somme - m.epaisseur_max_mm) < 2e-4, 'somme ' + somme + ' / total ' + m.epaisseur_max_mm);
  const base = m.epaisseur_max_detail.find((q) => q.index === null);
  assert.ok(m.epaisseur_max_mm > 6, 'épaisseur max sous la voûte > 6 mm : ' + m.epaisseur_max_mm);
  assert.ok(!base || base.epaisseur_mm <= 2 + 1e-5, 'la base ne dépasse jamais son épaisseur d\'origine');
});
test('coupe : un creux (décharge) abaisse le minimum réel mais n\'est pas compté comme une couche', () => {
  const b = plaque({ h: 3 }), r = calc([{ type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, hauteur_mm: 1.5, signe: -1, largeur_mm: 30, longueur_mm: 40 }], 'D', b);
  const m = mesurerCoupe(r, 'T', 100, 'D');
  assert.ok(m.epaisseur_min_mm < 2, 'creux : le minimum réel descend : ' + m.epaisseur_min_mm);
  assert.ok(Math.abs(m.epaisseur_max_mm - 3) < 1e-4, 'hors creux : 3 mm');
  assert.deepEqual(m.epaisseur_max_detail.map((q) => q.nom), ['Base']);
});
test('decomposerEpaisseur : élément masqué ignoré', () => {
  const b = plaque({ h: 2 }), r = calc([recouv(2, { visible: false })], 'D', b);
  const d = decomposerEpaisseur(r, 100 * b.nx + 120);
  assert.equal(d.couches.length, 1); assert.ok(Math.abs(d.total_mm - 2) < 1e-5);
});

test('coupe : sur un plateau (base plate + recouvrement), le point le plus épais est au CENTRE de la coupe, pas au premier nœud', () => {
  const b = plaque({ h: 2 }), r = calc([recouv(2)], 'D', b), m = mesurerCoupe(r, 'T', 100, 'D');
  assert.ok(Math.abs(m.epaisseur_max_mm - 4) < 1e-4);
  assert.ok(Math.abs(m.epaisseur_max_pos_mm - 0) < 1.5, 'centre du plateau (x de -60 à 60) : ' + m.epaisseur_max_pos_mm);
});

// ---- contour de la voûte au bord médial : demi-ellipse vue de dessus ----
const largeurAu = (b, z, y) => { let a = Infinity, c = -Infinity; const j = Math.round(y / 0.5); for (let i = 0; i < b.nx; i++) if (z[j * b.nx + i] > 0.02) { a = Math.min(a, b.ox + i * 0.5); c = Math.max(c, b.ox + i * 0.5); } return c < a ? 0 : c - a + 0.5; };
test('voûte : contour en DEMI-ELLIPSE (largeur à chaque y = étendue × √(1 − s²)), grand axe le long du pied, côté plat sur le bord médial, pieds D et G', () => {
  for (const cote of ['D', 'G']) {
    const b = plaque({ h: 2 }), r = calc([{ type: 'voute_bord', dy_mm: 100, largeur_mm: 36, longueur_mm: 78, hauteur_mm: 7 }], cote, b), z = r.couches[0].z;
    for (const s of [0, 0.3, 0.6, 0.8]) for (const sg of [-1, 1]) {
      const y = 100 + 39 + sg * s * 39 - 39; // milieu = 100 + ... : dy_mm est le milieu depuis le talon (rep.y = 0)
      const attendu = 36 * Math.sqrt(1 - s * s), mesure = largeurAu(b, z, 100 + sg * s * 39);
      assert.ok(Math.abs(mesure - attendu) < 1.6, cote + ' s=' + sg * s + ' : largeur ' + mesure + ' attendue ' + attendu.toFixed(1)); void y;
    }
    assert.equal(largeurAu(b, z, 100 - 40), 0, 'rien au-delà de la longueur'); assert.equal(largeurAu(b, z, 100 + 40), 0);
    const med = cote === 'D' ? -1 : 1; // côté plat = bord médial de la plaque (x = -60 pour D, +60 pour G)
    const x0 = med < 0 ? -60 : 60, i0 = Math.round((x0 - b.ox) / 0.5) + (med < 0 ? 0 : 0);
    for (let y = 70; y <= 130; y += 5) assert.ok(z[Math.round(y / 0.5) * b.nx + Math.max(0, Math.min(b.nx - 1, i0 + (med < 0 ? 1 : -1)))] > 0.02 || y > 139 - 100 + 100 + 0, cote + ' bord médial couvert sur toute la longueur utile (y=' + y + ')');
  }
});
test('voûte : plus longue que large = plus longue en y qu\'en x ; l\'étendue réglée est exactement atteinte au milieu de la longueur', () => {
  const b = plaque({ h: 2 }), r = calc([{ type: 'voute_bord', dy_mm: 100, largeur_mm: 24, longueur_mm: 80, hauteur_mm: 5 }], 'D', b), z = r.couches[0].z;
  const ligne = largeurAu(b, z, 100), long = (() => { let a = Infinity, c = -Infinity; const i = Math.round((-60 + 1 - b.ox) / 0.5); for (let j = 0; j < b.ny; j++) if (z[j * b.nx + i] > 0.02) { a = Math.min(a, j * 0.5); c = Math.max(c, j * 0.5); } return c - a + 0.5; })();
  assert.ok(Math.abs(ligne - 24) < 1.2, 'étendue au milieu : ' + ligne);
  assert.ok(long > 70 && long <= 80.5, 'longueur le long du bord : ' + long);
});
test('voûte : la hauteur maximale est atteinte (plateau) et le raccord règle la raideur des flancs (petit raccord = plateau plus grand)', () => {
  const b = plaque({ h: 2 });
  const aire = (raccord) => { const r = calc([{ type: 'voute_bord', dy_mm: 100, largeur_mm: 36, longueur_mm: 78, hauteur_mm: 7, raccord_mm: raccord }], 'D', b), z = r.couches[0].z; let n = 0, hm = 0; for (let k = 0; k < z.length; k++) { if (z[k] > 6.5) n++; hm = Math.max(hm, z[k]); } return { n, hm }; };
  const doux = aire(39), raide = aire(10);
  assert.ok(Math.abs(doux.hm - 7) < 0.05 && Math.abs(raide.hm - 7) < 1e-6, 'sommet atteint : ' + doux.hm + ' / ' + raide.hm);
  assert.ok(raide.n > doux.n * 4, 'plateau de ' + raide.n + ' cellules contre ' + doux.n);
});
test('voûte : les autres éléments de bord gardent leur forme rectangulaire (flange, arche externe, aileron, cuvette)', () => {
  for (const type of ['flange_mediale', 'arche_externe', 'aileron']) {
    assert.ok(!TYPES[type].demiEllipse, type);
    const b = plaque({ h: 2 }), r = calc([{ type, dy_mm: 100, longueur_mm: 60, largeur_mm: 20 }], 'D', b), z = r.couches[0].z;
    assert.ok(largeurAu(b, z, 100 + 27) > 0.6 * largeurAu(b, z, 100), type + ' : encore ' + largeurAu(b, z, 100 + 27) + ' mm de large à 3 mm de l\'extrémité (forme rectangulaire ; une demi-ellipse n\'en aurait que 44 %)');
  }
  assert.ok(TYPES.voute_bord.demiEllipse === true);
});

test('contour lissé (affichage) : disque sans escalier, aire proche, fermé, sommets sur la surface, bord de la semelle non rogné, masque vide = rien', () => {
  const b = plaque(), r = calc([pt({ hauteur_mm: 2 })], 'D', b);
  const [s] = surimpressions(r, 'D'), L = s.lisse;
  assert.ok(L.indices.length > 0 && L.contour.length > 0);
  // escalier : segments de la grille = tous horizontaux ou verticaux ; lissé = la plupart en diagonale
  const dir = (c) => { let ob = 0, n = 0; for (let q = 0; q < c.length; q += 6) { const ddx = Math.abs(c[q + 3] - c[q]), ddy = Math.abs(c[q + 4] - c[q + 1]); n++; if (ddx > 1e-4 && ddy > 1e-4) ob++; } return ob / n; };
  assert.equal(dir(s.contour), 0, 'le liseré en marches est horizontal/vertical');
  assert.ok(dir(L.contour) > 0.6, 'le liseré lissé est oblique : ' + dir(L.contour));
  // écart au cercle : moins de 0,25 mm (le contour en marches s'écarte jusqu'à ~0,35 mm)
  let em = 0; for (let q = 0; q < L.contour.length; q += 3) em = Math.max(em, Math.abs(Math.hypot(L.contour[q], L.contour[q + 1] - 100) - 10));
  assert.ok(em < 0.12, 'écart au cercle ' + em);
  let aire = 0; for (let q = 0; q < L.indices.length; q += 3) { const [a, c, d] = [0, 1, 2].map((u) => L.indices[q + u] * 3); aire += Math.abs((L.positions[c] - L.positions[a]) * (L.positions[d + 1] - L.positions[a + 1]) - (L.positions[d] - L.positions[a]) * (L.positions[c + 1] - L.positions[a + 1])) / 2; }
  assert.ok(Math.abs(aire - Math.PI * 100) / (Math.PI * 100) < 0.03, 'aire lissée ' + aire);
  const compte = new Map();
  for (let q = 0; q < L.contour.length; q += 3) { const c = L.contour[q].toFixed(3) + '/' + L.contour[q + 1].toFixed(3); compte.set(c, (compte.get(c) || 0) + 1); }
  for (const [c, v] of compte) assert.equal(v % 2, 0, 'liseré lissé ouvert en ' + c);
  let hmax = -Infinity; for (const h of r.haut) if (h > hmax) hmax = h;
  for (let q = 0; q < L.positions.length; q += 3) assert.ok(L.positions[q + 2] >= 2 - 1e-4 && L.positions[q + 2] <= hmax + 1e-4, 'sommet à la hauteur de la surface finale');
  // un élément qui déborde jusqu'au bord de la semelle n'est pas rogné
  const b2 = plaque({ x0: -60, x1: 0 }), rx = calc([pt()], 'D', b2).rapport_elements.repere_talon.x_mm;
  const r2 = calc([pt({ dx_mm: rx, dy_mm: 100, hauteur_mm: 2 })], 'D', b2); // centre posé exactement sur le bord x = 0 de la plaque
  const L2 = surimpressions(r2, 'D')[0].lisse; let xmax = -Infinity; for (let q = 0; q < L2.positions.length; q += 3) xmax = Math.max(xmax, L2.positions[q]);
  assert.ok(Math.abs(xmax) < 1e-5, 'l\'emprise va jusqu\'au bord de la plaque : ' + xmax);
  const v = surimpressionDeMasque(r, new Uint8Array(b.nx * b.ny)); assert.equal(v.cellules, 0);
});
