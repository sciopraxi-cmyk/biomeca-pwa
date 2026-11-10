import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construireBase, validerParametresBase, arrondirFin } from '../../js/semelle3d/calcul/base.js';
import { appliquerElements, validerElement, TYPES_ELEMENTS, TYPES_BORD, positionApres } from '../../js/semelle3d/calcul/elements.js';
import { suggererMilieuVoute, biseauDessous, distanceBords } from '../../js/semelle3d/calcul/bords.js';
import { chargerMateriaux } from '../../js/semelle3d/calcul/materiaux.js';
import { maillerBase } from '../../js/semelle3d/calcul/maillage_base.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { ecrireSTLBinaire, lireSTLBinaire, indexerSommets } from '../../js/semelle3d/calcul/stl.js';
import { DEMI_SEMELLE, BASE_DEFAUTS } from '../../js/semelle3d/constantes.js';
import { grilleFn, miroirGrille } from './aides_base.js';

const materiaux = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
const cat = chargerMateriaux(materiaux);
const tand = (d) => Math.tan((d * Math.PI) / 180);
// Plaque : x de -40 à 40, y de 0 à 200 (pas 0,5) ; hauteur plantaire constante (pas de moulage).
const plaque = () => grilleFn(161, 401, () => 1, 0.5, -40, 0);
const ix = (g, x) => Math.round((x - g.ox) / g.pas), jy = (g, y) => Math.round((y - g.oy) / g.pas);
const at = (g, arr, x, y) => arr[jy(g, y) * g.nx + ix(g, x)];
const finie = (v) => Number.isFinite(v);
const ids = (n = 2) => materiaux.materiaux.slice(0, n).map((m) => m.item_id);
const P = { type: 'plate', contour_lisse: false, epaisseur_mm: 2 };

test('décisions de Joël : limite 60 % (40 à 90), arrondi 8 mm, devant = 2e matériau de même épaisseur, étendue entière par défaut', () => {
  assert.equal(DEMI_SEMELLE.limite_defaut_pct, 60); assert.equal(BASE_DEFAUTS.limite_pct, 60);
  assert.equal(DEMI_SEMELLE.limite_min_pct, 40); assert.equal(DEMI_SEMELLE.limite_max_pct, 90);
  assert.equal(BASE_DEFAUTS.raccord_devant_mm, 20, 'transition entre les deux matériaux douce par défaut');
  assert.equal(BASE_DEFAUTS.arrondi_mm, 8); assert.equal(BASE_DEFAUTS.etendue, 'entiere'); assert.equal(BASE_DEFAUTS.devant, 'materiau2');
  const q = validerParametresBase({ epaisseur_mm: 2.2 });
  assert.equal(q.epaisseur_devant_mm, 2.2, 'épaisseur devant = celle de la base par défaut');
  assert.equal(validerParametresBase({ epaisseur_mm: 2.2, epaisseur_devant_mm: 1 }).epaisseur_devant_mm, 1);
});

test('validation de la demi-semelle : limite hors 40-90 %, étendue inconnue, raccord nul, arrondi négatif, épaisseur devant sous 0,9 : refusés', () => {
  assert.doesNotThrow(() => validerParametresBase({ limite_pct: 40 })); assert.doesNotThrow(() => validerParametresBase({ limite_pct: 90 }));
  assert.throws(() => validerParametresBase({ limite_pct: 39 }), RangeError); assert.throws(() => validerParametresBase({ limite_pct: 91 }), RangeError);
  assert.throws(() => validerParametresBase({ etendue: 'moitie' }), TypeError);
  assert.throws(() => validerParametresBase({ devant: 'autre' }), TypeError);
  assert.throws(() => validerParametresBase({ raccord_devant_mm: 0 }), RangeError);
  assert.throws(() => validerParametresBase({ arrondi_mm: -1 }), RangeError);
  assert.throws(() => validerParametresBase({ epaisseur_devant_mm: 0.5 }), RangeError);
});

test('matériau de la base : repris du tableau (Shore, résistance kg/m³) dans le rapport ; inconnu ou tableau absent = erreur', () => {
  const [a, b] = ids();
  const r = construireBase(plaque(), { ...P, materiau_id: a }, cat).rapport;
  const m = cat.parId.get(a);
  assert.equal(r.zones[0].materiau.id, a); assert.ok(r.zones[0].materiau.resistance_kgm3 === m.resistance_kgm3); assert.ok(r.zones[0].materiau.shore === m.shore);
  assert.throws(() => construireBase(plaque(), { ...P, materiau_id: 'XXX' }, cat), /inconnu/);
  assert.throws(() => construireBase(plaque(), { ...P, materiau_id: a }), /non chargé/);
  assert.equal(construireBase(plaque(), P, cat).rapport.zones[0].materiau, null);
  assert.ok(b);
});

test('demi-semelle SANS rien devant : la base s\'arrête à 60 % de la longueur (rangée limite exacte), rien au-delà ; entière = tout', () => {
  const g = plaque();
  const b = construireBase(g, { ...P, etendue: 'demi', devant: 'rien', arrondi_mm: 0 }, cat); // longueur 200 mm -> limite 120 mm
  assert.equal(b.rapport.etendue.limite_mm, 120); assert.equal(b.rapport.etendue.limite_pct, 60);
  assert.ok(finie(at(g, b.haut, 0, 120)), 'rangée limite présente');
  assert.ok(!finie(at(g, b.haut, 0, 120.5)), 'rien au-delà');
  assert.ok(!finie(at(g, b.bas, 0, 150)));
  const e = construireBase(g, P, cat);
  assert.ok(finie(at(g, e.haut, 0, 200)));
  const b80 = construireBase(g, { ...P, etendue: 'demi', devant: 'rien', limite_pct: 80, arrondi_mm: 0 }, cat);
  assert.ok(finie(at(g, b80.haut, 0, 160)) && !finie(at(g, b80.haut, 0, 161)));
});

test('demi-semelle : le maillage est fermé (relu), sans dégénéré, avec et sans matériau devant', () => {
  for (const devant of ['rien', 'materiau2']) {
    const b = construireBase(plaque(), { ...P, etendue: 'demi', devant, arrondi_mm: 8 }, cat);
    const m = maillerBase(b); const v = verifierMaillage(indexerSommets(lireSTLBinaire(ecrireSTLBinaire(m))));
    assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, devant + ' ' + JSON.stringify(v));
  }
});

test('2e matériau devant : même épaisseur par défaut (aucune marche), épaisseur réglable avec transition lisse centrée sur la limite, raccord jamais nul', () => {
  const g = plaque();
  const [a, b] = ids();
  const meme = construireBase(g, { ...P, etendue: 'demi', devant: 'materiau2', materiau_id: a, materiau_devant_id: b }, cat);
  for (const y of [10, 100, 119, 121, 150, 199]) assert.ok(Math.abs(at(g, meme.haut, 0, y) - 2) < 1e-6, 'y=' + y);
  const ep3 = construireBase(g, { ...P, etendue: 'demi', devant: 'materiau2', epaisseur_devant_mm: 3, raccord_devant_mm: 8 }, cat);
  assert.ok(Math.abs(at(g, ep3.haut, 0, 100) - 2) < 1e-6, 'avant la transition : épaisseur de la base');
  assert.ok(Math.abs(at(g, ep3.haut, 0, 140) - 3) < 1e-6, 'après la transition : épaisseur de devant');
  assert.ok(Math.abs(at(g, ep3.haut, 0, 120.25) - 2.5) < 0.05, 'milieu de la transition à la limite : ' + at(g, ep3.haut, 0, 120.25));
  let pente = 0; for (let y = 100; y < 140; y += 0.5) pente = Math.max(pente, Math.abs(at(g, ep3.haut, 0, y + 0.5) - at(g, ep3.haut, 0, y)));
  assert.ok(pente < 0.2, 'aucune marche : saut max entre 2 rangées ' + pente);
  assert.equal(ep3.rapport.zones.length, 2); assert.equal(ep3.rapport.zones[1].epaisseur_mm, 3);
  assert.equal(construireBase(g, { ...P, etendue: 'demi', devant: 'rien' }, cat).rapport.zones.length, 1);
  assert.ok(meme.rapport.avertissements.some((x) => /2 matériaux/.test(x)), 'info 3MF multi-volumes');
});

test('2e matériau devant non choisi : avertissement ; épaisseur plus grande que la feuille du matériau : avertissement', () => {
  const r = construireBase(plaque(), { ...P, etendue: 'demi', devant: 'materiau2', materiau_id: ids()[0] }, cat).rapport;
  assert.ok(r.avertissements.some((x) => /devant non choisi/.test(x)));
  const mince = cat.parId.get('EVA-2.0-30S'); // feuille de 2 mm
  assert.ok(mince && mince.epaisseur_mm === 2);
  const r2 = construireBase(plaque(), { ...P, epaisseur_mm: 5, materiau_id: mince.id }, cat).rapport;
  assert.ok(r2.avertissements.some((x) => /plus grande que la feuille/.test(x)), JSON.stringify(r2.avertissements));
  const r3 = construireBase(plaque(), { ...P, epaisseur_mm: 2, materiau_id: mince.id }, cat).rapport;
  assert.ok(!r3.avertissements.some((x) => /plus grande que la feuille/.test(x)));
});

test('ARRONDI des 2 pointes avant : les angles du bout deviennent des arcs de rayon R (écart au cercle < 0,5 mm), le reste du contour ne bouge pas', () => {
  const g = plaque(); const jl = jy(g, 120), R = 10;
  const a = arrondirFin(g, jl, R);
  // coin médial (x = -40, y = 120) et latéral (x = 40) retirés ; le bord de la matière est à une demi-cellule hors du dernier nœud :
  // arcs de rayon R centrés en (-40,5 + R ; 120,5 - R) et (40,5 - R ; 120,5 - R)
  assert.ok(!finie(at(g, a.z, -40, 120)) && !finie(at(g, a.z, 40, 120)), 'pointes retirées');
  assert.ok(finie(at(g, a.z, -40, 110)) && finie(at(g, a.z, -30, 120)), 'les bords droits sont conservés jusqu\'au début de l\'arc');
  for (const [cx, sx] of [[-40.5 + R, -1], [40.5 - R, 1]]) {
    for (let y = 110; y <= 120; y += 0.5) for (let x = -40; x <= 40; x += 0.5) {
      if (Math.abs(x - cx) > R) continue;
      const dedansArc = Math.hypot(x - cx, y - (120.5 - R)) <= R, present = finie(at(g, a.z, x, y));
      const bordZone = Math.abs(Math.hypot(x - cx, y - (120.5 - R)) - R) < 0.5;
      if (!bordZone && ((sx < 0 && x < cx) || (sx > 0 && x > cx)) && y > 120.5 - R) assert.equal(present, dedansArc, `(${x}, ${y})`);
    }
  }
  // le reste ne bouge pas : toutes les cellules à plus de 2R du bout sont identiques à l'entrée
  for (let k = 0; k < g.z.length; k++) { const y = g.oy + Math.floor(k / g.nx) * g.pas; if (y < 120 - 2 * R) assert.ok(finie(a.z[k]) === finie(g.z[k])); }
  // rayon 0 : coupe droite, rien de retiré sur la rangée limite
  const z0 = arrondirFin(g, jl, 0);
  assert.ok(finie(at(g, z0.z, -40, 120)) && finie(at(g, z0.z, 40, 120)));
});

test('arrondi : plus le rayon est grand, moins il reste de surface au bout ; symétrique D/G (image miroir exacte)', () => {
  const g = plaque(), jl = jy(g, 120);
  const aire = (R) => arrondirFin(g, jl, R).z.reduce((s, v) => s + (finie(v) ? 1 : 0), 0);
  assert.ok(aire(0) > aire(8) && aire(8) > aire(15) && aire(15) > aire(25));
  const a = arrondirFin(g, jl, 12), m = arrondirFin(miroirGrille(g), jl, 12), mm = miroirGrille({ ...g, z: a.z });
  for (let k = 0; k < a.z.length; k++) assert.ok(finie(m.z[k]) === finie(mm.z[k]), 'miroir en ' + k);
});

test('arrondi dans construireBase : l\'arrondi n\'agit que sans matériau devant (avec un 2e matériau le contour du pied continue)', () => {
  const g = plaque();
  const sans = construireBase(g, { ...P, etendue: 'demi', devant: 'rien', arrondi_mm: 8 }, cat);
  assert.ok(!finie(at(g, sans.haut, -40, 120)), 'pointe arrondie');
  const avec = construireBase(g, { ...P, etendue: 'demi', devant: 'materiau2', arrondi_mm: 8 }, cat);
  assert.ok(finie(at(g, avec.haut, -40, 200)), 'avec devant : coin du pied conservé');
});

test('ÉLÉMENTS DE BORD (lecture B) : sommet au bord médial SANS décroissance, descente en cosinus vers le milieu, nulle à la largeur', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  const f = appliquerElements(b, [{ type: 'voute_bord', hauteur_mm: 7, largeur_mm: 36, longueur_mm: 78, dy_mm: 100 }], { cote: 'D', cat });
  const c = f.couches[0].z; const yc = 0 + 100; // repère talon : y = 0 ici
  assert.ok(Math.abs(at(g, c, -40, yc) - 7) < 0.01, 'sommet au bord médial : ' + at(g, c, -40, yc));
  assert.ok(Math.abs(at(g, c, -39, yc) - 7) < 0.02 && Math.abs(at(g, c, -38, yc) - 7) < 0.06, 'pente nulle au bord (sans décroissance)');
  assert.ok(Math.abs(at(g, c, -40 + 18, yc) - 3.5) < 0.05, 'moitié à mi-largeur : ' + at(g, c, -22, yc));
  assert.ok(at(g, c, -40 + 36, yc) === 0 && at(g, c, 30, yc) === 0, 'rien au-delà de la largeur ni côté latéral');
  for (let x = -40; x < -4; x += 0.5) assert.ok(at(g, c, x + 0.5, yc) <= at(g, c, x, yc) + 1e-6, 'jamais de remontée de x=' + x);
  // le long du pied : plateau au centre, redescente lisse aux deux extrémités (longueur 78 mm centrée à 100 -> de 61 à 139 mm), rien au-delà
  assert.ok(at(g, c, -40, 100 + 39 - 0.5) < 0.05 && at(g, c, -40, 100 - 39 + 0.5) < 0.05, 'extrémités adoucies : ' + at(g, c, -40, 138.5));
  assert.ok(at(g, c, -40, 140) === 0 && at(g, c, -40, 60) === 0, 'rien au-delà de la longueur');
  const c10 = appliquerElements(b, [{ type: 'voute_bord', hauteur_mm: 7, largeur_mm: 36, longueur_mm: 78, dy_mm: 100, raccord_mm: 10 }], { cote: 'D', cat }).couches[0].z;
  assert.ok(at(g, c10, -40, 100 + 39 - 10) > 6.9 && at(g, c10, -40, 100 + 39 - 5) > 3 && at(g, c10, -40, 100 + 39 - 5) < 4, 'raccord réglé à 10 mm : à mi-raccord, la moitié (smoothstep) ' + at(g, c10, -40, 134));
  // la base d'origine n'est jamais modifiée (le dessous d'un élément ne s'écrit que dans la copie)
  const avant = Float32Array.from(b.bas), avantH = Float32Array.from(b.haut);
  appliquerElements(b, [{ type: 'voute_bord', dy_mm: 100 }], { cote: 'D', cat });
  for (let k = 0; k < avant.length; k++) assert.ok(avant[k] === b.bas[k] && avantH[k] === b.haut[k], 'base modifiée en ' + k);
});

test('élément de bord : sa position le long du pied est comptée depuis le TALON (repère), pas depuis y = 0', () => {
  const g = grilleFn(161, 401, () => 1, 0.5, -40, 20); // le pied commence à y = 20
  const b = construireBase(g, P, cat);
  const c = appliquerElements(b, [{ type: 'voute_bord', dy_mm: 100, longueur_mm: 78 }], { cote: 'D', cat }).couches[0].z; // centre à y = 120 (de 81 à 159)
  assert.ok(Math.abs(at(g, c, -40, 120) - 7) < 0.01, 'centre à 120 : ' + at(g, c, -40, 120));
  assert.ok(at(g, c, -40, 150) > 0.5 && at(g, c, -40, 165) === 0 && at(g, c, -40, 85) > 0 && at(g, c, -40, 75) === 0);
});

test('élément de bord : le DESSOUS est la règle de la base intermédiaire — bas = max(bas base, haut − épaisseur − d × tan(angle)) — pour 30°, 45°, 60°', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  for (const ang of [30, 45, 60]) {
    const f = appliquerElements(b, [{ type: 'voute_bord', biseau_deg: ang, dy_mm: 100 }], { cote: 'D', cat });
    let n = 0;
    for (let x = -40; x <= -10; x += 1) {
      const d = x + 40, haut = at(g, f.haut, x, 100), bas = at(g, f.bas, x, 100);
      const attendu = Math.max(0, haut - 2 - d * tand(ang));
      assert.ok(Math.abs(bas - attendu) < 1e-4, `${ang}° x=${x} d=${d} : ${bas} vs ${attendu}`); n++;
    }
    assert.ok(n > 25);
    assert.ok(Math.abs(at(g, f.bas, -40, 100) - 7) < 1e-4, 'au bord (d = 0) : dessous = haut 9 − épaisseur 2 = 7 mm');
  }
});

test('l\'angle du biseau est réglable PAR élément : 2 éléments, 2 angles, 2 largeurs de biseau différentes ; angle hors 15-75° refusé', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  const f = appliquerElements(b, [{ type: 'voute_bord', biseau_deg: 30, dy_mm: 60, longueur_mm: 60 }, { type: 'voute_bord', biseau_deg: 60, dy_mm: 150, longueur_mm: 60 }], { cote: 'D', cat });
  const larg = (y) => { let x = -40; while (at(g, f.bas, x, y) > 0 && x < 40) x += 0.5; return x + 40; };
  assert.ok(larg(60) > larg(150) + 5, `biseau 30° plus large que 60° : ${larg(60)} vs ${larg(150)}`);
  assert.throws(() => validerElement({ type: 'voute_bord', biseau_deg: 10 }, cat), /biseau/);
  assert.throws(() => validerElement({ type: 'voute_bord', biseau_deg: 80 }, cat), /biseau/);
  assert.equal(validerElement({ type: 'aileron' }, cat).biseau_deg, 45);
});

test('élément à 2 bords (cuvette talonnière) : biseau et sommet sur CHAQUE bord (médial ET latéral), symétriques ; le dessous suit le plus proche', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  const f = appliquerElements(b, [{ type: 'cuvette_talonniere', dy_mm: 35, largeur_mm: 20 }], { cote: 'D', cat });
  const c = f.couches[0].z, y = 15; // sur le plateau (0 à 35 mm), avant la pente d'extrémité
  assert.ok(Math.abs(at(g, c, -40, y) - 10) < 0.05 && Math.abs(at(g, c, 40, y) - 10) < 0.05, 'sommet aux deux bords');
  assert.ok(Math.abs(at(g, c, 0, 45)) < 1e-6, 'milieu de la semelle libre (à plus de 30 mm de chaque bord)');
  assert.ok(at(g, c, 0, 1) > 9.9 && at(g, c, -20, 0.5) > 9, 'le bord POSTÉRIEUR (talon) est aussi un bord : sommet au bord arrière : ' + at(g, c, 0, 1));
  assert.ok(Math.abs(at(g, f.bas, 0, 1) - Math.max(0, at(g, f.haut, 0, 1) - 2 - 1 * tand(45))) < 1e-4, 'dessous biseauté aussi au talon');
  for (const x of [-35, -30, -25]) assert.ok(Math.abs(at(g, f.bas, x, y) - at(g, f.bas, -x, y)) < 1e-4, 'dessous symétrique x=' + x);
  for (const x of [-40, -35, 35, 40]) { const d = Math.min(x + 40, 40 - x); assert.ok(Math.abs(at(g, f.bas, x, y) - Math.max(0, at(g, f.haut, x, y) - 2 - d * tand(45))) < 1e-4, 'x=' + x); }
  const dm = distanceBords(b, 'D', ['medial']), dl = distanceBords(b, 'D', ['lateral']), d2 = distanceBords(b, 'D', ['medial', 'lateral']);
  const k = jy(g, 100) * g.nx + ix(g, -30);
  assert.ok(Math.abs(dm[k] - 10) < 0.6 && Math.abs(dl[k] - 70) < 0.6 && Math.abs(d2[k] - 10) < 0.6, `distances ${dm[k]} ${dl[k]} ${d2[k]}`);
});

test('bord latéral (arche externe, aileron) : côté latéral du pied D = +X, du pied G = -X ; image miroir exacte', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  const D = appliquerElements(b, [{ type: 'aileron', dy_mm: 100 }], { cote: 'D', cat }).couches[0].z;
  assert.ok(at(g, D, 40, 100) > 2.4 && at(g, D, -40, 100) === 0, 'pied D : latéral = +X');
  const G = appliquerElements(b, [{ type: 'aileron', dy_mm: 100 }], { cote: 'G', cat }).couches[0].z;
  assert.ok(at(g, G, -40, 100) > 2.4 && at(g, G, 40, 100) === 0, 'pied G : latéral = -X');
  for (const t of TYPES_BORD) assert.ok(TYPES_ELEMENTS[t].bords.length >= 1);
  assert.deepEqual([...TYPES_BORD].sort(), ['aileron', 'arche_externe', 'cuvette_talonniere', 'flange_mediale', 'voute_bord']);
});

test('éléments de bord : maillage fermé relu, aucun triangle dégénéré, épaisseur mini ≥ épaisseur de la base partout', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  const f = appliquerElements(b, [{ type: 'voute_bord', dy_mm: 100 }, { type: 'cuvette_talonniere', dy_mm: 35 }, { type: 'aileron', dy_mm: 170 }], { cote: 'D', cat });
  const v = verifierMaillage(indexerSommets(lireSTLBinaire(ecrireSTLBinaire(maillerBase(f)))));
  assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, JSON.stringify(v));
  for (let k = 0; k < f.haut.length; k++) if (finie(f.haut[k])) assert.ok(f.haut[k] - f.bas[k] >= 2 - 1e-4, 'épaisseur < base en ' + k);
});

// ---------- suggestion bleue du milieu de la voûte ----------
// Pied synthétique : largeur 60 mm sauf un étranglement (isthme) de 40 mm centré à y = 90, côté médial rentrant seulement.
const pied = (cote, yIsthme = 90, rentree = 20) => {
  const sens = cote === 'D' ? -1 : 1;
  const nx = 161, ny = 361;
  return { nx, ny, pas: 0.5, ox: -40, valide: Array.from({ length: nx * ny }, (_, k) => {
    const x = -40 + (k % nx) * 0.5, y = Math.floor(k / nx) * 0.5;
    const r = rentree * Math.exp(-((y - yIsthme) ** 2) / (2 * 15 * 15));
    const limMed = -30 + r; // bord médial (pied D) : x ≥ limMed
    return (cote === 'D' ? x >= limMed && x <= 30 : x <= -limMed && x >= -30) ? 1 : 0;
  }), sens };
};
test('suggestion du milieu de voûte : retrouve l\'isthme construit (± 1 mm), appui médial du bon côté, pied D et pied G', () => {
  for (const cote of ['D', 'G']) {
    const s = suggererMilieuVoute(pied(cote), cote);
    assert.ok(Math.abs(s.dy_mm - 90) <= 1.5, cote + ' dy ' + s.dy_mm);
    assert.ok(Math.abs(Math.abs(s.x_medial_mm) - 10) < 0.6, cote + ' x ' + s.x_medial_mm); // -30 + 20 = -10
    assert.ok((cote === 'D' ? s.x_medial_mm < 0 : s.x_medial_mm > 0), 'côté médial');
    assert.equal(s.a_confirmer, false);
    assert.ok(s.largeur_mm < 45);
  }
});
test('suggestion : contour presque droit (isthme mal défini) = « à confirmer » ; latéralité obligatoire ; empreinte vide refusée', () => {
  const droit = pied('D', 90, 0);
  assert.equal(suggererMilieuVoute(droit, 'D').a_confirmer, true);
  assert.throws(() => suggererMilieuVoute(droit, 'X'), /latéralité/);
  assert.throws(() => suggererMilieuVoute({ ...droit, valide: new Array(droit.valide.length).fill(0) }, 'D'), /vide/);
});
test('suggestion : jamais appliquée seule — aucun élément n\'est posé par la suggestion ; le rapport du pipeline la contient', async () => {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario: 'droit_stl_mm' }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  await traiterMessageA({ type: 'materiaux', json: materiaux }, etat);
  const r = await traiterMessageA({ type: 'base', cote: d.cote_reel, params: { cote: d.cote_reel, type: 'thermoformee' }, elements: [] }, etat);
  assert.equal(r.rapport.nb_elements, 0);
  const s = r.rapport.suggestion_voute;
  assert.ok(s && s.dy_mm > 20 && s.dy_mm < 0.6 * s.longueur_pied_mm && typeof s.raison === 'string', JSON.stringify(s));
});

test('pipeline : demi-semelle + 2e matériau + voûte au bord sur le scan synthétique : maillage fermé, STL relu fermé, rapport par zone', async () => {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario: 'droit_stl_mm' }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  await traiterMessageA({ type: 'materiaux', json: materiaux }, etat);
  const [a, b] = ids();
  let r; try { r = await traiterMessageA({ type: 'base', cote: d.cote_reel, params: { cote: d.cote_reel, type: 'thermoformee', etendue: 'demi', limite_pct: 60, devant: 'materiau2', materiau_id: a, materiau_devant_id: b }, elements: [{ type: 'voute_bord', hauteur_mm: 6, biseau_deg: 45 }] }, etat); } catch (e) { assert.fail('le pipeline doit transmettre le tableau des matériaux à la base : ' + e.message); }
  assert.equal(r.rapport.ferme, true); assert.equal(r.rapport.degeneres, 0);
  assert.equal(r.rapport.zones.length, 2); assert.equal(r.rapport.zones[0].materiau.id, a); assert.equal(r.rapport.zones[1].materiau.id, b);
  assert.equal(r.rapport.elements[0].biseau_deg, 45); assert.deepEqual(r.rapport.elements[0].bords, ['medial']);
  const x = await traiterMessageA({ type: 'exporter', cote: d.cote_reel }, etat);
  assert.equal(x.type, 'exporte'); assert.ok(x.octets === 84 + 50 * x.nbTriangles);
  const c = await traiterMessageA({ type: 'coupe', mode: 'T', position_mm: r.rapport.suggestion_voute.dy_mm }, etat);
  assert.ok(c.mesures.elements[0].applicable === false && /biseau/.test(c.mesures.elements[0].raison));
  assert.ok(c.mesures.elements[0].hauteur_couche_max_mm > 5.5, 'hauteur de la couche à la coupe : ' + c.mesures.elements[0].hauteur_couche_max_mm);
});

test('la fonction biseauDessous ne descend jamais sous le dessous de la base et reste NaN hors contour', () => {
  const haut = Float32Array.from([5, 5, NaN, 5]), bas = Float32Array.from([2, 2, NaN, 4.5]), dist = new Float64Array([0, 100, 0, 0]);
  const o = biseauDessous(haut, bas, 1.5, dist, 45);
  assert.ok(o[0] === 3.5 && o[1] === 2 && Number.isNaN(o[2]) && o[3] === 4.5, Array.from(o).join(' '));
});

test('PENTES DOUCES (retour de Joël : « des marches d\'escalier ») : par défaut le raccord d\'extrémité = la moitié de la longueur ; pente max le long du bord < 25° pour chaque élément de bord', () => {
  const g = plaque(); const b = construireBase(g, P, cat);
  for (const t of TYPES_BORD) {
    const d = TYPES_ELEMENTS[t].defauts;
    assert.ok(Math.abs(d.raccord_mm - d.longueur_mm / 2) < 1e-9, t + ' : raccord par défaut ' + d.raccord_mm);
    const f = appliquerElements(b, [{ type: t }], { cote: 'D', cat });
    const c = f.couches[0].z, T = TYPES_ELEMENTS[t];
    const x = T.bords.includes('medial') ? -40 : 40; // colonne du bord de l'élément
    let pente = 0, hmax = 0;
    for (let y = 1; y < 199; y += 0.5) { pente = Math.max(pente, Math.abs(at(g, c, x, y + 0.5) - at(g, c, x, y)) / 0.5); hmax = Math.max(hmax, at(g, c, x, y)); }
    assert.ok(Math.abs(hmax - d.hauteur_mm) < 0.1, t + ' : le sommet reste atteint (' + hmax + ' mm pour ' + d.hauteur_mm + ')');
    assert.ok(pente < Math.tan((25 * Math.PI) / 180), t + ' : pente max le long du bord ' + (Math.atan(pente) * 180 / Math.PI).toFixed(1) + '°');
  }
  // avant (raccord de 10 mm sur la voûte) la pente dépassait 45° : la valeur réglable reste possible
  const raide = appliquerElements(b, [{ type: 'voute_bord', raccord_mm: 10 }], { cote: 'D', cat }).couches[0].z;
  let pr = 0; for (let y = 61; y < 160; y += 0.5) pr = Math.max(pr, Math.abs(at(g, raide, -40, y + 0.5) - at(g, raide, -40, y)) / 0.5);
  assert.ok(pr > 0.6, 'raccord réglé à 10 mm : pente ' + pr);
  // un raccord plus grand que la moitié de la longueur est plafonné : le sommet est quand même atteint
  const trop = appliquerElements(b, [{ type: 'voute_bord', raccord_mm: 200, dy_mm: 100 }], { cote: 'D', cat }).couches[0].z;
  assert.ok(Math.abs(at(g, trop, -40, 100) - 7) < 0.05, 'plafonné à L/2 : ' + at(g, trop, -40, 100));
});

test('la voûte DÉMARRE APRÈS la cuvette : position par défaut, aucun chevauchement, la hauteur ne s\'additionne pas (pas de « montagne »)', () => {
  const cuv = { type: 'cuvette_talonniere', ...TYPES_ELEMENTS.cuvette_talonniere.defauts }; // 0 à 70 mm
  const q = positionApres([cuv], 'voute_bord', 78, 100);
  assert.equal(q.dy_mm, 70 + 39); assert.equal(q.decale, true); assert.match(q.apres, /Cuvette/);
  const q2 = positionApres([cuv], 'voute_bord', 78, 150);
  assert.equal(q2.dy_mm, 150); assert.equal(q2.decale, false);
  assert.equal(positionApres([], 'voute_bord', 78, 100).decale, false);
  const voute = { type: 'voute_bord', ...TYPES_ELEMENTS.voute_bord.defauts }; // milieu 109
  assert.equal(positionApres([voute], 'cuvette_talonniere', 70, 35).decale, false, 'une cuvette ajoutée APRÈS la voûte reste au talon (l\'ordre d\'ajout ne compte pas)');
  const loin = positionApres([cuv], 'voute_bord', 78, 100, 140);
  assert.equal(loin.impossible, true); assert.equal(loin.dy_mm, 100); assert.equal(loin.decale, false, 'le décalage sortirait du pied : la position demandée est conservée');
  assert.equal(positionApres([{ ...cuv, visible: false }], 'voute_bord', 78, 100).decale, false, 'élément masqué ignoré');
  assert.equal(positionApres([{ type: 'aileron', ...TYPES_ELEMENTS.aileron.defauts, dy_mm: 60 }], 'voute_bord', 78, 100).decale, false, 'bord latéral : pas de conflit avec une voûte médiale');
  const g = plaque(); const b = construireBase(g, P, cat);
  const bien = appliquerElements(b, [{ type: 'cuvette_talonniere' }, { type: 'voute_bord', dy_mm: q.dy_mm }], { cote: 'D', cat });
  let somme = 0, hm = 0; for (let y = 0; y <= 200; y += 0.5) { somme = Math.max(somme, at(g, bien.couches[0].z, -40, y) + at(g, bien.couches[1].z, -40, y)); hm = Math.max(hm, at(g, bien.haut, -40, y) - 2); }
  assert.ok(somme < 10.2, 'cumul le long du bord médial ' + somme);
  assert.ok(!bien.rapport_elements.avertissements.some((x) => /chevauchent/.test(x)), JSON.stringify(bien.rapport_elements.avertissements));
  const mal = appliquerElements(b, [{ type: 'cuvette_talonniere' }, { type: 'voute_bord', dy_mm: 68 }], { cote: 'D', cat });
  assert.ok(mal.rapport_elements.avertissements.some((x) => /se chevauchent de \d+ mm sur le même bord/.test(x)), JSON.stringify(mal.rapport_elements.avertissements));
  let s2 = 0; for (let y = 0; y <= 200; y += 0.5) s2 = Math.max(s2, at(g, mal.couches[0].z, -40, y) + at(g, mal.couches[1].z, -40, y));
  assert.ok(s2 > 10.5, 'chevauchées : le cumul dépasse la hauteur de la cuvette seule — la montagne existe bien ('  + s2 + ' mm) et est signalée');
});

test('valeurs par défaut décidées après le retour de Joël : voûte centrée à 109 mm (démarre où la cuvette finit, 70 mm), cuvette de 30 mm de large', () => {
  const v = TYPES_ELEMENTS.voute_bord.defauts, c = TYPES_ELEMENTS.cuvette_talonniere.defauts;
  assert.equal(v.dy_mm, 109); assert.equal(c.largeur_mm, 30);
  assert.ok(Math.abs((v.dy_mm - v.longueur_mm / 2) - (c.dy_mm + c.longueur_mm / 2)) < 1e-9, 'la voûte démarre exactement là où la cuvette finit');
  const g = plaque(), b = construireBase(g, P, cat);
  const f = appliquerElements(b, [{ type: 'cuvette_talonniere' }, { type: 'voute_bord' }], { cote: 'D', cat });
  assert.ok(!f.rapport_elements.avertissements.some((x) => /chevauchent/.test(x)), 'défauts : aucun chevauchement');
  assert.ok(at(g, f.couches[0].z, 0, 35) === 0 && at(g, f.couches[0].z, -40 + 25, 35) > 0, 'la cuvette de 30 mm de large atteint 25 mm du bord, pas 35');
});

test('chevauchement : deux éléments sur des bords DIFFÉRENTS (voûte médiale et aileron latéral) ne se signalent pas, même au même endroit', () => {
  const g = plaque(), b = construireBase(g, P, cat);
  const f = appliquerElements(b, [{ type: 'voute_bord', dy_mm: 100 }, { type: 'aileron', dy_mm: 100 }], { cote: 'D', cat });
  assert.ok(!f.rapport_elements.avertissements.some((x) => /chevauchent/.test(x)), JSON.stringify(f.rapport_elements.avertissements));
  const m = appliquerElements(b, [{ type: 'voute_bord', dy_mm: 100 }, { type: 'flange_mediale', dy_mm: 100 }], { cote: 'D', cat });
  assert.ok(m.rapport_elements.avertissements.some((x) => /chevauchent/.test(x)), 'même bord médial : signalé');
});
