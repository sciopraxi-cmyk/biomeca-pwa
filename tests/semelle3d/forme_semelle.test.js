// Forme de semelle classique (04/11) : devant arrondi sans orteils ; contour de l'empreinte gardé au talon et sur les bords médial et latéral.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formeSemelle } from '../../js/semelle3d/calcul/forme_semelle.js';
import { construireBase, validerParametresBase } from '../../js/semelle3d/calcul/base.js';
import { grilleDuModele } from '../../js/semelle3d/calcul/mannequin.js';
import { modelePiedRealiste } from '../../js/semelle3d/calcul/pied_realiste.js';
import { FORME_SEMELLE, BASE_DEFAUTS } from '../../js/semelle3d/constantes.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message) }); a.cause = e; throw a; } };
const T = (nom, f) => test(nom, () => garde(f));
const grille = (c = 'D', L = 265) => grilleDuModele(modelePiedRealiste({ longueur_mm: L, cote: c, voute_mm: 15 }));
const etendue = (g, j) => { let a = 1e9, b = -1; for (let i = 0; i < g.nx; i++) if (Number.isFinite(g.z[j * g.nx + i])) { a = Math.min(a, i); b = Math.max(b, i); } return a <= b ? [a, b] : null; };
const rangees = (g) => { let a = 1e9, b = -1; for (let j = 0; j < g.ny; j++) if (etendue(g, j)) { a = Math.min(a, j); b = Math.max(b, j); } return [a, b]; };
const trous = (g, j) => { const e = etendue(g, j); if (!e) return 0; let n = 0, dans = true; for (let i = e[0]; i <= e[1]; i++) { const v = Number.isFinite(g.z[j * g.nx + i]); if (!v && dans) { n++; dans = false; } else if (v) dans = true; } return n; };

T('devant arrondi : plus aucune encoche entre orteils (chaque rangée d\'un seul tenant), même longueur de pied', () => {
  const g = grille(), r = formeSemelle(g), [a, b] = rangees(g), [a2, b2] = rangees(r.grille);
  assert.equal(r.rapport.applique, true); assert.ok(Math.abs(b2 - b) <= 1 && a2 === a, 'longueur conservée');
  let avant = 0, apres = 0; for (let j = a + Math.round(0.8 * (b - a)); j <= b; j++) { avant += trous(g, j); apres += trous(r.grille, j); }
  assert.ok(avant > 5, 'l\'empreinte d\'origine a bien des encoches : ' + avant); assert.equal(apres, 0, 'aucune encoche après');
});
T('devant arrondi : le devant se referme en arc régulier (largeur décroissante vers la pointe, sans saut)', () => {
  const g = grille(), r = formeSemelle(g), [a, b] = rangees(r.grille), S = r.rapport.rangee_depart; let prec = null;
  for (let j = S; j <= b; j++) { const e = etendue(r.grille, j); if (!e) continue; const w = e[1] - e[0]; if (prec !== null) { assert.ok(w <= prec + 1, 'largeur croissante à la rangée ' + j); assert.ok(prec - w < 24, 'saut de largeur ' + (prec - w) + ' à ' + j); } prec = w; }
  const pointe = etendue(r.grille, b), w0 = etendue(r.grille, S); assert.ok(pointe[1] - pointe[0] < 0.3 * (w0[1] - w0[0]), 'pointe arrondie : ' + (pointe[1] - pointe[0]) + ' cellules pour ' + (w0[1] - w0[0]) + ' au départ'); assert.ok((w0[1] - w0[0]) * 0.5 > 70, 'largeur au départ de l\'arrondi ' + (w0[1] - w0[0]) * 0.5 + ' mm');
  assert.ok(b - S > 40, 'arc assez long');
});
T('devant arrondi : talon, bords médial et latéral gardés tels quels jusqu\'à la rangée de départ (empreinte identique)', () => {
  const g = grille(), r = formeSemelle(g), S = r.rapport.rangee_depart;
  for (let j = 0; j <= S; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; assert.equal(Number.isFinite(g.z[k]), Number.isFinite(r.grille.z[k]), 'masque modifié en (' + i + ',' + j + ')'); if (Number.isFinite(g.z[k])) assert.equal(r.grille.z[k], g.z[k]); }
});
T('devant arrondi : l\'empreinte d\'origine n\'est jamais modifiée', () => {
  const g = grille(), copie = Float32Array.from(g.z); formeSemelle(g);
  for (let k = 0; k < copie.length; k++) assert.ok(Object.is(copie[k], g.z[k]));
});
T('devant arrondi : le relief des orteils disparaît (écart d\'altitude du devant réduit à moins de 0,5 mm)', () => {
  const g = grille(), r = formeSemelle(g), [a, b] = rangees(g); let mn = 1e9, mx = -1e9, mn0 = 1e9, mx0 = -1e9;
  for (let j = a + Math.round(0.88 * (b - a)); j <= b - 3; j++) for (let i = 0; i < g.nx; i++) { const v = r.grille.z[j * g.nx + i], v0 = g.z[j * g.nx + i]; if (Number.isFinite(v)) { mn = Math.min(mn, v); mx = Math.max(mx, v); } if (Number.isFinite(v0)) { mn0 = Math.min(mn0, v0); mx0 = Math.max(mx0, v0); } }
  assert.ok(mx0 - mn0 > 3, 'les orteils d\'origine sont relevés : ' + (mx0 - mn0)); assert.ok(mx - mn < 0.5, 'plateau : ' + (mx - mn));
  const tete = []; for (let j = a + Math.round(0.74 * (b - a)); j <= a + Math.round(0.78 * (b - a)); j++) for (let i = 0; i < g.nx; i++) if (Number.isFinite(g.z[j * g.nx + i])) tete.push(g.z[j * g.nx + i]);
  tete.sort((x, y) => x - y); assert.ok(Math.abs((mx + mn) / 2 - tete[tete.length >> 1]) < 0.3, 'le plateau est le relief médian des têtes : ' + ((mx + mn) / 2) + ' contre ' + tete[tete.length >> 1]);
});
T('devant arrondi : pied gauche (miroir) aussi, et pied court ou vide refusés proprement', () => {
  const g = grille('G', 258), r = formeSemelle(g); assert.equal(r.rapport.applique, true);
  const [a, b] = rangees(r.grille); for (let j = a + Math.round(0.8 * (b - a)); j <= b; j++) assert.equal(trous(r.grille, j), 0);
  const petit = { nx: 20, ny: 40, pas: 1, ox: 0, oy: 0, z: new Float32Array(800).map((_, i) => ((i % 20) > 4 && (i % 20) < 15 ? 1 : NaN)) };
  assert.equal(formeSemelle(petit).rapport.applique, false);
  assert.throws(() => formeSemelle({ nx: 5, ny: 5, pas: 1, ox: 0, oy: 0, z: new Float32Array(25).fill(NaN) }), /vide/);
});
T('base : option forme_semelle — contour sans orteils, mêmes hauteurs que l\'empreinte au talon, rapport renseigné ; désactivée = comportement d\'avant', () => {
  const g = grille(), sans = construireBase(g, { forme_semelle: false }), avec = construireBase(g, { forme_semelle: true });
  assert.equal(avec.rapport.forme_semelle.applique, true); assert.equal(sans.rapport.forme_semelle.applique, false);
  const compte = (b) => { let n = 0; for (let k = 0; k < b.haut.length; k++) if (Number.isFinite(b.haut[k])) n++; return n; };
  assert.ok(compte(avec) !== compte(sans), 'le contour change');
  const [a, bb] = rangees(g); const j = a + Math.round(0.9 * (bb - a)); assert.equal(trous({ ...avec, z: avec.haut }, j), 0);
  const j2 = a + 30; for (let i = 0; i < g.nx; i++) assert.equal(Number.isFinite(avec.haut[j2 * g.nx + i]), Number.isFinite(sans.haut[j2 * g.nx + i]), 'talon inchangé');
});
T('paramètres : forme_semelle booléen (faux par défaut dans le noyau, la page la coche), autre type refusé', () => {
  assert.equal(BASE_DEFAUTS.forme_semelle, false); assert.equal(validerParametresBase({ forme_semelle: true }).forme_semelle, true);
  assert.throws(() => validerParametresBase({ forme_semelle: 'oui' }), TypeError);
  assert.ok(FORME_SEMELLE.u_depart_min < FORME_SEMELLE.u_depart && FORME_SEMELLE.u_depart < FORME_SEMELLE.u_depart_max);
});

// ---------------- case « Mouler les têtes métatarsiennes » (04/11, soir) : la voûte est gardée
import { aplatirTetes } from '../../js/semelle3d/calcul/forme_semelle.js';
const ligne = (g, u) => { const [a, b] = rangees(g), j = a + Math.round(u * (b - a)); const v = []; for (let i = 0; i < g.nx; i++) { const z = g.z[j * g.nx + i]; if (Number.isFinite(z)) v.push(z); } return v; };
T('têtes non moulées : la voûte (avant 0,68 de la longueur) est strictement inchangée, contour inchangé, entrée intacte', () => {
  const g = grille(), copie = Float32Array.from(g.z), r = aplatirTetes(g), [a, b] = rangees(g), jV = a + Math.round(0.68 * (b - a));
  assert.equal(r.rapport.applique, true);
  for (let j = 0; j < jV; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; assert.ok(Object.is(r.grille.z[k], g.z[k]), 'voûte modifiée en (' + i + ',' + j + ')'); }
  for (let k = 0; k < g.z.length; k++) { assert.equal(Number.isFinite(r.grille.z[k]), Number.isFinite(g.z[k])); assert.ok(Object.is(copie[k], g.z[k])); }
});
T('têtes non moulées : le relief des têtes devient un plateau (écart < 0,2 mm entre 0,74 et 0,8), raccord progressif sans marche > 1,5 mm entre rangées', () => {
  const g = grille(), r = aplatirTetes(g), [a, b] = rangees(g);
  const e = (gg, u) => { const v = ligne(gg, u); return Math.max(...v) - Math.min(...v); };
  assert.ok(e(g, 0.78) > 3, 'avant : relief marqué ' + e(g, 0.78)); assert.ok(e(r.grille, 0.78) < 0.2, 'après : plateau ' + e(r.grille, 0.78));
  let prec = null; for (let j = a + Math.round(0.6 * (b - a)); j <= a + Math.round(0.84 * (b - a)); j++) { const v = []; for (let i = 0; i < g.nx; i++) { const z = r.grille.z[j * g.nx + i]; if (Number.isFinite(z)) v.push(z); } const m = v.reduce((s, x) => s + x, 0) / v.length; if (prec !== null) assert.ok(Math.abs(m - prec) < 1.5, 'marche à la rangée ' + j + ' : ' + Math.abs(m - prec)); prec = m; }
});
T('têtes non moulées : le plateau est le relief MÉDIAN des têtes (une empreinte relevée de 4 mm donne un plateau relevé de 4 mm) ; le niveau de base de la semelle reste celui de l\'empreinte d\'origine', () => {
  const g = grille(), [a, b] = rangees(g), j0 = a + Math.round(0.74 * (b - a)), j1 = a + Math.round(0.78 * (b - a));
  const val = []; for (let j = j0; j <= j1; j++) for (let i = 0; i < g.nx; i++) if (Number.isFinite(g.z[j * g.nx + i])) val.push(g.z[j * g.nx + i]); val.sort((x, y) => x - y);
  const r = aplatirTetes(g); assert.ok(Math.abs(r.rapport.plateau_mm - val[val.length >> 1]) < 1e-6, 'plateau = médiane : ' + r.rapport.plateau_mm + ' / ' + val[val.length >> 1]);
  const h = { ...g, z: Float32Array.from(g.z, (v) => (Number.isFinite(v) ? v + 4 : v)) }, rh = aplatirTetes(h); assert.ok(Math.abs(rh.rapport.plateau_mm - r.rapport.plateau_mm - 4) < 1e-6, 'relevée de 4 mm : ' + rh.rapport.plateau_mm + ' / ' + r.rapport.plateau_mm);
  // niveau de base : creux profonds dans les têtes (minimum de l'empreinte) ; l'aplatissement ne doit pas relever le niveau de la voûte
  const z3 = Float32Array.from(g.z, (v) => (Number.isFinite(v) ? v + 5 : v)); for (let j = j0; j <= j1; j++) for (let i = 0; i < g.nx; i += 5) if (Number.isFinite(g.z[j * g.nx + i])) z3[j * g.nx + i] = 0.5;
  const g3 = { ...g, z: z3 }, moule = construireBase(g3, { moulage_tetes: true }), plat = construireBase(g3, { moulage_tetes: false }), jv = a + Math.round(0.4 * (b - a)); let n = 0;
  for (let i = 0; i < g.nx; i++) { const u = plat.haut[jv * g.nx + i], v = moule.haut[jv * g.nx + i]; if (Number.isFinite(u) && Number.isFinite(v)) { n++; assert.ok(Math.abs(u - v) < 1e-3, 'voûte décalée de ' + Math.abs(u - v)); } }
  assert.ok(n > 20);
});
T('têtes non moulées : les orteils gardent leur relief si le devant n\'est pas arrondi ; pied court refusé, empreinte vide = erreur', () => {
  const g = grille(), r = aplatirTetes(g), [a, b] = rangees(g), j = a + Math.round(0.93 * (b - a));
  let diff = 0; for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; if (Number.isFinite(g.z[k])) diff = Math.max(diff, Math.abs(g.z[k] - r.grille.z[k])); }
  assert.ok(diff < 0.05, 'orteils inchangés : ' + diff);
  assert.equal(aplatirTetes({ nx: 20, ny: 40, pas: 1, ox: 0, oy: 0, z: new Float32Array(800).map((_, i) => ((i % 20) > 4 && (i % 20) < 15 ? 1 : NaN)) }).rapport.applique, false);
  assert.throws(() => aplatirTetes({ nx: 5, ny: 5, pas: 1, ox: 0, oy: 0, z: new Float32Array(25).fill(NaN) }), /vide/);
});
T('base : moulage_tetes décoché = rapport « aplati » et hauteurs du devant plus uniformes ; coché (défaut du noyau) = comportement d\'avant ; autre type refusé', () => {
  const g = grille(), moule = construireBase(g, { moulage_tetes: true }), plat = construireBase(g, { moulage_tetes: false });
  assert.equal(moule.rapport.moulage_tetes, true); assert.equal(plat.rapport.moulage_tetes, false); assert.equal(plat.rapport.tetes_aplaties.applique, true); assert.equal(moule.rapport.tetes_aplaties.applique, false);
  const [a, b] = rangees(g), j = a + Math.round(0.78 * (b - a)); const etalement = (bb) => { const v = []; for (let i = 0; i < g.nx; i++) { const z = bb.haut[j * g.nx + i]; if (Number.isFinite(z)) v.push(z); } return Math.max(...v) - Math.min(...v); };
  assert.ok(etalement(plat) < etalement(moule) - 0.5, 'plus uniforme : ' + etalement(plat) + ' contre ' + etalement(moule));
  const jv = a + Math.round(0.4 * (b - a)); for (let i = 0; i < g.nx; i++) assert.ok(Math.abs((plat.haut[jv * g.nx + i] || 0) - (moule.haut[jv * g.nx + i] || 0)) < 1e-4 || !Number.isFinite(plat.haut[jv * g.nx + i]), 'voûte de la base inchangée');
  assert.equal(BASE_DEFAUTS.moulage_tetes, true); assert.throws(() => validerParametresBase({ moulage_tetes: 1 }), TypeError);
});

test('ajusterAuContour : les rangées du devant sont resserrées dans le contour de la semelle, le reste ne change pas', async () => {
  const { ajusterAuContour } = await import('../../js/semelle3d/calcul/mannequin.js');
  const nx = 40, ny = 40, mk = (f) => { const z = new Float32Array(nx * ny).fill(NaN); for (let j = 0; j < ny; j++) { const [a, b] = f(j); for (let i = a; i <= b; i++) z[j * nx + i] = 1; } return { nx, ny, pas: 1, z }; };
  const pied = mk(() => [5, 34]), semelle = mk((j) => (j < 20 ? [5, 34] : [12, 27]));
  const r = ajusterAuContour(pied, semelle), larg = (g, j) => { let a = 99, b = -1; for (let i = 0; i < nx; i++) if (Number.isFinite(g.z[j * nx + i])) { a = Math.min(a, i); b = Math.max(b, i); } return b - a; };
  assert.equal(larg(r, 5), 29); assert.ok(larg(r, 30) < 29 && larg(r, 30) >= 22, 'rangée 30 : ' + larg(r, 30));
  assert.ok(r.retrecies > 0);
  assert.equal(ajusterAuContour(pied, pied).retrecies, 0);
});
