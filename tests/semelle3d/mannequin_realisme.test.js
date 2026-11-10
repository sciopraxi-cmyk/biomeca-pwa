// Lot 4 bis, étape 5 (réalisme) : lissage, normales du champ, occlusion, orteils / ongles / tendons, appui sur la semelle corrigée, axe corrigé.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../../js/semelle3d/calcul/mannequin.js';
import * as C from '../../js/semelle3d/calcul/correction_axe.js';
import { tetesParDefaut, axeParDefaut } from '../../js/semelle3d/calcul/axe-henke.js';
import { modelePiedRealiste } from '../../js/semelle3d/calcul/pied_realiste.js';
import { MANNEQUIN, HENKE, AXE_CORRIGE } from '../../js/semelle3d/constantes.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { etatAvecBase } from './aides_henke.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message) }); a.cause = e; throw a; } };
const T = (nom, f) => test(nom, () => garde(f));
const grilleD = (c = 'D', L = 265) => M.grilleDuModele(modelePiedRealiste({ longueur_mm: L, cote: c, voute_mm: 15 }));

// ---------------- outils de maillage
const sphere = (n = 31, R = 10) => { const F = new Float32Array(n * n * n), c = (n - 1) / 2; for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) F[(k * n + j) * n + i] = R - Math.hypot(i - c, j - c, k - c); const m = M.maillerChamp(F, n, n, n, 1, 0, 0, 0); return { F, n, m, champ: { F, nx: n, ny: n, nz: n, h: 1, x0: 0, y0: 0, z0: 0 }, c }; };
T('échantillonnage du champ : exact sur un champ linéaire (trilinéaire), borné hors de la boîte', () => {
  const n = 6, F = new Float32Array(n * n * n); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) F[(k * n + j) * n + i] = 2 * i + 3 * j - k;
  const c = { F, nx: n, ny: n, nz: n, h: 2, x0: 10, y0: 0, z0: 5 };
  assert.ok(Math.abs(M.echantillonChamp(c, 13.3, 4.1, 8.7) - (2 * (3.3 / 2) + 3 * (4.1 / 2) - (3.7 / 2))) < 1e-4);
  assert.ok(Math.abs(M.echantillonChamp(c, -100, -100, -100) - M.echantillonChamp(c, 10, 0, 5)) < 1e-6);
  assert.ok(Math.abs(M.echantillonChamp(c, 1e6, 1e6, 1e6) - M.echantillonChamp(c, 20, 10, 15)) < 1e-3);
});
T('voisinage : chaque sommet d\'un maillage fermé a au moins 3 voisins, relation symétrique', () => {
  const { m } = sphere(), v = M.voisins(m.nbSommets, m.indices); let mini = 1e9;
  for (let s = 0; s < m.nbSommets; s++) { mini = Math.min(mini, v.debut[s + 1] - v.debut[s]); const q = v.liste[v.debut[s]]; let trouve = false; for (let t = v.debut[q]; t < v.debut[q + 1]; t++) if (v.liste[t] === s) trouve = true; assert.ok(trouve, 'symétrie ' + s); }
  assert.ok(mini >= 6, 'voisins minimum ' + mini);
  // maillage ouvert (un seul triangle) : chaque sommet voit ses DEUX voisins
  const t = M.voisins(3, [0, 1, 2]); for (let a = 0; a < 3; a++) { const l = Array.from(t.liste.subarray(t.debut[a], t.debut[a + 1])).sort(); assert.deepEqual(l, [0, 1, 2].filter((q) => q !== a), 'voisins du sommet ' + a); }
});
T('lissage de Taubin : réduit le bruit, garde le volume (< 2 % de perte), n\'écarte pas les sommets fixes, entrée = sortie', () => {
  const { m } = sphere(41, 15), pos = Float32Array.from(m.positions), c = 20; let s = 1;
  for (let v = 0; v < pos.length; v++) { s = (s * 16807) % 2147483647; pos[v] += ((s / 2147483647) - 0.5) * 0.5; } // bruit ±0,25 mm
  const eRayon = (p) => { let e = 0; for (let v = 0; v < p.length; v += 3) e += Math.abs(Math.hypot(p[v] - c, p[v + 1] - c, p[v + 2] - c) - 15); return e / (p.length / 3); };
  const vois = M.voisins(m.nbSommets, m.indices), fixe = new Uint8Array(m.nbSommets); fixe[0] = 1; const p0 = [pos[0], pos[1], pos[2]], av = eRayon(pos);
  const vol = (p) => { let s6 = 0; for (let t = 0; t < m.indices.length; t += 3) { const a = 3 * m.indices[t], b = 3 * m.indices[t + 1], d = 3 * m.indices[t + 2]; s6 += p[a] * (p[b + 1] * p[d + 2] - p[b + 2] * p[d + 1]) - p[a + 1] * (p[b] * p[d + 2] - p[b + 2] * p[d]) + p[a + 2] * (p[b] * p[d + 1] - p[b + 1] * p[d]); } return s6 / 6; };
  const v0 = vol(pos), r = M.lisserMaillage(pos, vois, fixe, 8);
  assert.equal(r, pos); assert.ok(eRayon(pos) < av * 0.6, 'bruit ' + av + ' -> ' + eRayon(pos)); assert.ok(Math.abs(vol(pos) / v0 - 1) < 0.02, 'volume ' + vol(pos) / v0);
  assert.deepEqual([pos[0], pos[1], pos[2]], p0);
});
T('normales du champ : radiales (écart < 4°) sur une sphère, unitaires, tournées vers l\'extérieur ; repli si le champ est plat', () => {
  const { m, champ, c } = sphere(), rep = new Float32Array(m.positions.length).fill(0.577), nrm = M.normalesDuChamp(champ, m.positions, rep);
  for (let v = 0; v < m.nbSommets; v++) { const x = m.positions[3 * v] - c, y = m.positions[3 * v + 1] - c, z = m.positions[3 * v + 2] - c, l = Math.hypot(x, y, z), d = (nrm[3 * v] * x + nrm[3 * v + 1] * y + nrm[3 * v + 2] * z) / l; assert.ok(d > Math.cos(4 * Math.PI / 180), 'écart à la radiale ' + Math.acos(Math.min(1, d)) * 180 / Math.PI + '°'); assert.ok(Math.abs(Math.hypot(nrm[3 * v], nrm[3 * v + 1], nrm[3 * v + 2]) - 1) < 1e-4); }
  const plat = { F: new Float32Array(125).fill(1), nx: 5, ny: 5, nz: 5, h: 1, x0: 0, y0: 0, z0: 0 }; assert.ok(Math.abs(M.normalesDuChamp(plat, Float32Array.from([2, 2, 2]), Float32Array.from([0, 0, 1]))[2] - 1) < 1e-6);
});
T('occlusion ambiante : un point dans une fente étroite est occlus, un point dégagé ne l\'est pas', () => {
  const n = 40, F = new Float32Array(n * n * n).fill(-1); for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const dans = (i > 5 && i < 17) || (i > 22 && i < 34); if (dans && j > 5 && j < 34 && k > 5 && k < 34) F[(k * n + j) * n + i] = i < 20 ? Math.min(i - 5, 17 - i) : Math.min(i - 22, 34 - i); }
  const ch = { F, nx: n, ny: n, nz: n, h: 1, x0: 0, y0: 0, z0: 0 };
  const ao = M.occlusionAmbiante(ch, Float32Array.from([17, 20, 20, 5.5, 20, 20]), Float32Array.from([1, 0, 0, -1, 0, 0]));
  assert.ok(ao[0] < 0.8, 'dans la fente : ' + ao[0]); assert.ok(ao[1] > 0.97, 'face extérieure : ' + ao[1]); assert.ok(ao[0] >= 0 && ao[0] <= 1);
});

// ---------------- orteils et ongles
T('orteils : 5 détectés, du médial au latéral, le gros orteil le plus long et le plus large, largeurs décroissantes ; D et G en miroir', () => {
  for (const [c, L] of [['D', 265], ['G', 258], ['D', 272]]) {
    const g = grilleD(c, L), ch = M.champsPlantaires(g), o = M.detecterOrteils(g, ch, c, L / 265), med = c === 'D' ? -1 : 1;
    assert.equal(o.length, 5, c + L + ' : ' + o.length + ' orteils'); for (let i = 1; i < 5; i++) assert.ok(med * (o[i].x - o[i - 1].x) < 0, 'ordre médial -> latéral');
    assert.ok(o[0].y >= Math.max(...o.map((q) => q.y)) - 1e-6, 'le gros orteil est le plus long'); assert.ok(o[0].largeur_mm > o[1].largeur_mm + 3, 'le gros orteil est le plus large'); for (let i = 2; i < 5; i++) assert.ok(o[i].largeur_mm <= o[i - 1].largeur_mm + 1.5, 'largeurs décroissantes');
    for (const q of o) assert.ok(Math.abs(q.cx - q.x) < q.largeur_mm / 2 + 2, 'le milieu est dans l\'orteil');
  }
});
T('orteils : une empreinte sans orteils (forme ovale) ne donne ni ongles ni tendons ; liste vide', () => {
  const nx = 80, ny = 300, z = new Float32Array(nx * ny).fill(NaN); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = (i - 40) * 0.5, y = j * 0.5; if ((x / 18) ** 2 + ((y - 70) / 70) ** 2 <= 1) z[j * nx + i] = 2; }
  const g = { nx, ny, pas: 0.5, ox: -20, oy: 0, z }, ch = M.champsPlantaires(g); assert.equal(M.detecterOrteils(g, ch, 'D', 1).length, 0);
});
T('ongle : coque elliptique bombée au centre, bord net posé au-dessus de la peau, jupe qui s\'enfonce, normales unitaires', () => {
  const hauteurAt = (x, y) => 20 + 0.05 * x - 0.02 * y, g = M.maillageOngle(10, 100, 14, 11, hauteurAt), nv = g.positions.length / 3;
  assert.equal(g.normales.length, g.positions.length); let zmax = -1e9, bord = [], jupe = [];
  for (let v = 0; v < nv; v++) { const x = g.positions[3 * v], y = g.positions[3 * v + 1], zz = g.positions[3 * v + 2], r2 = ((x - 10) / 7) ** 2 + ((y - 100) / 5.5) ** 2; assert.ok(r2 < 1.6, 'dans l\'ellipse'); assert.ok(Math.abs(Math.hypot(g.normales[3 * v], g.normales[3 * v + 1], g.normales[3 * v + 2]) - 1) < 1e-4); if (r2 < 1.5 && r2 > 0.98) { (zz - hauteurAt(x, y) > 0 ? bord : jupe).push(zz - hauteurAt(x, y)); } zmax = Math.max(zmax, zz - hauteurAt(x, y)); }
  assert.ok(zmax > 0.9 && zmax < 1.4, 'bombé de ' + zmax); assert.ok(bord.length >= 20 && Math.min(...bord) > 0.2 && Math.max(...bord) < 0.5, 'bord net à +0,3 mm : ' + bord.slice(0, 3)); assert.ok(jupe.length >= 20 && Math.max(...jupe) < -1.0, 'jupe enfoncée');
  for (const i of g.indices) assert.ok(i >= 0 && i < nv); assert.equal(g.indices.length % 3, 0);
  assert.equal(g.indices.length / 3, 24 + 48 * 5 + 48, 'centre 24 + 5 anneaux de 48 + jupe de 48 triangles'); const utilises = new Set(g.indices); assert.equal(utilises.size, nv, 'tous les sommets (jupe comprise) sont reliés à des triangles');
});
// ---------------- appui du pied sur la semelle corrigée
const grillesAppui = () => { const g = grilleD(), n = g.nx * g.ny, hb = new Float32Array(n), z = g.z; for (let k = 0; k < n; k++) hb[k] = Number.isFinite(z[k]) ? 1.5 + 0.5 * z[k] : NaN; return { g, hb }; };
const entree = (g, haut, hb) => ({ nx: g.nx, ny: g.ny, pas: g.pas, ox: g.ox, oy: g.oy, haut, hautBase: hb, z: g.z });
T('appui sans correction : pas d\'inclinaison, relevé juste assez pour ne pas être traversé (contact exact en un point)', () => {
  const { g, hb } = grillesAppui(), r = M.appuiMannequin(entree(g, hb, hb));
  assert.equal(r.b, 0); assert.equal(r.c, 0); assert.ok(r.a_mm >= 0 && r.a_mm < 3, 'relevé ' + r.a_mm); assert.ok(r.penetration_mm < 1e-4); assert.equal(r.correction_max_mm, 0);
  let e = -1e9; for (let k = 0; k < hb.length; k++) if (Number.isFinite(g.z[k])) e = Math.max(e, hb[k] - Math.max(g.z[k], 0) - MANNEQUIN.socle_mm); assert.ok(Math.abs(e - r.a_mm) < 1e-4, 'contact exact : ' + e + ' contre ' + r.a_mm);
});
T('appui avec une torsion (cale linéaire médial 3 mm -> latéral 0) : le pied s\'incline comme la correction (pente ± 3 %) et ne reçoit aucune pénétration', () => {
  const { g, hb } = grillesAppui(), haut = Float32Array.from(hb); let xmin = 1e9, xmax = -1e9; for (let k = 0; k < hb.length; k++) if (Number.isFinite(hb[k])) { const x = g.ox + (k % g.nx) * g.pas; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); }
  for (let k = 0; k < hb.length; k++) if (Number.isFinite(hb[k])) { const x = g.ox + (k % g.nx) * g.pas; haut[k] += 3 * (xmax - x) / (xmax - xmin); } // pied D : médial = x négatif, donc plus haut à gauche
  const r = M.appuiMannequin(entree(g, haut, hb)), pente = -3 / (xmax - xmin);
  assert.ok(Math.abs(r.b - pente) / Math.abs(pente) < 0.03, 'b = ' + r.b + ' attendu ' + pente); assert.ok(Math.abs(r.c) < 2e-3, 'c = ' + r.c); assert.ok(Math.abs(r.frontal_deg - Math.atan(pente) * 180 / Math.PI) < 0.1);
  assert.ok(r.penetration_mm < 1e-4, 'pénétration ' + r.penetration_mm); assert.ok(r.correction_max_mm > 2.9);
});
T('appui avec des bosses isolées (voûte, skive) : jamais de pénétration après la pose', () => {
  const { g, hb } = grillesAppui(); let s = 7;
  for (let essai = 0; essai < 6; essai++) {
    const haut = Float32Array.from(hb); for (let b = 0; b < 4; b++) { s = (s * 16807) % 2147483647; const cx = g.ox + (s / 2147483647) * g.nx * g.pas; s = (s * 16807) % 2147483647; const cy = (s / 2147483647) * 530, amp = 1 + 4 * ((s % 100) / 100); for (let k = 0; k < haut.length; k++) if (Number.isFinite(haut[k])) { const x = g.ox + (k % g.nx) * g.pas, y = g.oy + Math.floor(k / g.nx) * g.pas; haut[k] += amp * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * 15 * 15)); } }
    const r = M.appuiMannequin(entree(g, haut, hb)); assert.ok(r.penetration_mm < 1e-4, 'essai ' + essai + ' : ' + r.penetration_mm);
  }
});
T('appui : bornes (relèvement 12 mm, inclinaison 12°) signalées, erreurs claires', () => {
  const { g, hb } = grillesAppui(), haut = Float32Array.from(hb); for (let k = 0; k < haut.length; k++) if (Number.isFinite(haut[k])) haut[k] += 40;
  const r = M.appuiMannequin(entree(g, haut, hb)); assert.equal(r.borne_atteinte, true); assert.equal(r.a_mm, MANNEQUIN.appui.max_mm); assert.ok(r.brut_mm > 30);
  const raide = Float32Array.from(hb); for (let k = 0; k < raide.length; k++) if (Number.isFinite(raide[k])) raide[k] += 0.5 * (k % g.nx); const q = M.appuiMannequin(entree(g, raide, hb)); assert.ok(q.inclinaison_deg <= MANNEQUIN.appui.inclinaison_max_deg + 1e-6 && q.borne_atteinte);
  for (const champ of ['haut', 'hautBase', 'z']) assert.throws(() => M.appuiMannequin({ ...entree(g, hb, hb), [champ]: new Float32Array(g.z.length - 1) }), /tailles différentes/, champ); assert.throws(() => M.appuiMannequin({ ...entree(g, hb, hb), z: new Float32Array(g.z.length).fill(NaN) }), RangeError);
});

// ---------------- axe corrigé
const tetes = tetesParDefaut(265, 95, 45), axe0 = axeParDefaut(265, tetes);
const axeMedial = { ...axe0, deviation_deg: 24 }; // croisement médial : « très médialisé » / « médialisé »
T('axe corrigé : supination -> déviation plus faible (de phi·sin λ), pronation -> plus forte, phi = 0 inchangé, bornée à ±47°, source « corrige » non validée', () => {
  const l = 42 * Math.PI / 180; assert.ok(Math.abs(C.deviationCorrigee(axeMedial, 5) - (24 - 5 * Math.sin(l))) < 1e-9); assert.ok(C.deviationCorrigee(axeMedial, -5) > 24); assert.equal(C.deviationCorrigee(axeMedial, 0), 24);
  assert.equal(C.deviationCorrigee({ ...axeMedial, deviation_deg: 46 }, -15), HENKE.deviation_plage_deg.max); assert.equal(C.deviationCorrigee({ ...axeMedial, deviation_deg: -46 }, 15), -HENKE.deviation_plage_deg.max);
  const a = C.axeCorrige({ ...axeMedial, valide: true }, 5); assert.equal(a.source, 'corrige'); assert.equal(a.valide, false); assert.deepEqual(a.p0, axeMedial.p0); assert.equal(a.inclinaison_deg, 42);
  assert.throws(() => C.deviationCorrigee(axeMedial, NaN), TypeError); assert.throws(() => C.deviationCorrigee({ inclinaison_deg: NaN, deviation_deg: 3 }, 1), TypeError);
  assert.ok(Math.abs(C.deviationCorrigee(axeMedial, 5, { facteur: 0.5 }) - (24 - 2.5 * Math.sin(l))) < 1e-9);
  assert.equal(AXE_CORRIGE.facteur, 1, 'modèle indicatif : facteur 1 = toute la composante transversale'); assert.ok(Math.abs(C.deviationCorrigee(axeMedial, 5, { facteur: 0 }) - 24) < 1e-9, 'facteur 0 = aucune correction'); assert.ok(Math.abs(C.deviationCorrigee(axeMedial, 5, { facteur: 2 }) - (24 - 10 * Math.sin(l))) < 1e-9);
});
T('bilan : un axe médialisé corrigé par une supination se rapproche de la zone normale, le croisement va vers le latéral (x diminue), la catégorie s\'améliore', () => {
  const b = C.bilanCorrection(axeMedial, tetes, 8); assert.ok(b.avant.categorie === 'tres_medialise' || b.avant.categorie === 'medialise', b.avant.categorie);
  assert.equal(b.amelioration, true); assert.equal(b.aggravation, false); assert.ok(b.deplacement_croisement_mm < -5, 'déplacement ' + b.deplacement_croisement_mm); assert.ok(b.apres.ecart_normal_mm < b.avant.ecart_normal_mm);
  assert.ok(b.delta_deviation_deg < 0); assert.equal(b.meme, false);
  const idx = tetes.m1.x; assert.ok(b.apres.x_croisement_mm < b.avant.x_croisement_mm && b.avant.x_croisement_mm > idx - 1);
});
T('bilan : phi = 0 = rien ne bouge ; une correction dans le mauvais sens (pied normal + supination) est signalée comme éloignement ; pied latéralisé + pronation s\'améliore', () => {
  const z = C.bilanCorrection(axeMedial, tetes, 0); assert.equal(z.meme, true); assert.equal(z.deplacement_croisement_mm, 0); assert.equal(z.amelioration, false); assert.deepEqual(C.textesCorrection(z), ['Pas de correction (phi = 0°) : l\'axe reste celui de départ.']);
  const mal = C.bilanCorrection({ ...axe0, deviation_deg: 11.6 }, tetes, 10); assert.equal(mal.aggravation, true); assert.ok(C.textesCorrection(mal)[2].includes('éloignement'));
  const lat = C.bilanCorrection({ ...axe0, deviation_deg: 4 }, tetes, -8); assert.ok(['lateralise', 'tres_lateralise'].includes(lat.avant.categorie), lat.avant.categorie); assert.equal(lat.amelioration, true); assert.ok(lat.deplacement_croisement_mm > 0);
});
T('textes de la correction : déviation avant → après avec signe, déplacement en mm vers le latéral/médial, catégories, virgule décimale', () => {
  const t = C.textesCorrection(C.bilanCorrection(axeMedial, tetes, 5)); assert.equal(t.length, 3);
  assert.match(t[0], /^Déviation de l'axe : 24,0° → 20,7° \(−3,3°\)$/); assert.match(t[1], /^Croisement avec la ligne des têtes : déplacé de \d+,\d mm vers le latéral$/); assert.match(t[2], /^Catégorie : (très médialisé|médialisé) → /); assert.ok(t[2].includes('✓ amélioration'));
  assert.ok(C.textesCorrection(C.bilanCorrection(axe0, tetes, -5))[1].includes('vers le médial'));
});
T('écart au normal et trace de l\'axe : 0 entre les centres de M1 et M2 ; segments de l\'axe (projection jusqu\'aux têtes + 25 mm, pointe 3D ≤ 70 mm de haut)', () => {
  assert.equal(C.ecartAuNormal((tetes.m1.x + tetes.m2.x) / 2, tetes), 0); assert.ok(Math.abs(C.ecartAuNormal(tetes.m1.x + 10, tetes) - 10) < 1e-9); assert.ok(Math.abs(C.ecartAuNormal(tetes.m2.x - 7, tetes) - 7) < 1e-9);
  const tr = C.traceAxe(axe0, tetes); assert.ok(Math.abs(tr.projection.a.y - (tetes.m1.y + 25)) < 1e-6 || tr.projection.a.y > tr.croisement.y); assert.ok(tr.axe3d.a.z <= 70.0001 && tr.axe3d.a.z > 10); assert.deepEqual(tr.projection.de, { x: axe0.p0.x, y: axe0.p0.y }); assert.ok(Math.abs(tr.croisement.y - (tetes.m1.y + tetes.m2.y + tetes.m3.y) / 3) < 1e-9);
  assert.equal(AXE_CORRIGE.facteur, 1);
});

// ---------------- worker : le pied suit le dessus FINAL de la semelle (éléments compris), pas la base seule
test('worker appui_mannequin : avec un coin pronateur de 5° le relèvement ou l\'inclinaison change par rapport à la base seule', async () => {
  const etat = await etatAvecBase(), a0 = await traiterMessageA({ type: 'appui_mannequin' }, etat);
  await traiterMessageA({ type: 'base', params: { type: 'thermoformee', cote: 'D' }, cote: 'D', elements: [{ type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 5 }] }, etat);
  const a1 = await traiterMessageA({ type: 'appui_mannequin' }, etat);
  assert.equal(a1.type, 'appui_mannequin'); assert.ok(Math.abs(a1.a_mm - a0.a_mm) > 0.3 || Math.abs(a1.inclinaison_deg - a0.inclinaison_deg) > 0.2, 'sans effet : ' + a0.a_mm + '/' + a1.a_mm + ' ; ' + a0.inclinaison_deg + '/' + a1.inclinaison_deg);
  assert.ok(a1.penetration_mm < 1e-6, 'pénétration ' + a1.penetration_mm);
});
