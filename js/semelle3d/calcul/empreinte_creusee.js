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
  fraction_profondeur: 0.5, // le creux du pied = ce qui est plus profond que 50 % de la profondeur du creux (la mousse s'affaisse de quelques mm autour : ce n'est pas le pied)
  percentile_profondeur: 0.98, // profondeur du creux = 98e percentile (insensible aux pointes isolées)
  cellules: 200, // résolution de la carte de profondeur (cellules sur la plus grande étendue)
  remplissage_min: 0.75, // le scan d'une boîte est un RECTANGLE plein (≥ 75 % de sa boîte englobante) ; un pied scanné seul a un contour de pied (≈ 50-65 %) : sans cela, un pied en décharge posé à plat (plateau + bosse) est géométriquement identique à une boîte vue du dessous
  fraction_murs: 0.1, // les bords qui remontent (parois du creux) : tout ce qui est plus profond que 10 % du creux et relié au creux du pied ; la hauteur gardée est ensuite limitée en mm (réglage « bords »)
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


// Carte de profondeur dans le plan du bord ; cavité = plus grand ensemble connexe plus profond que le seuil, trous remplis
// (la voûte du pied, moins profonde, ne doit pas faire un trou). Retourne null s'il n'y a rien de plus profond que `3 tol`.
function cavitePrincipale({ nt, c, aire, h, sgn, plan, tol }) {
  const n = plan.n;
  let u = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const dn = dot(u, n); u = unit([u[0] - dn * n[0], u[1] - dn * n[1], u[2] - dn * n[2]]);
  const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const U = new Float64Array(nt), V = new Float64Array(nt), prof = new Float64Array(nt);
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  for (let t = 0; t < nt; t++) {
    const x = c[3 * t], y = c[3 * t + 1], z = c[3 * t + 2];
    U[t] = x * u[0] + y * u[1] + z * u[2]; V[t] = x * v[0] + y * v[1] + z * v[2]; prof[t] = -sgn * h[t];
    if (U[t] < u0) u0 = U[t]; if (U[t] > u1) u1 = U[t]; if (V[t] < v0) v0 = V[t]; if (V[t] > v1) v1 = V[t];
  }
  // profondeur du creux : percentile pondéré par l'aire
  const ordre = Array.from({ length: nt }, (_, t) => t).filter((t) => prof[t] > 3 * tol).sort((a, b) => prof[a] - prof[b]);
  if (!ordre.length) return null;
  let tot = 0; for (const t of ordre) tot += aire[t];
  let acc = 0, profondeur = prof[ordre[ordre.length - 1]];
  for (const t of ordre) { acc += aire[t]; if (acc >= CREUSEE.percentile_profondeur * tot) { profondeur = prof[t]; break; } }
  const seuil = Math.max(3 * tol, CREUSEE.fraction_profondeur * profondeur);
  const pas = Math.max(u1 - u0, v1 - v0) / CREUSEE.cellules;
  const nx = Math.floor((u1 - u0) / pas) + 1, ny = Math.floor((v1 - v0) / pas) + 1;
  const cell = new Int32Array(nt), m = new Uint8Array(nx * ny);
  const occupe = new Uint8Array(nx * ny);
  for (let t = 0; t < nt; t++) { const k = Math.floor((V[t] - v0) / pas) * nx + Math.floor((U[t] - u0) / pas); cell[t] = k; occupe[k] = 1; if (prof[t] > seuil) m[k] = 1; }
  // remplissage : surface occupée / surface du plus petit rectangle (toutes orientations, pas de 3°) qui contient le scan
  const cen = []; for (let k = 0; k < occupe.length; k++) if (occupe[k]) cen.push([k % nx, Math.floor(k / nx)]);
  const nOcc = cen.length;
  let rectMin = Infinity;
  for (let a = 0; a < 90; a += 3) {
    const co = Math.cos((a * Math.PI) / 180), si = Math.sin((a * Math.PI) / 180);
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [i, j] of cen) { const pp = i * co + j * si, qq = -i * si + j * co; if (pp < p0) p0 = pp; if (pp > p1) p1 = pp; if (qq < q0) q0 = qq; if (qq > q1) q1 = qq; }
    const A = (p1 - p0 + 1) * (q1 - q0 + 1); if (A < rectMin) rectMin = A;
  }
  const voisins = (q, f) => { const i = q % nx, j = (q - i) / nx; if (i > 0) f(q - 1); if (i < nx - 1) f(q + 1); if (j > 0) f(q - nx); if (j < ny - 1) f(q + nx); };
  const id = new Int32Array(nx * ny); let best = 0, bestN = 0, nb = 0;
  for (let s0 = 0; s0 < m.length; s0++) {
    if (!m[s0] || id[s0]) continue;
    nb++; const pile = [s0]; id[s0] = nb; let cnt = 0;
    while (pile.length) { const q = pile.pop(); cnt++; voisins(q, (r) => { if (m[r] && !id[r]) { id[r] = nb; pile.push(r); } }); }
    if (cnt > bestN) { bestN = cnt; best = nb; }
  }
  if (!best) return null;
  const dans = new Uint8Array(nx * ny); for (let k = 0; k < dans.length; k++) if (id[k] === best) dans[k] = 1;
  // remplissage des trous : le fond (hors composant) relié au bord de la carte est « dehors », le reste est dedans
  const dehors = new Uint8Array(nx * ny), pile = [];
  const semer = (q) => { if (!dans[q] && !dehors[q]) { dehors[q] = 1; pile.push(q); } };
  for (let i = 0; i < nx; i++) { semer(i); semer((ny - 1) * nx + i); }
  for (let j = 0; j < ny; j++) { semer(j * nx); semer(j * nx + nx - 1); }
  while (pile.length) { const q = pile.pop(); voisins(q, semer); }
  for (let k = 0; k < dans.length; k++) if (!dehors[k]) dans[k] = 1;
  // marge = distance (en cellules, 4-voisinage) du creux au plus proche VIDE (cellule sans triangle, ou extérieur de la carte), quelle que soit
  // l'orientation du scan : un scan coupé en biais a des cellules vides au bord de la coupe, qu'une boîte englobante alignée sur les axes ne verrait pas.
  // Le « vide » est le vide relié à l'extérieur de la carte : les cellules sans triangle isolées à l'intérieur du scan (un seul triangle par cellule suffit à
  // l'occuper, mais un maillage à grands triangles en laisse) ne sont pas un bord.
  const ext = new Uint8Array(nx * ny), pileE = [];
  const semerE = (q) => { if (!occupe[q] && !ext[q]) { ext[q] = 1; pileE.push(q); } };
  for (let i = 0; i < nx; i++) { semerE(i); semerE((ny - 1) * nx + i); }
  for (let j = 0; j < ny; j++) { semerE(j * nx); semerE(j * nx + nx - 1); }
  while (pileE.length) { const q = pileE.pop(); voisins(q, semerE); }
  const dist = new Int32Array(nx * ny).fill(-1), file = [];
  for (let k = 0; k < dist.length; k++) {
    const i = k % nx, j = (k - i) / nx;
    if (ext[k]) { dist[k] = 0; file.push(k); } else if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) { dist[k] = 1; file.push(k); }
  }
  for (let h = 0; h < file.length; h++) { const q = file[h]; voisins(q, (r) => { if (dist[r] < 0) { dist[r] = dist[q] + 1; file.push(r); } }); }
  let dMin = Infinity;
  for (let k = 0; k < dans.length; k++) if (id[k] === best && dist[k] < dMin) dMin = dist[k]; // cellules du creux lui-même (les trous du maillage remplis ne comptent pas)
  const marge = Number.isFinite(dMin) ? (dMin - 1) / Math.max(nx, ny) : 0;
  // Bords qui remontent : cellules un peu profondes (> 10 % du creux) reliées au creux du pied (4-voisinage, sans le franchir par le vide)
  const seuilMurs = Math.max(3 * tol, CREUSEE.fraction_murs * profondeur);
  const m2 = new Uint8Array(nx * ny);
  for (let t = 0; t < nt; t++) if (prof[t] > seuilMurs) m2[cell[t]] = 1;
  const large = new Uint8Array(nx * ny), pileL = [];
  for (let k = 0; k < dans.length; k++) if (dans[k]) { large[k] = 1; pileL.push(k); }
  while (pileL.length) { const q = pileL.pop(); voisins(q, (r) => { if (m2[r] && !large[r]) { large[r] = 1; pileL.push(r); } }); }
  let aCav = 0, aTot = 0;
  const masque = new Uint8Array(nt), murs = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) if (large[cell[t]] && prof[t] > seuilMurs) murs[t] = 1;
  const trouTri = new Uint8Array(nt); // triangles d'un trou rempli (voûte moins profonde que le seuil mais entourée de creux) : gardés
  for (let t = 0; t < nt; t++) { aTot += aire[t]; if (dans[cell[t]]) { masque[t] = 1; aCav += aire[t]; if (!m[cell[t]]) trouTri[t] = 1; } }
  return { masque, trouTri, murs, prof, marge, profondeur, seuil, aire_pct: aCav / aTot, remplissage: Math.min(1, nOcc / rectMin) };
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
  // Cavité principale : plus grand ensemble connexe plus profond que la fraction de la profondeur du creux (trous remplis).
  const cav = cavitePrincipale({ nt, c, aire, h, sgn, plan, tol });
  const marge = cav ? cav.marge : 0;
  const creusee = plateau_pct >= CREUSEE.plateau_min && cavite_pct >= CREUSEE.cavite_min && cote_unique >= CREUSEE.cote_unique_min && !!cav && cav.remplissage >= CREUSEE.remplissage_min && cav.aire_pct >= CREUSEE.cavite_min * 0.5 && marge >= CREUSEE.marge_min;
  return { creusee, plateau_pct, cavite_pct, cote_unique, marge, plan, sgn, h, tol, nt, geo: { n, aire, aireTot }, cav, profondeur_creux: cav ? cav.profondeur : 0, versPied: sgn === 1 ? plan.n : [-plan.n[0], -plan.n[1], -plan.n[2]] };
}

// Cavité seule + sens du pied. Lève une erreur de code 'creusee_introuvable' si le scan n'a pas de bord plan + cavité.
export function convertirCreusee(mesh) {
  const a = analyserBoite(mesh);
  if (!a.creusee) {
    const e = new RangeError('boîte creusée introuvable : le scan n\'a pas de bord plan entourant une cavité (bord ' + Math.round(100 * a.plateau_pct) + ' % de la surface, cavité ' + Math.round(100 * a.cavite_pct) + ' %, marge autour de la cavité ' + Math.round(100 * a.marge) + ' %, scan rectangulaire à ' + Math.round(100 * (a.cav ? a.cav.remplissage : 0)) + ' %). Choisissez « Pied en décharge » ou vérifiez le fichier.');
    e.code = 'creusee_introuvable'; throw e;
  }
  const { h, sgn, plan, nt } = a, { n, aire, aireTot } = a.geo;
  const garde = [];
  let aGardee = 0, profMax = 0;
  for (let t = 0; t < nt; t++) {
    if (!a.cav.masque[t]) continue;
    const prof = -sgn * h[t];
    // détourage : seuls les triangles plus profonds que le seuil du creux sont gardés (le bord de la boîte et la mousse affaissée tombés dans une cellule du creux sont écartés), sauf dans un trou rempli (voûte)
    if (prof <= CREUSEE.profondeur_min_tol * a.tol || (prof <= a.cav.seuil && !a.cav.trouTri[t])) continue;
    if (Math.abs(n[3 * t] * plan.n[0] + n[3 * t + 1] * plan.n[1] + n[3 * t + 2] * plan.n[2]) < CREUSEE.paroi_cos_min) continue;
    garde.push(t); aGardee += aire[t]; if (prof > profMax) profMax = prof;
  }
  if (aGardee / aireTot < CREUSEE.cavite_min * 0.5) { const e = new RangeError('boîte creusée : cavité trop petite après retrait des parois'); e.code = 'creusee_introuvable'; throw e; }
  // triangles des bords qui remontent (hors fond déjà gardé) : filtrés en hauteur (mm) par le recalage, qui seul connaît l'échelle
  const gardeSet = new Uint8Array(nt); for (const t of garde) gardeSet[t] = 1;
  const mursT = [];
  for (let t = 0; t < nt; t++) if (a.cav.murs[t] && !gardeSet[t]) mursT.push(t); // les parois plus raides que ~80° sont masquées par la rasterisation
  const mursIdx = new Uint32Array(3 * mursT.length);
  mursT.forEach((t, k) => { mursIdx[3 * k] = mesh.indices[3 * t]; mursIdx[3 * k + 1] = mesh.indices[3 * t + 1]; mursIdx[3 * k + 2] = mesh.indices[3 * t + 2]; });
  const idx = new Uint32Array(3 * garde.length);
  garde.forEach((t, k) => { idx[3 * k] = mesh.indices[3 * t]; idx[3 * k + 1] = mesh.indices[3 * t + 1]; idx[3 * k + 2] = mesh.indices[3 * t + 2]; });
  return { mursIdx, mesh: { positions: mesh.positions, indices: idx, nbTriangles: garde.length, nbSommets: mesh.nbSommets, format: mesh.format }, versPied: a.versPied, profondeur_brute: profMax,
    mesures: { plateau_pct: a.plateau_pct, cavite_pct: a.cavite_pct, triangles_gardes: garde.length, triangles_total: nt } };
}
