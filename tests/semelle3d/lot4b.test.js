import test from 'node:test';
import assert from 'node:assert/strict';
import { validerElement as validerBrut, appliquerElements as appliquerBrut, reperTalon } from '../../js/semelle3d/calcul/elements.js';
import { historiqueNeuf, valider, annuler, retablir, courant, peutAnnuler, peutRetablir, remplacerCourant } from '../../js/semelle3d/calcul/historique.js';
import { planVide, ajouterElement, detacher, derogerBase, retirerElement, normaliserPlan } from '../../js/semelle3d/calcul/plan.js';

function plaque({ x0 = -60, x1 = 60, y1 = 200, h = 2 } = {}) {
  const nx = Math.round((x1 - x0) / 0.5) + 1, ny = Math.round(y1 / 0.5) + 1;
  return { nx, ny, pas: 0.5, ox: x0, oy: 0, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } }; // le sabotage ne reconnaît que les AssertionError
const T = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) { if (e.origine) return e.origine; throw e; } return e; } };
const validerElement = (...a) => garde(() => validerBrut(...a));
const appliquerElements = (...a) => garde(() => appliquerBrut(...a));
const calc = (els, cote = 'D', base = plaque()) => appliquerElements(base, els, { cote, cat: { liste: [], parId: new Map() } });
const idx = (b, x, y) => Math.round((y - b.oy) / b.pas) * b.nx + Math.round((x - b.ox) / b.pas);
const z = (b, r, x, y) => r.haut[idx(b, x, y)] - b.haut[idx(b, x, y)];
const pt = (extra = {}) => ({ type: 'point_curseur', dx_mm: 0, dy_mm: 100, hauteur_mm: 2, rayon_mm: 10, ...extra });
const etendue = (b, r) => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) if (r.haut[j * b.nx + i] - 2 > 0.05) { x0 = Math.min(x0, i * 0.5); x1 = Math.max(x1, i * 0.5); y0 = Math.min(y0, j * 0.5); y1 = Math.max(y1, j * 0.5); } return { w: x1 - x0, l: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; };

test('point curseur : sommet = hauteur au 1/10 mm, mi-rayon = moitié, nul au rayon, symétrique, rien hors du rayon', () => {
  const b = plaque(), r = calc([pt({ hauteur_mm: 2.34 })], 'D', b);
  assert.ok(Math.abs(z(b, r, 0, 100) - 2.3) < 1e-6, 'arrondi au 1/10 mm : 2,34 -> 2,3');
  assert.ok(Math.abs(z(b, r, 5, 100) - 1.15) < 1e-5, 'mi-rayon = moitié (cosinus surélevé)');
  assert.ok(Math.abs(z(b, r, 0, 105) - z(b, r, 5, 100)) < 1e-6, 'symétrie de révolution');
  assert.ok(z(b, r, 10.5, 100) === 0 && z(b, r, 0, 111) === 0);
  assert.ok(r.infos[0].rayon_mm === 10);
});
test('point curseur : un creux descend, ne perce jamais et s\'arrête à 0,9 mm de reste', () => {
  const b = plaque({ h: 2 }), r = calc([pt({ hauteur_mm: -1 })], 'D', b);
  assert.ok(Math.abs(z(b, r, 0, 100) + 1) < 1e-6);
  const r2 = calc([pt({ hauteur_mm: -8 })], 'D', b);
  assert.ok(Math.abs(r2.haut[idx(b, 0, 100)] - 0.9) < 1e-6, 'plancher : 0,9 mm de reste');
  for (let k = 0; k < r2.haut.length; k++) assert.ok(Number.isFinite(r2.haut[k]), 'aucun trou');
  assert.match(r2.infos[0].avertissements.join(' '), /creux limité/);
  assert.ok(r2.infos[0].perce === null);
});
test('point curseur : valeurs refusées (0, hors plage, rayon) et nombres exacts', () => {
  assert.ok(validerElement(pt({ hauteur_mm: 0 })).hauteur_mm === 0, 'point à 0 : poignée posée sur la surface, accepté');
  assert.ok(validerElement(pt({ hauteur_mm: 0.04 })).hauteur_mm === 0, 'arrondi à 0,0');
  assert.ok(T(() => validerElement(pt({ hauteur_mm: 9 }))) instanceof RangeError);
  assert.ok(T(() => validerElement(pt({ rayon_mm: 1 }))) instanceof RangeError);
  assert.ok(T(() => validerElement(pt({ rayon_mm: 61 }))) instanceof RangeError);
  assert.ok(T(() => validerElement(pt({ hauteur_mm: NaN }))) instanceof TypeError);
  const v = validerElement(pt({ rayon_mm: 7.26 }));
  assert.ok(v.rayon_mm === 7.3 && Math.abs(v.largeur_mm - 14.6) < 1e-9);
});
test('point curseur : miroir D / G (dx vers le médial) et hors contour refusé', () => {
  const b = plaque(), D = calc([pt({ dx_mm: 15 })], 'D', b), G = calc([pt({ dx_mm: 15 })], 'G', b);
  assert.ok(Math.abs(z(b, D, -15, 100) - 2) < 1e-6 && z(b, D, 15, 100) === 0, 'pied D : médial = -X');
  assert.ok(Math.abs(z(b, G, 15, 100) - 2) < 1e-6 && z(b, G, -15, 100) === 0, 'pied G : médial = +X');
  assert.ok(T(() => calc([pt({ dx_mm: 300 })])) instanceof RangeError, 'entièrement hors du contour');
});
test('point curseur à 0 : aucun effet sur la surface, jamais « hors contour » ; la rangée de points monte/descend la semelle localement', () => {
  const b = plaque(), r = calc([pt({ hauteur_mm: 0 })], 'D', b);
  assert.ok(r.haut.every((v, k) => v === b.haut[k]), 'surface inchangée');
  const rang = [60, 90, 120, 150].map((y, k) => pt({ dy_mm: y, rayon_mm: 20, hauteur_mm: [0, 1.5, -1, 0][k] })), q = calc(rang, 'D', b);
  assert.ok(Math.abs(z(b, q, 0, 90) - 1.5) < 1e-6 && Math.abs(z(b, q, 0, 120) + 1) < 1e-6, 'sous chaque point : sa hauteur');
  assert.ok(z(b, q, 0, 105) > -1 && z(b, q, 0, 105) < 1.5, 'entre deux points : transition douce');
});
test('point curseur : plusieurs points s\'additionnent, un point caché ne compte pas', () => {
  const b = plaque(), r = calc([pt({ dy_mm: 100 }), pt({ dy_mm: 104 }), pt({ dy_mm: 150, visible: false })], 'D', b);
  assert.ok(z(b, r, 0, 102) > 2 * 1.5, 'recouvrement de deux points');
  assert.ok(z(b, r, 0, 150) === 0);
  const cache = calc([pt({ hauteur_mm: 2, visible: false })], 'D', b);
  assert.ok(cache.haut.every((v, k) => v === b.haut[k]), 'un point caché ne change rien (même à hauteur non nulle)');
});

test('rotation : 0° = pas de rotation ; 90° échange largeur et longueur ; la hauteur maximale ne change pas', () => {
  const el = { type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, largeur_mm: 30, longueur_mm: 90, hauteur_mm: 5 };
  const b = plaque(), a = calc([el], 'D', b), a0 = calc([{ ...el, angle_plan_deg: 0 }], 'D', b), c = calc([{ ...el, angle_plan_deg: 90 }], 'D', b);
  assert.ok(a.haut.every((v, k) => v === a0.haut[k]));
  const A = etendue(b, a), C = etendue(b, c);
  assert.ok(Math.abs(A.w - C.l) < 3 && Math.abs(A.l - C.w) < 3, JSON.stringify({ A, C }));
  assert.ok(Math.abs(Math.max(...a.haut) - Math.max(...c.haut)) < 0.05);
  assert.ok(c.infos[0].angle_plan_deg === 90);
});
test('rotation : le miroir est automatique (G = image de D dans X) et le sens + penche l\'avant vers le médial', () => {
  const el = { type: 'soutien_de_voute', dx_mm: 0, dy_mm: 100, largeur_mm: 24, longueur_mm: 80, hauteur_mm: 5, angle_plan_deg: 30 };
  const b = plaque(), D = calc([el], 'D', b), G = calc([el], 'G', b);
  for (let j = 0; j < b.ny; j += 7) for (let i = 0; i < b.nx; i += 3) assert.ok(Math.abs(D.haut[j * b.nx + i] - G.haut[j * b.nx + (b.nx - 1 - i)]) < 1e-5);
  const moy = (r, y) => { let s = 0, m = 0; for (let i = 0; i < b.nx; i++) { const v = r.haut[Math.round(y / 0.5) * b.nx + i] - 2; if (v > 0.2) { s += v * (b.ox + i * 0.5); m += v; } } return s / m; };
  assert.ok(moy(D, 118) < moy(D, 82) - 4, 'pied D : l\'avant est plus médial (-X) que l\'arrière');
  assert.ok(moy(G, 118) > moy(G, 82) + 4, 'pied G : l\'avant est plus médial (+X) que l\'arrière');
});
test('rotation : un élément importé tourne autour de son centre (l\'emprise reste centrée)', () => {
  const imp = { type: 'dome_libre', dx_mm: 0, dy_mm: 60, largeur_mm: 40, longueur_mm: 60 };
  const b = plaque(), r0 = calc([imp], 'D', b), r1 = calc([{ ...imp, angle_plan_deg: 90 }], 'D', b);
  const A = etendue(b, r0), C = etendue(b, r1);
  assert.ok(Math.abs(A.cx - C.cx) < 3 && Math.abs(A.cy - C.cy) < 3, JSON.stringify({ A, C }));
  assert.ok(Math.abs(A.w - C.l) < 6 && Math.abs(A.l - C.w) < 6, JSON.stringify({ A, C }));
  assert.ok(Math.abs(Math.max(...r0.haut) - Math.max(...r1.haut)) < 0.1);
});
test('rotation : hors plage refusée ; bords, coins et recouvrement gardent 0°', () => {
  assert.ok(T(() => validerElement({ type: 'soutien_de_voute', angle_plan_deg: 181 })) instanceof RangeError);
  assert.ok(validerElement({ type: 'voute_bord', angle_plan_deg: 40 }).angle_plan_deg === 0);
  assert.ok(validerElement({ type: 'coin_pronateur_posterieur', angle_plan_deg: 40 }).angle_plan_deg === 0);
  assert.ok(validerElement({ type: 'coin_supinateur_anterieur', angle_plan_deg: 40 }).angle_plan_deg === 0);
  assert.ok(validerElement({ type: 'recouvrement', angle_plan_deg: 40 }).angle_plan_deg === 0);
  assert.ok(validerElement({ type: 'soutien_de_voute', angle_plan_deg: -45 }).angle_plan_deg === -45);
  assert.ok(validerElement({ type: 'point_curseur', angle_plan_deg: 20 }).angle_plan_deg === 20, 'sans effet sur un rond, mais accepté');
});
test('repère talon : toujours donné dans le rapport (même sans élément)', () => {
  const b = plaque(), r0 = calc([], 'D', b), r1 = calc([pt()], 'D', b);
  assert.ok(JSON.stringify(r0.rapport_elements.repere_talon) === JSON.stringify(reperTalon(b)));
  assert.ok(JSON.stringify(r1.rapport_elements.repere_talon) === JSON.stringify(reperTalon(b)));
});

test('historique : annuler / rétablir, pas identique ignoré, rétablir perdu après un nouveau pas, limite de pas', () => {
  let h = historiqueNeuf({ n: 0 }, 3);
  assert.ok(!peutAnnuler(h) && !peutRetablir(h));
  h = valider(h, { n: 1 }); h = valider(h, { n: 1 }); assert.ok(h.pile.length === 2, 'doublon ignoré');
  h = valider(h, { n: 2 });
  h = annuler(h); assert.deepEqual(courant(h), { n: 1 }); assert.ok(peutRetablir(h));
  h = retablir(h); assert.deepEqual(courant(h), { n: 2 });
  h = annuler(annuler(annuler(h))); assert.deepEqual(courant(h), { n: 0 }); assert.ok(!peutAnnuler(h));
  h = retablir(h); h = valider(h, { n: 9 }); assert.ok(!peutRetablir(h), 'nouveau pas : rétablir vidé'); assert.deepEqual(courant(annuler(h)), { n: 1 });
  let g = historiqueNeuf({ n: 0 }, 3); for (let k = 1; k <= 6; k++) g = valider(g, { n: k });
  assert.ok(g.pile.length === 3); assert.deepEqual(courant(g), { n: 6 }); g = annuler(annuler(g)); assert.deepEqual(courant(g), { n: 4 }); assert.ok(!peutAnnuler(g), 'les plus anciens sont oubliés');
  assert.ok(T(() => historiqueNeuf({}, 0)) instanceof RangeError);
  const k = historiqueNeuf({ a: 1 }), k2 = valider(k, { a: 2 }); assert.deepEqual(courant(k), { a: 1 }, 'immuable');
  assert.deepEqual(courant(remplacerCourant(k2, { a: 3 })), { a: 3 }); assert.ok(remplacerCourant(k2, { a: 3 }).pile.length === 2);
});
test('historique : un plan complet (portées, dérogation, détachement, points) revient à l\'identique', () => {
  let p = planVide(); const pas = [];
  const note = () => pas.push(JSON.parse(JSON.stringify(p)));
  note();
  p = ajouterElement(p, pt({ dy_mm: 60 }), 'commun'); note();
  p = ajouterElement(p, pt({ dy_mm: 90, hauteur_mm: -1 }), 'D'); note();
  p = derogerBase(p, 'G', { epaisseur_mm: 4 }); note();
  p = detacher(p, 'u1'); note();
  p = retirerElement(p, 'u1D'); note();
  let h = historiqueNeuf(pas[0]); for (let k = 1; k < pas.length; k++) h = valider(h, pas[k]);
  for (let k = pas.length - 1; k >= 0; k--) { assert.deepEqual(courant(h), pas[k]); assert.deepEqual(normaliserPlan(courant(h)), normaliserPlan(pas[k])); h = annuler(h); }
  for (let k = 0; k < pas.length; k++) { assert.deepEqual(courant(h), pas[k]); h = retablir(h); }
});
