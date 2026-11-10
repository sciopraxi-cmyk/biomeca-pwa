// Pied mannequin posé SUR l'empreinte (pied sculpté resserré sur le contour et le relief du scan) et sans empreinte (proportions mises à l'échelle). Scans SYNTHÉTIQUES.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerMannequin, maillagePiedEmpreinte } from '../../js/semelle3d/calcul/pied_sculpte.js';
import { grilleDuModele, champsPlantaires, detecterOrteils } from '../../js/semelle3d/calcul/mannequin.js';
import { modelePiedRealiste } from '../../js/semelle3d/calcul/pied_realiste.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { MANNEQUIN } from '../../js/semelle3d/constantes.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message) }); a.cause = e; throw a; } };
const T = (nom, f) => test(nom, () => garde(f));
const grille = (cote = 'D', L = 265, voute = 15) => grilleDuModele(modelePiedRealiste({ longueur_mm: L, cote, voute_mm: voute }));
const cache = {}; const sur = (cote = 'D', L = 265, voute = 15) => (cache[cote + L + voute] ||= creerMannequin({ grille: grille(cote, L, voute), longueur_mm: L, cote }));
const boite = (p) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.positions.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p.positions[i + a]); mx[a] = Math.max(mx[a], p.positions[i + a]); } return { mn, mx }; };
const etendue = (g) => { let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) if (g.z[j * g.nx + i] === g.z[j * g.nx + i]) { const x = g.ox + i * g.pas, y = g.oy + j * g.pas; xa = Math.min(xa, x); xb = Math.max(xb, x); ya = Math.min(ya, y); yb = Math.max(yb, y); } return { xa, xb, ya, yb }; };
const dedans = (g, x, y) => { const i = Math.round((x - g.ox) / g.pas), j = Math.round((y - g.oy) / g.pas); return i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.z[j * g.nx + i] === g.z[j * g.nx + i]; };
const distanceContour = (g, x, y, rmax) => { const ci = Math.round((x - g.ox) / g.pas), cj = Math.round((y - g.oy) / g.pas), R = Math.ceil(rmax / g.pas); let best = Infinity; for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) { const i = ci + di, j = cj + dj; if (i >= 0 && j >= 0 && i < g.nx && j < g.ny && g.z[j * g.nx + i] === g.z[j * g.nx + i]) best = Math.min(best, Math.hypot(di, dj) * g.pas); } return best; };
const largeurA = (p, y, zmax = 30) => { let a = 1e9, b = -1e9; for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i + 1] - y) < 2 && p.positions[i + 2] < zmax) { a = Math.min(a, p.positions[i]); b = Math.max(b, p.positions[i]); } return b - a; };
const largeurG = (g, y) => { const j = Math.round((y - g.oy) / g.pas); let a = 1e9, b = -1e9; for (let i = 0; i < g.nx; i++) if (g.z[j * g.nx + i] === g.z[j * g.nx + i]) { a = Math.min(a, i); b = Math.max(b, i); } return (b - a) * g.pas; };

T('sur empreinte : un seul volume fermé, sans arête libre, orienté vers l\'extérieur, de volume plausible ; D et G', () => {
  for (const c of ['D', 'G']) { const p = sur(c).pied, v = verifierMaillage({ positions: p.positions, indices: p.indices, nbSommets: p.nbSommets, nbTriangles: p.nbTriangles }); assert.equal(v.ferme, true, c); assert.equal(v.aretesLibres, 0); assert.equal(v.nonManifold, 0); assert.equal(v.degeneres, 0); assert.ok(v.volume > 0.7e6 && v.volume < 1.4e6, c + ' volume ' + v.volume); }
  assert.equal(sur('D').source, 'empreinte');
});
T('sur empreinte : le talon et le bout du pied sont calés sur la première et la dernière rangée de l\'empreinte', () => {
  for (const [c, L] of [['D', 265], ['G', 240]]) { const g = grille(c, L), e = etendue(g), b = boite(sur(c, L).pied); assert.ok(Math.abs(b.mn[1] - e.ya) < 2, 'talon ' + b.mn[1] + ' / ' + e.ya); assert.ok(Math.abs(b.mx[1] - e.yb) < 3, 'bout ' + b.mx[1] + ' / ' + e.yb); }
});
T('sur empreinte : au niveau du sol, le pied reste dans le contour (≤ 1,5 mm) et le remplit (largeur ≥ 85 % de celle de l\'empreinte au talon, au médio-pied et à l\'avant-pied)', () => {
  for (const c of ['D', 'G']) {
    const g = grille(c), p = sur(c).pied; let pire = 0; for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 2] < 12) pire = Math.max(pire, dedans(g, p.positions[i], p.positions[i + 1]) ? 0 : distanceContour(g, p.positions[i], p.positions[i + 1], 6));
    assert.ok(pire <= 1.5, c + ' : débord ' + pire);
    for (const y of [40, 110, 170]) assert.ok(largeurA(p, y) >= 0.85 * largeurG(g, y), c + ' y=' + y + ' : ' + largeurA(p, y).toFixed(1) + ' / ' + largeurG(g, y).toFixed(1));
  }
});
T('sur empreinte : le resserrement seul (sans recadrage) amène la largeur du pied à celle de l\'empreinte (écart ≤ 6 mm au talon, médio-pied, avant-pied, base des orteils) ; la jambe garde sa largeur', () => {
  const g = grille('D'), p = maillagePiedEmpreinte(g, { longueur_mm: 265, cote: 'D', marge_mm: 80 });
  const bande = (y) => { let a = 1e9, b = -1e9; for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i + 1] - y) < 1.5 && p.positions[i + 2] >= 20 && p.positions[i + 2] < 28) { a = Math.min(a, p.positions[i]); b = Math.max(b, p.positions[i]); } return b - a; }; // largeur du pied entre 20 et 28 mm au-dessus du sol (le plus large)
  for (const y of [40, 110, 170, 200]) { const e = bande(y) - largeurG(g, y); assert.ok(Math.abs(e) <= 6, 'y=' + y + ' : écart ' + e.toFixed(1)); }
  let a = 1e9, b = -1e9; for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i + 1] - 45) < 1.5 && p.positions[i + 2] > 95 && p.positions[i + 2] < 105) { a = Math.min(a, p.positions[i]); b = Math.max(b, p.positions[i]); }
  assert.ok(b - a > 60 && b - a < 68, 'largeur de la jambe à 100 mm : ' + (b - a).toFixed(1));
});
T('sur empreinte : le contour de l\'empreinte commande la forme (empreinte resserrée de 5 mm de chaque côté -> pied plus étroit d\'autant)', () => {
  const g = grille('D'); // l'empreinte entière est resserrée de 5 mm de chaque côté (rangées assez larges seulement)
  const rec = (g0, mm) => { const z = new Float32Array(g0.z.length).fill(NaN); for (let jj = 0; jj < g0.ny; jj++) { let a = 1e9, b = -1e9; for (let i = 0; i < g0.nx; i++) if (g0.z[jj * g0.nx + i] === g0.z[jj * g0.nx + i]) { a = Math.min(a, i); b = Math.max(b, i); } if (a > b) continue; const m = Math.round(mm / g0.pas); for (let i = a + (b - a > 3 * m ? m : 0); i <= b - (b - a > 3 * m ? m : 0); i++) z[jj * g0.nx + i] = g0.z[jj * g0.nx + i]; } return { ...g0, z }; };
  const etroit = rec(g, 5), p0 = sur('D').pied, p1 = creerMannequin({ grille: etroit, longueur_mm: 265, cote: 'D' }).pied;
  const w0 = largeurA(p0, 120), w1 = largeurA(p1, 120); assert.ok(w0 - w1 > 6 && w0 - w1 < 14, 'largeur ' + w0.toFixed(1) + ' -> ' + w1.toFixed(1));
});
T('sur empreinte : la plante suit le relief de l\'empreinte (hauteur + socle), jamais sous la plante ; une voûte plus haute relève le dessous', () => {
  const g = grille('D'), p = sur('D').pied; let sous = 0, ecart = 0, signe = 0, n = 0; for (let v = 0; v < p.nbSommets; v++) { if (p.normales[3 * v + 2] > -0.8) continue; const x = p.positions[3 * v], y = p.positions[3 * v + 1], z = p.positions[3 * v + 2]; if (!dedans(g, x, y)) continue; const i = Math.round((x - g.ox) / g.pas), j = Math.round((y - g.oy) / g.pas), r = Math.max(g.z[j * g.nx + i], 0) + 0.5; if (z < r - 1.2) sous++; ecart += Math.abs(z - r); signe += z - r; n++; }
  assert.equal(sous, 0, sous + ' sommets sous la plante'); assert.ok(n > 5000 && ecart / n < 1.5, 'écart moyen à la plante ' + ecart / n); assert.ok(signe / n > 0.1 && signe / n < 0.7, 'la plante est posée à 0,5 mm (en dur) au-dessus du relief (arêtes arrondies : +0,4 mm en moyenne) : ' + signe / n);
  const haute = creerMannequin({ grille: grille('D', 265, 28), longueur_mm: 265, cote: 'D' }).pied, zMin = (q, y0, y1, x0, x1) => { let m = 1e9; for (let i = 0; i < q.positions.length; i += 3) if (q.positions[i + 1] > y0 && q.positions[i + 1] < y1 && q.positions[i] > x0 && q.positions[i] < x1) m = Math.min(m, q.positions[i + 2]); return m; };
  assert.ok(zMin(haute, 90, 130, -30, -5) > zMin(p, 90, 130, -30, -5) + 4, 'voûte : ' + zMin(haute, 90, 130, -30, -5).toFixed(1) + ' / ' + zMin(p, 90, 130, -30, -5).toFixed(1));
});
T('sur empreinte : 5 ongles (un par orteil) posés dans le contour, jambe de 130 mm, decal = hauteur de plante sous chaque sommet, centre et cheville renseignés', () => {
  const g = grille('D'), p = sur('D').pied; assert.equal(p.ongles.nb, 5); assert.ok(p.ongles.indices.length >= 5 * 3 * 150, 'triangles d\'ongles ' + p.ongles.indices.length / 3);
  for (let i = 0; i < p.ongles.positions.length; i += 3) assert.ok(dedans(g, p.ongles.positions[i], p.ongles.positions[i + 1]) || distanceContour(g, p.ongles.positions[i], p.ongles.positions[i + 1], 4) < 3, 'ongle hors de l\'empreinte');
  assert.equal(p.ongles.decal.length, p.ongles.positions.length / 3); assert.equal(p.decal.length, p.nbSommets);
  const b = boite(p); assert.ok(b.mx[2] > 130 && b.mx[2] < 142, 'hauteur ' + b.mx[2]);
  for (let v = 0; v < p.nbSommets; v += 997) { const i = Math.round((p.positions[3 * v] - g.ox) / g.pas), j = Math.round((p.positions[3 * v + 1] - g.oy) / g.pas); if (p.positions[3 * v + 2] < 5 && dedans(g, p.positions[3 * v], p.positions[3 * v + 1])) assert.ok(Math.abs(p.decal[v] - (Math.max(g.z[j * g.nx + i], 0) + MANNEQUIN.socle_mm)) < 2, 'decal'); }
  assert.ok(Math.abs(p.z_cheville_mm - 76) < 1e-9 && p.centre.y_mm > 30 && p.centre.y_mm < 70 && p.longueur_mm === 265);
  assert.equal(creerMannequin({ grille: g, longueur_mm: 265, cote: 'D', details: false }).pied.ongles.indices.length, 0);
});
T('sur empreinte : chaque orteil garde la longueur de l\'orteil de l\'empreinte (écart du bout ≤ 4 mm), sans rester coupé par le contour', () => {
  const g = grille('D'), ch = champsPlantaires(g), det = detecterOrteils(g, ch, 'D', 1), p = sur('D').pied; assert.equal(det.length, 5);
  for (const d of det) { let ymax = -1e9; for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i] - d.cx) < d.largeur_mm / 3 && p.positions[i + 2] < 25) ymax = Math.max(ymax, p.positions[i + 1]); assert.ok(Math.abs(ymax - d.y) <= 4, 'orteil en x=' + d.cx.toFixed(0) + ' : bout ' + ymax.toFixed(1) + ' / empreinte ' + d.y.toFixed(1)); }
});
T('sur empreinte : dessus du pied continu (aucune marche : dérivée seconde de la hauteur le long de y < 3 mm entre 110 et 190 mm (hors jambe))', () => {
  const p = sur('D').pied, haut = (x, y) => { let m = -1e9; for (let i = 0; i < p.positions.length; i += 3) if (Math.abs(p.positions[i] - x) < 2.5 && Math.abs(p.positions[i + 1] - y) < 1) m = Math.max(m, p.positions[i + 2]); return m; };
  for (const x of [-10, 5]) for (let y = 110; y <= 190; y += 3) { const d2 = haut(x, y - 3) - 2 * haut(x, y) + haut(x, y + 3); assert.ok(Math.abs(d2) < 3, 'cassure en x=' + x + ' y=' + y + ' : ' + d2.toFixed(2)); }
});
T('sur empreinte : pied G = miroir du pied D (empreinte miroir)', () => {
  const d = boite(sur('D').pied), gg = boite(sur('G').pied); assert.ok(Math.abs(d.mx[2] - gg.mx[2]) < 1 && Math.abs((d.mx[1] - d.mn[1]) - (gg.mx[1] - gg.mn[1])) < 1.5);
  const larg = (q) => q.mx[0] - q.mn[0]; assert.ok(Math.abs(larg(d) - larg(gg)) < 1.5);
});
T('sans empreinte : proportions du pied sculpté mises à l\'échelle de la longueur (longueur, largeur, hauteur proportionnelles) ; ongles, decal, centre, cheville', () => {
  const a = creerMannequin({ longueur_mm: 265, cote: 'D' }), b = creerMannequin({ longueur_mm: 230, cote: 'D' }); assert.equal(a.source, 'sans_empreinte');
  const ba = boite(a.pied), bb = boite(b.pied), k = 230 / 265;
  assert.ok(Math.abs((bb.mx[1] - bb.mn[1]) / (ba.mx[1] - ba.mn[1]) - k) < 0.02, 'longueur'); assert.ok(Math.abs((bb.mx[0] - bb.mn[0]) / (ba.mx[0] - ba.mn[0]) - k) < 0.03, 'largeur'); assert.ok(Math.abs(bb.mx[2] / ba.mx[2] - k) < 0.03, 'hauteur');
  assert.equal(a.pied.ongles.nb, 5); assert.equal(a.pied.decal.length, a.pied.nbSommets); assert.ok(a.pied.decal.every((v) => v === 0)); assert.ok(Math.abs(b.pied.z_cheville_mm - 76 * k) < 1e-9 && b.pied.centre.y_mm > 0);
});
T('erreurs claires : côté invalide, grille vide, longueur invalide', () => {
  assert.throws(() => maillagePiedEmpreinte(grille('D'), { longueur_mm: 265, cote: 'X' }), /côté/);
  assert.throws(() => maillagePiedEmpreinte({ nx: 10, ny: 10, pas: 0.5, ox: 0, oy: 0, z: new Float32Array(100).fill(NaN) }, { longueur_mm: 265, cote: 'D' }), /vide/);
  assert.throws(() => creerMannequin({ longueur_mm: 50 }), /longueur/);
});

// Retours de Joël (05/11) sur le scan de démonstration : pas de pointe latérale au 5e orteil, pas de bosse au bord médial (tête du 1er métatarsien), gros orteil large dans le prolongement du bord médial.
test('démo réelle : aucun débord > 3 mm hors de l\'empreinte, bord médial régulier, gros orteil prolongeant le bord médial', async () => {
  const { traiterMessageA } = await import('../../js/semelle3d/calcul/pipeline.js');
  const etat = {}, d = await traiterMessageA({ type: 'demo', scenario: 'reel_droit_stl' }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat); await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  const g = etat.plantaire.grille, m = await traiterMessageA({ type: 'mannequin', cote: 'D', longueur_mm: d.longueur_suggeree_mm, forme_semelle: false }, etat), P = m.positions;
  const bords = (y) => { let a = 1e9, b = -1e9; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 1 && P[i + 2] < 30) { a = Math.min(a, P[i]); b = Math.max(b, P[i]); } return [a, b]; };
  const emp = (y) => { const j = Math.round((y - g.oy) / g.pas); let a = 1e9, b = -1e9; for (let i = 0; i < g.nx; i++) if (Number.isFinite(g.z[j * g.nx + i])) { a = Math.min(a, g.ox + i * g.pas); b = Math.max(b, g.ox + i * g.pas); } return [a, b]; };
  for (let y = 130; y <= 258; y += 4) { const [a, b] = bords(y), [ea, eb] = emp(y); assert.ok(ea - a < 3 && b - eb < 3, 'débord à y=' + y + ' : médial ' + (ea - a).toFixed(1) + ', latéral ' + (b - eb).toFixed(1)); }
  let prec = bords(150)[0]; for (let y = 154; y <= 214; y += 4) { const a = bords(y)[0]; assert.ok(a - prec > -5, 'bosse du bord médial à y=' + y + ' : ' + (a - prec).toFixed(1)); prec = a; } // le bord médial ne recule jamais de plus de 5 mm en 4 mm d'avancée
  const [a, b] = bords(236), [ea] = emp(236); assert.ok(Math.abs(a - ea) < 2.5, 'gros orteil prolonge le bord médial : ' + a.toFixed(1) + ' / ' + ea.toFixed(1));
  const [, l5] = bords(222), [, el5] = emp(222); assert.ok(el5 - l5 < 5, '5e orteil rejoint le bord latéral : ' + l5.toFixed(1) + ' / ' + el5.toFixed(1)); void b;
});
