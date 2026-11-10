import test from 'node:test';
import assert from 'node:assert/strict';
import { graver, lignesGravure, nettoyerTexte, largeurPx, bitmapLigne, GRAVURE } from '../../js/semelle3d/calcul/gravure.js';
import { POLICE } from '../../js/semelle3d/donnees/police_gravure.js';
import { EPAISSEUR_BASE_MIN_MM } from '../../js/semelle3d/constantes.js';

// plaque : x de -x1 à x1, y de 0 à 260 ; épaisseur e ; dessous à 0
function plaque({ demi = 30, e = 1.5, pas = 0.5, L = 260 } = {}) {
  const nx = Math.round((2 * demi) / pas) + 1, ny = Math.round(L / pas) + 1;
  return { nx, ny, pas, ox: -demi, oy: 0, haut: new Float32Array(nx * ny).fill(e), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const copie = (f) => ({ ...f, haut: Float32Array.from(f.haut), bas: Float32Array.from(f.bas) });
const nom = 'DUPONT Jean', date = '02/11/2026';

test('police : 137 glyphes dont les accents français, capitale de 15 rangées', () => {
  for (const c of 'AZaz09 .-/·àâäçéèêëîïôöùûüÿÀÂÇÉÈÊËÎÏÔÖÙÛÜŸœŒ'.replace('Ÿ', '')) assert.ok(POLICE.glyphes[c], 'glyphe ' + c);
  assert.equal(POLICE.capitale, 15);
  const h = POLICE.glyphes.H.r.map((r, i) => (r ? i : -1)).filter((i) => i >= 0);
  assert.equal(h[h.length - 1] - h[0] + 1, 15, 'H : 15 rangées de haut');
});
test('texte : espaces normalisés, caractères inconnus remplacés par « ? », accents conservés', () => {
  assert.equal(nettoyerTexte('  DUPONT   Éloïse  '), 'DUPONT Éloïse');
  assert.equal(nettoyerTexte('Dupont ☃'), 'Dupont ?');
  assert.equal(nettoyerTexte(null), '');
});
test('lignes : 1 = nom complet ; 2 = lettre du pied · date ; sans nom une seule ligne ; pied obligatoire', () => {
  assert.deepEqual(lignesGravure({ nom, date }, 'D'), ['DUPONT Jean', 'D · 02/11/2026']);
  assert.deepEqual(lignesGravure({ nom, date }, 'G'), ['DUPONT Jean', 'G · 02/11/2026']);
  assert.deepEqual(lignesGravure({ nom: '', date }, 'G'), ['G · 02/11/2026']);
  assert.deepEqual(lignesGravure({ nom, date: '' }, 'D'), ['DUPONT Jean', 'D']);
  assert.throws(() => lignesGravure({ nom, date }, 'X'), /pied D ou G/);
  assert.throws(() => lignesGravure({ nom, date }, undefined), /pied D ou G/);
});
test('gravure : inactive ou absente = semelle strictement inchangée', () => {
  for (const o of [undefined, null, { actif: false, nom, date }]) { const f = plaque(), g = copie(f), info = graver(g, o, 'D'); assert.equal(info.actif, false); assert.deepEqual([...g.bas], [...f.bas]); }
});
test('gravure : profondeur demandée, creux sur le DESSOUS seulement, le dessus ne bouge pas, rien hors du bloc de texte', () => {
  const f = plaque({ e: 3 }), g = copie(f), info = graver(g, { actif: true, nom, date, profondeur_mm: 0.4 }, 'D');
  assert.equal(info.actif, true); assert.ok(info.cellules > 500, 'cellules ' + info.cellules);
  assert.ok(Math.abs(info.profondeur_mm - 0.4) < 1e-6);
  assert.deepEqual([...g.haut], [...f.haut], 'dessus intact');
  let gravees = 0; const b = info.bloc;
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) {
    const k = j * f.nx + i, d = g.bas[k] - f.bas[k];
    if (d === 0) continue; gravees++;
    assert.ok(Math.abs(d - 0.4) < 1e-5, 'profondeur uniforme 0,4');
    const x = f.ox + i * 0.5, y = f.oy + j * 0.5; assert.ok(y >= b.u0 - 1e-6 && y <= b.u1 + 1e-6 && x >= b.v0 - 1e-6 && x <= b.v1 + 1e-6, 'dans le bloc');
  }
  assert.equal(gravees, info.cellules);
  assert.ok(info.hauteur_lettre_mm === 7 && info.avertissements.length === 0);
});
test('gravure : il reste toujours au moins 0,9 mm de semelle ; profondeur limitée avec avertissement sur une base fine', () => {
  for (const e of [1.0, 1.1, 1.3, 1.5, 2, 4]) {
    const f = plaque({ e }), g = copie(f), info = graver(g, { actif: true, nom, date, profondeur_mm: 0.6 }, 'G');
    for (let k = 0; k < g.haut.length; k++) assert.ok(g.haut[k] - g.bas[k] >= EPAISSEUR_BASE_MIN_MM - 1e-5, 'e ' + e + ' : épaisseur ' + (g.haut[k] - g.bas[k]));
    if (e >= 1.5) assert.ok(Math.abs(info.profondeur_mm - 0.6) < 1e-6, 'e ' + e); else if (info.actif) { assert.ok(info.profondeur_mm <= e - EPAISSEUR_BASE_MIN_MM + 1e-6, 'e ' + e); assert.match(info.avertissements.join(' '), /profondeur limitée/); }
  }
});
test('gravure : semelle trop fine (0,9 mm) = pas de gravure et message explicite', () => {
  const f = plaque({ e: 0.9 }), g = copie(f), info = graver(g, { actif: true, nom, date }, 'D');
  assert.equal(info.actif, false); assert.match(info.avertissements.join(' '), /trop fine/); assert.deepEqual([...g.bas], [...f.bas]);
});
test('gravure : profondeur hors plage refusée', () => {
  assert.throws(() => graver(plaque(), { actif: true, nom, date, profondeur_mm: 0 }, 'D'), /profondeur/);
  assert.throws(() => graver(plaque(), { actif: true, nom, date, profondeur_mm: 2 }, 'D'), /profondeur/);
});
test('gravure : le texte se LIT en retournant la semelle (vu de dessous : lecture le long de +y, haut des lettres vers +x) — test sur la lettre L', () => {
  const f = plaque({ demi: 40, e: 3 }), g = copie(f), info = graver(g, { actif: true, nom: 'L', date: '' }, 'D'); // lignes : « L » puis « D »
  const b = info.bloc, pxmm = info.hauteur_lettre_mm / 15, hl = 22 * pxmm;
  const noeuds = []; // nœuds gravés de la 1re ligne (la plus haute : x le plus grand)
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const k = j * f.nx + i; if (g.bas[k] > 0 && f.ox + i * 0.5 >= b.v1 - hl) noeuds.push({ x: f.ox + i * 0.5, y: j * 0.5 }); }
  assert.ok(noeuds.length > 40, 'nœuds du L : ' + noeuds.length);
  const xs = noeuds.map((n) => n.x), ys = noeuds.map((n) => n.y), xmax = Math.max(...xs), xmin = Math.min(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const haut = noeuds.filter((n) => n.x >= xmax - 3), bas = noeuds.filter((n) => n.x <= xmin + 1.5);
  const etendue = (a) => Math.max(...a.map((n) => n.y)) - Math.min(...a.map((n) => n.y));
  assert.ok(etendue(haut) < 3.8, 'haut de L : seulement la hampe (' + etendue(haut).toFixed(1) + ' mm)');
  assert.ok(Math.min(...haut.map((n) => n.y)) < ymin + 1.2, 'la hampe est au début de la lecture (y le plus petit)');
  assert.ok(etendue(bas) > 0.6 * (ymax - ymin), 'bas de L : la barre court vers +y (' + etendue(bas).toFixed(1) + ' / ' + (ymax - ymin).toFixed(1) + ')');
  // la lettre du pied : G et D donnent des gravures différentes
  const g2 = copie(f); graver(g2, { actif: true, nom: 'L', date: '' }, 'G'); assert.notDeepEqual([...g2.bas], [...g.bas]);
});
test('gravure : nom long -> lettres réduites (avertissement) ; trop long pour la largeur de la semelle -> non gravé (avertissement), jamais de débordement', () => {
  const f = plaque({ demi: 22, e: 3 }), long = 'Jean-Baptiste DE LA ROCHEFOUCAULD-LIANCOURT', g = copie(f), info = graver(g, { actif: true, nom: long, date }, 'D');
  if (info.actif) { assert.ok(info.hauteur_lettre_mm < 7); assert.match(info.avertissements.join(' '), /réduites/); } else assert.match(info.avertissements.join(' '), /ne tient pas/);
  const tresLong = 'X'.repeat(60), g2 = copie(f), i2 = graver(g2, { actif: true, nom: tresLong, date }, 'D');
  assert.equal(i2.actif, false); assert.match(i2.avertissements.join(' '), /ne tient pas/); assert.deepEqual([...g2.bas], [...f.bas]);
  for (const A of [g, g2]) { for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const x = f.ox + i * 0.5; if (A.bas[j * f.nx + i] > 0) assert.ok(Math.abs(x) <= 22 - GRAVURE.marge_mm + 1e-6, 'gravure à moins de ' + GRAVURE.marge_mm + ' mm du bord : x=' + x); } }
});
test('gravure : jamais en dehors du contour du pied (nœuds hors contour = NaN), et centrée vers 55 % de la longueur', () => {
  const f = plaque({ demi: 40, e: 3 });
  for (let j = 0; j < f.ny; j++) for (let i = 0; i < f.nx; i++) { const x = f.ox + i * 0.5; if (Math.abs(x) > 24 + (j > 200 ? 10 : 0)) f.haut[j * f.nx + i] = NaN; }
  const g = copie(f), info = graver(g, { actif: true, nom, date }, 'D');
  assert.equal(info.actif, true); assert.ok(Math.abs(info.bloc.centre_pct - 55) <= 6, 'centre ' + info.bloc.centre_pct);
  for (let k = 0; k < g.bas.length; k++) if (!Number.isFinite(f.haut[k])) assert.equal(g.bas[k], f.bas[k]);
});
test('gravure : un dessous déjà relevé (thermoformé) : la profondeur suit l\'épaisseur locale, jamais sous 0,9 mm', () => {
  const f = plaque({ demi: 30, e: 4 }); for (let k = 0; k < f.bas.length; k++) f.bas[k] = ((k % f.nx) / f.nx) * 2.4; // dessous en pente : épaisseur de 4 à 1,6
  const g = copie(f), info = graver(g, { actif: true, nom, date, profondeur_mm: 0.6 }, 'D');
  for (let k = 0; k < g.bas.length; k++) assert.ok(g.haut[k] - g.bas[k] >= EPAISSEUR_BASE_MIN_MM - 1e-5);
  assert.ok(info.cellules > 100);
});
test('police : largeurs cohérentes (une ligne plus longue = plus large) et bitmap de la bonne taille', () => {
  assert.ok(largeurPx('DUPONT Jean') > largeurPx('DU'));
  const b = bitmapLigne('Aé'); assert.equal(b.h, POLICE.haut + POLICE.bas); assert.equal(b.cases.length, b.w * b.h); assert.ok(b.cases.some((c) => c === 1));
});

test('gravure : la marge de 2,5 mm avec le bord du pied est respectée (semelle de 18 mm de large : le texte n\'y tient pas)', () => {
  const f = plaque({ demi: 9, e: 3 }), g = copie(f), info = graver(g, { actif: true, nom: 'Lea', date }, 'D');
  assert.equal(info.actif, false); assert.match(info.avertissements.join(' '), /ne tient pas/); assert.deepEqual([...g.bas], [...f.bas]);
  const f2 = plaque({ demi: 14, e: 3 }), g2 = copie(f2), i2 = graver(g2, { actif: true, nom: 'Lea', date }, 'D'); // 28 mm : tient à 4,5-5 mm de haut
  assert.equal(i2.actif, true);
});
