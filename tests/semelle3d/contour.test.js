import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceAuxSources, lisserContour, noeudsContour, regulariserMasque, chainesBord, corrigerRetournements, cellulesValides } from '../../js/semelle3d/calcul/contour.js';
import { construireBase } from '../../js/semelle3d/calcul/base.js';
import { maillerBase } from '../../js/semelle3d/calcul/maillage_base.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { genererDome, modelePied } from '../../js/semelle3d/calcul/synthetique.js';
import { ecartContour, ellipsePoints, largeurA, facesHautesRetournees, grilleFn, blobAleatoire, boucleBordHaut, rugositeBoucle, grilleDentee } from './aides_base.js';

test('distance : transformée exacte = recherche exhaustive (grille 41x33, sources aléatoires)', () => {
  const nx = 41, ny = 33, pas = 0.5;
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const src = new Uint8Array(nx * ny);
  for (let k = 0; k < 25; k++) src[Math.floor(r() * nx * ny)] = 1;
  const d = distanceAuxSources(nx, ny, pas, src);
  const liste = []; for (let k = 0; k < src.length; k++) if (src[k]) liste.push([k % nx, Math.floor(k / nx)]);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let m = Infinity; for (const [a, b] of liste) m = Math.min(m, Math.hypot(i - a, j - b) * pas);
    assert.ok(Math.abs(d[j * nx + i] - m) < 1e-9, `(${i},${j}) ${d[j * nx + i]} vs ${m}`);
  }
});

test('contour : rectangle 10x8 nœuds -> 2*(9+7) = 32 nœuds de bord, aucun à l\'intérieur', () => {
  const g = grilleFn(14, 12, (x, y) => (x >= 1 && x <= 5 && y >= 1 && y <= 4 ? 3 : NaN), 0.5, 0, 0);
  const { utilise, bord } = noeudsContour(g);
  let nb = 0, nu = 0; for (const v of bord) nb += v; for (const v of utilise) nu += v;
  assert.equal(nu, 9 * 7); assert.equal(nb, 2 * (9 - 1) + 2 * (7 - 1));
});

test('contour lissé : les nœuds du bord glissent VERS L\'EXTÉRIEUR, de moins de 0,7 pas, les autres ne bougent pas', () => {
  const g = genererDome();
  const c = lisserContour(g, { relaxer: false, prolonger: false, corriger: false }); // placement seul
  const { nx, ny, pas } = g;
  let deplaces = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, d = Math.hypot(c.dx[k], c.dy[k]);
    if (!c.bord[k]) { assert.equal(d, 0, 'nœud intérieur déplacé'); continue; }
    assert.ok(d <= 0.7 * pas + 1e-6, 'déplacement ' + d);
    if (d > 0) {
      deplaces++;
      // vers l'extérieur de l'ellipse : le nœud s'éloigne du centre (45 ; 125)
      const x = i * pas, y = j * pas, u = ((x - 45) / 45) ** 2 + ((y - 125) / 125) ** 2;
      const u2 = ((x + c.dx[k] - 45) / 45) ** 2 + ((y + c.dy[k] - 125) / 125) ** 2;
      assert.ok(u2 > u, 'nœud déplacé vers l\'intérieur');
    }
  }
  assert.ok(deplaces > 1000, 'peu de nœuds déplacés : ' + deplaces);
});

// --- Écart au contour théorique (critère du lot 2) : ellipse de demi-axes 45 x 125 mm centrée en (45 ; 125) ---
test('contour théorique (ellipse) : l\'écart chiffré est divisé par plus de 2 par le lissage, largeur 90 mm retrouvée à 0,6 mm', () => {
  const g = genererDome();
  const pts = ellipsePoints(45, 125, 45, 125);
  const esc = maillerBase(construireBase(g, { type: 'plate', contour_lisse: false }));
  const lis = maillerBase(construireBase(g, { type: 'plate', contour_lisse: true }));
  const e0 = ecartContour(esc, pts), e1 = ecartContour(lis, pts);
  const l0 = largeurA(esc, 125), l1 = largeurA(lis, 125);
  console.log(`  écart au contour théorique (ellipse 90 x 250 mm) : escalier max ${e0.max.toFixed(3)} / moyen ${e0.moyenne.toFixed(3)} mm ; lissé max ${e1.max.toFixed(3)} / moyen ${e1.moyenne.toFixed(3)} mm ; largeur ${l0.toFixed(2)} -> ${l1.toFixed(2)} mm (théorique 90)`);
  assert.ok(e0.max > 0.6, 'témoin : l\'escalier doit être mesuré à > 0,6 mm, mesuré ' + e0.max);
  assert.ok(e1.max < 0.45, 'écart max lissé ' + e1.max);
  assert.ok(e1.moyenne < 0.12, 'écart moyen lissé ' + e1.moyenne);
  assert.ok(e1.moyenne < e0.moyenne / 2, 'le lissage doit diviser l\'écart moyen par plus de 2');
  assert.ok(Math.abs(90 - l1) < 0.6, 'largeur ' + l1);
  assert.ok(90 - l0 > 0.9, 'témoin : l\'escalier perd ~1 mm, mesuré ' + (90 - l0));
});

test('contour théorique (contour de pied synthétique) : écart moyen < 0,15 mm, max < 1,0 mm (angles vifs du dessin arrondis)', () => {
  const m = modelePied({ longueur_mm: 265, cote: 'D' });
  const g = grilleFn(281, 531, (x, y) => (m.dedans(x - 70, y) ? 3 : NaN), 0.5, 0, 0); // x décalé de -70 comme grilleCanonique
  // contour analytique échantillonné finement
  const pts = []; const L = 265;
  for (let y = 0; y <= L; y += 0.01) { const u = y / L; let w = 0; // demi-largeur lue par dedans (bissection en x)
    const c = m.centre(y); let lo = 0, hi = 60; if (!m.dedans(c, y)) continue;
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (m.dedans(c + mid, y)) lo = mid; else hi = mid; }
    w = lo; void u; pts.push(c - w + 70, y, c + w + 70, y); }
  for (const y of [0.05, 0.1, 0.2, 0.5, 1, 2, 2.65, L - 2.65, L - 0.5, L - 0.2, L - 0.1, L - 0.05]) {
    const c = m.centre(y); for (let x = -60; x <= 60; x += 0.01) { const a = m.dedans(c + x, y), b = m.dedans(c + x + 0.01, y); if (a !== b) pts.push(c + x + 70, y); }
  }
  // l'extrémité du talon / des orteils (y proche de 0 ou L) : on complète par échantillonnage de l'indicateur
  for (let y = 0; y <= 3; y += 0.02) for (let x = -30; x <= 30; x += 0.02) { const a = m.dedans(x, y), b = m.dedans(x + 0.02, y), c2 = m.dedans(x, y + 0.02); if (a !== b || a !== c2) pts.push(x + 70, y); }
  for (let y = L - 3; y <= L; y += 0.02) for (let x = -30; x <= 30; x += 0.02) { const a = m.dedans(x, y), b = m.dedans(x + 0.02, y), c2 = m.dedans(x, y + 0.02); if (a !== b || a !== c2) pts.push(x + 70, y); }
  const P = Float64Array.from(pts);
  const lis = maillerBase(construireBase(g, { type: 'plate', contour_lisse: true }));
  const esc = maillerBase(construireBase(g, { type: 'plate', contour_lisse: false }));
  const e1 = ecartContour(lis, P), e0 = ecartContour(esc, P);
  console.log(`  contour de pied : escalier max ${e0.max.toFixed(3)} / moyen ${e0.moyenne.toFixed(3)} ; lissé max ${e1.max.toFixed(3)} / moyen ${e1.moyenne.toFixed(3)} mm`);
  assert.ok(e1.moyenne < 0.15, 'moyen ' + e1.moyenne);
  // Le dessin synthétique du pied a des ANGLES VIFS (talon et pointe, mesurés à 0,8-0,9 mm) : le lissage les arrondit, c'est voulu ;
  // un vrai pied n'en a pas. Hors angles, l'erreur est celle de l'ellipse (test précédent, max < 0,45 mm).
  assert.ok(e1.max < 1.0, 'max ' + e1.max);
  assert.ok(e1.moyenne < e0.moyenne / 2, 'le lissage doit diviser l\'écart moyen par plus de 2');
});

test('contour lissé : maillage fermé, sans triangle dégénéré ni face haute retournée (ellipse + 25 formes aléatoires)', () => {
  const grilles = [genererDome()];
  for (let s = 1; s <= 25; s++) grilles.push(blobAleatoire(s * 7919));
  for (const [n, g] of grilles.entries()) {
    const m = maillerBase(construireBase(g, { type: 'thermoformee', taux: 1, contour_lisse: true }));
    const v = verifierMaillage(m);
    assert.equal(v.ferme, true, 'forme ' + n + ' non fermée');
    assert.equal(v.degeneres, 0, 'forme ' + n + ' : dégénérés');
    assert.ok(v.volume > 0, 'forme ' + n + ' : volume');
    assert.equal(facesHautesRetournees(m), 0, 'forme ' + n + ' : faces hautes retournées');
  }
});

// ---------------- lissage du contour (retour de Joël : « pas lissé, des vagues à l'avant ») ----------------
test('contour lissé : un bord DENTÉ (±1 mm, période 2 mm) devient lisse — rugosité divisée par plus de 3, inflexions divisées par plus de 2', () => {
  const g = grilleDentee(5);
  const esc = maillerBase(construireBase(g, { type: 'plate', contour_lisse: false }));
  const lis = maillerBase(construireBase(g, { type: 'plate', contour_lisse: true }));
  const r0 = rugositeBoucle(boucleBordHaut(esc)), r1 = rugositeBoucle(boucleBordHaut(lis));
  console.log(`  bord denté : rugosité max ${r0.max.toFixed(3)} -> ${r1.max.toFixed(3)} mm, moyenne ${r0.moyenne.toFixed(3)} -> ${r1.moyenne.toFixed(3)} mm, inflexions ${r0.inflexions} -> ${r1.inflexions}`);
  assert.ok(r0.max > 0.6, 'témoin : le bord denté doit être rugueux (' + r0.max + ')');
  // 0,14 mm mesuré ; sans le lissage le long du bord : 0,24 mm (ce seuil prouve donc cette étape)
  assert.ok(r1.max < 0.18, 'rugosité max lissée ' + r1.max);
  assert.ok(r1.moyenne < r0.moyenne / 3, 'rugosité moyenne ' + r1.moyenne + ' vs ' + r0.moyenne);
  assert.ok(r1.inflexions < r0.inflexions / 2, 'inflexions ' + r1.inflexions + ' vs ' + r0.inflexions);
  assert.equal(verifierMaillage(lis).ferme, true); assert.equal(facesHautesRetournees(lis), 0);
});

test('contour lissé : le bord denté reste fidèle à la forme sous-jacente (cercle de 20 mm) à moins de 1,2 mm près, aire conservée à 5 %', () => {
  const g = grilleDentee(5);
  const lis = maillerBase(construireBase(g, { type: 'plate', contour_lisse: true }));
  const bv = boucleBordHaut(lis);
  let mx = 0; for (const [x, y] of bv) mx = Math.max(mx, Math.abs(Math.hypot(x - 30, y - 30) - 20));
  assert.ok(mx < 1.2, 'écart au cercle ' + mx);
  const aire = Math.abs(bv.reduce((a, [x, y], i) => { const [x2, y2] = bv[(i + 1) % bv.length]; return a + (x * y2 - x2 * y); }, 0) / 2);
  // le flou du masque (σ 3 mm) rétrécit un disque de 20 mm de ~0,2 mm de rayon (≈ 2 % d'aire) et les dents sont rognées
  assert.ok(Math.abs(aire / (Math.PI * 400) - 1) < 0.05, 'aire ' + aire);
});

test('masque régularisé : une pointe isolée (1 nœud) est effacée, un trou d\'un nœud est comblé, l\'entrée reste intacte', () => {
  const g = grilleFn(60, 60, (x, y) => ((x >= 5 && x <= 24 && y >= 5 && y <= 24) || (x === 15 && y > 24 && y <= 25.5) ? 4 : NaN), 0.5, 0, 0);
  const trou = 20 * 60 + 20; g.z[trou] = NaN; // trou au centre
  const avant = Float32Array.from(g.z);
  const r = regulariserMasque(g, 3);
  assert.deepEqual(g.z, avant);
  assert.ok(Number.isFinite(r.grille.z[trou]) && Math.abs(r.grille.z[trou] - 4) < 1e-5, 'trou non comblé');
  const pointe = Math.round(25.5 / 0.5) * 60 + 30;
  assert.ok(Number.isNaN(r.grille.z[pointe]), 'pointe non effacée');
  assert.ok(r.stats.noeuds_retires >= 1 && r.stats.noeuds_ajoutes >= 1);
});

test('masque régularisé : une forme déjà lisse et large est quasi inchangée (disque de 30 mm : écart d\'aire < 3 %), hauteurs conservées', () => {
  const g = grilleFn(161, 161, (x, y) => (Math.hypot(x - 40, y - 40) <= 30 ? 2.5 : NaN));
  const r = regulariserMasque(g, 3);
  let n0 = 0, n1 = 0; for (const v of g.z) if (Number.isFinite(v)) n0++; for (const v of r.grille.z) if (Number.isFinite(v)) n1++;
  assert.ok(Math.abs(n1 / n0 - 1) < 0.03, `nœuds ${n0} -> ${n1}`);
  for (const v of r.grille.z) if (Number.isFinite(v)) assert.ok(Math.abs(v - 2.5) < 1e-5);
});

test('chaîne du bord : un rectangle donne UNE boucle fermée de 2*(a+b) nœuds, voisins consécutifs distants d\'un pas, lissable', () => {
  const g = grilleFn(20, 16, (x, y) => (x >= 1 && x <= 5 && y >= 1 && y <= 4 ? 3 : NaN), 0.5, 0, 0); // 9 x 7 nœuds
  const ch = chainesBord(g);
  assert.equal(ch.length, 1); assert.equal(ch[0].lissable, true); assert.equal(ch[0].noeuds.length, 2 * (8 + 6));
  const L = ch[0].noeuds;
  for (let t = 0; t < L.length; t++) { const a = L[t], b = L[(t + 1) % L.length]; assert.equal(Math.abs((a % 20) - (b % 20)) + Math.abs(Math.floor(a / 20) - Math.floor(b / 20)), 1); }
  assert.equal(new Set(L).size, L.length);
});

test('correction des retournements : un déplacement qui retourne une cellule est réduit jusqu\'à ce qu\'aucun triangle ne soit retourné ou écrasé', () => {
  const g = grilleFn(12, 12, () => 3, 0.5, 0, 0);
  const n = 144, dx = new Float32Array(n), dy = new Float32Array(n);
  dx[5 * 12 + 5] = 0.9; dy[5 * 12 + 5] = 0.9; // le nœud (5,5) traverse la cellule (5,5)
  const r = corrigerRetournements(g, dx, dy);
  assert.ok(r.corrigees > 0, 'le témoin doit déclencher la correction');
  const cel = cellulesValides(g), pas = 0.5;
  const air = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let j = 0; j < 11; j++) for (let i = 0; i < 11; i++) {
    if (!cel[j * 12 + i]) continue;
    const k = j * 12 + i, P = [[i, j, k], [i + 1, j, k + 1], [i + 1, j + 1, k + 13], [i, j + 1, k + 12]].map(([a, b, kk]) => [a * pas + dx[kk], b * pas + dy[kk]]);
    assert.ok(air(P[0], P[1], P[2]) > 0.0025 && air(P[0], P[2], P[3]) > 0.0025, `cellule ${i},${j} retournée`);
  }
  const zero = corrigerRetournements(g, new Float32Array(n), new Float32Array(n));
  assert.equal(zero.corrigees, 0);
});

test('prolongement : le déplacement du bord se propage aux nœuds voisins (décroissant), aucun effet au-delà de 3,2 mm du bord', () => {
  const g = grilleFn(121, 121, (x, y) => (Math.hypot(x - 30, y - 30) <= 20 ? 3 : NaN));
  const avec = lisserContour(g, { prolonger: true, corriger: false, relaxer: false });
  const sans = lisserContour(g, { prolonger: false, corriger: false, relaxer: false });
  let proches = 0, lointains = 0;
  for (let j = 0; j < 121; j++) for (let i = 0; i < 121; i++) {
    const k = j * 121 + i;
    if (sans.bord[k] || !Number.isFinite(g.z[k])) continue;
    const d = 20 - Math.hypot(i * 0.5 - 30, j * 0.5 - 30);
    const dep = Math.hypot(avec.dx[k], avec.dy[k]);
    if (d < 1.2 && dep > 1e-4) proches++;
    if (d > 3.2) { lointains++; assert.equal(dep, 0, 'déplacement à ' + d + ' mm du bord'); }
  }
  assert.ok(proches > 20, 'nœuds voisins déplacés : ' + proches);
  assert.ok(lointains > 1000);
});
