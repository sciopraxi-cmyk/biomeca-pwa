// Mode B : empreinte virtuelle du pied générique (proportions moyennes FICTIVES) — format H_plantaire, alimente base / mannequin / axe sans les modifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { grilleDuPiedGenerique, PIED_GENERIQUE } from '../../js/semelle3d/calcul/pied_generique.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { creerMannequin } from '../../js/semelle3d/calcul/pied_sculpte.js';
import { detecterOrteils, champsPlantaires } from '../../js/semelle3d/calcul/mannequin.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { tetesParDefaut, axeParDefaut } from '../../js/semelle3d/calcul/axe-henke.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message) }); a.cause = e; throw a; } };
const T = (nom, f) => test(nom, () => garde(f));
const mesure = (g) => { let a = 1e9, b = -1e9, ya = 1e9, yb = -1e9, zmax = 0, n = 0, neg = 0, nan = 0; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const v = g.z[j * g.nx + i]; if (Number.isFinite(v)) { n++; if (v < 0) neg++; a = Math.min(a, g.ox + i * g.pas); b = Math.max(b, g.ox + i * g.pas); ya = Math.min(ya, g.oy + j * g.pas); yb = Math.max(yb, g.oy + j * g.pas); zmax = Math.max(zmax, v); } else nan++; } return { a, b, larg: b - a, ya, yb, long: yb - ya, zmax, n, neg, nan, aire: n * g.pas * g.pas }; };
const larg = (g, y) => { const j = Math.round((y - g.oy) / g.pas); let a = 1e9, b = -1e9; for (let i = 0; i < g.nx; i++) if (Number.isFinite(g.z[j * g.nx + i])) { a = Math.min(a, i); b = Math.max(b, i); } return (b - a) * g.pas; };

T('format H_plantaire : talon en y = 0, longueur = celle demandée (± 1 mm), hauteurs >= 0, NaN hors du pied, pas 0,5 mm, aire plausible (130 à 190 cm²)', () => {
  for (const [L, c] of [[265, 'D'], [258, 'G'], [220, 'D'], [300, 'G']]) { const g = grilleDuPiedGenerique({ longueur_mm: L, cote: c }), m = mesure(g); assert.equal(g.pas, 0.5); assert.ok(m.ya < 1.1, 'talon ' + m.ya); assert.ok(Math.abs(m.long - L) < 1.5, c + L + ' : longueur ' + m.long); assert.equal(m.neg, 0); assert.ok(m.nan > 0.3 * g.z.length, 'NaN hors du pied'); const k = (L / 265) ** 2; assert.ok(m.aire / 100 > 130 * k && m.aire / 100 < 190 * k, c + L + ' : aire ' + m.aire / 100 + ' cm²'); }
});
T('pied gauche = miroir EXACT du pied droit : chaque cellule du D est dans le G au x opposé (écart de contour < 1 %), mêmes hauteurs (± 0,5 mm) ; le D n\'est pas symétrique par lui-même', () => {
  const d = grilleDuPiedGenerique({ longueur_mm: 265, cote: 'D' }), g = grilleDuPiedGenerique({ longueur_mm: 265, cote: 'G' }); assert.equal(d.nx, g.nx); assert.ok(Math.abs(d.ox + g.ox + (d.nx - 1) * d.pas) < 1e-6, 'grilles symétriques en x');
  let n = 0, pas = 0, dz = 0, asym = 0; for (let j = 0; j < d.ny; j++) for (let i = 0; i < d.nx; i++) { const a = d.z[j * d.nx + i], b = g.z[j * d.nx + (d.nx - 1 - i)], c = d.z[j * d.nx + (d.nx - 1 - i)]; if (Number.isFinite(a)) { n++; if (!Number.isFinite(b)) pas++; else dz = Math.max(dz, Math.abs(a - b)); if (!Number.isFinite(c)) asym++; } }
  assert.ok(pas / n < 0.01, 'cellules du D absentes du G miroir : ' + pas / n); assert.ok(dz < 0.5, 'hauteurs : ' + dz); assert.ok(asym / n > 0.03, 'le pied D est asymétrique (sinon le test ne prouve rien) : ' + asym / n);
});
T('largeur relative : 0,9 / 1,1 changent la largeur de 10 % à l\'avant-pied et au talon, sans changer la longueur ni les hauteurs', () => {
  const n = grilleDuPiedGenerique({ longueur_mm: 265 }), e = grilleDuPiedGenerique({ longueur_mm: 265, largeur_rel: 0.9 }), l = grilleDuPiedGenerique({ longueur_mm: 265, largeur_rel: 1.1 });
  for (const y of [40, 190]) { assert.ok(Math.abs(larg(e, y) / larg(n, y) - 0.9) < 0.03, 'étroit y=' + y + ' : ' + larg(e, y) / larg(n, y)); assert.ok(Math.abs(larg(l, y) / larg(n, y) - 1.1) < 0.03, 'large y=' + y); }
  assert.ok(Math.abs(mesure(e).long - mesure(n).long) < 1 && Math.abs(mesure(l).zmax - mesure(n).zmax) < 0.5); assert.ok(mesure(l).aire > mesure(n).aire * 1.07 && mesure(e).aire < mesure(n).aire * 0.93);
});
T('voûte : 8 / 15 / 24 mm montent la hauteur maximale dans cet ordre, d\'au moins 5 mm entre basse et haute', () => {
  const h = (v) => mesure(grilleDuPiedGenerique({ longueur_mm: 265, voute_mm: v })).zmax, b = h(PIED_GENERIQUE.voute_mm.basse), m = h(PIED_GENERIQUE.voute_mm.moyenne), t = h(PIED_GENERIQUE.voute_mm.haute); assert.ok(b < m && m < t && t - b > 8, [b, m, t]);
});
T('paramètres invalides : erreurs claires de CE module (pas celles d\'un module en dessous) pour la longueur, le côté, la largeur, la voûte, NaN', () => {
  for (const L of [100, 149, 351, 400, NaN]) assert.throws(() => grilleDuPiedGenerique({ longueur_mm: L }), /pied générique : longueur entre 150 et 350/, 'longueur ' + L);
  assert.doesNotThrow(() => grilleDuPiedGenerique({ longueur_mm: 150, pas: 2 })); assert.doesNotThrow(() => grilleDuPiedGenerique({ longueur_mm: 350, pas: 2 }));
  for (const c of ['X', 'd', '', null]) assert.throws(() => grilleDuPiedGenerique({ cote: c }), /pied générique : côté D ou G exigé/, 'côté ' + c);
  for (const w of [0.79, 1.26, 2, NaN]) assert.throws(() => grilleDuPiedGenerique({ largeur_rel: w }), /pied générique : largeur relative/, 'largeur ' + w);
  for (const v of [-1, 36, 50, NaN]) assert.throws(() => grilleDuPiedGenerique({ voute_mm: v }), /pied générique : voûte entre/, 'voûte ' + v);
  assert.doesNotThrow(() => grilleDuPiedGenerique({ largeur_rel: 0.8, pas: 2 })); assert.doesNotThrow(() => grilleDuPiedGenerique({ largeur_rel: 1.25, voute_mm: 0, pas: 2 })); assert.doesNotThrow(() => grilleDuPiedGenerique({ voute_mm: 35, pas: 2 }));
});
test('alimente le noyau : base thermoformée (message « base » du pipeline) fermée, sans triangle dégénéré, D et G, étroit et large ; grille d\'entrée intacte', async () => {
  for (const [c, w] of [['D', 1], ['G', 1.1], ['D', 0.9]]) {
    const g = grilleDuPiedGenerique({ longueur_mm: 262, cote: c, largeur_rel: w }), avant = Float32Array.from(g.z), etat = { plantaire: { grille: g, rapport: {} } };
    const r = await traiterMessageA({ type: 'base', cote: c, params: { type: 'thermoformee', cote: c, forme_semelle: true, moulage_tetes: false }, elements: [] }, etat);
    assert.equal(r.rapport.ferme, true, c + w); assert.equal(r.rapport.degeneres, 0); assert.ok(r.rapport.volume_mm3 > 15000, 'volume ' + r.rapport.volume_mm3); assert.deepEqual(Array.from(g.z), Array.from(avant));
  }
});
T('alimente le mannequin : pied sculpté fermé sur l\'empreinte virtuelle, 5 orteils détectés, longueur du pied = longueur demandée', () => {
  const g = grilleDuPiedGenerique({ longueur_mm: 258, cote: 'D' }), o = detecterOrteils(g, champsPlantaires(g), 'D', 258 / 265); assert.equal(o.length, 5, 'orteils détectés : ' + o.length);
  const p = creerMannequin({ grille: g, longueur_mm: 258, cote: 'D' }).pied, v = verifierMaillage({ positions: p.positions, indices: p.indices, nbSommets: p.nbSommets, nbTriangles: p.nbTriangles }); assert.equal(v.ferme, true); assert.equal(v.aretesLibres, 0); assert.equal(p.ongles.nb, 5);
  let ymax = -1e9, ymin = 1e9; for (let i = 1; i < p.positions.length; i += 3) { ymax = Math.max(ymax, p.positions[i]); ymin = Math.min(ymin, p.positions[i]); } assert.ok(Math.abs(ymax - ymin - 258) < 6, 'longueur du pied ' + (ymax - ymin));
});
T('alimente l\'axe de Henke : têtes et axe par défaut calculables sur cette longueur', () => {
  const t = tetesParDefaut(265, 95, 45), a = axeParDefaut(265, t); assert.ok(Number.isFinite(a.deviation_deg) && Number.isFinite(a.inclinaison_deg));
});

test('mode B : le relief des têtes métatarsiennes n\'entre dans la semelle QUE si la case « Mouler les têtes » est cochée (décochée : plateau)', async () => {
  const g = grilleDuPiedGenerique({ longueur_mm: 265, cote: 'D' }), base = async (moulage) => traiterMessageA({ type: 'base', cote: 'D', params: { type: 'thermoformee', cote: 'D', forme_semelle: true, moulage_tetes: moulage }, elements: [] }, { plantaire: { grille: g, rapport: {} } });
  const non = await base(false), oui = await base(true); assert.equal(non.rapport.moulage_tetes, false); assert.equal(non.rapport.tetes_aplaties.applique, true); assert.equal(oui.rapport.moulage_tetes, true); assert.equal(oui.rapport.tetes_aplaties.applique, false);
  const z = (r) => { let a = 1e9, b = -1e9, n = 0; const P = r.positions; for (let i = 0; i < P.length; i += 3) { const y = P[i + 1]; if (y > 0.74 * 265 && y < 0.78 * 265) { a = Math.min(a, P[i + 2]); b = Math.max(b, P[i + 2]); n++; } } return { n, etal: b - a }; };
  const zn = z(non), zo = z(oui); assert.ok(zn.n > 100 && zo.n > 100); assert.ok(zo.etal > zn.etal + 0.5 || zo.etal > 1, 'décochée : ' + zn.etal.toFixed(2) + ' mm d\'étalement ; cochée : ' + zo.etal.toFixed(2));
});
