// Empreinte « boîte creusée » -> empreinte unique.
// Une boîte d'empreinte scannée d'en haut = un plan (le bord de la boîte) + une cavité creusée à la forme du pied.
// Le fond de la cavité EST la face plantaire (le pied est au-dessus du fond, du côté du bord). Si on la traite comme un
// pied « en décharge » ordinaire, le plan d'appui trouvé est celui du BORD de la boîte, vu de l'autre côté : le relief
// est retourné (talon/têtes les plus hauts) et le côté D/G se lit en miroir. La conversion :
//   1. trouve le plan du bord (plus grand plateau plan du scan) ;
//   2. ne garde que la cavité (triangles nettement sous le bord, hors parois quasi verticales) ;
//   3. indique au recalage de quel côté est le pied (versPied = vers le bord) ;
// puis le recalage habituel (échelle, plan d'appui, mise à plat) donne la MÊME empreinte qu'un pied en décharge.
// Unités du fichier non supposées : toutes les tolérances sont relatives à l'étendue du scan.
import { analyseACP, eigenSym3 } from './recalage.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n]; };

export const CREUSEE = Object.freeze({
  tol_relative: 0.002, // épaisseur du plateau = 0,2 % de la longueur de l'étendue principale
  plateau_min: 0.3, // le bord doit couvrir au moins 30 % de la surface pour parler de boîte
  cavite_min: 0.05, // la cavité doit couvrir au moins 5 % de la surface
  marge_min: 0.02, // la cavité est ENTOURÉE par le bord : au moins 2 % de l'étendue de marge de chaque côté (un pied dont le plan plantaire touche le bord du scan n'est pas une boîte)
  cote_unique_min: 0.75, // au moins 75 % de la surface hors plateau du même côté du bord
  profondeur_min_tol: 3, // un triangle est « dans la cavité » à plus de 3 tolérances sous le bord
  paroi_cos_min: 0.5, // les parois (normale à plus de 60° de l'axe du bord) sont écartées
});

function geometrieTriangles(mesh) {
  const { positions: P, indices: I } = mesh;
  const nt = I.length / 3;
  const c = new Float64Array(3 * nt), n = new Float64Array(3 * nt), aire = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = 3 * I[3 * t], b = 3 * I[3 * t + 1], d = 3 * I[3 * t + 2];
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, m = Math.hypot(nx, ny, nz);
    aire[t] = 0.5 * m;
    if (m > 0) { n[3 * t] = nx / m; n[3 * t + 1] = ny / m; n[3 * t + 2] = nz / m; }
    for (let k = 0; k < 3; k++) c[3 * t + k] = (P[a + k] + P[b + k] + P[d + k]) / 3;
  }
  return { nt, c, n, aire };
}

// Analyse (sans rien modifier) : le scan ressemble-t-il à une boîte creusée ? Retourne toujours un objet de mesures.
export function analyserBoite(mesh) {
  const { nt, c, n, aire } = geometrieTriangles(mesh);
  const acp = analyseACP(mesh);
  let normale = unit(acp.axes[2]);
  const ctr = acp.centre;
  let e1min = Infinity, e1max = -Infinity;
  const e1 = acp.axes[0];
  for (let t = 0; t < nt; t++) { const s = (c[3 * t] - ctr[0]) * e1[0] + (c[3 * t + 1] - ctr[1]) * e1[1] + (c[3 * t + 2] - ctr[2]) * e1[2]; if (s < e1min) e1min = s; if (s > e1max) e1max = s; }
  const tol = CREUSEE.tol_relative * (e1max - e1min);
  let aireTot = 0;
  for (let t = 0; t < nt; t++) aireTot += aire[t];
  let d = 0, plan = null;
  const hauteur = (nn, dd) => { const h = new Float64Array(nt); for (let t = 0; t < nt; t++) h[t] = nn[0] * c[3 * t] + nn[1] * c[3 * t + 1] + nn[2] * c[3 * t + 2] - dd; return h; };
  // plateau : fenêtre de 3 classes (épaisseur tol) de plus grande surface le long de la normale
  for (let tour = 0; tour < 3; tour++) {
    const h = hauteur(normale, d || dot(normale, ctr));
    let mn = Infinity, mx = -Infinity;
    for (let t = 0; t < nt; t++) { if (h[t] < mn) mn = h[t]; if (h[t] > mx) mx = h[t]; }
    const nb = Math.max(1, Math.ceil((mx - mn) / tol) + 1), A = new Float64Array(nb + 2);
    for (let t = 0; t < nt; t++) A[1 + Math.floor((h[t] - mn) / tol)] += aire[t];
    let best = 1, bestA = -1;
    for (let b = 1; b <= nb; b++) { const s = A[b - 1] + A[b] + A[b + 1]; if (s > bestA) { bestA = s; best = b; } }
    const centreH = (d || dot(normale, ctr)) + mn + (best + 0.5 - 1) * tol;
    // ajustement des moindres carrés sur les triangles du plateau
    const sel = [];
    const h2 = hauteur(normale, centreH);
    for (let t = 0; t < nt; t++) if (Math.abs(h2[t]) <= 1.5 * tol) sel.push(t);
    if (sel.length < 3) break;
    const g = [0, 0, 0]; let w = 0;
    for (const t of sel) { for (let k = 0; k < 3; k++) g[k] += aire[t] * c[3 * t + k]; w += aire[t]; }
    for (let k = 0; k < 3; k++) g[k] /= w;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const t of sel) { const e = [c[3 * t] - g[0], c[3 * t + 1] - g[1], c[3 * t + 2] - g[2]]; for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += aire[t] * e[a] * e[b]; }
    let nn = unit(eigenSym3(C).vecteurs[2]);
    if (dot(nn, normale) < 0) nn = [-nn[0], -nn[1], -nn[2]];
    normale = nn; d = dot(nn, g); plan = { n: nn, d };
  }
  if (!plan) return { creusee: false, plateau_pct: 0, cavite_pct: 0, cote_unique: 0, plan: null, tol, nt };
  const h = hauteur(plan.n, plan.d);
  let aPlateau = 0, aDessous = 0, aDessus = 0;
  for (let t = 0; t < nt; t++) { if (Math.abs(h[t]) <= 1.5 * tol) aPlateau += aire[t]; else if (h[t] < 0) aDessous += aire[t]; else aDessus += aire[t]; }
  const horsPlateau = aDessous + aDessus;
  const sgn = aDessous >= aDessus ? 1 : -1; // +1 : cavité du côté -n (le bord est au-dessus) ; -1 : cavité du côté +n
  const cavite = Math.max(aDessous, aDessus);
  const plateau_pct = aPlateau / aireTot, cavite_pct = cavite / aireTot, cote_unique = horsPlateau > 0 ? cavite / horsPlateau : 0;
  // marge : étendue (dans le plan du bord) de la cavité candidate, comparée à celle du scan entier
  const e2 = acp.axes[1];
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, cu0 = Infinity, cu1 = -Infinity, cv0 = Infinity, cv1 = -Infinity;
  for (let t = 0; t < nt; t++) {
    const dx = c[3 * t] - ctr[0], dy = c[3 * t + 1] - ctr[1], dz = c[3 * t + 2] - ctr[2];
    const u = dx * e1[0] + dy * e1[1] + dz * e1[2], v = dx * e2[0] + dy * e2[1] + dz * e2[2];
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    if (-sgn * h[t] > 3 * tol) { if (u < cu0) cu0 = u; if (u > cu1) cu1 = u; if (v < cv0) cv0 = v; if (v > cv1) cv1 = v; }
  }
  const marge = Number.isFinite(cu0) ? Math.min((cu0 - u0) / (u1 - u0), (u1 - cu1) / (u1 - u0), (cv0 - v0) / (v1 - v0), (v1 - cv1) / (v1 - v0)) : 0;
  const creusee = plateau_pct >= CREUSEE.plateau_min && cavite_pct >= CREUSEE.cavite_min && cote_unique >= CREUSEE.cote_unique_min && marge >= CREUSEE.marge_min;
  return { creusee, plateau_pct, cavite_pct, cote_unique, marge, plan, sgn, h, tol, nt, geo: { n, aire, aireTot }, versPied: sgn === 1 ? plan.n : [-plan.n[0], -plan.n[1], -plan.n[2]] };
}

// Cavité seule + sens du pied. Lève une erreur de code 'creusee_introuvable' si le scan n'a pas de bord plan + cavité.
export function convertirCreusee(mesh) {
  const a = analyserBoite(mesh);
  if (!a.creusee) {
    const e = new RangeError('boîte creusée introuvable : le scan n\'a pas de bord plan entourant une cavité (bord ' + Math.round(100 * a.plateau_pct) + ' % de la surface, cavité ' + Math.round(100 * a.cavite_pct) + ' %, marge autour de la cavité ' + Math.round(100 * a.marge) + ' %). Choisissez « Pied en décharge » ou vérifiez le fichier.');
    e.code = 'creusee_introuvable'; throw e;
  }
  const { h, tol, sgn, plan, nt } = a, { n, aire, aireTot } = a.geo;
  const garde = [];
  let aGardee = 0, profMax = 0;
  for (let t = 0; t < nt; t++) {
    const prof = -sgn * h[t];
    if (prof <= CREUSEE.profondeur_min_tol * tol) continue;
    if (Math.abs(n[3 * t] * plan.n[0] + n[3 * t + 1] * plan.n[1] + n[3 * t + 2] * plan.n[2]) < CREUSEE.paroi_cos_min) continue;
    garde.push(t); aGardee += aire[t]; if (prof > profMax) profMax = prof;
  }
  if (aGardee / aireTot < CREUSEE.cavite_min * 0.5) { const e = new RangeError('boîte creusée : cavité trop petite après retrait des parois'); e.code = 'creusee_introuvable'; throw e; }
  const idx = new Uint32Array(3 * garde.length);
  garde.forEach((t, k) => { idx[3 * k] = mesh.indices[3 * t]; idx[3 * k + 1] = mesh.indices[3 * t + 1]; idx[3 * k + 2] = mesh.indices[3 * t + 2]; });
  return { mesh: { positions: mesh.positions, indices: idx, nbTriangles: garde.length, nbSommets: mesh.nbSommets, format: mesh.format }, versPied: a.versPied, profondeur_brute: profMax,
    mesures: { plateau_pct: a.plateau_pct, cavite_pct: a.cavite_pct, triangles_gardes: garde.length, triangles_total: nt } };
}
