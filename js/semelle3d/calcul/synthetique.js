// Scans / formes SYNTHÉTIQUES générés par code (aucune donnée réelle).
import { creerGrille, remplir } from './grille.js';
import { DOME_DEFAUT, PAS_GRILLE_MM } from '../constantes.js';

export function genererDome(params = {}) {
  const p = { ...DOME_DEFAUT, ...params };
  const nx = Math.round(p.largeur_mm / PAS_GRILLE_MM) + 1;
  const ny = Math.round(p.longueur_mm / PAS_GRILLE_MM) + 1;
  const g = creerGrille(nx, ny, PAS_GRILLE_MM, 0, 0);
  const cx = p.demi_axe_x_mm;
  const cy = p.demi_axe_y_mm;
  const s2 = 2 * p.sigma_mm * p.sigma_mm;
  remplir(g, (x, y) => {
    const u = (x - cx) / p.demi_axe_x_mm;
    const v = (y - cy) / p.demi_axe_y_mm;
    if (u * u + v * v > 1) return NaN; // hors contour
    const dx = x - p.centre_dome.x_mm;
    const dy = y - p.centre_dome.y_mm;
    return p.epaisseur_mm + p.hauteur_dome_mm * Math.exp(-(dx * dx + dy * dy) / s2);
  });
  return g;
}

// ---------------- Lot 1 : pied SYNTHÉTIQUE (aucune donnée réelle) ----------------
// Pied « canonique » : talon en y = 0, orteils en y = L, ligne médiane de l'avant-pied décalée du côté
// médial (pour un pied DROIT le côté médial est -X ; pour un pied GAUCHE, +X ; vu de dessus, pied vers +Z).
// Relief plantaire : zones d'appui plates à z = 0 (talon, avant-pied), voûte médiale haute, voûte
// latérale basse, léger relèvement des orteils. Valeurs de démonstration, pas des normes cliniques.
const smooth = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const PTS_LARGEUR = [[0, 0], [0.01, 14], [0.04, 21], [0.1, 27], [0.25, 25], [0.45, 27], [0.7, 44], [0.85, 41], [0.95, 27], [0.99, 12], [1, 0]];
function demiLargeur(u) {
  if (u <= 0 || u >= 1) return 0;
  for (let i = 0; i < PTS_LARGEUR.length - 1; i++) {
    const [u0, w0] = PTS_LARGEUR[i], [u1, w1] = PTS_LARGEUR[i + 1];
    if (u >= u0 && u <= u1) return w0 + (w1 - w0) * smooth((u - u0) / (u1 - u0));
  }
  return 0;
}

export function modelePied({ longueur_mm = 265, cote = 'D', decalage_medial_mm = 7 } = {}) {
  const m = cote === 'D' ? -1 : 1; // direction du côté médial en X
  const L = longueur_mm;
  const centre = (y) => m * decalage_medial_mm * smooth((y / L - 0.35) / 0.6);
  const dedans = (x, y) => { const u = y / L; const w = demiLargeur(u); return w > 0 && Math.abs(x - centre(y)) <= w; };
  const relief = (x, y) => {
    const u = y / L, xr = x - centre(y);
    const med = 11 * Math.exp(-((u - 0.38) ** 2) / (2 * 0.1 ** 2) - ((xr - m * 12) ** 2) / (2 * 13 ** 2));
    const lat = 3 * Math.exp(-((u - 0.4) ** 2) / (2 * 0.1 ** 2) - ((xr + m * 15) ** 2) / (2 * 12 ** 2));
    return med + lat + 6 * smooth((u - 0.88) / 0.12);
  };
  const epaisseurDessus = (x, y) => { // dôme dorsal (variante solide) : jamais plat
    const u = y / L, w = Math.max(demiLargeur(u), 1e-6);
    const r = Math.min(1, Math.abs(x - centre(y)) / w);
    return 22 + 30 * (1 - r * r) * Math.sin(Math.PI * Math.min(1, Math.max(0, u))) ** 0.5;
  };
  return { longueur_mm: L, cote, dedans, relief, epaisseurDessus, centre };
}

function grilleCanonique(modele, pas) {
  const L = modele.longueur_mm;
  const x0 = modele.x0 ?? -70, nx = Math.round((modele.largeur_grille_mm ?? 140) / pas) + 1, ny = Math.round(L / pas) + 1;
  const ok = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) ok[j * nx + i] = modele.dedans(x0 + i * pas, j * pas) ? 1 : 0;
  const cell = (i, j) => i >= 0 && j >= 0 && i < nx - 1 && j < ny - 1 && ok[j * nx + i] && ok[j * nx + i + 1] && ok[(j + 1) * nx + i] && ok[(j + 1) * nx + i + 1];
  return { x0, nx, ny, pas, cell };
}

// Surface seule (maillage OUVERT, comme beaucoup de scanners) : face plantaire = relief.
export function scanPiedSurface(opts = {}) {
  const modele = opts.modele || modelePied(opts);
  const pas = opts.pas_mm || 1;
  const { x0, nx, ny, cell } = grilleCanonique(modele, pas);
  const num = new Int32Array(nx * ny).fill(-1);
  const pos = [], idx = [];
  const sommet = (i, j) => { const k = j * nx + i; if (num[k] < 0) { num[k] = pos.length / 3; const x = x0 + i * pas, y = j * pas; pos.push(x, y, modele.relief(x, y)); } return num[k]; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!cell(i, j)) continue;
    const a = sommet(i, j), b = sommet(i + 1, j), c = sommet(i + 1, j + 1), d = sommet(i, j + 1);
    idx.push(a, b, c, a, c, d);
  }
  return { modele, positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}

// Solide fermé (pied entier simplifié) : face plantaire = relief, face dorsale = dôme, parois sur le contour.
export function scanPiedSolide(opts = {}) {
  const modele = opts.modele || modelePied(opts);
  const pas = opts.pas_mm || 1;
  const { x0, nx, ny, cell } = grilleCanonique(modele, pas);
  const num = new Int32Array(nx * ny).fill(-1);
  const pos = [], idx = [];
  const sommet = (i, j) => { const k = j * nx + i; if (num[k] < 0) { num[k] = pos.length / 6; const x = x0 + i * pas, y = j * pas; const zb = modele.relief(x, y); pos.push(x, y, zb, x, y, zb + modele.epaisseurDessus(x, y)); } return num[k]; };
  const B = (n) => 2 * n, T = (n) => 2 * n + 1;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!cell(i, j)) continue;
    const a = sommet(i, j), b = sommet(i + 1, j), c = sommet(i + 1, j + 1), d = sommet(i, j + 1);
    idx.push(T(a), T(b), T(c), T(a), T(c), T(d)); // dessus (+z)
    idx.push(B(a), B(c), B(b), B(a), B(d), B(c)); // dessous (-z)
    const paroi = (p, q) => idx.push(T(p), B(p), B(q), T(p), B(q), T(q));
    if (!cell(i, j - 1)) paroi(a, b);
    if (!cell(i + 1, j)) paroi(b, c);
    if (!cell(i, j + 1)) paroi(c, d);
    if (!cell(i - 1, j)) paroi(d, a);
  }
  return { modele, positions: Float64Array.from(pos), indices: Uint32Array.from(idx) };
}

// Modèle de 2 pieds côte à côte (empreinte unique). `ecart_mm` = distance entre les axes des 2 pieds ; sous ~100 mm les
// contours se recouvrent (pieds collés : un seul bloc). Le pied D est du côté +X, le G du côté -X, talons alignés.
// Retourne un modèle compatible scanPiedSurface/scanPiedSolide ({ modele }) + les modèles de chaque pied.
export function modeleDeuxPieds({ longueur_D_mm = 265, longueur_G_mm = 258, ecart_mm = 130, decalage_medial_mm = 7 } = {}) {
  const mD = modelePied({ longueur_mm: longueur_D_mm, cote: 'D', decalage_medial_mm });
  const mG = modelePied({ longueur_mm: longueur_G_mm, cote: 'G', decalage_medial_mm });
  const cD = ecart_mm / 2, cG = -ecart_mm / 2;
  const dedansD = (x, y) => mD.dedans(x - cD, y), dedansG = (x, y) => mG.dedans(x - cG, y);
  const modele = {
    longueur_mm: Math.max(longueur_D_mm, longueur_G_mm), cote: 'DG',
    x0: -(ecart_mm / 2 + 75), largeur_grille_mm: ecart_mm + 150,
    dedans: (x, y) => dedansD(x, y) || dedansG(x, y),
    relief: (x, y) => Math.max(dedansD(x, y) ? mD.relief(x - cD, y) : -Infinity, dedansG(x, y) ? mG.relief(x - cG, y) : -Infinity),
    epaisseurDessus: (x, y) => Math.max(dedansD(x, y) ? mD.epaisseurDessus(x - cD, y) : -Infinity, dedansG(x, y) ? mG.epaisseurDessus(x - cG, y) : -Infinity),
    centre: () => 0,
  };
  return { modele, pieds: { D: { modele: mD, cx: cD }, G: { modele: mG, cx: cG } } };
}

// Scan synthétique des 2 pieds (variante 'surface' ouvert ou 'solide' fermé), en maillage brut.
export function scanDeuxPieds({ variante = 'surface', pas_mm = 1, ...opts } = {}) {
  const { modele, pieds } = modeleDeuxPieds(opts);
  const sc = (variante === 'solide' ? scanPiedSolide : scanPiedSurface)({ modele, pas_mm });
  return { ...sc, pieds };
}

// Transformation rigide + changement d'unité : p' = facteur · R · p + t. R = matrice 3x3 (lignes).
export function transformerMaillage(m, { R, t = [0, 0, 0], facteur = 1, miroirX = false }) {
  const p = new Float64Array(m.positions.length);
  for (let v = 0; v < p.length; v += 3) {
    const x = miroirX ? -m.positions[v] : m.positions[v], y = m.positions[v + 1], z = m.positions[v + 2];
    p[v] = facteur * (R[0][0] * x + R[0][1] * y + R[0][2] * z) + t[0];
    p[v + 1] = facteur * (R[1][0] * x + R[1][1] * y + R[1][2] * z) + t[1];
    p[v + 2] = facteur * (R[2][0] * x + R[2][1] * y + R[2][2] * z) + t[2];
  }
  const idx = Uint32Array.from(m.indices);
  if (miroirX) for (let k = 0; k < idx.length; k += 3) { const a = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = a; }
  return { positions: p, indices: idx };
}
export const rotX = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
export const rotY = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
export const rotZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
export const produit = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
export const deg = (d) => (d * Math.PI) / 180;
