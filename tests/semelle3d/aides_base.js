// Aides de tests du lot 2 (aucun test ici).
import { creerGrille, remplir } from '../../js/semelle3d/calcul/grille.js';

// Arêtes dirigées du bord de la face supérieure (celles dont l'inverse n'existe pas parmi les triangles du haut).
export function aretesBordHaut(m) {
  const I = m.indices, dir = new Set();
  const haut = (i) => i % 2 === 0;
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    if (!tri.every(haut)) continue;
    for (let e = 0; e < 3; e++) dir.add(tri[e] + '>' + tri[(e + 1) % 3]);
  }
  const out = [];
  for (const k of dir) { const [p, q] = k.split('>').map(Number); if (!dir.has(q + '>' + p)) out.push([p, q]); }
  return out;
}
export function sommetsBord(m) { const s = new Set(); for (const [p, q] of aretesBordHaut(m)) { s.add(p); s.add(q); } return [...s]; }
// Aire du contour (formule du lacet) lue sur le maillage produit : recoupement indépendant de la triangulation.
export function aireContour(m) {
  let a = 0;
  for (const [p, q] of aretesBordHaut(m)) a += m.positions[3 * p] * m.positions[3 * q + 1] - m.positions[3 * q] * m.positions[3 * p + 1];
  return a / 2;
}
// Faces hautes retournées (aire signée dans le plan XY <= 0) : doit valoir 0.
export function facesHautesRetournees(m) {
  let n = 0;
  const I = m.indices, P = m.positions;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (a % 2 || b % 2 || c % 2) continue;
    const s = (P[3 * b] - P[3 * a]) * (P[3 * c + 1] - P[3 * a + 1]) - (P[3 * b + 1] - P[3 * a + 1]) * (P[3 * c] - P[3 * a]);
    if (!(s > 0)) n++;
  }
  return n;
}
export function ellipsePoints(cx, cy, a, b, n = 40000) {
  const pts = new Float64Array(2 * n);
  for (let t = 0; t < n; t++) { const u = (2 * Math.PI * t) / n; pts[2 * t] = cx + a * Math.cos(u); pts[2 * t + 1] = cy + b * Math.sin(u); }
  return pts;
}
export function distanceMin(x, y, pts) {
  let d = Infinity;
  for (let k = 0; k < pts.length; k += 2) { const dd = (pts[k] - x) ** 2 + (pts[k + 1] - y) ** 2; if (dd < d) d = dd; }
  return Math.sqrt(d);
}
export function ecartContour(m, pts) {
  const bv = sommetsBord(m);
  let max = 0, somme = 0;
  for (const i of bv) { const d = distanceMin(m.positions[3 * i], m.positions[3 * i + 1], pts); max = Math.max(max, d); somme += d; }
  return { n: bv.length, max, moyenne: somme / bv.length };
}
export function largeurA(m, y, tol = 1) {
  let a = Infinity, b = -Infinity;
  for (let k = 0; k < m.positions.length; k += 3) if (Math.abs(m.positions[k + 1] - y) < tol) { a = Math.min(a, m.positions[k]); b = Math.max(b, m.positions[k]); }
  return b - a;
}
// Grille rectangulaire dont chaque nœud vaut fn(x, y) (NaN = hors contour).
export function grilleFn(nx, ny, fn, pas = 0.5, ox = 0, oy = 0) { return remplir(creerGrille(nx, ny, pas, ox, oy), fn); }
// Image miroir en X (le nœud i devient nx-1-i ; l'origine suit).
export function miroirGrille(g) {
  const z = new Float32Array(g.z.length);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) z[j * g.nx + i] = g.z[j * g.nx + (g.nx - 1 - i)];
  return { ...g, ox: -(g.ox + (g.nx - 1) * g.pas), z };
}
// Blob aléatoire reproductible (graine) pour les tests de propriété.
export function blobAleatoire(graine) {
  let s = graine >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = 4 + Math.floor(r() * 3);
  const ph = [], am = [];
  for (let k = 0; k < n; k++) { ph.push(r() * 6.283); am.push(0.08 * r()); }
  const R0 = 14 + 6 * r();
  return grilleFn(121, 121, (x, y) => {
    const dx = x - 30, dy = y - 30, rr = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    let R = R0; for (let k = 0; k < n; k++) R *= 1 + am[k] * Math.cos((k + 2) * th + ph[k]);
    return rr <= R ? 2 + 4 * Math.exp(-(rr * rr) / 120) : NaN;
  });
}

// Boucle ordonnée du bord de la face supérieure (la plus longue) : liste de [x, y].
export function boucleBordHaut(m) {
  const ar = aretesBordHaut(m), suiv = new Map(ar), vus = new Set();
  let best = [];
  for (const [s] of ar) {
    if (vus.has(s)) continue;
    const L = []; let c = s;
    while (!vus.has(c)) { vus.add(c); L.push([m.positions[3 * c], m.positions[3 * c + 1]]); c = suiv.get(c); }
    if (L.length > best.length) best = L;
  }
  return best;
}
function reechantillonner(L, h) {
  const P = [...L, L[0]], out = [];
  let acc = 0, prochain = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const [a, b] = [P[i], P[i + 1]], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (prochain <= acc + seg) { const t = (prochain - acc) / seg; out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); prochain += h; }
    acc += seg;
  }
  return out;
}
// Rugosité d'un contour : écart à la moyenne mobile (±3 mm, échantillonnage 0,5 mm) et nombre d'inflexions (changements de sens de courbure).
export function rugositeBoucle(L) {
  const R = reechantillonner(L, 0.5), n = R.length, w = 6;
  let max = 0, somme = 0;
  for (let i = 0; i < n; i++) {
    let ax = 0, ay = 0;
    for (let k = -w; k <= w; k++) { const q = R[(i + k + n) % n]; ax += q[0]; ay += q[1]; }
    const d = Math.hypot(R[i][0] - ax / (2 * w + 1), R[i][1] - ay / (2 * w + 1));
    max = Math.max(max, d); somme += d;
  }
  let inflexions = 0, prec = 0;
  for (let i = 0; i < n; i++) {
    const a = R[(i - 3 + n) % n], b = R[i], c = R[(i + 3) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    const sg = Math.abs(cr) < 0.05 ? 0 : Math.sign(cr);
    if (sg && prec && sg !== prec) inflexions++;
    if (sg) prec = sg;
  }
  return { max, moyenne: somme / n, inflexions, n };
}
// Disque de rayon 20 mm centré en (30 ; 30) dont le bord est DENTÉ : rayon + 1 mm × bruit (graine) par pas de 2 mm d'arc.
export function grilleDentee(graine) {
  let s = graine >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pas = 2 * Math.PI * 20 / 2; // 2 mm d'arc
  const nb = Math.round(pas / 2 * 2 / 2) || 63;
  const bruit = []; for (let k = 0; k < 63; k++) bruit.push(r() * 2 - 1);
  void nb;
  return grilleFn(121, 121, (x, y) => {
    const th = Math.atan2(y - 30, x - 30), u = ((th + Math.PI) / (2 * Math.PI)) * 63, k = Math.floor(u) % 63, t = u - Math.floor(u);
    const R = 20 + bruit[k] * (1 - t) + bruit[(k + 1) % 63] * t;
    return Math.hypot(x - 30, y - 30) <= R ? 3 : NaN;
  });
}
