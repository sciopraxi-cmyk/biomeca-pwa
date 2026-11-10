import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { chargerMateriaux } from '../../js/semelle3d/calcul/materiaux.js';
import { appliquerElements, validerElement, mesurerCoupe, TYPES_ELEMENTS } from '../../js/semelle3d/calcul/elements.js';
import { FICHES_PODAXIA } from '../../js/semelle3d/donnees/bibliotheque.js';
import { reliefAjuste } from '../../js/semelle3d/calcul/bibliotheque.js';
import { stlVersFiche } from '../../js/semelle3d/calcul/element_stl.js';
import { lireSTLBinaire } from '../../js/semelle3d/calcul/stl.js';
import { maillerBase } from '../../js/semelle3d/calcul/maillage_base.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';

const DIR = '/root/projets/VERTICY/documents/elements-podaxia/extrait/stl/';
const AVEC_STL = existsSync(DIR + '02_coin_supinateur_posterieur.stl');
const E_MIN = 0.4;
const cat = chargerMateriaux(JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8')));
const tand = (d) => Math.tan((d * Math.PI) / 180);
function plaque({ h = 2, oy = 0 } = {}) {
  const nx = 241, ny = 401; // x de -60 à 60, y de oy à oy + 200, pas de 0,5 mm
  return { nx, ny, pas: 0.5, ox: -60, oy, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const val = (b, c, x, y) => c[Math.round((y - b.oy) / b.pas) * b.nx + Math.round((x - b.ox) / b.pas)];
const FICHE = Object.fromEntries(FICHES_PODAXIA.map((f) => [f.cle, f]));
// Position telle que le nœud (X, Y) du fichier tombe EXACTEMENT sur un nœud de la plaque (pied DROIT, médial = -x) : x = 2·xc − X, y = Y.
function posAlignee(f, oy = 0) {
  const xc = f.x0 + ((f.nx - 1) * f.pas) / 2;
  // dy = distance du BORD ARRIÈRE du relief au point le plus postérieur (ici y = 0) : le nœud Y du fichier tombe en y = dy + (Y − y0) ; dy = y0 -> y = Y.
  // largeur/longueur = emprise du fichier (pas d'étirement), douceur 0 (pas de flou) : comparaison nœud à nœud exacte.
  return { ancrage: 'libre', dx_mm: -xc, dy_mm: f.y0 - oy, xc, largeur_mm: (f.nx - 1) * f.pas, longueur_mm: (f.ny - 1) * f.pas, douceur_mm: 0 };
}
// Sommets de la FACE HAUTE du STL relu par NOS lecteurs (normale z > 0) : (X, Y, Z), indépendants du rasteriseur de la fiche.
function dessusSTL(fichier) {
  const b = readFileSync(DIR + fichier);
  const { sommets, nbTriangles } = lireSTLBinaire(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const pts = new Map();
  for (let t = 0; t < nbTriangles; t++) {
    const v = (k) => [sommets[9 * t + 3 * k], sommets[9 * t + 3 * k + 1], sommets[9 * t + 3 * k + 2]];
    const a = v(0), bb = v(1), c = v(2);
    if (!((bb[0] - a[0]) * (c[1] - a[1]) - (bb[1] - a[1]) * (c[0] - a[0]) > 1e-9)) continue;
    for (const p of [a, bb, c]) pts.set(Math.round(p[0] * 2) + '_' + Math.round(p[1] * 2), p);
  }
  return [...pts.values()];
}

test('bibliothèque : 23 éléments, clés uniques, aucun doublon avec les 7 types paramétriques, licence et référence fournisseur sur chaque fiche', () => {
  assert.equal(FICHES_PODAXIA.length, 23);
  assert.equal(new Set(FICHES_PODAXIA.map((f) => f.cle)).size, 23);
  assert.equal(Object.keys(TYPES_ELEMENTS).length, 35); // 7 paramétriques + recouvrement + point curseur (lot 4b) + pinceau (lot 4d) + torsion + skive (lot 4 bis) + 23 importés
  const deja = ['01_coin_pronateur_posterieur', '06_cuvette_talonniere', '08_flange_mediale', '10_soutien_de_voute', '14_arche_externe', '25_aileron'];
  for (const f of FICHES_PODAXIA) {
    assert.ok(!deja.includes(f.fichier.replace('.stl', '')), f.fichier + ' est déjà un type paramétrique');
    assert.ok(!f.fichier.startsWith('30_'), 'la semelle de démonstration n\'est jamais importée');
    assert.match(f.licence, /PODAXIA — usage Verticy autorisé par le fondateur, 31\/10\/2026/);
    assert.equal(f.reference_fournisseur, 'PODAXIA ' + f.fichier.replace('.stl', ''));
    const T = TYPES_ELEMENTS[f.cle];
    assert.ok(T && T.importe && T.zone && T.libelle, f.cle);
    assert.equal(T.signe_defaut, f.signe);
  }
  assert.deepEqual(FICHES_PODAXIA.filter((f) => f.signe === -1).map((f) => f.cle).sort(), ['decharge_capitale', 'decharge_talonniere', 'depression_naviculaire', 'morton_inverse', 'puits_libre', 'sillon_fascial']);
});

test('importé -> couche : chaque nœud de la face haute du STL est retrouvé à 2 µm près (relief = (z − 0,4) remis à l\'échelle : bord à 0, sommet = hauteur du STL ; creux = plaque − z), dimensions et hauteur conservées', { skip: !AVEC_STL && 'STL PODAXIA absents (documents locaux)' }, () => {
  for (const f of FICHES_PODAXIA) {
    const b = plaque({ h: f.signe === -1 ? 8 : 2, oy: -30 }), P = posAlignee(f, -30); // la plaque commence 30 mm AVANT le talon : certains STL ont des y négatifs (BRC, cimier) // base épaisse pour les creux (un creux qui traverse la base est refusé)
    const fin = appliquerElements(b, [{ type: f.cle, ancrage: P.ancrage, dx_mm: P.dx_mm, dy_mm: P.dy_mm, largeur_mm: P.largeur_mm, longueur_mm: P.longueur_mm, douceur_mm: P.douceur_mm }], { cote: 'D', cat });
    const c = fin.couches[0].z;
    let ecartMax = 0, nb = 0, zmax = 0;
    for (const [X, Y, Z] of dessusSTL(f.fichier)) {
      const attendu = f.signe === -1 ? -Math.max(0, f.plaque_mm - Z) : Math.max(0, Z - E_MIN) * (f.hauteur_ref_mm / (f.hauteur_ref_mm - E_MIN)); // rebord de 0,4 mm supprimé, sommet = hauteur du STL
      const x = 2 * P.xc - X, y = Y; // (la grille plaque est alignée : voir posAlignee)
      if (x < -60 || x > 60 || y < -30 || y > 170) continue;
      ecartMax = Math.max(ecartMax, Math.abs(val(b, c, x, y) - attendu)); nb++;
      zmax = Math.max(zmax, Math.abs(attendu));
    }
    assert.ok(nb > 100, f.cle + ' : nœuds comparés ' + nb);
    assert.ok(ecartMax < 0.002, f.cle + ' : écart max ' + ecartMax);
    assert.ok(Math.abs(zmax - f.hauteur_ref_mm) < 0.002, f.cle + ' hauteur ' + zmax + ' / ' + f.hauteur_ref_mm);
    // dimensions : l'emprise de la couche reste dans celle du fichier (au plus 0,2 mm de plus) ; le plancher de 0,4 mm ôté ne retire que le bord
    let xa = Infinity, xb = -Infinity, ya = Infinity, yb = -Infinity;
    for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) if (c[j * b.nx + i] !== 0) { const x = b.ox + i * 0.5, y = b.oy + j * 0.5; xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); }
    assert.ok(xb - xa <= f.dims_stl_mm[0] + 0.2 && yb - ya <= f.dims_stl_mm[1] + 0.2, f.cle + ' emprise ' + (xb - xa) + 'x' + (yb - ya));
    if (f.signe === 1) assert.ok(xb - xa >= 0.7 * f.dims_rapport_mm[0] && yb - ya >= 0.7 * f.dims_rapport_mm[1], f.cle + ' emprise ' + (xb - xa) + 'x' + (yb - ya) + ' < 70 % du STL ' + f.dims_rapport_mm); // même emprise que le STL ; les parties où l\'élément s\'amincit jusqu\'au plancher (coins, talonnettes en biseau) arrivent à 0 : quelques mm de moins
    assert.ok(Math.abs(fin.infos[0].hauteur_max_mm - (f.signe === 1 ? f.hauteur_ref_mm : 0)) < 0.002);
    if (f.signe === 1) assert.ok(Math.abs(f.hauteur_ref_mm - f.dims_rapport_mm[2]) < 0.6, f.cle + ' hauteur ' + f.hauteur_ref_mm + ' / STL ' + f.dims_rapport_mm[2]); // hauteur = celle du STL
  }
});

test('valeurs par défaut (celles que l\'interface envoie à l\'ajout) : chaque type importé est valide et rend sa couche', () => {
  for (const [cle, T] of Object.entries(TYPES_ELEMENTS)) {
    if (!T.importe) continue;
    const p = validerElement({ type: cle, ...T.defauts, materiau_id: null, shore_a: null, visible: true }, null);
    assert.ok(p.hauteur_mm > 0 && p.largeur_mm > 0 && p.longueur_mm > 0, cle);
    assert.equal(p.signe, T.signe_defaut);
    const f = appliquerElements(plaque({ h: 8 }), [{ type: cle, ...T.defauts, dy_mm: 100, materiau_id: null, shore_a: null, visible: true }], { cote: 'D', cat }); // (plaque de 200 mm : dy ramené à 100 ; les dy par défaut visent un pied de 265 mm)
    assert.ok(T.signe_defaut === -1 ? f.infos[0].hauteur_min_mm < 0 : f.infos[0].hauteur_max_mm > 0, cle);
  }
});

test('miroir : pied gauche = image miroir exacte du pied droit ; coin supinateur = médial haut (−x pour un pied droit)', () => {
  for (const cle of ['coin_supinateur_posterieur', 'appui_sous_scaphoidien', 'element_de_morton', 'coin_pronateur_anterieur']) {
    const b = plaque();
    const D = appliquerElements(b, [{ type: cle }], { cote: 'D', cat }).couches[0].z, G = appliquerElements(b, [{ type: cle }], { cote: 'G', cat }).couches[0].z;
    let diff = 0, somme = 0;
    for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) { diff = Math.max(diff, Math.abs(D[j * b.nx + i] - G[j * b.nx + (b.nx - 1 - i)])); somme += D[j * b.nx + i]; }
    assert.ok(somme > 10 && diff < 1e-6, cle + ' miroir ' + diff);
  }
  const b = plaque();
  const D = appliquerElements(b, [{ type: 'coin_supinateur_posterieur' }], { cote: 'D', cat }).couches[0].z;
  assert.ok(val(b, D, -15, 35) > 1.5 * val(b, D, 15, 35) + 0.5, 'supinateur D : médial (-x) plus haut : ' + val(b, D, -15, 35) + ' / ' + val(b, D, 15, 35));
});

test('coins importés : l\'angle réglé est retrouvé par l\'outil de coupe à ±0,2° (pieds D et G)', () => {
  for (const [cle, ang, y] of [['coin_supinateur_posterieur', 4, 25], ['coin_supinateur_posterieur', 2.5, 25], ['coin_pronateur_anterieur', 3, 188], ['coin_supinateur_anterieur', 5, 188]]) {
    for (const cote of ['D', 'G']) {
      const b = plaque();
      const f = appliquerElements(b, [{ type: cle, angle_deg: ang }], { cote, cat });
      const m = mesurerCoupe(f, 'T', y, cote).elements[0];
      assert.ok(m.applicable, cle + ' ' + cote + ' : ' + m.raison);
      assert.ok(Math.abs(m.angle_mesure_deg - ang) <= 0.2, cle + ' ' + cote + ' ' + ang + '° -> ' + m.angle_mesure_deg);
      assert.equal(m.cote_haut, cle.includes('supinateur') ? 'médial' : 'latéral');
    }
  }
});

test('coin importé : angle OU hauteur au bord (h = largeur du fichier × tan θ), valeurs hors plage refusées', () => {
  const a = validerElement({ type: 'coin_supinateur_posterieur', angle_deg: 4 }, null);
  assert.ok(Math.abs(a.hauteur_mm - 56 * tand(4)) < 1e-9);
  const b = validerElement({ type: 'coin_supinateur_posterieur', hauteur_mm: 2.8 }, null);
  assert.ok(Math.abs(b.angle_deg - (Math.atan(2.8 / 56) * 180) / Math.PI) < 1e-9);
  assert.equal(validerElement({ type: 'coin_pronateur_anterieur' }, null).angle_deg, 3);
  assert.throws(() => validerElement({ type: 'coin_supinateur_anterieur', angle_deg: 4, hauteur_mm: 3 }, null), /OU la hauteur/);
  assert.throws(() => validerElement({ type: 'coin_supinateur_anterieur', angle_deg: 40 }, null), /hors de/);
});

test('hauteur d\'un élément importé : étirement vertical simple (dôme) et forme conservée (heel skive : la partie fixe ne bouge pas) ; hors plage refusée', () => {
  const b = plaque(), f = FICHE.appui_sous_scaphoidien;
  const c1 = appliquerElements(b, [{ type: f.cle }], { cote: 'D', cat }).couches[0].z;
  const c2 = appliquerElements(b, [{ type: f.cle, hauteur_mm: 2 * f.hauteur_ref_mm }], { cote: 'D', cat }).couches[0].z;
  let ecart = 0, max2 = 0; for (let k = 0; k < c1.length; k++) { ecart = Math.max(ecart, Math.abs(c2[k] - 2 * c1[k])); max2 = Math.max(max2, c2[k]); }
  assert.ok(ecart < 1e-5 && Math.abs(max2 - 2 * f.hauteur_ref_mm) < 1e-4, 'écart ' + ecart + ' max ' + max2);
  const s = FICHE.heel_skive_kirby;
  const r1 = appliquerElements(b, [{ type: s.cle }], { cote: 'D', cat }).couches[0].z;
  const r2 = appliquerElements(b, [{ type: s.cle, hauteur_mm: 12 }], { cote: 'D', cat }).couches[0].z;
  let bas = 0, nbBas = 0, sommet = 0, diffEtir = 0;
  for (let k = 0; k < r1.length; k++) {
    if (r1[k] > 0 && r1[k] <= s.plancher_fixe_mm) { bas = Math.max(bas, Math.abs(r2[k] - r1[k])); nbBas++; diffEtir = Math.max(diffEtir, Math.abs(r2[k] - r1[k] * (12 / s.hauteur_ref_mm))); }
    sommet = Math.max(sommet, r2[k]);
  }
  // la partie au-dessus de la partie fixe est mise à l'échelle (h − 0,6)/(href − 0,6), pas (h / href)
  let milieu = 0, nbMilieu = 0;
  for (let k = 0; k < r1.length; k++) if (r1[k] > 2) { milieu = Math.max(milieu, Math.abs(r2[k] - (s.plancher_fixe_mm + (r1[k] - s.plancher_fixe_mm) * ((12 - s.plancher_fixe_mm) / (s.hauteur_ref_mm - s.plancher_fixe_mm))))); nbMilieu++; }
  assert.ok(nbMilieu > 50 && milieu < 1e-4, 'partie variable : ' + milieu);
  assert.ok(nbBas > 50 && bas < 1e-5, 'partie fixe : ' + bas + ' sur ' + nbBas);
  assert.ok(Math.abs(sommet - 12) < 1e-4, 'sommet ' + sommet);
  assert.ok(diffEtir > 0.1, 'doit différer d\'un simple étirement (la partie fixe aurait grandi de ×' + (12 / s.hauteur_ref_mm).toFixed(2) + ')');
  assert.throws(() => validerElement({ type: s.cle, hauteur_mm: 0.5 }, null), /hors de/); // sous la partie fixe
  assert.throws(() => validerElement({ type: f.cle, hauteur_mm: 20 }, null), /hors de/);
  assert.throws(() => validerElement({ type: f.cle, hauteur_mm: 0.05 }, null), /hors de/);
  assert.throws(() => validerElement({ type: FICHE.puits_libre.cle, hauteur_mm: 30 }, null), /profondeur/);
});

test('décharge : creux = hauteur de la base -> semelle PERCÉE (trou), comblée par un autre matériau si choisi ; creux partiel = avertissement si reste < 0,9 mm', () => {
  const f = FICHE.decharge_capitale;
  const mk = (h, extra = {}) => appliquerElements(plaque({ h }), [{ type: f.cle, dx_mm: 0, dy_mm: 100, hauteur_mm: 3, ...extra }], { cote: 'D', cat });
  const A = mk(3); // creux de 3 mm dans une base de 3 mm : traversant
  assert.ok(A.infos[0].perce && A.infos[0].perce.cellules > 50 && !A.infos[0].perce.comble, JSON.stringify(A.infos[0].perce));
  let nan = 0; for (let k = 0; k < A.haut.length; k++) if (!Number.isFinite(A.haut[k])) nan++;
  assert.equal(nan, A.infos[0].perce.cellules);
  assert.ok(A.rapport_elements.avertissements.some((a) => /PERCÉE/.test(a)));
  const v = verifierMaillage(maillerBase(A)); // le trou est une vraie ouverture : maillage toujours fermé, 0 dégénéré
  assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, JSON.stringify(v));
  const plein = verifierMaillage(maillerBase(mk(3, { hauteur_mm: 1 }))), troue = v;
  assert.ok(troue.volume < plein.volume);
  // comblement : pas de trou, la surface revient au niveau de la base sur la zone, matériau noté
  const mat = cat.liste[0];
  const C = mk(3, { comblement_materiau_id: mat.id });
  assert.ok(C.infos[0].perce.comble && C.infos[0].perce.comblement_materiau === mat.libelle);
  for (let k = 0; k < C.haut.length; k++) assert.ok(Number.isFinite(C.haut[k]));
  const cx = Math.round((0 - -60) / 0.5), cy = Math.round((100 + (f.ny - 1) * f.pas / 2) / 0.5); // centre du creux (dy = bord arrière)
  assert.ok(Math.abs(C.haut[cy * 241 + cx] - 3) < 1e-6, 'comblé au niveau de la base : ' + C.haut[cy * 241 + cx]);
  assert.ok(C.rapport_elements.avertissements.some((a) => /comblé par/.test(a)));
  assert.throws(() => mk(3, { comblement_materiau_id: 'XXX' }), /inconnu/);
  // creux partiel : reste 0,5 mm -> avertissement (pas de trou)
  const B = mk(3.5);
  assert.equal(B.infos[0].perce, null);
  assert.ok(B.infos[0].avertissements.some((a) => /épaisseur restante autour du creux/.test(a)));
  const E8 = mk(8);
  assert.equal(E8.infos[0].perce, null); assert.ok(!E8.infos[0].avertissements.some((a) => /restante/.test(a)));
  assert.ok(Math.abs(E8.rapport_elements.epaisseur_min_mm - 5) < 0.01);
});

test('recouvrement : couche d\'épaisseur constante sur TOUTE la semelle, au-dessus des éléments, même saisi en premier ; épaisseur hors plage refusée', () => {
  const b = plaque({ h: 3 });
  const sans = appliquerElements(b, [{ type: 'appui_sous_scaphoidien', dy_mm: 90 }], { cote: 'D', cat });
  const avec = appliquerElements(b, [{ type: 'recouvrement', hauteur_mm: 1.2 }, { type: 'appui_sous_scaphoidien', dy_mm: 90 }], { cote: 'D', cat });
  for (let k = 0; k < b.haut.length; k++) assert.ok(Math.abs(avec.haut[k] - sans.haut[k] - 1.2) < 1e-5);
  assert.equal(avec.infos.length, 2); assert.equal(avec.infos[0].type, 'recouvrement'); assert.equal(avec.infos[1].type, 'appui_sous_scaphoidien'); // ordre de saisie conservé
  assert.ok(Math.abs(avec.rapport_elements.epaisseur_min_mm - 4.2) < 0.01);
  assert.throws(() => validerElement({ type: 'recouvrement', hauteur_mm: 9 }, null), /hors de/);
  assert.throws(() => validerElement({ type: 'recouvrement', hauteur_mm: 0.05 }, null), /hors de/);
  // recouvrement posé APRÈS une décharge traversante : le trou reste un trou ; la décharge ne voit pas l'épaisseur du recouvrement
  const t = appliquerElements(plaque({ h: 3 }), [{ type: 'recouvrement', hauteur_mm: 1 }, { type: 'decharge_capitale', dx_mm: 0, dy_mm: 100, hauteur_mm: 3 }], { cote: 'D', cat });
  assert.ok(t.infos[1].perce && t.infos[1].perce.cellules > 50);
  assert.ok(verifierMaillage(maillerBase(t)).ferme);
  const m = mesurerCoupe(t, 'T', 100, 'D'); assert.equal(m.elements[0].applicable, false);
});

test('étirement en plan : largeur et longueur réglables (la barre rétrocapitale s\'élargit d\'avant en arrière), hauteur conservée, coin : pente conservée', () => {
  const f = FICHE.barre_retrocapitale, T = TYPES_ELEMENTS[f.cle];
  assert.ok(T.defauts.longueur_mm > T.longueur_ref_mm * 1.3, 'barre plus large d\'avant en arrière par défaut : ' + T.defauts.longueur_mm + ' / ' + T.longueur_ref_mm);
  assert.ok(TYPES_ELEMENTS.dome_libre.defauts.largeur_mm >= 28);
  const emprise = (c, b) => { let ya = Infinity, yb = -Infinity, xa = Infinity, xb = -Infinity, h = 0; for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) { const z = c[j * b.nx + i]; if (z > 0.3) { ya = Math.min(ya, j * 0.5); yb = Math.max(yb, j * 0.5); xa = Math.min(xa, -60 + i * 0.5); xb = Math.max(xb, -60 + i * 0.5); } h = Math.max(h, z); } return { l: yb - ya, w: xb - xa, h }; };
  const b = plaque();
  const un = emprise(appliquerElements(b, [{ type: f.cle, dy_mm: 60, longueur_mm: T.longueur_ref_mm, largeur_mm: T.largeur_ref_mm, douceur_mm: 0 }], { cote: 'D', cat }).couches[0].z, b);
  const deux = emprise(appliquerElements(b, [{ type: f.cle, dy_mm: 60, longueur_mm: 2 * T.longueur_ref_mm, largeur_mm: 1.5 * T.largeur_ref_mm, douceur_mm: 0 }], { cote: 'D', cat }).couches[0].z, b);
  assert.ok(Math.abs(deux.l / un.l - 2) < 0.08 && Math.abs(deux.w / un.w - 1.5) < 0.08, `${un.l}→${deux.l} ; ${un.w}→${deux.w}`);
  assert.ok(Math.abs(deux.h - un.h) < 1e-4, 'hauteur inchangée');
  assert.throws(() => validerElement({ type: f.cle, longueur_mm: 5 * T.longueur_ref_mm }, null), /longueur/);
  assert.throws(() => validerElement({ type: f.cle, largeur_mm: 3 }, null), /largeur/);
  // coin élargi de 1,5 : la pente reste celle de l'angle réglé (angle retrouvé par la coupe)
  const c = TYPES_ELEMENTS.coin_supinateur_posterieur;
  const g = appliquerElements(b, [{ type: c.fiche.cle, angle_deg: 4, largeur_mm: 1.5 * c.largeur_ref_mm }], { cote: 'D', cat });
  const mm = mesurerCoupe(g, 'T', 20, 'D').elements[0];
  assert.ok(mm.applicable && Math.abs(mm.angle_mesure_deg - 4) <= 0.2, JSON.stringify(mm));
});

test('douceur des bords : le flou adoucit la pente maximale, garde le sommet, limite l\'emprise (< 3σ de plus) ; 0 = relief du fichier', () => {
  const f = FICHE.appui_sous_scaphoidien, T = TYPES_ELEMENTS[f.cle];
  assert.ok(T.defauts.douceur_mm >= 1.5);
  const pente = (c, b) => { let m = 0, h = 0; for (let j = 1; j < b.ny - 1; j++) for (let i = 1; i < b.nx - 1; i++) { const k = j * b.nx + i; m = Math.max(m, Math.abs(c[k + 1] - c[k]) / 0.5, Math.abs(c[k + b.nx] - c[k]) / 0.5); h = Math.max(h, c[k]); } return { m, h }; };
  const b = plaque();
  const dur = pente(appliquerElements(b, [{ type: f.cle, douceur_mm: 0 }], { cote: 'D', cat }).couches[0].z, b);
  const doux = pente(appliquerElements(b, [{ type: f.cle, douceur_mm: 5 }], { cote: 'D', cat }).couches[0].z, b);
  assert.ok(doux.m < 0.75 * dur.m, `pente ${dur.m.toFixed(2)} -> ${doux.m.toFixed(2)}`);
  assert.ok(Math.abs(doux.h - dur.h) < 1e-3, 'sommet conservé');
  assert.ok(doux.m < 0.6, 'pente maximale douce (< 31°) : ' + doux.m); // retour de Joël : « marche d\'escalier »
  assert.throws(() => validerElement({ type: f.cle, douceur_mm: 30 }, null), /douceur/);
  assert.equal(validerElement({ type: 'coin_supinateur_posterieur' }, null).douceur_mm, 0); // un coin garde son angle : pas de flou
});

test('position : dy = 0 démarre l\'élément au point le plus postérieur du pied (talonnettes, coins), sans décalage', () => {
  const b = plaque();
  for (const cle of ['talonnette_compensation', 'talonnette_sifflet', 'heel_skive_kirby', 'coin_supinateur_posterieur']) {
    assert.equal(TYPES_ELEMENTS[cle].defauts.dy_mm, 0, cle + ' : dy par défaut = 0 mm du talon');
    const c = appliquerElements(b, [{ type: cle, dx_mm: 0, dy_mm: 0, douceur_mm: 0 }], { cote: 'D', cat }).couches[0].z;
    let premiere = Infinity; for (let j = 0; j < b.ny && premiere === Infinity; j++) for (let i = 0; i < b.nx; i++) if (c[j * b.nx + i] > 0.05) { premiere = j * 0.5; break; }
    assert.ok(premiere <= 3, cle + ' commence à ' + premiere + ' mm du bord arrière');
  }
});

test('élément importé + base : maillage fermé, aucun triangle dégénéré (plusieurs éléments superposés, pieds D et G)', () => {
  for (const cote of ['D', 'G']) {
    const b = plaque({ h: 6 });
    const f = appliquerElements(b, [{ type: 'barre_retrocapitale', dy_mm: 150 }, { type: 'coupole_metatarsienne', dy_mm: 150 }, { type: 'sillon_fascial', dy_mm: 60 }, { type: 'talonnette_sifflet', dy_mm: 40 }], { cote, cat });
    const v = verifierMaillage(maillerBase(f));
    assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, cote + ' ' + JSON.stringify(v));
    assert.equal(f.infos.length, 4);
    assert.equal(f.elements[0].source.type, 'stl');
  }
});

test('reliefAjuste : zéro hors du relief, jamais négatif, sans falaise (pente jamais plus raide que le raccord smoothstep du fichier : 1,5 × h / raccord, +25 %)', () => {
  for (const f of FICHES_PODAXIA) {
    const T = TYPES_ELEMENTS[f.cle], p = validerElement({ type: f.cle }, null);
    assert.equal(reliefAjuste(T.fiche, p, 1e4, 1e4), 0);
    let saut = 0, mx = 0;
    for (let u = 0; u < T.defauts.longueur_mm; u += 0.25) for (let t = -T.defauts.largeur_mm / 2; t < T.defauts.largeur_mm / 2; t += 0.25) {
      const a = T.profil(p, t, u), b2 = T.profil(p, t + 0.25, u);
      assert.ok(a >= 0 && Number.isFinite(a));
      const b3 = T.profil(p, t, u + 0.25); // (les marches au contour du STL — plancher de bord de 0,4 mm — ne comptent pas : seules les pentes DANS le relief)
      if (a > 0.02 && b2 > 0.02) saut = Math.max(saut, Math.abs(a - b2)); if (a > 0.02 && b3 > 0.02) saut = Math.max(saut, Math.abs(a - b3)); mx = Math.max(mx, a);
    }
    assert.ok(saut / 0.25 <= (1.25 * 1.5 * mx) / f.raccord_ref_mm, f.cle + ' pente ' + saut / 0.25);
  }
});

test('fiches : régénérées depuis les STL par le même code, elles sont identiques à celles du dépôt (le générateur n\'est pas périmé)', { skip: !AVEC_STL && 'STL PODAXIA absents (documents locaux)' }, async () => {
  for (const f of FICHES_PODAXIA) {
    const b = readFileSync(DIR + f.fichier);
    const { relief_b64, nx, ny, x0, y0, hauteur_ref_mm, decalage_y_mm, dims_stl_mm, ...meta } = f;
    const g = await stlVersFiche(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), meta);
    assert.equal(g.relief_b64, relief_b64, f.cle);
    assert.deepEqual([g.nx, g.ny, g.x0, g.y0, g.hauteur_ref_mm, g.decalage_y_mm, g.dims_stl_mm], [nx, ny, x0, y0, hauteur_ref_mm, decalage_y_mm, dims_stl_mm], f.cle);
    // le STL est bien celui du rapport du fournisseur (±0,6 mm)
    assert.ok(g.dims_stl_mm.every((d, i) => Math.abs(d - f.dims_rapport_mm[i]) < 0.6), f.cle + ' ' + g.dims_stl_mm);
  }
});

// ---- Coins ancrés au bord (retour de Joël 31/10) : sommet plein AU bord de la semelle, côté haut, sans déport ni retombée ----
const COINS = [['coin_pronateur_posterieur', 'lateral', 56, 4], ['coin_supinateur_posterieur', 'medial', 56, 4], ['coin_pronateur_anterieur', 'lateral', 80, 3], ['coin_supinateur_anterieur', 'medial', 80, 3]];
test('coin ancré au bord : hauteur au bord = largeur × tan θ AU nœud du bord, côté haut (pronateur latéral, supinateur médial), pieds D et G ; rampe plane puis nulle', () => {
  for (const [cle, haut, W, ang] of COINS) for (const cote of ['D', 'G']) {
    const b = plaque({ h: 2, oy: 0 });
    const f = appliquerElements(b, [{ type: cle, dy_mm: 20, angle_deg: ang }], { cote, cat });
    const c = f.couches[0].z, med = cote === 'D' ? -1 : 1, versX = haut === 'medial' ? med : -med;
    const iBord = versX > 0 ? b.nx - 1 : 0, j = Math.round((20 + 12) / 0.5); // 12 mm après le début : plateau
    assert.ok(Math.abs(c[j * b.nx + iBord] - W * tand(ang)) < 0.01, `${cle} ${cote} : au bord ${c[j * b.nx + iBord]} / attendu ${W * tand(ang)}`);
    const h = (tp) => c[j * b.nx + iBord - versX * Math.round(tp / 0.5)];
    assert.ok(Math.abs(h(10) - (W - 10) * tand(ang)) < 0.01, 'rampe plane à 10 mm du bord');
    assert.ok(Math.abs(h(30) - (W - 30) * tand(ang)) < 0.01, 'rampe plane à 30 mm du bord');
    assert.equal(h(W + 4), 0, 'nulle au-delà de la largeur');
    let prec = Infinity, maxPente = 0; // jamais de remontée vers l'intérieur, jamais plus raide que tan θ (pas d'arête)
    for (let tp = 0; tp <= W + 6; tp += 0.5) { const v = h(tp); assert.ok(v <= prec + 1e-6 && v >= 0, cle + ' remonte à t\'=' + tp); if (prec !== Infinity) maxPente = Math.max(maxPente, (prec - v) / 0.5); prec = v; }
    assert.ok(maxPente <= tand(ang) * 1.001, cle + ' pente max ' + maxPente + ' > tan θ');
    // les cellules du côté opposé au bord haut ne reçoivent rien (rampe nulle au-delà de la largeur : 120 mm de plaque)
    assert.equal(c[j * b.nx + (versX > 0 ? 0 : b.nx - 1)], 0);
  }
});

test('coin ancré au bord : dx ignoré (« pas de déport »), dy = début du coin (0 = bord du talon), décroissance vers l\'avant, ancrage invalide refusé, libre = ancien comportement', () => {
  const b = plaque();
  const a = appliquerElements(b, [{ type: 'coin_supinateur_posterieur', dy_mm: 0, dx_mm: 0 }], { cote: 'D', cat }).couches[0].z;
  const c = appliquerElements(b, [{ type: 'coin_supinateur_posterieur', dy_mm: 0, dx_mm: 25 }], { cote: 'D', cat }).couches[0].z;
  assert.deepEqual(Array.from(a), Array.from(c), 'dx sans effet en ancrage au bord');
  const iBord = 0; // supinateur, pied D : bord médial = -X = nœud 0
  assert.ok(a[0 * b.nx + iBord] > 3, 'démarre AU talon (rangée 0) à pleine hauteur : ' + a[iBord]);
  const plateau = a[Math.round(20 / 0.5) * b.nx + iBord], fin = a[Math.round(60 / 0.5) * b.nx + iBord];
  assert.ok(Math.abs(plateau - 56 * tand(4)) < 0.01 && Math.abs(fin - plateau * 0.238) < 0.02 * plateau, `plateau ${plateau} fin ${fin}`);
  assert.equal(a[Math.round(71 / 0.5) * b.nx + iBord], 0, 'rien au-delà de la longueur');
  // début adouci quand le coin ne démarre pas au talon
  const m = appliquerElements(b, [{ type: 'coin_supinateur_anterieur', dy_mm: 100 }], { cote: 'D', cat }).couches[0].z;
  assert.ok(m[Math.round(100 / 0.5) * b.nx + iBord] < 0.01 && m[Math.round(115 / 0.5) * b.nx + iBord] > 3.5, 'début en rampe sur le raccord, sans marche');
  assert.throws(() => validerElement({ type: 'coin_supinateur_posterieur', ancrage: 'milieu' }, cat), /ancrage/);
  assert.equal(validerElement({ type: 'coin_pronateur_posterieur' }, cat).ancrage, 'bord');
  const lib = validerElement({ type: 'coin_supinateur_posterieur', ancrage: 'libre', dx_mm: 7 }, cat);
  assert.equal(lib.ancrage, 'libre'); assert.equal(lib.dx_mm, 7);
});

test('coin ancré au bord sur un VRAI contour de pied (scan synthétique D et G) : à chaque rangée du plateau la couche vaut largeur × tan θ au dernier nœud du côté haut', async () => {
  for (const scenario of ['droit_stl_mm', 'gauche_obj_mm']) for (const [cle, haut, W, ang] of COINS.filter((c) => c[0].includes('posterieur'))) {
    const etat = {}, d = await traiterMessageA({ type: 'demo', scenario }, etat);
    await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
    await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
    await traiterMessageA({ type: 'materiaux', json: JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8')) }, etat);
    const cote = d.cote_reel;
    await traiterMessageA({ type: 'base', cote, params: { cote, type: 'plate' }, elements: [{ type: cle, angle_deg: ang }] }, etat);
    const F = etat.finale, z = F.couches[0].z, med = cote === 'D' ? -1 : 1, versX = haut === 'medial' ? med : -med;
    let testes = 0;
    const yMin = (() => { for (let j = 0; j < F.ny; j++) for (let i = 0; i < F.nx; i++) if (Number.isFinite(F.haut_base[j * F.nx + i])) return F.oy + j * F.pas; })();
    for (let j = 0; j < F.ny; j++) {
      const u = F.oy + j * F.pas - (yMin + 30 - 30) ; // distance au point le plus postérieur du contour (le repère talon est à y_min)
      if (u < 3 || u > 30) continue; // plateau du coin (0,55 × 70 mm = 38,5 mm) hors du tout début
      let a = -1, bb = -1; for (let i = 0; i < F.nx; i++) if (Number.isFinite(F.haut_base[j * F.nx + i])) { if (a < 0) a = i; bb = i; }
      if (a < 0) continue;
      const e = versX > 0 ? bb : a;
      assert.ok(Math.abs(z[j * F.nx + e] - W * tand(ang)) < 0.02, `${scenario} ${cle} rangée ${j} (u=${u.toFixed(1)}) : bord ${z[j * F.nx + e]} / ${W * tand(ang)}`);
      testes++;
    }
    assert.ok(testes > 40, scenario + ' ' + cle + ' : rangées testées ' + testes);
  }
});
