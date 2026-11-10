import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPES_ELEMENTS, validerElement as validerBrut, appliquerElements as appliquerBrut } from '../../js/semelle3d/calcul/elements.js';
import { capacites, bordUnique, bornesTaille, pivotPlan, reglagesPourPivot, poigneesLocales, glisserPoignee, contient, localVersPlan, planVersLocal, medial, contourLocal, aire } from '../../js/semelle3d/calcul/poignees.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } }; // le sabotage ne reconnaît que les AssertionError
const Tdummy = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) { if (e.origine) return e.origine; throw e; } return e; } };
const validerElement = (...a) => garde(() => validerBrut(...a));
const appliquerElements = (...a) => garde(() => appliquerBrut(...a));
const rep = { x_mm: 0, y_mm: 0 };
const proche = (a, b, e = 0.06) => Math.abs(a - b) <= e;
const el = (type, extra = {}) => { const T = TYPES_ELEMENTS[type]; return { el: { type, ...T.defauts, ...extra }, T }; };
function plaque() { const nx = 241, ny = 401; return { nx, ny, pas: 0.5, ox: -60, oy: 0, haut: new Float32Array(nx * ny).fill(2), bas: new Float32Array(nx * ny), dx: null, dy: null }; }
const calc = (els, cote, b = plaque()) => appliquerElements(b, els, { cote, cat: { liste: [], parId: new Map() } });
function etendue(b, r) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) if (r.haut[j * b.nx + i] - 2 > 0.05) { x0 = Math.min(x0, b.ox + i * 0.5); x1 = Math.max(x1, b.ox + i * 0.5); y0 = Math.min(y0, j * 0.5); y1 = Math.max(y1, j * 0.5); } return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; }

test('poignées : le pivot calculé = le centre réel de l\'élément dans le noyau (point, importé, 2 pieds)', () => {
  for (const cote of ['D', 'G']) {
    const med = medial(cote), b = plaque();
    for (const [type, extra] of [['point_curseur', { dx_mm: 12, dy_mm: 90, rayon_mm: 12, hauteur_mm: 2 }], ['dome_libre', { dx_mm: -9, dy_mm: 70, largeur_mm: 40, longueur_mm: 50 }], ['dome_libre', { dx_mm: -9, dy_mm: 70, largeur_mm: 40, longueur_mm: 50, angle_plan_deg: 50 }]]) {
      const { el: e, T } = el(type, extra), v = validerElement(e), c = pivotPlan(v, T, rep, med), m = etendue(b, calc([e], cote, b));
      assert.ok(proche(c.x, m.cx, 2.2) && proche(c.y, m.cy, 2.2), type + ' ' + cote + ' : pivot ' + JSON.stringify(c) + ' mesuré ' + JSON.stringify({ x: m.cx, y: m.cy }));
    }
  }
});
test('poignées : aller-retour pivot -> réglages = identité (tous types déplaçables)', () => {
  for (const type of ['point_curseur', 'soutien_de_voute', 'dome_libre', 'voute_bord', 'coin_pronateur_posterieur', 'cimier']) for (const med of [-1, 1]) {
    const { el: e0, T } = el(type, { dx_mm: 7.3, dy_mm: 81.4 }), e = validerElement(e0), c = pivotPlan(e, T, rep, med), p = reglagesPourPivot(e, T, rep, med, c.x, c.y);
    for (const k of Object.keys(p)) assert.ok(proche(p[k], e[k], 0.051), type + ' ' + k + ' ' + p[k] + ' vs ' + e[k]);
  }
});
test('poignées : repère local <-> plan inverses, et le sens de rotation suit le miroir', () => {
  for (const med of [-1, 1]) for (const th of [0, 33, -120, 180]) { const w = localVersPlan(5, 9, th, med), l = planVersLocal(w.x, w.y, th, med); assert.ok(proche(l.a, 5, 1e-9) && proche(l.b, 9, 1e-9)); }
  const D = localVersPlan(0, 10, 30, -1), G = localVersPlan(0, 10, 30, 1);
  assert.ok(D.x < 0 && G.x > 0 && proche(D.y, G.y, 1e-9), 'θ > 0 : l\'avant va vers le médial (−X pour D, +X pour G)');
});
test('poignées : étirer une poignée garde le bord opposé fixe (élément tourné ou non, importé ou non)', () => {
  for (const type of ['soutien_de_voute', 'dome_libre']) for (const th of [0, 40]) for (const id of ['W+', 'W-', 'L+', 'L-']) for (const med of [-1, 1]) {
    const { el: e0, T } = el(type, { dx_mm: 5, dy_mm: 90, angle_plan_deg: th, largeur_mm: 40, longueur_mm: 50 }), e = validerElement(e0);
    const h = poigneesLocales(e, T).find((x) => x.id === id), c = pivotPlan(e, T, rep, med), w = localVersPlan(h.a, h.b, th, med);
    const cible = { x: c.x + w.x * 1.4, y: c.y + w.y * 1.4 }; // on tire 40 % plus loin
    const patch = glisserPoignee(e, T, rep, med, id, cible.x, cible.y), e2 = { ...e, ...patch }, c2 = pivotPlan(e2, T, rep, med);
    const opp = poigneesLocales(e, T).find((x) => x.id === { 'W+': 'W-', 'W-': 'W+', 'L+': 'L-', 'L-': 'L+' }[id]);
    const wo = localVersPlan(opp.a, opp.b, th, med), avant = { x: c.x + wo.x, y: c.y + wo.y };
    const hh = poigneesLocales(e2, T).find((x) => x.id === { 'W+': 'W-', 'W-': 'W+', 'L+': 'L-', 'L-': 'L+' }[id]), wo2 = localVersPlan(hh.a, hh.b, th, med);
    assert.ok(proche(c2.x + wo2.x, avant.x, 0.35) && proche(c2.y + wo2.y, avant.y, 0.35), type + ' ' + id + ' th' + th + ' med' + med + ' : bord opposé ' + JSON.stringify(avant) + ' -> ' + JSON.stringify({ x: c2.x + wo2.x, y: c2.y + wo2.y }));
    const dim = id[0] === 'W' ? 'largeur_mm' : 'longueur_mm';
    assert.ok(patch[dim] > e[dim] + 1, dim + ' agrandi');
  }
});
test('poignées : tailles bornées comme le noyau (jamais de valeur que validerElement refuse)', () => {
  for (const type of ['soutien_de_voute', 'dome_libre', 'voute_bord', 'coin_pronateur_posterieur', 'point_curseur']) {
    const { el: e0, T } = el(type, { dx_mm: 0, dy_mm: 90 }), e = validerElement(e0), c = pivotPlan(e, T, rep, -1);
    for (const f of [0, 0.01, 50]) for (const id of poigneesLocales(e, T).map((h) => h.id).filter((i) => i !== 'rot')) {
      const h = poigneesLocales(e, T).find((x) => x.id === id), w = localVersPlan(h.a, h.b, 0, -1);
      const p = glisserPoignee(e, T, rep, -1, id, c.x + w.x * f, c.y + w.y * f);
      assert.doesNotThrow(() => validerBrut({ ...e0, ...p }), type + ' ' + id + ' ×' + f + ' ' + JSON.stringify(p));
    }
  }
  assert.ok(bornesTaille(TYPES_ELEMENTS.dome_libre).largeur.max > bornesTaille(TYPES_ELEMENTS.dome_libre).largeur.min);
});
test('poignées : rotation par la poignée (aimantée à 15°, miroir, plage) ; rayon du point', () => {
  const { el: e0, T } = el('soutien_de_voute', { dx_mm: 0, dy_mm: 90 }), e = validerElement(e0), c = pivotPlan(e, T, rep, -1);
  assert.ok(glisserPoignee(e, T, rep, -1, 'rot', c.x, c.y + 30).angle_plan_deg === 0, 'droit devant : 0°');
  assert.ok(glisserPoignee(e, T, rep, -1, 'rot', c.x - 30, c.y + 30).angle_plan_deg === 45, 'D : vers -X = médial = +45°');
  assert.ok(glisserPoignee(e, T, rep, 1, 'rot', c.x + 30, c.y + 30).angle_plan_deg === 45, 'G : vers +X = médial = +45°');
  assert.ok(glisserPoignee(e, T, rep, -1, 'rot', c.x + 30, c.y + 30).angle_plan_deg === -45);
  assert.ok(glisserPoignee(e, T, rep, -1, 'rot', c.x - 30, c.y + 48.8).angle_plan_deg === 30, 'aimanté à 30° (31,6° visé)');
  assert.ok(glisserPoignee(e, T, rep, -1, 'rot', c.x - 30, c.y + 52).angle_plan_deg === 30 && glisserPoignee(e, T, rep, -1, 'rot', c.x - 30, c.y - 30).angle_plan_deg === 135);
  assert.ok(glisserPoignee(e, T, rep, -1, 'rot', c.x - 30, c.y + 47).angle_plan_deg === 33 || glisserPoignee(e, T, rep, -1, 'rot', c.x - 30, c.y + 47).angle_plan_deg === 32, 'hors aimantation : au degré');
  const { el: p0, T: Tp } = el('point_curseur', { dx_mm: 0, dy_mm: 90 }), p = validerElement(p0);
  const cp = pivotPlan(p, Tp, rep, -1);
  assert.ok(glisserPoignee(p, Tp, rep, -1, 'R', cp.x + 17.26, cp.y).rayon_mm === 17.3 && glisserPoignee(p, Tp, rep, -1, 'R', cp.x + 500, cp.y).rayon_mm === 60 && glisserPoignee(p, Tp, rep, -1, 'R', cp.x, cp.y).rayon_mm === 2);
  assert.ok(Object.keys(glisserPoignee(p, Tp, rep, -1, 'W+', 0, 0)).length === 0);
});
test('poignées : bord (longueur, extrémité opposée fixe, dy = milieu) et coin ancré (début fixe)', () => {
  const { el: e0, T } = el('voute_bord', { dy_mm: 100, longueur_mm: 60 }), e = validerElement(e0);
  assert.deepEqual(capacites(T, e).deplace, 'y');
  const p = glisserPoignee(e, T, rep, -1, 'L+', 0, 150); // extrémité avant tirée à y=150 ; arrière fixe à 70
  assert.ok(proche(p.longueur_mm, 80) && proche(p.dy_mm, 110), JSON.stringify(p));
  const q = glisserPoignee(e, T, rep, -1, 'L-', 0, 40); // arrière tirée à 40 ; avant fixe à 130
  assert.ok(proche(q.longueur_mm, 90) && proche(q.dy_mm, 85), JSON.stringify(q));
  assert.ok(reglagesPourPivot(e, T, rep, -1, 55, 123).dx_mm === undefined && proche(reglagesPourPivot(e, T, rep, -1, 55, 123).dy_mm, 123));
  const { el: c0, T: Tc } = el('coin_pronateur_posterieur', { dy_mm: 20, longueur_mm: 70 }), cc = validerElement(c0);
  assert.ok(capacites(Tc, cc).coinAncre && !capacites(Tc, cc).rotation && !capacites(Tc, cc).largeur);
  assert.ok(glisserPoignee(cc, Tc, rep, -1, 'L+', 0, 100).longueur_mm === 80);
  assert.ok(reglagesPourPivot(cc, Tc, rep, -1, 0, -50).dy_mm === 0, 'jamais avant le talon');
  assert.ok(poigneesLocales(cc, Tc).length === 1);
});
test('poignées : sélection au clic (contient), aire, contour, éléments sans poignée', () => {
  const { el: e0, T } = el('dome_libre', { dx_mm: 0, dy_mm: 60, largeur_mm: 40, longueur_mm: 60, angle_plan_deg: 90 }), e = validerElement(e0), c = pivotPlan(e, T, rep, -1);
  assert.ok(contient(e, T, rep, -1, c.x + 28, c.y) && !contient(e, T, rep, -1, c.x, c.y + 28), 'tourné de 90° : la longueur est devenue horizontale');
  assert.ok(!contient(validerElement(el('voute_bord').el), TYPES_ELEMENTS.voute_bord, rep, -1, 0, 109));
  assert.ok(aire(e, T) === 2400 && contourLocal(e, T).rect.length === 4 && contourLocal(validerElement(el('point_curseur').el), TYPES_ELEMENTS.point_curseur).cercle === 10);
  const r = capacites(TYPES_ELEMENTS.recouvrement, {}); assert.ok(r.deplace === '' && !r.rotation);
  assert.ok(poigneesLocales(validerElement(el('recouvrement').el), TYPES_ELEMENTS.recouvrement).length === 0);
  assert.ok(poigneesLocales(validerElement(el('soutien_de_voute').el), TYPES_ELEMENTS.soutien_de_voute).map((h) => h.id).join() === 'W+,W-,L+,L-,rot');
});

test('poignée d\'étendue des bords (verte, vers l\'autre bord du pied) : seulement pour un bord médial OU latéral seul', () => {
  for (const [type, attendu] of [['voute_bord', true], ['flange_mediale', true], ['arche_externe', true], ['aileron', true], ['cuvette_talonniere', false], ['dome_libre', false], ['point_curseur', false], ['coin_pronateur_posterieur', false]]) {
    const { el: e0, T } = el(type, { dy_mm: 100 }), e = validerElement(e0);
    assert.equal(poigneesLocales(e, T).some((h) => h.id === 'W+') && !!bordUnique(T) === true, attendu && true, type);
    if (T.bord) assert.equal(capacites(T, e).largeurBord, attendu, type + ' : capacité');
  }
});
test('poignée d\'étendue : largeur = distance du vrai bord au pointeur (vers l\'intérieur du pied), bord fixe, bornée, D et G, médial et latéral', () => {
  for (const type of ['voute_bord', 'arche_externe']) for (const med of [-1, 1]) {
    const { el: e0, T } = el(type, { dy_mm: 100 }), e = validerElement(e0), bornes = bornesTaille(T);
    const versBord = T.bords[0] === 'medial' ? med : -med, bordX = 25 * versBord; // bord du pied à 25 mm de l'axe
    const cible = (d) => bordX - versBord * d; // pointeur à d mm du bord, vers l'intérieur
    const patch = glisserPoignee(e, T, rep, med, 'W+', cible(30), 100, undefined, { bordX });
    assert.deepEqual(Object.keys(patch), ['largeur_mm'], type + ' : seule la largeur change (bord et milieu inchangés)');
    assert.ok(proche(patch.largeur_mm, 30), type + ' med ' + med + ' : ' + patch.largeur_mm);
    assert.ok(proche(glisserPoignee(e, T, rep, med, 'W+', cible(12.34), 100, undefined, { bordX }).largeur_mm, 12.3), 'arrondi au 1/10 mm');
    assert.equal(glisserPoignee(e, T, rep, med, 'W+', cible(5000), 100, undefined, { bordX }).largeur_mm, bornes.largeur.max, 'borne haute');
    assert.equal(glisserPoignee(e, T, rep, med, 'W+', cible(-40), 100, undefined, { bordX }).largeur_mm, bornes.largeur.min, 'pointeur de l\'autre côté du bord : borne basse');
    assert.doesNotThrow(() => validerBrut({ ...e0, ...patch }));
    assert.deepEqual(glisserPoignee(e, T, rep, med, 'W+', cible(30), 100), {}, 'sans bord mesuré : rien');
  }
});
test('poignée d\'étendue : la couche calculée suit la largeur (zone plus étendue vers le bord externe)', () => {
  const b = plaque(), pas = 0.5;
  const large = (w) => { const r = calc([{ type: 'voute_bord', dy_mm: 100, largeur_mm: w, longueur_mm: 60, hauteur_mm: 4 }], 'D', b); let x1 = -1e9; for (let i = 0; i < b.nx; i++) if (r.haut[Math.round(100 / pas) * b.nx + i] - 2 > 0.05) x1 = Math.max(x1, b.ox + i * pas); return x1; };
  assert.ok(large(40) > large(20) + 10, 'plus large = va plus loin vers l\'intérieur du pied');
});
