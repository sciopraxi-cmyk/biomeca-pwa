// Lot 4 bis, étape 1 : noyau de l'axe de Henke (script du praticien + réponses du 03/11).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../../js/semelle3d/calcul/axe-henke.js';
import { HENKE } from '../../js/semelle3d/constantes.js';
import { normaliserPlan, planVide, ajouterElement } from '../../js/semelle3d/calcul/plan.js';
import { reperTalon } from '../../js/semelle3d/calcul/elements.js';
import { maillerBase } from '../../js/semelle3d/calcul/maillage_base.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';

const axe = { inclinaison_deg: 42, deviation_deg: 16, p0: { x: -8, y: 13 } };
const grille = { x0: -50, y0: 0, pas: 1, nx: 101, ny: 266 };
const N = grille.nx * grille.ny;
const H = new Float32Array(N).fill(3);
const masque = new Uint8Array(N).fill(1);
const idx = (x, y) => (y - grille.y0) * grille.nx + (x - grille.x0);
const RAD = Math.PI / 180;
const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } };

// ---------------- tests du script du praticien
test('distance signée : positive côté médial, nulle sur l\'axe', () => {
  assert.ok(A.coordonneesAxe({ x: 30, y: 13 }, axe).d > 0);
  assert.ok(A.coordonneesAxe({ x: -40, y: 13 }, axe).d < 0);
  const { a } = A.vecteursAxe(axe), sur = { x: axe.p0.x + 50 * a.x, y: axe.p0.y + 50 * a.y };
  assert.ok(Math.abs(A.coordonneesAxe(sur, axe).d) < 1e-9);
});
test('torsion nulle si phi = 0', () => {
  const out = garde(() => A.torsion(H, masque, grille, axe, { phi_deg: 0 }));
  for (let i = 0; i < N; i++) assert.equal(out[i], H[i]);
});
test('supination relève le côté médial, pronation le côté latéral', () => {
  const sup = garde(() => A.torsion(H, masque, grille, axe, { phi_deg: 5 }));
  assert.ok(sup[idx(40, 40)] > sup[idx(-40, 40)]);
  const pro = garde(() => A.torsion(H, masque, grille, axe, { phi_deg: -5 }));
  assert.ok(pro[idx(-40, 40)] > pro[idx(40, 40)]);
});
test('pente frontale = tan(phi) · cos(lambda) · cos(delta) le long de X', () => {
  const out = garde(() => A.torsion(H, masque, grille, axe, { phi_deg: 5 })), pente = (out[idx(30, 60)] - out[idx(-30, 60)]) / 60;
  const att = Math.tan(5 * RAD) * Math.cos(42 * RAD) * Math.cos(16 * RAD);
  assert.ok(Math.abs(pente - att) < 1e-4, pente + ' vs ' + att);
});
test('mode ajout : jamais de matière retirée', () => {
  for (const phi of [-8, -3, 3, 8]) {
    const out = garde(() => A.torsion(H, masque, grille, axe, { phi_deg: phi, zone: 'arriere', sCharniere: 80, largeurTransition: 30 }));
    for (let i = 0; i < N; i++) assert.ok(out[i] >= H[i] - 1e-5);
  }
});
test('zone arrière-pied : sans effet loin devant la charnière', () => {
  const out = garde(() => A.torsion(H, masque, grille, axe, { phi_deg: 6, zone: 'arriere', sCharniere: 80, largeurTransition: 30 }));
  assert.ok(Math.abs(out[idx(40, 250)] - 3) < 1e-6);
  assert.ok(out[idx(30, 20)] > 3);
});
test('entrée jamais modifiée', () => {
  const copie = new Float32Array(H); garde(() => A.torsion(H, masque, grille, axe, { phi_deg: 7 }));
  assert.deepEqual(H, copie);
});
test('palpation : deux points donnent la déviation, source « palpation », non validée', () => {
  const r = A.axeDepuisPalpation({ x: -8, y: 13 }, { x: -8 + Math.tan(20 * RAD) * 100, y: 113 });
  assert.ok(Math.abs(r.deviation_deg - 20) < 1e-9); assert.equal(r.source, 'palpation'); assert.equal(r.valide, false);
  assert.throws(() => A.axeDepuisPalpation({ x: 0, y: 50 }, { x: 0, y: 40 }));
});
test('Rodrigues : point sur l\'axe immobile ; supination relève le médial', () => {
  const { u } = A.vecteursAxe(axe), p = { x: axe.p0.x + 40 * u.x, y: axe.p0.y + 40 * u.y, z: 40 * u.z }, q = A.rotationAutourAxe(p, axe, 10);
  assert.ok(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 1e-9);
  assert.ok(A.rotationAutourAxe({ x: 30, y: 40, z: 0 }, axe, 5).z > 0 && A.rotationAutourAxe({ x: -40, y: 40, z: 0 }, axe, 5).z < 0);
});

// ---------------- réponse 1 : axe par défaut défini par 2 repères, déviation calculée
const L = 262, W = 100;
test('axe par défaut : p0 à 7 mm latéral et 5 % de la longueur ; point antérieur = milieu M1-M2 ; déviation calculée ; source défaut, non validé', () => {
  const t = A.tetesParDefaut(L, W), a = A.axeParDefaut(L, t);
  assert.deepEqual(a.p0, { x: -7, y: 0.05 * L });
  assert.deepEqual(a.p1, { x: (t.m1.x + t.m2.x) / 2, y: (t.m1.y + t.m2.y) / 2 });
  assert.ok(Math.abs(a.deviation_deg - Math.atan2(a.p1.x - a.p0.x, a.p1.y - a.p0.y) / RAD) < 1e-9);
  assert.equal(a.source, 'defaut'); assert.equal(a.valide, false); assert.equal(a.inclinaison_deg, 42);
  assert.ok(Math.abs(A.xCroisement(a, t.m1.y) - a.p1.x) < 1e-9, 'la projection de l\'axe passe par le point antérieur');
  assert.equal(A.alertesAxe(a).length, 0, 'déviation de départ dans 4-47°');
  assert.equal(A.categorieAxe(a, t).categorie, 'normal');
});
test('alerte de déviation hors 4-47° (et inclinaison hors 20-70°)', () => {
  assert.equal(A.alertesAxe({ inclinaison_deg: 42, deviation_deg: 3.9 }).length, 1);
  assert.equal(A.alertesAxe({ inclinaison_deg: 42, deviation_deg: 47.1 }).length, 1);
  assert.equal(A.alertesAxe({ inclinaison_deg: 42, deviation_deg: 4 }).length, 0);
  assert.equal(A.alertesAxe({ inclinaison_deg: 42, deviation_deg: 47 }).length, 0);
  assert.equal(A.alertesAxe({ inclinaison_deg: 19, deviation_deg: 16 }).length, 1);
});
test('têtes : ordre M1 > M2 > M3 exigé', () => {
  const t = A.tetesParDefaut(L, W);
  assert.throws(() => A.categorieAxe(axe, { ...t, m2: { ...t.m2, x: t.m1.x + 1 } }), RangeError);
  assert.throws(() => A.categorieAxe(axe, { m1: t.m1, m2: t.m2 }), TypeError);
});

// ---------------- réponse 2 : catégories aux frontières (le croisement est réglé en déplaçant p0 : x_croisement = p0.x quand a est vertical)
const T = { m1: { x: 40, y: 180, rayon_mm: 8 }, m2: { x: 22, y: 180 }, m3: { x: 4, y: 180 } };
const axeEn = (xc) => ({ inclinaison_deg: 42, deviation_deg: 0, p0: { x: xc, y: 20 } }); // deviation 0 : la projection croise la ligne à x = p0.x
const cat = (xc) => A.categorieAxe(axeEn(xc), T);
test('catégories : les 5 zones (au milieu de chacune, jamais « limite »)', () => {
  const att = [[60, 'tres_medialise'], [44, 'medialise'], [31, 'normal'], [13, 'lateralise'], [-20, 'tres_lateralise']];
  for (const [x, c] of att) { const r = cat(x); assert.equal(r.categorie, c, x + ' -> ' + r.categorie); assert.equal(r.limite, false, x + ' limite'); }
});
test('catégories : 4 frontières, à ± 2 mm la catégorie change (> 2 mm) et « limite » apparaît sous 2 mm', () => {
  const S = [[48, 'tres_medialise', 'medialise'], [40, 'medialise', 'normal'], [22, 'normal', 'lateralise'], [4, 'lateralise', 'tres_lateralise']]; // [seuil, au-dessus (médial), au-dessous]
  for (const [s, haut, bas] of S) {
    assert.equal(cat(s + 2.5).categorie, haut); assert.equal(cat(s + 2.5).limite, false, 'à +2,5 mm : pas limite');
    assert.equal(cat(s - 2.5).categorie, bas); assert.equal(cat(s - 2.5).limite, false, 'à -2,5 mm : pas limite');
    assert.equal(cat(s + 1.9).limite, true, 'à +1,9 mm : limite'); assert.equal(cat(s + 1.9).categorie, haut, 'la catégorie ne bascule pas');
    assert.equal(cat(s - 1.9).limite, true, 'à -1,9 mm : limite'); assert.equal(cat(s - 1.9).categorie, bas);
    assert.equal(cat(s + 2.0).limite, false, 'exactement 2 mm : pas « moins de 2 mm »');
    assert.ok(cat(s + 1).seuil_proche, 'le seuil proche est nommé');
  }
});
test('catégories : la ligne des têtes est la MOYENNE des 3 centres (têtes à des ordonnées différentes)', () => {
  const T2 = { m1: { x: 40, y: 160, rayon_mm: 8 }, m2: { x: 22, y: 180 }, m3: { x: 4, y: 200 } }; // moyenne 180
  const a = { inclinaison_deg: 42, deviation_deg: 20, p0: { x: 0, y: 20 } };
  assert.equal(A.yTetes(T2), 180);
  assert.ok(Math.abs(A.categorieAxe(a, T2).x_croisement_mm - A.xCroisement(a, 180)) < 1e-9);
});
test('catégories : la limite se lit sur le seuil le plus proche (les seuils sont dans constantes.js)', () => {
  assert.equal(HENKE.limite_mm, 2); assert.deepEqual([...HENKE.categories], ['tres_medialise', 'medialise', 'normal', 'lateralise', 'tres_lateralise']);
  assert.equal(cat(48.5).seuil_proche, 'bord médial de M1'); assert.equal(cat(39).seuil_proche, 'centre de M1');
});

// ---------------- réponse 3 : phi
test('phi : 0 par défaut, pas 0,5°, orange > 6°, rouge + confirmation > 10°, blocage > 15°', () => {
  assert.equal(HENKE.phi.defaut_deg, 0); assert.equal(HENKE.phi.pas_deg, 0.5);
  const n = (p) => A.controlerPhi(p).niveau;
  assert.equal(n(0), 'ok'); assert.equal(n(6), 'ok'); assert.equal(n(6.5), 'orange'); assert.equal(n(-6.5), 'orange');
  assert.equal(n(10), 'orange'); assert.equal(n(10.5), 'rouge'); assert.equal(A.controlerPhi(10.5).confirmation, true); assert.equal(A.controlerPhi(8).confirmation, false);
  assert.equal(n(15), 'rouge'); assert.equal(n(15.5), 'bloque'); assert.equal(n(-15.5), 'bloque'); assert.equal(A.controlerPhi(-16).bloque, true);
  assert.equal(A.controlerPhi(2.5).multiple_du_pas, true); assert.equal(A.controlerPhi(2.3).multiple_du_pas, false);
});
test('phi : au-delà de 15° la torsion est REFUSÉE ; 15° passe', () => {
  assert.throws(() => A.torsion(H, masque, grille, axe, { phi_deg: 15.5 }), RangeError);
  assert.throws(() => A.torsion(H, masque, grille, axe, { phi_deg: -16 }), RangeError);
  assert.doesNotThrow(() => A.torsion(H, masque, grille, axe, { phi_deg: 15 }));
  assert.throws(() => A.torsion(H, masque, grille, axe, { phi_deg: NaN }), TypeError);
});
test('torsion : mode charnière sur l\'axe refusé (non décidé) ; transition < 10 mm refusée', () => {
  assert.throws(() => A.torsion(H, masque, grille, axe, { phi_deg: 3, mode: 'charniere_sur_axe' }), RangeError);
  assert.throws(() => A.torsion(H, masque, grille, axe, { phi_deg: 3, zone: 'arriere', largeurTransition: 9 }), RangeError);
});
test('angle frontal = atan(tan(phi)·cos λ·cos δ) : 5° -> ≈ 3,7° ; dans la torsion mesurée à ± 0,2°', () => {
  assert.ok(Math.abs(A.angleFrontal(5, axe) - 3.7) < 0.15, String(A.angleFrontal(5, axe)));
  assert.equal(A.angleFrontal(0, axe), 0); assert.ok(A.angleFrontal(-5, axe) < 0);
  for (const phi of [2, 5, 10]) {
    const out = A.torsion(H, masque, grille, axe, { phi_deg: phi }), pente = (out[idx(30, 60)] - out[idx(-30, 60)]) / 60;
    assert.ok(Math.abs(Math.atan(pente) / RAD - A.angleFrontal(phi, axe)) < 0.2, 'phi ' + phi);
  }
});

// ---------------- réponse 4 : skives (suggestions)
test('skive : axe normal -> aucune suggestion', () => { assert.equal(A.suggererSkive('normal', { age_ans: 30 }), null); assert.equal(A.suggererSkive('normal', {}), null); });
test('skive : profondeurs adulte / enfant selon l\'âge (enfant = moins de 12 ans)', () => {
  const p = (c, age) => A.suggererSkive(c, { age_ans: age }).profondeur_mm;
  assert.equal(p('medialise', 30), 2); assert.equal(p('medialise', 8), 4); assert.equal(p('tres_medialise', 30), 4); assert.equal(p('tres_medialise', 8), 6);
  assert.equal(p('lateralise', 40), 2); assert.equal(p('lateralise', 5), 4); assert.equal(p('tres_lateralise', 40), 4); assert.equal(p('tres_lateralise', 5), 6);
  assert.equal(p('medialise', 11), 4); assert.equal(p('medialise', 11.99), 4); assert.equal(p('medialise', 12), 2, '12 ans = adulte'); assert.equal(p('medialise', 0), 4);
  const inc = A.suggererSkive('medialise', {}); assert.equal(inc.profondeur_mm, 2); assert.equal(inc.age_inconnu, true); assert.equal(inc.enfant, false);
});
test('skive : type médial / latéral (+ coin valgisant), angle 15°, suggestion jamais appliquée', () => {
  const m = A.suggererSkive('medialise', { age_ans: 30 }), l = A.suggererSkive('lateralise', { age_ans: 30 });
  assert.equal(m.type, 'skive_medial'); assert.equal(m.alternative, null); assert.equal(A.suggererSkive('tres_medialise', { age_ans: 30 }).type, 'skive_medial');
  assert.equal(l.type, 'skive_lateral'); assert.equal(l.alternative, 'coin_valgisant'); assert.equal(A.suggererSkive('tres_lateralise', { age_ans: 30 }).type, 'skive_lateral');
  assert.equal(m.angle_deg, 15); assert.equal(m.suggestion, true); assert.equal(m.appliquee, false);
  assert.throws(() => A.suggererSkive('bizarre', {}), RangeError);
});
test('skive : réglages 10–25° et 2–6 mm', () => {
  assert.deepEqual(A.validerSkive({ angle_deg: 10, profondeur_mm: 2 }), { angle_deg: 10, profondeur_mm: 2 });
  assert.doesNotThrow(() => A.validerSkive({ angle_deg: 25, profondeur_mm: 6 }));
  for (const bad of [{ angle_deg: 9.9, profondeur_mm: 3 }, { angle_deg: 25.1, profondeur_mm: 3 }, { angle_deg: 15, profondeur_mm: 1.9 }, { angle_deg: 15, profondeur_mm: 6.1 }]) assert.throws(() => A.validerSkive(bad), RangeError);
});

// ---------------- adaptation au repère du prototype (D : médial = x négatif)
function plaque({ x0 = -60, x1 = 60, y1 = 200, h = 3 } = {}) {
  const nx = Math.round((x1 - x0) / 0.5) + 1, ny = Math.round(y1 / 0.5) + 1;
  return { nx, ny, pas: 0.5, ox: x0, oy: 0, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const AX = { inclinaison_deg: 42, deviation_deg: 16, p0: { x: -7, y: 10 } };
test('repère : versHenke/depuisHenke sont inverses ; le médial est positif pour D comme pour G', () => {
  const rep = { x_mm: 3, y_mm: 7 };
  for (const c of ['D', 'G']) for (const p of [{ x: -20, y: 50 }, { x: 31, y: 0 }]) { const q = A.depuisHenke(A.versHenke(p, rep, c), rep, c); assert.ok(Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9); }
  assert.ok(A.versHenke({ x: rep.x_mm - 20, y: 50 }, rep, 'D').x > 0, 'D : x négatif = médial');
  assert.ok(A.versHenke({ x: rep.x_mm + 20, y: 50 }, rep, 'G').x > 0, 'G : x positif = médial');
  assert.throws(() => A.versHenke({ x: 0, y: 0 }, rep, 'X'), TypeError);
});
test('couche de torsion : le côté MÉDIAL est relevé en supination, pour D et pour G ; les deux pieds sont en miroir exact', () => {
  const b = plaque(), rep = reperTalon(b), D = A.coucheTorsion(b, AX, { phi_deg: 5 }, 'D'), G = A.coucheTorsion(b, AX, { phi_deg: 5 }, 'G');
  const i = (x, y) => Math.round(y / 0.5) * b.nx + Math.round((x - b.ox) / 0.5);
  assert.ok(D.z[i(rep.x_mm - 40, 100)] > D.z[i(rep.x_mm + 40, 100)], 'D : médial (x < talon) plus haut');
  assert.ok(G.z[i(rep.x_mm + 40, 100)] > G.z[i(rep.x_mm - 40, 100)], 'G : médial (x > talon) plus haut');
  for (let j = 0; j < b.ny; j += 7) for (let c = 0; c < b.nx; c += 5) { const cm = Math.round((2 * rep.x_mm - 2 * b.ox) / 0.5) - c; if (cm < 0 || cm >= b.nx) continue; assert.ok(Math.abs(D.z[j * b.nx + c] - G.z[j * b.nx + cm]) < 1e-5, 'miroir D/G'); }
});
test('couche de torsion : jamais négative ; annulée (haut − couche) redonne la base ; hors contour inchangé ; base non modifiée', () => {
  const b = plaque(); for (let k = 0; k < 400; k++) b.haut[k] = NaN; const copie = Float32Array.from(b.haut);
  const r = A.coucheTorsion(b, AX, { phi_deg: -6, zone: 'avant', sCharniere: 90, largeurTransition: 30 }, 'D');
  for (let k = 0; k < r.z.length; k++) { assert.ok(r.z[k] >= -1e-6); if (Number.isFinite(copie[k])) assert.ok(Math.abs(r.haut[k] - r.z[k] - copie[k]) < 1e-5); else { assert.ok(Number.isNaN(r.haut[k])); assert.equal(r.z[k], 0); } }
  assert.deepEqual(b.haut, copie); assert.ok(r.z.some((v) => v > 0.1));
});
test('STL après torsion : maillage fermé, 0 dégénéré, volume > 0 (D et G)', () => {
  for (const c of ['D', 'G']) {
    const b = plaque(), r = A.coucheTorsion(b, AX, { phi_deg: 10 }, c), v = verifierMaillage(maillerBase({ ...b, haut: r.haut }));
    assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, c + ' ' + JSON.stringify(v));
    assert.ok(v.volume > verifierMaillage(maillerBase(b)).volume, 'de la matière a été ajoutée');
  }
});
test('angle frontal mesuré sur la couche du prototype = angle annoncé à ± 0,2° (D et G)', () => {
  for (const c of ['D', 'G']) {
    const b = plaque(), rep = reperTalon(b), r = A.coucheTorsion(b, AX, { phi_deg: 5 }, c), j = Math.round(100 / 0.5), med = c === 'D' ? -1 : 1;
    const i = (dx) => j * b.nx + Math.round((rep.x_mm + dx - b.ox) / 0.5);
    const pente = (r.haut[i(med * 30)] - r.haut[i(-med * 30)]) / 60; // médial - latéral
    assert.ok(Math.abs(Math.atan(pente) / RAD - A.angleFrontal(5, AX)) < 0.2, c);
  }
});

// ---------------- plan JSON
test('plan : axe_henke par pied sérialisé et relu à l\'identique ; absent = absent ; source inconnue refusée', () => {
  const a = { ...A.axeParDefaut(L, A.tetesParDefaut(L, W)), valide: true };
  let p = ajouterElement({ ...planVide(), axe_henke: { D: a, G: { ...a, source: 'palpation' } } }, { type: 'point_curseur', dx_mm: 0, dy_mm: 50, hauteur_mm: 1, rayon_mm: 10 });
  const n = normaliserPlan(p), relu = normaliserPlan(JSON.parse(JSON.stringify(n)));
  assert.ok(n.axe_henke && n.axe_henke.D && n.axe_henke.G, 'axe conservé par la normalisation');
  assert.deepEqual(relu, n); assert.equal(relu.axe_henke.D.valide, true); assert.equal(relu.axe_henke.G.source, 'palpation');
  assert.equal(normaliserPlan(planVide()).axe_henke, undefined);
  const suite = normaliserPlan(ajouterElement(n, { type: 'point_curseur', dx_mm: 0, dy_mm: 60, hauteur_mm: 1, rayon_mm: 10 })); assert.ok(suite.axe_henke, 'axe conservé'); assert.equal(suite.axe_henke.D.p0.x, -7, 'conservé par les autres opérations du plan');
  assert.throws(() => normaliserPlan({ ...planVide(), axe_henke: { D: { ...a, source: 'devine' } } }), TypeError);
  assert.equal(normaliserPlan({ ...planVide(), axe_henke: { D: { ...a, valide: 'oui' } } }).axe_henke.D.valide, false, 'valide = true strict');
});

// ---------------- étape 2 : état éditable, repères, validation, bras de levier
const REP = { x_mm: 3, y_mm: 7 }, BOITE = { x_min: -47, x_max: 53 }; // pied de 100 mm de large, talon à x = 3
test('état par défaut : têtes posées depuis le bord médial réel du scan (D : x_min, G : x_max) ; axe non validé', () => {
  const D = A.etatParDefaut(L, BOITE, REP, 'D'), G = A.etatParDefaut(L, BOITE, REP, 'G');
  assert.equal(D.axe.valide, false); assert.equal(D.axe.source, 'defaut');
  assert.ok(Math.abs(D.tetes.m1.x - (50 - 8)) < 1e-9, 'D : bord médial à x_min = -47 -> +50 en repère de l\'axe, M1 à 8 mm du bord');
  assert.ok(Math.abs(G.tetes.m1.x - (50 - 8)) < 1e-9 || Math.abs(G.tetes.m1.x - (50 - 8)) < 1e-9);
  const dec = A.etatParDefaut(L, { x_min: -47, x_max: 53 }, { x_mm: 20, y_mm: 0 }, 'G'); // talon décalé : G médial = x_max = 53, talon 20 -> +33
  assert.ok(Math.abs(dec.tetes.m1.x - (33 - 8)) < 1e-9);
  assert.equal(A.resumerAxe(D).categorie, 'normal');
});
test('déplacer un repère : l\'axe « défaut » suit M1/M2 et p0 ; les têtes restent alignées et ordonnées ; l\'axe est dé-validé', () => {
  let e = A.valider(A.etatParDefaut(L, BOITE, REP, 'D')); assert.equal(e.axe.valide, true);
  const dev0 = e.axe.deviation_deg;
  e = A.deplacerRepere(e, 'm1', { x: e.tetes.m1.x + 10, y: e.tetes.m1.y + 5 });
  assert.equal(e.axe.valide, false); assert.ok(e.axe.deviation_deg > dev0, 'M1 plus médial -> milieu plus médial -> déviation plus grande');
  assert.equal(e.tetes.m1.y, e.tetes.m2.y); assert.equal(e.tetes.m2.y, e.tetes.m3.y);
  const e2 = A.deplacerRepere(e, 'm2', { x: 999, y: e.tetes.m2.y }); assert.ok(e2.tetes.m2.x <= e2.tetes.m1.x - 5 + 1e-9, 'M2 ne dépasse pas M1');
  const e3 = A.deplacerRepere(e, 'm2', { x: -999, y: e.tetes.m2.y }); assert.ok(e3.tetes.m2.x >= e3.tetes.m3.x + 5 - 1e-9, 'M2 ne dépasse pas M3');
  const e4 = A.deplacerRepere(e, 'p0', { x: -12, y: 9999 }); assert.ok(e4.axe.p0.y <= A.yTetes(e4.tetes) - 10, 'p0 reste en arrière de la ligne des têtes');
  assert.throws(() => A.deplacerRepere(e, 'zz', { x: 0, y: 0 }), RangeError); assert.throws(() => A.deplacerRepere(e, 'p0', { x: NaN, y: 0 }), TypeError);
  assert.deepEqual(e.tetes, A.deplacerRepere(e, 'p0', { x: 0, y: 20 }).tetes, 'état d\'origine jamais modifié');
});
test('réglage manuel : déviation -> source « manuel » (l\'axe ne suit plus M1/M2), croisement cohérent ; inclinaison bornée ; dé-validation', () => {
  let e = A.valider(A.etatParDefaut(L, BOITE, REP, 'D'));
  e = A.regler(e, { deviation_deg: 30 }); assert.equal(e.axe.source, 'manuel'); assert.equal(e.axe.valide, false); assert.equal(e.axe.deviation_deg, 30);
  assert.ok(Math.abs(A.xCroisement(e.axe, A.yTetes(e.tetes)) - e.axe.p1.x) < 1e-9);
  const d = e.axe.deviation_deg; e = A.deplacerRepere(e, 'm1', { x: e.tetes.m1.x + 5, y: e.tetes.m1.y }); assert.equal(e.axe.deviation_deg, d, 'axe manuel : M1 ne le modifie pas');
  assert.equal(A.regler(e, { inclinaison_deg: 35 }).axe.inclinaison_deg, 35); assert.equal(A.regler(e, { inclinaison_deg: 35 }).axe.source, 'manuel');
  assert.throws(() => A.regler(e, { inclinaison_deg: 95 }), RangeError); assert.throws(() => A.regler(e, { inclinaison_deg: 'x' }), RangeError); assert.throws(() => A.regler(e, { deviation_deg: 120 }), RangeError);
  assert.ok(A.resumerAxe(A.regler(e, { deviation_deg: 60 })).alertes.length > 0, 'déviation hors 4–47° : alerte, pas de refus');
});
test('palpation : remplace l\'axe, source « palpation », dé-validé, inclinaison et têtes conservées ; retour aux repères par défaut', () => {
  const def = A.etatParDefaut(L, BOITE, REP, 'D'); let e = A.regler(A.valider(def), { inclinaison_deg: 36 });
  e = A.palper(e, { x: -7, y: 13 }, { x: 30, y: 180 }); assert.equal(e.axe.source, 'palpation'); assert.equal(e.axe.valide, false); assert.equal(e.axe.inclinaison_deg, 36);
  assert.ok(Math.abs(e.axe.deviation_deg - Math.atan2(37, 167) / RAD) < 1e-9); assert.deepEqual(e.tetes, def.tetes);
  const r = A.retablir(e, def); assert.equal(r.axe.source, 'defaut'); assert.equal(r.axe.inclinaison_deg, 36); assert.equal(r.axe.deviation_deg, def.axe.deviation_deg); assert.equal(r.axe.valide, false);
  assert.throws(() => A.palper(e, { x: 0, y: 100 }, { x: 0, y: 50 }));
});
test('validation : valider() est la seule voie vers valide = true', () => {
  const e = A.etatParDefaut(L, BOITE, REP, 'G'); assert.equal(e.axe.valide, false); assert.equal(A.valider(e).axe.valide, true); assert.equal(e.axe.valide, false);
  for (const f of [(x) => A.deplacerRepere(x, 'p0', { x: -7, y: 14 }), (x) => A.regler(x, { inclinaison_deg: 40 }), (x) => A.palper(x, { x: -7, y: 13 }, { x: 30, y: 180 })]) assert.equal(f(A.valider(e)).axe.valide, false);
});
test('résumé : catégorie lisible, « limite », suggestion de skive seulement hors « normal »', () => {
  const T3 = { m1: { x: 40, y: 180, rayon_mm: 8 }, m2: { x: 22, y: 180 }, m3: { x: 4, y: 180 } };
  const r = (xc) => A.resumerAxe({ axe: { inclinaison_deg: 42, deviation_deg: 0, p0: { x: xc, y: 20 }, source: 'manuel', valide: false }, tetes: T3 });
  assert.equal(r(31).libelle, 'normal'); assert.equal(r(31).suggestion_skive, null);
  assert.equal(r(44).libelle, 'médialisé'); assert.equal(r(44).suggestion_skive, 'skive_medial');
  assert.equal(r(13).suggestion_skive, 'skive_lateral'); assert.equal(r(60).libelle, 'très médialisé'); assert.equal(r(-20).libelle, 'très latéralisé');
  assert.equal(r(40.5).limite, true);
});
test('bras de levier des sommets : médial positif (D et G), nul sur l\'axe, valeur = distance signée', () => {
  const rep = { x_mm: 0, y_mm: 0 }, ax = { inclinaison_deg: 42, deviation_deg: 0, p0: { x: 0, y: 0 } };
  const pos = Float32Array.from([-20, 50, 0, 20, 50, 0, 0, 50, 0]);
  const D = A.brasDesSommets(pos, ax, rep, 'D'), G = A.brasDesSommets(pos, ax, rep, 'G');
  assert.ok(D[0] > 0 && D[1] < 0, 'D : x négatif = médial = supinateur'); assert.ok(G[1] > 0 && G[0] < 0, 'G : x positif = médial');
  assert.ok(Math.abs(D[2]) < 1e-6); assert.ok(Math.abs(D[0] - 20) < 1e-5);
  const incline = { ...ax, deviation_deg: 20 }, Di = A.brasDesSommets(pos, incline, rep, 'D');
  for (let v = 0; v < 3; v++) assert.ok(Math.abs(Di[v] - A.coordonneesAxe(A.versHenke({ x: pos[3 * v], y: pos[3 * v + 1] }, rep, 'D'), incline).d) < 1e-5);
});
test('enregistrement dans le plan : axe + têtes relus à l\'identique par normaliserPlan', () => {
  const e = A.valider(A.etatParDefaut(L, BOITE, REP, 'D')), enr = A.enregistrer(e);
  const n = normaliserPlan({ ...planVide(), axe_henke: { D: enr } }), relu = normaliserPlan(JSON.parse(JSON.stringify(n)));
  assert.deepEqual(relu, n); assert.ok(n.axe_henke.D.tetes, 'têtes conservées'); assert.deepEqual(n.axe_henke.D.tetes.m1, e.tetes.m1); assert.equal(n.axe_henke.D.valide, true);
  assert.throws(() => normaliserPlan({ ...planVide(), axe_henke: { D: { ...enr, tetes: { m1: { x: 1, y: 1, rayon_mm: 8 }, m2: { x: 5, y: 1 }, m3: { x: 9, y: 1 } } } } }), RangeError);
});

// ---------------- étape 3 : élément « torsion » dans la pile (appliquerElements) et dans le pipeline
import { appliquerElements, mesurerCoupe, TYPES_ELEMENTS, validerElement } from '../../js/semelle3d/calcul/elements.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
const catVide = { liste: [], parId: new Map() };
const AXV = { inclinaison_deg: 42, deviation_deg: 16, p0: { x: -7, y: 10 }, source: 'manuel', valide: true };
const tor = (extra = {}) => ({ type: 'torsion', phi_deg: 5, ...extra });
const app = (els, axe = AXV, cote = 'D', base = plaque()) => garde(() => appliquerElements(base, els, { cote, cat: catVide, axe }));
const appBrut = (els, axe = AXV) => appliquerElements(plaque(), els, { cote: 'D', cat: catVide, axe }); // erreurs d'origine conservées (RangeError...)
const basePlate = () => plaque();

test('torsion : type d\'élément (sans matériau, sans poignée), valeurs par défaut, phi 0 = aucun effet', () => {
  const T = TYPES_ELEMENTS.torsion; assert.ok(T && T.torsion && T.pinceau); assert.equal(T.defauts.phi_deg, 0); assert.equal(T.defauts.mode, 'ajout'); assert.equal(T.defauts.transition_mm, 20);
  const f = app([tor({ phi_deg: 0 })]); for (let k = 0; k < f.haut.length; k++) assert.equal(f.haut[k], basePlate().haut[k]);
  assert.equal(f.infos[0].torsion.appliquee, false);
});
test('torsion appliquée : surface = base + couche >= 0 ; côté médial plus haut (D et G) ; base non modifiée', () => {
  for (const c of ['D', 'G']) {
    const b = basePlate(), copie = Float32Array.from(b.haut), f = app([tor()], AXV, c, b), rep = f.rapport_elements.repere_talon;
    assert.deepEqual(b.haut, copie); assert.equal(f.infos[0].torsion.appliquee, true); assert.ok(f.infos[0].hauteur_max_mm > 3);
    for (let k = 0; k < f.haut.length; k++) assert.ok(f.haut[k] >= copie[k] - 1e-6 && f.couches[0].z[k] >= -1e-6);
    const med = c === 'D' ? -1 : 1, i = (dx) => Math.round(100 / 0.5) * b.nx + Math.round((rep.x_mm + dx - b.ox) / 0.5);
    assert.ok(f.haut[i(med * 40)] > f.haut[i(-med * 40)] + 1, c + ' : médial relevé');
  }
});
test('torsion : refusée sans axe validé (aucune matière, signalé, export bloqué par le rapport)', () => {
  for (const axe of [null, { ...AXV, valide: false }]) {
    const f = app([tor()], axe); assert.equal(f.infos[0].torsion.appliquee, false); assert.ok(f.infos[0].torsion.raison);
    assert.equal(f.rapport_elements.torsions_bloquees.length, 1); assert.ok(f.infos[0].avertissements.some((a) => /NON VALIDÉ|absent/.test(a)));
    for (let k = 0; k < f.haut.length; k++) assert.equal(f.haut[k], basePlate().haut[k]);
  }
  assert.equal(app([tor()]).rapport_elements.torsions_bloquees.length, 0);
  assert.equal(app([tor({ visible: false })], { ...AXV, valide: false }).rapport_elements.torsions_bloquees.length, 0, 'une torsion masquée ne bloque rien');
});
test('torsion : |phi| > 15° refusé ; > 10° exige la confirmation ; > 6° alerte orange ; arrondi au pas de 0,5°', () => {
  assert.throws(() => appBrut([tor({ phi_deg: 15.5 })]), /dépasse la limite de 15/); assert.throws(() => appBrut([tor({ phi_deg: -16 })]), /limite/); assert.throws(() => appBrut([tor({ phi_deg: NaN })]));
  const r = app([tor({ phi_deg: 12 })]); assert.equal(r.infos[0].torsion.appliquee, false); assert.equal(r.rapport_elements.torsions_bloquees.length, 1); assert.ok(r.infos[0].avertissements.some((a) => /CONFIRMATION/.test(a)));
  const c = app([tor({ phi_deg: 12, phi_confirme: true })]); assert.equal(c.infos[0].torsion.appliquee, true); assert.equal(c.rapport_elements.torsions_bloquees.length, 0); assert.ok(c.infos[0].avertissements.some((a) => /confirmé/.test(a)));
  const o = app([tor({ phi_deg: 7 })]); assert.ok(o.infos[0].avertissements.some((a) => /alerte orange/.test(a))); assert.ok(!o.infos[0].avertissements.some((a) => /CONFIRMATION/.test(a)));
  assert.ok(!app([tor({ phi_deg: 6 })]).infos[0].avertissements.some((a) => /alerte orange/.test(a)));
  const a = app([tor({ phi_deg: 2.3 })]); assert.equal(a.elements[0].phi_deg, 2.5); assert.ok(a.infos[0].avertissements.some((x) => /arrondi/.test(x)));
});
test('torsion : zone, transition >= 10 mm, mode « ajout » seul', () => {
  assert.throws(() => appBrut([tor({ zone_torsion: 'milieu' })]), RangeError); assert.throws(() => appBrut([tor({ zone_torsion: 'arriere', transition_mm: 9 })]), RangeError); assert.throws(() => appBrut([tor({ mode: 'charniere_sur_axe' })]), RangeError);
  const tot = app([tor()]), arr = app([tor({ zone_torsion: 'arriere', s_charniere_mm: 80, transition_mm: 30 })]);
  assert.ok(arr.infos[0].hauteur_max_mm > 0); assert.ok(Math.abs(arr.haut[Math.round(190 / 0.5) * plaque().nx + 60] - 3) < 1e-4, 'loin devant la charnière : inchangé');
  assert.ok(tot.haut[Math.round(190 / 0.5) * plaque().nx + 60] !== 3);
});
test('torsion à son rang : agit sur la surface déjà modifiée (point curseur avant) ; annulée = retirée redonne la base ; recouvrement toujours après', () => {
  const pt = { type: 'point_curseur', dx_mm: 0, dy_mm: 100, hauteur_mm: 2, rayon_mm: 10 };
  const sans = app([pt]), avec = app([pt, tor()]), seule = app([tor()]);
  const k = Math.round(100 / 0.5) * plaque().nx + 120; // au centre du point (talon à x ≈ 0)
  const k2 = Math.round(100 / 0.5) * plaque().nx + Math.round((sans.rapport_elements.repere_talon.x_mm + 60) / 0.5);
  assert.ok(Math.abs(avec.haut[k] - (sans.haut[k] + seule.couches[0].z[k])) < 1e-4, 'la torsion s\'ajoute à la surface avec le point'); void k2;
  assert.deepEqual(app([pt]).haut, sans.haut, 'retirer la torsion redonne la surface sans torsion');
  const rec = app([tor(), { type: 'recouvrement', hauteur_mm: 2 }]); assert.ok(rec.haut[k] > app([tor()]).haut[k] + 1.9);
  assert.equal(rec.infos[0].type, 'torsion');
});
test('torsion : garde-fous d\'épaisseur (> 12 mm chaussant ; < 1,5 mm minimale) sur la semelle après la couche', () => {
  const epais = app([tor({ phi_deg: 10 })], AXV, 'D', plaque({ h: 8 })); assert.ok(epais.infos[0].avertissements.some((a) => /épaisseur totale/.test(a)), epais.infos[0].avertissements.join('|'));
  const mince = app([tor({ phi_deg: 1 })], AXV, 'D', plaque({ h: 1.2 })); assert.ok(mince.infos[0].avertissements.some((a) => /épaisseur minimale/.test(a)), mince.infos[0].avertissements.join('|'));
  assert.ok(!app([tor({ phi_deg: 1 })], AXV, 'D', plaque({ h: 3 })).infos[0].avertissements.some((a) => /épaisseur/.test(a)));
});
test('torsion : outil de coupe — l\'angle frontal mesuré = atan(tan φ cos λ cos δ) à ± 0,2° (D, G, plusieurs phi et axes)', () => {
  for (const c of ['D', 'G']) for (const phi of [2, 5, -5, 9]) for (const axe of [AXV, { ...AXV, inclinaison_deg: 30, deviation_deg: 25 }]) {
    const f = app([tor({ phi_deg: phi })], axe, c), m = mesurerCoupe(f, 'T', 100, c), e = m.elements[0];
    assert.equal(e.applicable, true, e.raison); assert.ok(Math.abs(e.angle_mesure_deg - Math.abs(A.angleFrontal(phi, axe))) < 0.2, c + ' ' + phi + ' ' + e.angle_mesure_deg + ' vs ' + A.angleFrontal(phi, axe));
    assert.ok(Math.abs(e.angle_frontal_attendu_deg - A.angleFrontal(phi, axe)) < 1e-9);
  }
  assert.ok(Math.abs(A.angleFrontal(5, AXV) - 3.58) < 0.05);
});
test('torsion : coupe dans la transition ou torsion non appliquée = pas de mesure, raison donnée', () => {
  const f = app([tor({ zone_torsion: 'arriere', s_charniere_mm: 100, transition_mm: 40 })]), m = mesurerCoupe(f, 'T', 100, 'D').elements[0];
  assert.equal(m.applicable, false); assert.match(m.raison, /transition/);
  const n = mesurerCoupe(app([tor()], { ...AXV, valide: false }), 'T', 100, 'D').elements[0]; assert.equal(n.applicable, false); assert.match(n.raison, /NON VALIDÉ/);
  const loin = mesurerCoupe(app([tor({ zone_torsion: 'arriere', s_charniere_mm: 80, transition_mm: 20 })]), 'T', 40, 'D').elements[0]; assert.equal(loin.applicable, true, 'en arrière de la charnière : plateau');
});
test('torsion : la validation d\'élément accepte un type complet et conserve confirmation / zone', () => {
  const v = validerElement({ id: 'x', type: 'torsion', phi_deg: 11, phi_confirme: true, zone_torsion: 'avant', s_charniere_mm: 120 }, catVide);
  assert.equal(v.phi_confirme, true); assert.equal(v.zone_torsion, 'avant'); assert.equal(v.s_charniere_mm, 120); assert.equal(v.materiau_id, null);
  assert.equal(validerElement({ id: 'y', type: 'torsion' }, catVide).phi_confirme, false);
});

// pipeline : l'axe suit le message ; export refusé tant que la torsion n'est pas appliquée
import { lireSTLBinaire, indexerSommets } from '../../js/semelle3d/calcul/stl.js';
test('pipeline : axe validé -> torsion appliquée et export fermé ; axe non validé -> export refusé ; sans torsion -> export normal', async () => {
  const { etatAvecBase } = await import('./aides_henke.js');
  const etat = await etatAvecBase();
  const m = (axe, els) => traiterMessageA({ type: 'elements', cote: 'D', elements: els, axe }, etat);
  let r = await m(AXV, [tor()]); assert.equal(r.rapport.torsions_bloquees.length, 0); assert.ok(r.rapport.elements[0].torsion.appliquee);
  const e = await traiterMessageA({ type: 'exporter', cote: 'D' }, etat); const v = verifierMaillage(indexerSommets(lireSTLBinaire(e.stl))); assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, JSON.stringify(v));
  r = await m({ ...AXV, valide: false }, [tor()]); assert.equal(r.rapport.torsions_bloquees.length, 1);
  await assert.rejects(() => traiterMessageA({ type: 'exporter', cote: 'D' }, etat), /torsion non appliquée/);
  r = await m(undefined, [tor()]); assert.equal(r.rapport.torsions_bloquees.length, 1);
  r = await m({ ...AXV, valide: false }, []); assert.equal(r.rapport.torsions_bloquees.length, 0);
  assert.ok((await traiterMessageA({ type: 'exporter', cote: 'D' }, etat)).octets > 1000, 'sans torsion : export normal même si l\'axe n\'est pas validé');
  void basePlate;
});

test('torsion : le « centre » (où se place la coupe après un réglage) est le milieu du pied, pas le bord du talon', () => {
  const f = app([tor()]), y = f.infos[0].centre.y_mm; assert.ok(y > 80 && y < 120, 'plaque de 200 mm : milieu ≈ 100 mm, obtenu ' + y);
  assert.ok(Math.abs(y - 100) < 1);
});

// ---------------- étape 4 : skive de Kirby (élément de la pile)
import { coucheSkive, largeurSkive } from '../../js/semelle3d/calcul/skive.js';
const sk = (extra = {}) => ({ type: 'skive', bord_skive: 'medial', profondeur_mm: 4, ...extra });
const P6 = () => plaque({ h: 6 });
const sapp = (els, cote = 'D', base = P6()) => garde(() => appliquerElements(base, els, { cote, cat: catVide }));
const sbrut = (els, cote = 'D') => appliquerElements(P6(), els, { cote, cat: catVide });
const iCell = (b, x, y) => Math.round(y / 0.5) * b.nx + Math.round((x - b.ox) / 0.5);

test('skive : type d\'élément (sans matériau), valeurs par défaut du praticien (15°, 50 mm)', () => {
  const T = TYPES_ELEMENTS.skive; assert.ok(T && T.skive && T.pinceau); assert.equal(T.defauts.angle_skive_deg, 15); assert.equal(T.defauts.longueur_skive_mm, 50); assert.equal(T.defauts.bord_skive, 'medial');
  const v = validerElement({ id: 'x', type: 'skive', bord_skive: 'lateral', profondeur_mm: 3 }, catVide); assert.equal(v.materiau_id, null); assert.equal(v.bord_skive, 'lateral');
});
test('skive : largeur de la pente = profondeur / tan(angle) ; profondeur maximale AU bord, nulle à la largeur', () => {
  assert.ok(Math.abs(largeurSkive(4, 15) - 4 / Math.tan(15 * Math.PI / 180)) < 1e-9); assert.ok(Math.abs(largeurSkive(4, 15) - 14.93) < 0.01); assert.ok(largeurSkive(4, 10) > largeurSkive(4, 25));
  const f = sapp([sk()]), b = P6(), z = f.couches[0].z, rep = f.rapport_elements.repere_talon;
  assert.ok(Math.abs(z[iCell(b, -60, 10)] + 4) < 0.05, 'au bord (x = -60) : -4 mm, obtenu ' + z[iCell(b, -60, 10)]);
  assert.ok(Math.abs(z[iCell(b, -60 + 7.5, 10)] + 4 * (1 - 7.5 / 14.93)) < 0.05, 'à mi-pente'); assert.equal(z[iCell(b, -60 + 15.5, 10)], 0, 'au-delà de la largeur : rien'); void rep;
});
test('skive : côté médial du D à x négatif, du G à x positif ; bord latéral = l\'autre côté ; miroir D/G exact', () => {
  const b = P6();
  for (const [bord, cote, xBord] of [['medial', 'D', -60], ['medial', 'G', 60], ['lateral', 'D', 60], ['lateral', 'G', -60]]) {
    const z = sapp([sk({ bord_skive: bord })], cote).couches[0].z; assert.ok(z[iCell(b, xBord, 10)] < -3.9, bord + ' ' + cote + ' creusé au bord ' + xBord); assert.equal(z[iCell(b, -xBord, 10)], 0, bord + ' ' + cote + ' : rien de l\'autre côté');
  }
  const D = sapp([sk()], 'D').couches[0].z, G = sapp([sk()], 'G').couches[0].z;
  for (let j = 0; j < b.ny; j += 9) for (let i = 0; i < b.nx; i += 3) assert.ok(Math.abs(D[j * b.nx + i] - G[j * b.nx + (b.nx - 1 - i)]) < 1e-5, 'miroir');
});
test('skive : arrière-pied seulement (longueur depuis le talon), fin progressive, début réglable', () => {
  const f = sapp([sk({ longueur_skive_mm: 40 })]), b = P6(), z = f.couches[0].z;
  assert.ok(z[iCell(b, -60, 5)] < -3.9, 'dans la longueur'); assert.equal(z[iCell(b, -60, 41)], 0, 'au-delà de 40 mm : rien'); assert.equal(z[iCell(b, -60, 80)], 0);
  const a = z[iCell(b, -60, 20)], m = z[iCell(b, -60, 33)], c = z[iCell(b, -60, 38)]; assert.ok(a < m - 0.1 && m < c - 0.1 && c < 0 && a < -3.9, 'la profondeur diminue progressivement vers l\'avant (' + [a, m, c].map((v) => v.toFixed(2)).join(' / ') + ')');
  const d = sapp([sk({ debut_skive_mm: 30, longueur_skive_mm: 40 })]).couches[0].z; assert.equal(d[iCell(b, -60, 10)], 0, 'avant le début : rien'); assert.ok(d[iCell(b, -60, 40)] < -3);
});
test('skive : retire de la matière, jamais sous 0,9 mm (base mince : profondeur limitée et signalée) ; pas de trou', () => {
  const fin = sapp([sk({ profondeur_mm: 6 })], 'D', plaque({ h: 2 })), b = plaque({ h: 2 });
  for (let k = 0; k < fin.haut.length; k++) assert.ok(fin.haut[k] - fin.bas[k] >= 0.9 - 1e-4, 'épaisseur >= 0,9 mm');
  assert.ok(Math.abs(fin.haut[iCell(b, -60, 10)] - 0.9) < 1e-4); assert.ok(fin.infos[0].skive.limitees > 0 && fin.infos[0].skive.profondeur_reelle_mm < 1.2);
  assert.ok(fin.infos[0].avertissements.some((a) => /profondeur limitée/.test(a)), fin.infos[0].avertissements.join('|'));
  const ok = sapp([sk()]); assert.equal(ok.infos[0].skive.limitees, 0); assert.ok(!ok.infos[0].avertissements.some((a) => /limitée/.test(a)));
  const sans = sapp([sk({ visible: false })]); for (let k = 0; k < sans.haut.length; k++) assert.equal(sans.haut[k], 6);
  const mince = sapp([sk()], 'D', plaque({ h: 0.9 })); assert.ok(mince.infos[0].avertissements.some((a) => /sans effet/.test(a)));
});
test('skive : bornes du praticien (profondeur 2–6 mm, pente 10–25°, longueur 20–120 mm, bord médial/latéral)', () => {
  for (const bad of [{ profondeur_mm: 1.9 }, { profondeur_mm: 6.1 }, { angle_skive_deg: 9.9 }, { angle_skive_deg: 25.1 }, { longueur_skive_mm: 19 }, { longueur_skive_mm: 121 }, { bord_skive: 'haut' }, { debut_skive_mm: -1 }, { profondeur_mm: NaN }]) assert.throws(() => sbrut([sk(bad)]), RangeError, JSON.stringify(bad));
  for (const ok of [{ profondeur_mm: 2 }, { profondeur_mm: 6 }, { angle_skive_deg: 10 }, { angle_skive_deg: 25 }, { longueur_skive_mm: 20 }, { longueur_skive_mm: 120 }]) assert.doesNotThrow(() => sbrut([sk(ok)]), JSON.stringify(ok));
});
test('skive : à son rang — agit sur la surface déjà modifiée ; le recouvrement vient toujours après ; retirer la skive redonne la surface', () => {
  const pt = { type: 'point_curseur', dx_mm: 0, dy_mm: 100, hauteur_mm: 2, rayon_mm: 10 };
  const avec = sapp([pt, sk()]), sans = sapp([pt]); assert.deepEqual(sapp([pt]).haut, sans.haut);
  const b = P6(), k = iCell(b, -60, 10); assert.ok(Math.abs((avec.haut[k] - sans.haut[k]) + 4) < 0.05);
  const rec = sapp([sk(), { type: 'recouvrement', hauteur_mm: 2 }]); assert.ok(Math.abs(rec.haut[k] - (sapp([sk()]).haut[k] + 2)) < 1e-4);
  assert.equal(avec.infos[1].type, 'skive');
});
test('skive : outil de coupe (pas d\'angle à mesurer, raison donnée), emprise colorée, aucun blocage d\'export', () => {
  const f = sapp([sk()]), m = mesurerCoupe(f, 'T', 10, 'D').elements[0]; assert.equal(m.applicable, false); assert.match(m.raison, /skive de Kirby/);
  assert.equal(f.rapport_elements.torsions_bloquees.length, 0);
});
test('skive : maillage fermé après la skive (D et G)', () => {
  for (const c of ['D', 'G']) { const f = sapp([sk({ profondeur_mm: 5 })], c), v = verifierMaillage(maillerBase(f)); assert.ok(v.ferme && v.degeneres === 0 && v.volume > 0, c + JSON.stringify(v)); assert.ok(v.volume < verifierMaillage(maillerBase(P6())).volume - 100, 'matière retirée'); }
});

// suggestion -> skive : la suggestion dépend de l'âge ; le résumé la porte ; l'élément créé reprend ses valeurs
test('résumé de l\'axe : la suggestion porte l\'âge (adulte / enfant / inconnu) ; l\'élément créé a les mêmes profondeur et angle', () => {
  const T3 = { m1: { x: 40, y: 180, rayon_mm: 8 }, m2: { x: 22, y: 180 }, m3: { x: 4, y: 180 } };
  const e = { axe: { inclinaison_deg: 42, deviation_deg: 0, p0: { x: 44, y: 20 }, source: 'manuel', valide: true }, tetes: T3 }; // médialisé
  const a = A.resumerAxe(e, { age_ans: 30 }).skive, k = A.resumerAxe(e, { age_ans: 8 }).skive, i = A.resumerAxe(e, {}).skive;
  assert.equal(a.profondeur_mm, 2); assert.equal(k.profondeur_mm, 4); assert.equal(k.enfant, true); assert.equal(i.profondeur_mm, 2); assert.equal(i.age_inconnu, true);
  const el = validerElement({ id: 'x', type: 'skive', bord_skive: a.type === 'skive_medial' ? 'medial' : 'lateral', profondeur_mm: k.profondeur_mm, angle_skive_deg: k.angle_deg }, catVide);
  assert.equal(el.profondeur_mm, 4); assert.equal(el.angle_skive_deg, 15); assert.equal(el.bord_skive, 'medial');
  assert.equal(A.resumerAxe({ ...e, axe: { ...e.axe, p0: { x: 31, y: 20 } } }, { age_ans: 8 }).skive, null, 'axe normal : aucune suggestion');
});
