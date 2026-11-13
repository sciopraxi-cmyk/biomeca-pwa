// Recalage d'un scan de pied : ACP (axe longitudinal), échelle, plan d'appui par RANSAC (mise à plat),
// et PROPOSITIONS (talon/avant, haut/bas, latéralité) toujours à confirmer par le praticien.
// Repère final : X transversal, Y longitudinal (talon en Y = 0), Z vertical (plan d'appui en Z = 0, pied vers +Z).
// Les unités du fichier ne sont pas supposées : l'échelle vient de la longueur saisie.
import { RECALAGE as P } from '../constantes.js';
import { calculerEchelle, validerLongueurPied } from './echelle.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const croix = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norme = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const n = norme(a); return [a[0] / n, a[1] / n, a[2] / n]; };

export function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Valeurs/vecteurs propres d'une matrice symétrique 3x3 (Jacobi). Vecteurs propres rangés par valeur décroissante.
export function eigenSym3(m) {
  const A = m.map((r) => r.slice());
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    const off = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]);
    if (off <= 1e-15 * (Math.abs(A[0][0]) + Math.abs(A[1][1]) + Math.abs(A[2][2])) || off === 0) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (A[p][q] === 0) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
  }
  const ordre = [0, 1, 2].sort((i, j) => A[j][j] - A[i][i]);
  return { valeurs: ordre.map((i) => A[i][i]), vecteurs: ordre.map((i) => [V[0][i], V[1][i], V[2][i]]) };
}

// ACP pondérée par l'aire des triangles (insensible aux sommets dupliqués d'un STL).
export function analyseACP({ positions, indices }) {
  const nt = indices.length / 3;
  const r = [positions[0], positions[1], positions[2]];
  let A = 0;
  const c = [0, 0, 0];
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0];
  for (let t = 0; t < nt; t++) {
    const ia = 3 * indices[3 * t], ib = 3 * indices[3 * t + 1], ic = 3 * indices[3 * t + 2];
    for (let k = 0; k < 3; k++) { a[k] = positions[ia + k] - r[k]; b[k] = positions[ib + k] - r[k]; d[k] = positions[ic + k] - r[k]; }
    const aire = 0.5 * norme(croix([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]));
    if (!(aire > 0)) continue;
    A += aire;
    for (let k = 0; k < 3; k++) c[k] += (aire * (a[k] + b[k] + d[k])) / 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      S[i][j] += (aire / 12) * (a[i] * a[j] + b[i] * b[j] + d[i] * d[j] + (a[i] + b[i] + d[i]) * (a[j] + b[j] + d[j]));
    }
  }
  if (!(A > 0)) throw new RangeError('recalage : surface nulle (triangles dégénérés)');
  const m = c.map((v) => v / A);
  const cov = S.map((row, i) => row.map((v, j) => v / A - m[i] * m[j]));
  const e = eigenSym3(cov);
  return { centre: [m[0] + r[0], m[1] + r[1], m[2] + r[2]], axes: e.vecteurs, valeurs: e.valeurs, aire: A };
}

// Plan d'appui par RANSAC. pts : Float64Array (x,y,z) en mm dans le repère ACP ; haut = +z.
// Retourne { n:[..], d, score } : plan n·p = d, n_z > 0.
export function ransacPlanAppui(pts, rng) {
  const m = pts.length / 3;
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < m; i++) { const z = pts[3 * i + 2]; if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
  const seuil = zmin + P.ransac_fraction_basse * (zmax - zmin);
  const cand = [];
  for (let i = 0; i < m; i++) if (pts[3 * i + 2] <= seuil) cand.push(i);
  const tol = P.ransac_tolerance_mm;
  const cosMax = Math.cos((P.ransac_angle_max_deg * Math.PI) / 180);
  let meilleur = null;
  const compter = (n, d) => {
    let dedans = 0, dessous = 0;
    for (let i = 0; i < m; i++) {
      const e = n[0] * pts[3 * i] + n[1] * pts[3 * i + 1] + n[2] * pts[3 * i + 2] - d;
      if (e < -tol) dessous++; else if (e <= tol) dedans++;
    }
    return { dedans, dessous };
  };
  if (cand.length >= 3) {
    for (let it = 0; it < P.ransac_iterations; it++) {
      const i1 = cand[Math.floor(rng() * cand.length)], i2 = cand[Math.floor(rng() * cand.length)], i3 = cand[Math.floor(rng() * cand.length)];
      const p1 = [pts[3 * i1], pts[3 * i1 + 1], pts[3 * i1 + 2]], p2 = [pts[3 * i2], pts[3 * i2 + 1], pts[3 * i2 + 2]], p3 = [pts[3 * i3], pts[3 * i3 + 1], pts[3 * i3 + 2]];
      const u = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]], v = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];
      const w = [p3[0] - p2[0], p3[1] - p2[1], p3[2] - p2[2]];
      if (norme(u) < P.ransac_ecart_min_mm || norme(v) < P.ransac_ecart_min_mm || norme(w) < P.ransac_ecart_min_mm) continue;
      let n = croix(u, v);
      if (norme(n) < 1e-9) continue;
      n = unit(n);
      if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
      if (n[2] < cosMax) continue;
      const d = dot(n, p1);
      const { dedans, dessous } = compter(n, d);
      if (dessous > P.ransac_max_sous_plan * m) continue;
      if (!meilleur || dedans > meilleur.score) meilleur = { n, d, score: dedans };
    }
  }
  if (!meilleur) return { n: [0, 0, 1], d: zmin, score: compter([0, 0, 1], zmin).dedans, repli: true };
  // affinage : moindres carrés sur les points « sur le plan »
  for (let k = 0; k < 2; k++) {
    const { n, d } = meilleur;
    const dans = [];
    for (let i = 0; i < m; i++) if (Math.abs(n[0] * pts[3 * i] + n[1] * pts[3 * i + 1] + n[2] * pts[3 * i + 2] - d) <= tol) dans.push(i);
    if (dans.length < 3) break;
    const g = [0, 0, 0];
    for (const i of dans) for (let q = 0; q < 3; q++) g[q] += pts[3 * i + q] / dans.length;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const i of dans) { const e = [pts[3 * i] - g[0], pts[3 * i + 1] - g[1], pts[3 * i + 2] - g[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += e[a] * e[b];
    }
    let nn = eigenSym3(C).vecteurs[2];
    if (nn[2] < 0) nn = [-nn[0], -nn[1], -nn[2]];
    const dd = dot(nn, g);
    meilleur = { n: nn, d: dd, score: compter(nn, dd).dedans };
  }
  return meilleur;
}

function bornes(positions, utilise, f) {
  let mn = Infinity, mx = -Infinity;
  for (let v = 0; v < utilise.length; v++) { if (!utilise[v]) continue; const t = f(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]); if (t < mn) mn = t; if (t > mx) mx = t; }
  return { mn, mx };
}

export function recaler(mesh, longueur_mm, options = {}) {
  validerLongueurPied(longueur_mm);
  const { positions, indices } = mesh;
  const nv = positions.length / 3;
  const nt = indices.length / 3;
  const utilise = new Uint8Array(nv);
  for (let i = 0; i < indices.length; i++) utilise[indices[i]] = 1;
  const avertissements = [];

  const acp = analyseACP(mesh);
  const [e1, e2, e3] = acp.axes;
  const ratio_acp = acp.valeurs[0] / Math.max(acp.valeurs[1], 1e-300);
  if (ratio_acp < P.seuil_ratio_acp) avertissements.push('axe longitudinal ambigu (le scan est presque aussi large que long) : vérifier le sens du pied');
  const c = acp.centre;

  // échelle provisoire (pour exprimer les tolérances du RANSAC en mm)
  const ext1 = bornes(positions, utilise, (x, y, z) => (x - c[0]) * e1[0] + (y - c[1]) * e1[1] + (z - c[2]) * e1[2]);
  const s0 = longueur_mm / (ext1.mx - ext1.mn);

  // échantillon de points : centres de triangles, régulièrement espacés
  const pas = Math.max(1, Math.ceil(nt / P.ransac_points_max));
  const pts = new Float64Array(3 * Math.ceil(nt / pas));
  let m = 0;
  for (let t = 0; t < nt; t += pas) {
    const ia = 3 * indices[3 * t], ib = 3 * indices[3 * t + 1], ic = 3 * indices[3 * t + 2];
    const dx = (positions[ia] + positions[ib] + positions[ic]) / 3 - c[0];
    const dy = (positions[ia + 1] + positions[ib + 1] + positions[ic + 1]) / 3 - c[1];
    const dz = (positions[ia + 2] + positions[ib + 2] + positions[ic + 2]) / 3 - c[2];
    pts[3 * m] = s0 * (dx * e1[0] + dy * e1[1] + dz * e1[2]);
    pts[3 * m + 1] = s0 * (dx * e2[0] + dy * e2[1] + dz * e2[2]);
    pts[3 * m + 2] = s0 * (dx * e3[0] + dy * e3[1] + dz * e3[2]);
    m++;
  }
  const P3 = pts.subarray(0, 3 * m);
  // plan d'appui des deux côtés : celui qui a le plus de points « sur le plan » est le côté plantaire
  const rng = mulberry32(P.ransac_graine);
  const haut = ransacPlanAppui(P3, rng);
  const bas = (() => { const q = new Float64Array(P3.length); for (let i = 0; i < P3.length; i += 3) { q[i] = P3[i]; q[i + 1] = P3[i + 1]; q[i + 2] = -P3[i + 2]; } return ransacPlanAppui(q, rng); })();
  // « haut » = plan en bas de e3 (z croissant vers e3) ; « bas » = plan du côté opposé
  let sens = haut.score >= bas.score ? 1 : -1;
  const confVertical = (Math.max(haut.score, bas.score) + 1) / (Math.min(haut.score, bas.score) + 1);
  const propVertical = { valeur: sens === 1 ? '+e3' : '-e3', confiance: confVertical, a_confirmer: true, ambigu: confVertical < P.seuil_confiance_vertical };
  // Boîte creusée : le sens du pied (vers le bord de la boîte) est connu, il n'est plus deviné par le plan le plus plat.
  if (options.versPied) { sens = dot(e3, unit(options.versPied)) >= 0 ? 1 : -1; propVertical.valeur = sens === 1 ? '+e3' : '-e3'; propVertical.imposee = true; propVertical.ambigu = false; }
  if (options.inverserZ) sens = -sens;
  const plan = sens === 1 ? haut : bas;
  if (plan.repli) avertissements.push('plan d\'appui : repli sur le plan de la boîte (RANSAC sans candidat valable)');
  // normale du plan, côté « pied » = +Z final (dans le repère brut)
  const nq = [plan.n[0], plan.n[1], sens * plan.n[2]];
  const Z = unit([nq[0] * e1[0] + nq[1] * e2[0] + nq[2] * e3[0], nq[0] * e1[1] + nq[1] * e2[1] + nq[2] * e3[1], nq[0] * e1[2] + nq[1] * e2[2] + nq[2] * e3[2]]);
  // si on a inversé, le plan choisi est celui du côté opposé : Z pointe déjà vers le pied
  const Y = unit([e1[0] - dot(e1, Z) * Z[0], e1[1] - dot(e1, Z) * Z[1], e1[2] - dot(e1, Z) * Z[2]]);
  const X = croix(Y, Z);
  const inclinaison = (Math.acos(Math.min(1, Math.abs(dot(Z, e3)))) * 180) / Math.PI;
  // hauteur du plan le long de Z, en unités brutes du fichier (le plan est n·q = d, q en mm = s0 × coordonnées brutes)
  const origineZ = plan.d / s0;

  const ext = bornes(positions, utilise, (x, y, z) => (x - c[0]) * Y[0] + (y - c[1]) * Y[1] + (z - c[2]) * Y[2]);
  const echelle = calculerEchelle(ext.mx - ext.mn, longueur_mm);
  const s = echelle.facteur_echelle;

  const sortie = new Float32Array(positions.length);
  for (let v = 0; v < nv; v++) {
    const dx = positions[3 * v] - c[0], dy = positions[3 * v + 1] - c[1], dz = positions[3 * v + 2] - c[2];
    sortie[3 * v] = s * (dx * X[0] + dy * X[1] + dz * X[2]);
    sortie[3 * v + 1] = s * (dx * Y[0] + dy * Y[1] + dz * Y[2]);
    sortie[3 * v + 2] = s * (dx * Z[0] + dy * Z[1] + dz * Z[2] - origineZ);
  }
  // Sens talon / avant-pied : l'extrémité où la largeur à 25 % est la plus grande est l'avant-pied.
  const L = longueur_mm;
  const ymin0 = bornes(sortie, utilise, (x, y) => y).mn;
  const largeurA = largeurBande(sortie, utilise, ymin0 + P.bande_avant_pied * L, P.bande_demi_largeur * L);
  const largeurB = largeurBande(sortie, utilise, ymin0 + (1 - P.bande_avant_pied) * L, P.bande_demi_largeur * L);
  const avantEstB = largeurB >= largeurA;
  const confLong = Math.max(largeurA, largeurB) / Math.max(Math.min(largeurA, largeurB), 1e-9);
  const propLong = { valeur: avantEstB ? '+Y' : '-Y', confiance: confLong, a_confirmer: true, ambigu: confLong < P.seuil_confiance_longitudinal };
  let retourner = !avantEstB;
  if (options.inverserY) retourner = !retourner;
  if (retourner) for (let v = 0; v < nv; v++) { sortie[3 * v] = -sortie[3 * v]; sortie[3 * v + 1] = -sortie[3 * v + 1]; }
  const bb = { x: bornes(sortie, utilise, (x) => x), y: bornes(sortie, utilise, (x, y) => y), z: bornes(sortie, utilise, (x, y, z) => z) };
  const tx = -(bb.x.mn + bb.x.mx) / 2, ty = -bb.y.mn;
  for (let v = 0; v < nv; v++) { sortie[3 * v] += tx; sortie[3 * v + 1] += ty; }
  const boite = { x_min: bb.x.mn + tx, x_max: bb.x.mx + tx, y_min: 0, y_max: bb.y.mx + ty, z_min: bb.z.mn, z_max: bb.z.mx };

  // Latéralité : signal « contour » ici ; signal « voûte » après rasterisation (lateralite.js).
  const contour = signalContour(sortie, utilise, L, boite);
  if (boite.z_min < -P.ransac_tolerance_mm * 4) avertissements.push('des points passent à ' + boite.z_min.toFixed(1) + ' mm sous le plan d\'appui (artefacts du scan ?)');

  return {
    positions: sortie, indices, boite,
    transformation: { facteur: s, axes: { X, Y, Z }, centre: c, translation_x: tx, translation_y: ty },
    echelle,
    propositions: { sens_longitudinal: propLong, sens_vertical: propVertical },
    signal_contour: contour,
    diagnostics: { valeurs_acp: acp.valeurs, ratio_acp, inclinaison_plan_deg: inclinaison, ransac: { score_haut: haut.score, score_bas: bas.score, points: m } },
    avertissements,
  };
}

function largeurBande(pos, utilise, yc, demi) {
  let mn = Infinity, mx = -Infinity;
  for (let v = 0; v < utilise.length; v++) {
    if (!utilise[v]) continue;
    const y = pos[3 * v + 1];
    if (y < yc - demi || y > yc + demi) continue;
    const x = pos[3 * v];
    if (x < mn) mn = x; if (x > mx) mx = x;
  }
  return mx >= mn ? mx - mn : 0;
}

// Signal « contour » : courbure de la ligne médiane du contour (talon, milieu, avant-pied). Elle ne dépend pas
// d'un petit défaut d'axe de l'ACP. Le côté qui bombe vers +X (convexe) est le côté latéral pour un pied DROIT.
function signalContour(pos, utilise, L, boite) {
  const NB = 100;
  const mn = new Float64Array(NB).fill(Infinity), mx = new Float64Array(NB).fill(-Infinity);
  for (let v = 0; v < utilise.length; v++) {
    if (!utilise[v]) continue;
    const b = Math.min(NB - 1, Math.max(0, Math.floor((pos[3 * v + 1] / L) * NB)));
    const x = pos[3 * v];
    if (x < mn[b]) mn[b] = x; if (x > mx[b]) mx[b] = x;
  }
  const moy = (a, b) => { let s = 0, n = 0; for (let i = a; i < b; i++) if (mx[i] >= mn[i]) { s += (mn[i] + mx[i]) / 2; n++; } return n ? s / n : null; };
  const talon = moy(10, 20), milieu = moy(45, 55), avant = moy(80, 90);
  if (talon === null || milieu === null || avant === null) return { valeur: null, confiance: 0, ambigu: true };
  const c = milieu - (talon + avant) / 2;
  const confiance = Math.abs(c) / (boite.x_max - boite.x_min);
  return { valeur: c > 0 ? 'D' : 'G', courbure_mm: c, confiance, ambigu: confiance < P.seuil_confiance_contour };
}
