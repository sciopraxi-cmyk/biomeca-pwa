// Contour de la base : nœuds du bord, contour lissé (position sous-cellule), distance exacte au contour médial.
import { flouGauss } from './flou.js';
import { estValide } from './grille.js';
import { CONTOUR_LISSAGE } from '../constantes.js';

export function cellulesValides(g) {
  const { nx, ny, z } = g;
  const ok = new Uint8Array(nx * ny); // indexé par la cellule (i,j) -> coin inférieur gauche
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (estValide(z[j * nx + i]) && estValide(z[j * nx + i + 1]) && estValide(z[(j + 1) * nx + i]) && estValide(z[(j + 1) * nx + i + 1])) ok[j * nx + i] = 1;
    }
  }
  return ok;
}

// Nœuds utilisés par au moins une cellule valide ; nœuds du bord = extrémités d'une arête de paroi.
export function noeudsContour(g) {
  const { nx, ny } = g;
  const cel = cellulesValides(g);
  const c = (i, j) => (i < 0 || j < 0 || i > nx - 2 || j > ny - 2 ? 0 : cel[j * nx + i]);
  const utilise = new Uint8Array(nx * ny);
  const bord = new Uint8Array(nx * ny);
  const marquer = (arr, i, j) => { arr[j * nx + i] = 1; };
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      if (!c(i, j)) continue;
      for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) marquer(utilise, i + a, j + b);
      if (!c(i, j - 1)) { marquer(bord, i, j); marquer(bord, i + 1, j); }
      if (!c(i + 1, j)) { marquer(bord, i + 1, j); marquer(bord, i + 1, j + 1); }
      if (!c(i, j + 1)) { marquer(bord, i, j + 1); marquer(bord, i + 1, j + 1); }
      if (!c(i - 1, j)) { marquer(bord, i, j); marquer(bord, i, j + 1); }
    }
  }
  return { utilise, bord };
}

// Contour lissé : le masque (0/1) est flouté ; un nœud du bord glisse vers l'extérieur jusqu'à l'isoligne 0,5
// (position sous-cellule du contour), sans jamais bouger de plus de deplacement_max_pas.
export function lisserContour(g, { sigma_mm = CONTOUR_LISSAGE.sigma_mm, deplacementMaxPas = CONTOUR_LISSAGE.deplacement_max_pas, champ = null, corriger = true, relaxer = true, prolonger = true } = {}) {
  const { nx, ny, pas } = g;
  const { utilise, bord } = noeudsContour(g);
  const f = champ || flouGauss(Float64Array.from(utilise), nx, ny, pas, sigma_mm, 'zero');
  const dx = new Float32Array(nx * ny), dy = new Float32Array(nx * ny);
  const normX = new Float32Array(nx * ny), normY = new Float32Array(nx * ny);
  // Placement sous-cellule : le nœud glisse le long de la normale sortante du champ (gradient) jusqu'à l'isoligne 0,5
  // (distance = (f − 0,5) / |gradient|, plafonnée). Des nœuds voisins ont des normales presque parallèles.
  const valeur = (i, j) => f[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  let nb = 0, somme = 0, max = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!bord[k]) continue;
      nb++;
      const gx = (valeur(i + 1, j) - valeur(i - 1, j)) / (2 * pas), gy = (valeur(i, j + 1) - valeur(i, j - 1)) / (2 * pas);
      const gm = Math.hypot(gx, gy);
      if (gm < 1e-9) continue;
      const nxn = -gx / gm, nyn = -gy / gm;
      normX[k] = nxn; normY[k] = nyn;
      const delta = Math.min(deplacementMaxPas * pas, Math.max(0, (f[k] - 0.5) / gm));
      dx[k] = nxn * delta; dy[k] = nyn * delta;
      somme += delta; max = Math.max(max, delta);
    }
  }
  if (relaxer) relaxerBord(g, bord, dx, dy);
  if (prolonger) prolongerVersInterieur(g, bord, utilise, dx, dy);
  let fix = corriger ? corrigerRetournements(g, dx, dy) : { corrigees: 0, passes: 0 };
  if (corriger && fix.corrigees > 0) { // la correction freine certains nœuds : on relisse le bord puis on re-vérifie
    relaxerBord(g, bord, dx, dy);
    prolongerVersInterieur(g, bord, utilise, dx, dy);
    const f2 = corrigerRetournements(g, dx, dy);
    fix = { corrigees: fix.corrigees + f2.corrigees, passes: fix.passes + f2.passes };
  }
  somme = 0; max = 0;
  for (let k = 0; k < dx.length; k++) if (bord[k]) { const d = Math.hypot(dx[k], dy[k]); somme += d; max = Math.max(max, d); }
  return { bord, dx, dy, normX, normY, stats: { noeuds_contour: nb, deplacement_moyen_mm: nb ? somme / nb : 0, deplacement_max_mm: max, cellules_retournees_corrigees: fix.corrigees, passes_correction: fix.passes } };
}

// Distance euclidienne EXACTE (transformée de Felzenszwalb) de chaque nœud au plus proche nœud « source », en mm.
const INF = 1e20;
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}
export function distanceAuxSources(nx, ny, pas, sources) {
  const m = Math.max(nx, ny);
  const f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  const tmp = new Float64Array(nx * ny);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) f[j] = sources[j * nx + i] ? 0 : INF;
    edt1d(f, ny, d, v, z);
    for (let j = 0; j < ny; j++) tmp[j * nx + i] = d[j];
  }
  const out = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) f[i] = tmp[j * nx + i];
    edt1d(f, nx, d, v, z);
    for (let i = 0; i < nx; i++) out[j * nx + i] = d[i] >= INF / 2 ? Infinity : Math.sqrt(d[i]) * pas;
  }
  return out;
}

// Régularisation du MASQUE (lot 2, retour de Joël : « ce n'est pas lissé, des vagues à l'avant »).
// Le masque des nœuds est flouté (sigma_mm) et seuillé à 0,5 : les dents et les vagues plus petites que
// sigma disparaissent, les trous minuscules se comblent. Les nœuds nouvellement couverts reçoivent la hauteur
// moyenne de leurs voisins (couche par couche) ; les nœuds retirés deviennent NaN. L'entrée n'est pas modifiée.
export function regulariserMasque(g, sigma_mm) {
  const { nx, ny, pas } = g;
  const { utilise } = noeudsContour(g);
  const f = flouGauss(Float64Array.from(utilise), nx, ny, pas, sigma_mm, 'zero');
  const z = new Float32Array(nx * ny);
  const nouveau = new Uint8Array(nx * ny);
  let retires = 0, ajoutes = 0;
  for (let k = 0; k < z.length; k++) {
    const garde = f[k] >= 0.5;
    if (garde && utilise[k] && Number.isFinite(g.z[k])) z[k] = g.z[k];
    else if (garde) { z[k] = NaN; nouveau[k] = 1; ajoutes++; }
    else { z[k] = NaN; if (utilise[k]) retires++; }
  }
  // remplissage des nœuds ajoutés : moyenne des voisins (8) déjà renseignés, par couches
  let restant = ajoutes, garde = 0;
  while (restant > 0 && garde++ < 40) {
    const sortie = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!nouveau[k]) continue;
      let s = 0, n = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        if (!a && !b) continue;
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const v = z[jj * nx + ii];
        if (Number.isFinite(v)) { s += v; n++; }
      }
      if (n) sortie.push([k, s / n]);
    }
    if (!sortie.length) break;
    for (const [k, v] of sortie) { z[k] = v; nouveau[k] = 0; restant--; }
  }
  for (let k = 0; k < z.length; k++) if (nouveau[k]) z[k] = NaN; // inaccessible : retiré
  return { grille: { ...g, z }, champ: f, stats: { noeuds_retires: retires, noeuds_ajoutes: ajoutes } };
}

// Garantit qu'aucune cellule n'est retournée par le déplacement du contour : les deux triangles de chaque cellule
// valide (mêmes que maillage_base.js) doivent garder une aire signée > 1 % de celle d'une cellule non déplacée.
// Les nœuds d'une cellule fautive voient leur déplacement réduit de 40 % ; on recommence (au plus 30 passes) ;
// en dernier recours, déplacement annulé.
export function corrigerRetournements(g, dx, dy) {
  const { nx, ny, pas } = g;
  const cel = cellulesValides(g);
  const seuil = 0.01 * 0.5 * pas * pas; // triangle écrasé : aire < 1 % de celle d'une demi-cellule normale (retourné = négatif)
  const aire = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  let corrigees = 0, passes = 0;
  for (; passes < 31; passes++) {
    let fautives = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!cel[j * nx + i]) continue;
      const k0 = j * nx + i, k1 = k0 + 1, k2 = k0 + nx + 1, k3 = k0 + nx;
      const X = (k, ii) => ii * pas + dx[k], Y = (k, jj) => jj * pas + dy[k];
      const x0 = X(k0, i), y0 = Y(k0, j), x1 = X(k1, i + 1), y1 = Y(k1, j), x2 = X(k2, i + 1), y2 = Y(k2, j + 1), x3 = X(k3, i), y3 = Y(k3, j + 1);
      const a1 = aire(x0, y0, x1, y1, x2, y2), a2 = aire(x0, y0, x2, y2, x3, y3);
      if (a1 > 2 * seuil && a2 > 2 * seuil) continue;
      fautives++;
      for (const k of [k0, k1, k2, k3]) { if (passes === 30) { dx[k] = 0; dy[k] = 0; } else { dx[k] *= 0.9; dy[k] *= 0.9; } }
    }
    if (!fautives) break;
    corrigees += fautives;
  }
  return { corrigees, passes };
}

// Le déplacement des nœuds du bord est prolongé aux nœuds voisins (champ moyenné, décroissance en smoothstep sur
// BANDE mm) : sinon le bord avance seul et retourne les cellules du premier rang.
const BANDE_MM = 2.5;
export function prolongerVersInterieur(g, bord, utilise, dx, dy) {
  const { nx, ny, pas } = g;
  const n = nx * ny;
  const mx = new Float64Array(n), my = new Float64Array(n), mb = new Float64Array(n);
  for (let k = 0; k < n; k++) if (bord[k]) { mx[k] = dx[k]; my[k] = dy[k]; mb[k] = 1; }
  const sx = flouGauss(mx, nx, ny, pas, 1.5, 'zero'), sy = flouGauss(my, nx, ny, pas, 1.5, 'zero'), sb = flouGauss(mb, nx, ny, pas, 1.5, 'zero');
  const d = distanceAuxSources(nx, ny, pas, bord);
  for (let k = 0; k < n; k++) {
    if (bord[k] || !utilise[k] || sb[k] < 1e-6) continue;
    const t = Math.max(0, 1 - d[k] / BANDE_MM);
    const w = t * t * (3 - 2 * t);
    dx[k] = (sx[k] / sb[k]) * w; dy[k] = (sy[k] / sb[k]) * w;
  }
}

// Lissage le long du bord : le contour est parcouru comme une chaîne ordonnée (arêtes de paroi, intérieur à gauche) ;
// la position de chaque nœud devient la moyenne gaussienne de celle de ses voisins DE LA CHAÎNE (écart-type en nombre
// de nœuds). Efface les micro-ondulations laissées par la projection nœud par nœud sur l'isoligne, sans mélanger
// des nœuds voisins seulement dans la grille. Une boucle qui repasse deux fois par un nœud (pincement) n'est pas lissée.
const SIGMA_CHAINE_NOEUDS = 2.5;
export function chainesBord(g) {
  const { nx, ny } = g;
  const cel = cellulesValides(g);
  const c = (i, j) => (i < 0 || j < 0 || i > nx - 2 || j > ny - 2 ? 0 : cel[j * nx + i]);
  const suivant = new Map(), pince = new Set();
  const arete = (a, b) => { if (suivant.has(a)) pince.add(a); suivant.set(a, b); };
  const K = (i, j) => j * nx + i;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!c(i, j)) continue;
    if (!c(i, j - 1)) arete(K(i, j), K(i + 1, j));
    if (!c(i + 1, j)) arete(K(i + 1, j), K(i + 1, j + 1));
    if (!c(i, j + 1)) arete(K(i + 1, j + 1), K(i, j + 1));
    if (!c(i - 1, j)) arete(K(i, j + 1), K(i, j));
  }
  const vus = new Set(), boucles = [];
  for (const [debut] of suivant) {
    if (vus.has(debut)) continue;
    const L = []; let k = debut, ok = true;
    while (!vus.has(k)) { vus.add(k); L.push(k); if (pince.has(k)) ok = false; k = suivant.get(k); if (k === undefined) { ok = false; break; } }
    if (k !== debut) ok = false;
    boucles.push({ noeuds: L, lissable: ok });
  }
  return boucles;
}
export function relaxerBord(g, bord, dx, dy) {
  const { nx, pas } = g;
  const r = Math.ceil(3 * SIGMA_CHAINE_NOEUDS), w = [];
  for (let m = -r; m <= r; m++) w.push(Math.exp(-0.5 * (m / SIGMA_CHAINE_NOEUDS) ** 2));
  const sw = w.reduce((a, b) => a + b, 0);
  for (const { noeuds, lissable } of chainesBord(g)) {
    const n = noeuds.length;
    if (!lissable || n < 2 * r + 1) continue;
    const X = noeuds.map((k) => (k % nx) * pas + dx[k]), Y = noeuds.map((k) => Math.floor(k / nx) * pas + dy[k]);
    for (let t = 0; t < n; t++) {
      let sx = 0, sy = 0;
      for (let m = -r; m <= r; m++) { const q = (t + m + n) % n; sx += w[m + r] * X[q]; sy += w[m + r] * Y[q]; }
      const k = noeuds[t];
      dx[k] = sx / sw - (k % nx) * pas; dy[k] = sy / sw - Math.floor(k / nx) * pas;
    }
  }
}
