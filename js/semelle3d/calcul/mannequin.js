// Lot 4 bis, étape 5 : outils du pied MANNEQUIN (purs) — maillage par tétraèdres marchants, lissage, normales, occlusion ambiante, détection des orteils sur l'empreinte, ongles,
// appui du pied sur la semelle corrigée, couplage triplan quand le pied tourne autour de l'axe de Henke. Affichage seulement : aucun effet sur la semelle, le STL, Annuler.
// La FORME du pied (volume fermé pied + cheville + jambe) est dans pied_sculpte.js (creerMannequin) ; ici ses briques.
// Repère : celui de la semelle (x absolu, y depuis le talon, z vers le haut, mm) ; l'axe de Henke est exprimé dans son repère (X+ = médial) et converti par versHenke/depuisHenke.
import { MANNEQUIN, HENKE } from '../constantes.js';
import { estValide } from './grille.js';
import { vecteursAxe, depuisHenke, angleFrontal } from './axe-henke.js';

const RAD = Math.PI / 180;
const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const borne = (v, a, b) => (v < a ? a : v > b ? b : v);
const lisse01 = (a, b, x) => { const t = borne((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- distance exacte au bord (Felzenszwalb) et champs de la grille plantaire
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -1e30; z[1] = 1e30;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = 1e30;
  }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function distance2(nx, ny, cible) { // distance² (en cellules) de chaque cellule à la cellule la plus proche où cible[k] = 1
  const g = new Float64Array(nx * ny), m = Math.max(nx, ny), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), zz = new Float64Array(m + 1);
  for (let k = 0; k < g.length; k++) g[k] = cible[k] ? 0 : 1e12;
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = g[j * nx + i]; edt1(f, ny, d, v, zz); for (let j = 0; j < ny; j++) g[j * nx + i] = d[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) f[i] = g[j * nx + i]; edt1(f, nx, d, v, zz); for (let i = 0; i < nx; i++) g[j * nx + i] = d[i]; }
  return g;
}
function lisser(tab, nx, ny, r) { // flou par boîte (rayon r cellules, 3 passes ≈ gaussienne), bords prolongés
  if (!(r >= 1)) return; const tmp = new Float32Array(tab.length), w = 2 * r + 1;
  for (let passe = 0; passe < 3; passe++) {
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let a = -r; a <= r; a++) s += tab[j * nx + borne(i + a, 0, nx - 1)]; tmp[j * nx + i] = s / w; }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let s = 0; for (let b = -r; b <= r; b++) s += tmp[borne(j + b, 0, ny - 1) * nx + i]; tab[j * nx + i] = s / w; }
  }
}
/** Champs de la grille plantaire : distance signée au contour (mm, > 0 dedans), plante prolongée vers l'extérieur (moyenne des voisines), étendue du pied. */
export function champsPlantaires(grille) {
  const { nx, ny, pas, ox, oy, z } = grille, n = nx * ny, dedans = new Uint8Array(n), dehors = new Uint8Array(n);
  let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (estValide(z[k])) { dedans[k] = 1; const y = oy + j * pas, x = ox + i * pas; if (y < ymin) ymin = y; if (y > ymax) ymax = y; if (x < xmin) xmin = x; if (x > xmax) xmax = x; } else dehors[k] = 1; }
  if (!(ymax > ymin)) throw new RangeError('mannequin : grille plantaire vide');
  const dOut = distance2(nx, ny, dehors), dIn = distance2(nx, ny, dedans), d = new Float32Array(n), bas = new Float32Array(n);
  for (let k = 0; k < n; k++) { d[k] = dedans[k] ? (Math.sqrt(dOut[k]) - 0.5) * pas : -(Math.sqrt(dIn[k]) - 0.5) * pas; bas[k] = dedans[k] ? Math.max(z[k], 0) : NaN; }
  lisser(d, nx, ny, MANNEQUIN.lissage_bord_cellules(pas)); // la distance d'une image binaire est en escalier : on l'adoucit (sinon le dessus est « crépu » près du bord)
  for (let iter = 0; iter < 400; iter++) { // prolongement de la plante : cellule vide à côté d'une cellule pleine = moyenne des pleines voisines
    const nouv = []; 
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (bas[k] === bas[k]) continue; let s = 0, c = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < nx && b < ny && bas[b * nx + a] === bas[b * nx + a]) { s += bas[b * nx + a]; c++; } } if (c) nouv.push([k, s / c]); }
    if (!nouv.length) break; for (const [k, v] of nouv) bas[k] = v;
  }
  for (let k = 0; k < n; k++) if (bas[k] !== bas[k]) bas[k] = 0;
  return { nx, ny, pas, ox, oy, d, bas, xmin, xmax, ymin, ymax };
}

// ---------------------------------------------------------------- tétraèdres marchants (sans table ; sommets soudés par arête)
const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
const COIN = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
/** Surface F = 0 d'un champ échantillonné (Float32Array nx·ny·nz, F > 0 dedans). Triangles orientés vers l'extérieur (F décroissant). Bord de la boîte : F doit y être négatif. */
export function maillerChamp(F, nx, ny, nz, h, x0, y0, z0) {
  const pos = [], idx = [], soude = new Map(), N = nx * ny * nz;
  const nd = (i, j, k) => (k * ny + j) * nx + i;
  const sommet = (a, b, ia, ja, ka, ib, jb, kb) => { // a dedans (F > 0), b dehors
    const cle = a < b ? a * N + b : b * N + a; let id = soude.get(cle);
    if (id === undefined) { const t = F[a] / (F[a] - F[b]); id = pos.length / 3; soude.set(cle, id); pos.push(x0 + (ia + (ib - ia) * t) * h, y0 + (ja + (jb - ja) * t) * h, z0 + (ka + (kb - ka) * t) * h); }
    return id;
  };
  // Orientation : décidée avec les milieux des arêtes (jamais dégénérés), pas avec les sommets interpolés (un sommet posé sur un nœud donnerait une normale nulle et un maillage ouvert).
  const tri = (a, b, c, ma, mb, mc, ref, versExterieur) => { // ma, mb, mc : milieux des arêtes de a, b, c ; ref : point de référence ; versExterieur : la normale va de ref vers le triangle
    if (a === b || b === c || a === c) return;
    const ux = mb[0] - ma[0], uy = mb[1] - ma[1], uz = mb[2] - ma[2], vx = mc[0] - ma[0], vy = mc[1] - ma[1], vz = mc[2] - ma[2];
    const nxx = uy * vz - uz * vy, nyy = uz * vx - ux * vz, nzz = ux * vy - uy * vx;
    const gx = (ma[0] + mb[0] + mc[0]) / 3 - ref[0], gy = (ma[1] + mb[1] + mc[1]) / 3 - ref[1], gz = (ma[2] + mb[2] + mc[2]) / 3 - ref[2];
    const s = (nxx * gx + nyy * gy + nzz * gz) * (versExterieur ? 1 : -1);
    if (s >= 0) idx.push(a, b, c); else idx.push(a, c, b);
  };
  const cn = new Int32Array(8), ci = new Int32Array(8), cj = new Int32Array(8), ck = new Int32Array(8), cf = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let pos_ = 0;
    for (let q = 0; q < 8; q++) { ci[q] = i + COIN[q][0]; cj[q] = j + COIN[q][1]; ck[q] = k + COIN[q][2]; cn[q] = nd(ci[q], cj[q], ck[q]); cf[q] = F[cn[q]]; if (cf[q] > 0) pos_++; }
    if (pos_ === 0 || pos_ === 8) continue;
    for (const T of TETS) {
      const dedans = [], dehors = []; for (const q of T) (cf[q] > 0 ? dedans : dehors).push(q);
      if (!dedans.length || !dehors.length) continue;
      const P = (q) => [x0 + ci[q] * h, y0 + cj[q] * h, z0 + ck[q] * h];
      const S = (a, b) => sommet(cn[a], cn[b], ci[a], cj[a], ck[a], ci[b], cj[b], ck[b]);
      const Mi = (a, b) => { const A = P(a), B = P(b); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; };
      if (dedans.length === 1) { const v = dedans[0], [o1, o2, o3] = dehors; tri(S(v, o1), S(v, o2), S(v, o3), Mi(v, o1), Mi(v, o2), Mi(v, o3), P(v), true); }
      else if (dedans.length === 3) { const o = dehors[0], [i1, i2, i3] = dedans; tri(S(i1, o), S(i2, o), S(i3, o), Mi(i1, o), Mi(i2, o), Mi(i3, o), P(o), false); }
      else { const [i1, i2] = dedans, [o1, o2] = dehors, a = S(i1, o1), b = S(i1, o2), c = S(i2, o2), d = S(i2, o1), m = P(i1), n = P(i2), ref = [(m[0] + n[0]) / 2, (m[1] + n[1]) / 2, (m[2] + n[2]) / 2];
        tri(a, b, c, Mi(i1, o1), Mi(i1, o2), Mi(i2, o2), ref, true); tri(a, c, d, Mi(i1, o1), Mi(i2, o2), Mi(i2, o1), ref, true); }
    }
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), nbSommets: pos.length / 3, nbTriangles: idx.length / 3 };
}

// ---------------------------------------------------------------- outils de maillage : voisinage, lissage, échantillonnage du champ
/** Voisinage des sommets (CSR) : { debut, liste } ; une arête partagée par deux triangles compte deux fois (poids uniforme, sans importance pour une moyenne). */
export function voisins(nbSommets, indices) {
  const nb = new Uint32Array(nbSommets + 1);
  for (let t = 0; t < indices.length; t += 3) for (let a = 0; a < 3; a++) nb[indices[t + a] + 1] += 2;
  for (let v = 0; v < nbSommets; v++) nb[v + 1] += nb[v];
  const liste = new Uint32Array(nb[nbSommets]), cur = Uint32Array.from(nb.subarray(0, nbSommets));
  for (let t = 0; t < indices.length; t += 3) for (let a = 0; a < 3; a++) { const v = indices[t + a], w1 = indices[t + (a + 1) % 3], w2 = indices[t + (a + 2) % 3]; liste[cur[v]++] = w1; liste[cur[v]++] = w2; }
  return { debut: nb, liste };
}
/** Lissage de Taubin (λ puis μ : lisse sans rétrécir), sommets `fixe` immobiles. Modifie `positions` en place. */
export function lisserMaillage(positions, voisinage, fixe, iterations = 8, lambda = 0.5, mu = -0.53) {
  const n = positions.length / 3, tmp = new Float32Array(positions.length), { debut, liste } = voisinage;
  for (let it = 0; it < iterations; it++) for (const f of [lambda, mu]) {
    for (let v = 0; v < n; v++) {
      const d = debut[v + 1] - debut[v]; if (fixe[v] || d === 0) { tmp[3 * v] = positions[3 * v]; tmp[3 * v + 1] = positions[3 * v + 1]; tmp[3 * v + 2] = positions[3 * v + 2]; continue; }
      let sx = 0, sy = 0, sz = 0; for (let q = debut[v]; q < debut[v + 1]; q++) { const w = liste[q]; sx += positions[3 * w]; sy += positions[3 * w + 1]; sz += positions[3 * w + 2]; }
      tmp[3 * v] = positions[3 * v] + f * (sx / d - positions[3 * v]); tmp[3 * v + 1] = positions[3 * v + 1] + f * (sy / d - positions[3 * v + 1]); tmp[3 * v + 2] = positions[3 * v + 2] + f * (sz / d - positions[3 * v + 2]);
    }
    positions.set(tmp);
  }
  return positions;
}
/** Moyenne des vecteurs (normales) avec ceux des voisins, `passes` fois, puis renormalisation. Modifie `vec` en place. */
export function moyennerVecteurs(vec, voisinage, passes) {
  const n = vec.length / 3, { debut, liste } = voisinage, tmp = new Float32Array(vec.length);
  for (let p = 0; p < passes; p++) {
    for (let v = 0; v < n; v++) { let x = vec[3 * v], y = vec[3 * v + 1], z = vec[3 * v + 2]; for (let q = debut[v]; q < debut[v + 1]; q++) { const w = liste[q]; x += vec[3 * w] / 3; y += vec[3 * w + 1] / 3; z += vec[3 * w + 2] / 3; } const l = Math.hypot(x, y, z) || 1; tmp[3 * v] = x / l; tmp[3 * v + 1] = y / l; tmp[3 * v + 2] = z / l; }
    vec.set(tmp);
  }
  return vec;
}
/** Valeur du champ F (trilinéaire) au point (x, y, z) ; hors de la boîte : valeur du nœud le plus proche. */
export function echantillonChamp(c, x, y, z) {
  const fx = borne((x - c.x0) / c.h, 0, c.nx - 1.0001), fy = borne((y - c.y0) / c.h, 0, c.ny - 1.0001), fz = borne((z - c.z0) / c.h, 0, c.nz - 1.0001);
  const i = fx | 0, j = fy | 0, k = fz | 0, a = fx - i, b = fy - j, e = fz - k, { F, nx, ny } = c, o = (k * ny + j) * nx + i, sy = nx, sz = nx * ny;
  const c00 = F[o] * (1 - a) + F[o + 1] * a, c10 = F[o + sy] * (1 - a) + F[o + sy + 1] * a, c01 = F[o + sz] * (1 - a) + F[o + sz + 1] * a, c11 = F[o + sy + sz] * (1 - a) + F[o + sy + sz + 1] * a;
  return (c00 * (1 - b) + c10 * b) * (1 - e) + (c01 * (1 - b) + c11 * b) * e;
}
/** Normales lisses, tournées vers l'extérieur : −∇F (différences centrées). Un champ sans pente (rare) garde la normale du maillage. */
export function normalesDuChamp(c, positions, repli) {
  const n = positions.length / 3, out = new Float32Array(positions.length), e = 0.9 * c.h;
  for (let v = 0; v < n; v++) {
    const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    let gx = echantillonChamp(c, x - e, y, z) - echantillonChamp(c, x + e, y, z), gy = echantillonChamp(c, x, y - e, z) - echantillonChamp(c, x, y + e, z), gz = echantillonChamp(c, x, y, z - e) - echantillonChamp(c, x, y, z + e);
    const l = Math.hypot(gx, gy, gz);
    if (l < 1e-6) { gx = repli[3 * v]; gy = repli[3 * v + 1]; gz = repli[3 * v + 2]; } else { gx /= l; gy /= l; gz /= l; }
    out[3 * v] = gx; out[3 * v + 1] = gy; out[3 * v + 2] = gz;
  }
  return out;
}
/** Moyenne d'une valeur par sommet avec celles des voisins, `passes` fois (lisse les bandes de l'occlusion échantillonnée). Modifie et rend `val`. */
export function lisserScalaire(val, voisinage, passes) {
  const { debut, liste } = voisinage, n = val.length, tmp = new Float32Array(n);
  for (let p = 0; p < passes; p++) { for (let v = 0; v < n; v++) { let s = val[v], c = 1; for (let q = debut[v]; q < debut[v + 1]; q++) { s += val[liste[q]]; c++; } tmp[v] = s / c; } val.set(tmp); }
  return val;
}
/** Occlusion ambiante (0 = très occlus, 1 = dégagé) : 5 directions autour de la normale × 3 rayons ; un point d'échantillonnage DANS le corps compte comme occlusion (creux entre les orteils, pli cheville / cou-de-pied). */
export function occlusionAmbiante(c, positions, nrm, rayons = MANNEQUIN.ao_rayons_mm, poids = MANNEQUIN.ao_poids) {
  const n = positions.length / 3, ao = new Float32Array(n), K = 5, wsum = poids.reduce((s, w) => s + w, 0);
  for (let v = 0; v < n; v++) {
    const nx = nrm[3 * v], ny = nrm[3 * v + 1], nz = nrm[3 * v + 2];
    let tx, ty, tz; if (Math.abs(nz) < 0.9) { tx = -ny; ty = nx; tz = 0; } else { tx = 0; ty = -nz; tz = ny; } const lt = Math.hypot(tx, ty, tz) || 1; tx /= lt; ty /= lt; tz /= lt;
    const ux = ny * tz - nz * ty, uy = nz * tx - nx * tz, uz = nx * ty - ny * tx; // 2e tangente
    let occ = 0;
    for (let d = 0; d < K; d++) {
      let dx = nx, dy = ny, dz = nz; const s = d === 0 ? 0 : 0.85, sg = d % 2 === 1 ? 1 : -1;
      if (d >= 1 && d <= 2) { dx += sg * s * tx; dy += sg * s * ty; dz += sg * s * tz; } else if (d >= 3) { dx += sg * s * ux; dy += sg * s * uy; dz += sg * s * uz; }
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      for (let r = 0; r < rayons.length; r++) occ += poids[r] * lisse01(-0.5, 3, echantillonChamp(c, positions[3 * v] + dx * rayons[r], positions[3 * v + 1] + dy * rayons[r], positions[3 * v + 2] + dz * rayons[r])); // occlusion DOUCE (un seuil dur dessinait des stries obliques sur les pentes)
    }
    ao[v] = 1 - occ / (K * wsum);
  }
  return ao;
}

// ---------------------------------------------------------------- orteils (détection sur la grille plantaire) et ongles
/**
 * Orteils de l'empreinte : pics du bord avant (lissé) au-delà de 80 % de la longueur, séparés par une encoche d'au moins 2 mm. Retourne, du MÉDIAL vers le latéral :
 * [{ x, y (bout), largeur_mm (à 9 mm du bout), cx (milieu à cette ligne) }]. Moins de 3 pics = pas de détection (liste vide) : le pied est alors dessiné sans ongles ni tendons.
 */
export function detecterOrteils(grille, ch, cote = 'D', k = 1) {
  const { nx, ny, pas, ox, oy, z } = grille, front = new Float32Array(nx).fill(NaN), yMin = ch.ymin + 0.80 * (ch.ymax - ch.ymin);
  for (let i = 0; i < nx; i++) for (let j = ny - 1; j >= 0; j--) if (estValide(z[j * nx + i])) { front[i] = oy + j * pas; break; }
  const r = Math.max(1, Math.round(1.2 / pas)), fs = new Float32Array(nx).fill(NaN);
  for (let i = 0; i < nx; i++) { let s = 0, c = 0; for (let a = -r; a <= r; a++) { const w = front[i + a]; if (i + a >= 0 && i + a < nx && w === w) { s += w; c++; } } if (c > 0 && front[i] === front[i]) fs[i] = s / c; }
  const W = Math.round(3 / pas), V = Math.round(11 / pas), pics = [];
  for (let i = 0; i < nx; i++) {
    const v = fs[i]; if (!(v >= yMin)) continue;
    let max = true; for (let a = -W; a <= W; a++) { const w = fs[i + a]; if (i + a >= 0 && i + a < nx && w === w && (w > v + 1e-6 || (w === v && a < 0))) { max = false; break; } }
    if (!max) continue;
    let gauche = Infinity, droite = Infinity; for (let a = 1; a <= V; a++) { const l = fs[i - a], d = fs[i + a]; gauche = Math.min(gauche, i - a >= 0 && l === l ? l : -1e9); droite = Math.min(droite, i + a < nx && d === d ? d : -1e9); }
    const prom = v - Math.max(gauche, droite); if (prom >= 1.0) pics.push({ i, y: v, prom });
  }
  const gardes = []; for (const p of pics) { const proche = gardes.find((q) => Math.abs(q.i - p.i) * pas < 7); if (proche) { if (p.y > proche.y) { proche.i = p.i; proche.y = p.y; proche.prom = Math.max(proche.prom, p.prom); } } else gardes.push({ ...p }); }
  if (gardes.length < 3) return [];
  const retenus = gardes.sort((u, w) => w.prom - u.prom).slice(0, 5).sort((u, w) => u.i - w.i); // au plus 5 orteils : les 5 pics les plus marqués
  const vallee = (i0, i1) => { let m = Infinity, im = i0; for (let i = i0; i <= i1; i++) if (fs[i] === fs[i] && fs[i] < m) { m = fs[i]; im = i; } return im; };
  const bord = (p, sens) => { let i = p.i; while (i + sens >= 0 && i + sens < nx && fs[i + sens] === fs[i + sens] && fs[i + sens] > p.y - 9) i += sens; return i; }; // bord extérieur : là où le devant tombe de plus de 9 mm
  const orteils = retenus.map((p, n) => {
    const L = n === 0 ? bord(p, -1) : vallee(retenus[n - 1].i, p.i), R = n === retenus.length - 1 ? bord(p, 1) : vallee(p.i, retenus[n + 1].i);
    return { x: ox + p.i * pas, y: p.y, largeur_mm: Math.max(5, (R - L) * pas), cx: ox + ((L + R) / 2) * pas };
  });
  const med = cote === 'D' ? -1 : 1; orteils.sort((u, w) => med * (w.x - u.x)); // médial d'abord
  return orteils;
}
/**
 * Ongle : coque elliptique qui épouse le dessus de l'orteil (hauteur lue sur la carte du dessus `hautAt`), bombée de 0,75 mm, avec un bord net posé 0,3 mm au-dessus de la peau et une jupe verticale
 * qui s'enfonce de 1,5 mm (la coque ne « mord » jamais en dents de scie dans la peau). Retourne { positions, indices, normales } (normales analytiques ; radiales sur la jupe).
 */
export function maillageOngle(cx, cy, largeur, longueur, hautAt, { anneaux = 6, segments = 24, bombe = 0.75 } = {}) {
  const rx = largeur / 2, ry = longueur / 2, pos = [], nrm = [], idx = [], e = 0.35;
  const xy = (r, t) => [cx + rx * r * Math.cos(t), cy + ry * r * Math.sin(t) * (1 + 0.1 * Math.max(0, Math.sin(t)))];
  const zf = (x, y) => { const r2 = ((x - cx) / rx) ** 2 + ((y - cy) / (ry * (1 + 0.1 * Math.max(0, (y - cy) / ry)))) ** 2; return hautAt(x, y) + 0.3 + bombe * Math.pow(Math.max(0, 1 - r2), 0.7); };
  const pousser = (x, y, z, nx, ny, nz) => { const l = Math.hypot(nx, ny, nz) || 1; pos.push(x, y, z); nrm.push(nx / l, ny / l, nz / l); };
  const dessus = (x, y) => { const z = zf(x, y), gx = (zf(x + e, y) - zf(x - e, y)) / (2 * e), gy = (zf(x, y + e) - zf(x, y - e)) / (2 * e); pousser(x, y, z, -gx, -gy, 1); };
  dessus(cx, cy);
  for (let a = 1; a <= anneaux; a++) for (let s = 0; s < segments; s++) { const [x, y] = xy(a / anneaux, (2 * Math.PI * s) / segments); dessus(x, y); }
  for (let s = 0; s < segments; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segments));
  for (let a = 1; a < anneaux; a++) for (let s = 0; s < segments; s++) { const p = 1 + (a - 1) * segments, q = 1 + a * segments, s1 = (s + 1) % segments; idx.push(p + s, q + s, q + s1, p + s, q + s1, p + s1); }
  const bord = 1 + (anneaux - 1) * segments, jupe = pos.length / 3; // jupe : même contour, 1,5 mm plus bas, normales radiales
  for (let s = 0; s < segments; s++) { const i = bord + s, x = pos[3 * i], y = pos[3 * i + 1]; pousser(x, y, pos[3 * i + 2] - 1.5, x - cx, y - cy, 0); }
  for (let s = 0; s < segments; s++) { const s1 = (s + 1) % segments; idx.push(bord + s, jupe + s, jupe + s1, bord + s, jupe + s1, bord + s1); }
  return { positions: pos, indices: idx, normales: nrm };
}

// ---------------------------------------------------------------- appui du pied sur la semelle corrigée
/**
 * Pose d'appui du pied sur la semelle CORRIGÉE (retour du praticien : le pied doit suivre la correction, la semelle ne doit pas « manger » le pied en remontant).
 * Entrées (grilles de même taille, repère de la semelle) : haut = dessus final de la semelle (éléments compris), hautBase = dessus de la base sans élément, z = hauteur de l'empreinte
 * (NaN hors pied), socle = jeu entre l'empreinte et le sol (0,5 mm). Le pied est posé à R = max(z, 0) + socle.
 * Sortie : déplacement rigide du pied, en petits angles, sous forme du plan  z = a + b·(x − px) + c·(y − py)  :
 *   1) (b, c) = plan des moindres carrés de la CORRECTION E = haut − hautBase sur la surface du pied : le pied s'incline avec la correction (torsion : angle frontal) ;
 *   2) a = le plus petit relèvement qui supprime toute pénétration : max sur le pied de (haut − R − b·dx − c·dy). Après la pose, plus aucune cellule où la semelle monte dans le pied.
 * Les relèvements sont bornés (max_mm, tilt_max_deg) ; `penetration_mm` = pénétration restante après pose (0 sauf si une borne a joué).
 */
export function appuiMannequin({ nx, ny, pas, ox, oy, haut, hautBase, z, socle = MANNEQUIN.socle_mm, max_mm = MANNEQUIN.appui.max_mm, tilt_max_deg = MANNEQUIN.appui.inclinaison_max_deg }) {
  const n = nx * ny; if (haut.length !== n || hautBase.length !== n || z.length !== n) throw new RangeError('appui : grilles de tailles différentes');
  let nc = 0, sx = 0, sy = 0, se = 0, emax = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!estValide(z[k]) || !estValide(haut[k]) || !estValide(hautBase[k])) continue; nc++; sx += ox + i * pas; sy += oy + j * pas; const e = haut[k] - hautBase[k]; se += e; if (Math.abs(e) > emax) emax = Math.abs(e); }
  if (nc === 0) throw new RangeError('appui : aucune cellule commune au pied et à la semelle');
  const px = sx / nc, py = sy / nc, em = se / nc;
  let b = 0, c = 0;
  if (emax > 1e-3) {
    let sxx = 0, sxy = 0, syy = 0, sxe = 0, sye = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!estValide(z[k]) || !estValide(haut[k]) || !estValide(hautBase[k])) continue; const dx = ox + i * pas - px, dy = oy + j * pas - py, e = haut[k] - hautBase[k] - em; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; sxe += dx * e; sye += dy * e; }
    const det = sxx * syy - sxy * sxy; if (Math.abs(det) > 1e-9) { b = (sxe * syy - sye * sxy) / det; c = (sye * sxx - sxe * sxy) / det; }
  }
  const pente = Math.hypot(b, c), pmax = Math.tan(tilt_max_deg * RAD); let incline_borne = false; if (pente > pmax) { b *= pmax / pente; c *= pmax / pente; incline_borne = true; }
  let a = -Infinity; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!estValide(z[k]) || !estValide(haut[k])) continue; const dx = ox + i * pas - px, dy = oy + j * pas - py, e = haut[k] - (Math.max(z[k], 0) + socle) - b * dx - c * dy; if (e > a) a = e; }
  const brut = a, aa = Math.min(Math.max(a, 0), max_mm); let pen = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (!estValide(z[k]) || !estValide(haut[k])) continue; const dx = ox + i * pas - px, dy = oy + j * pas - py, e = haut[k] - (Math.max(z[k], 0) + socle) - aa - b * dx - c * dy; if (e > pen) pen = e; }
  return { a_mm: aa, b, c, px, py, brut_mm: brut, penetration_mm: pen, inclinaison_deg: Math.atan(Math.hypot(b, c)) / RAD, frontal_deg: Math.atan(b) / RAD, sagittal_deg: Math.atan(c) / RAD, correction_moyenne_mm: em, correction_max_mm: emax, borne_atteinte: incline_borne || brut > max_mm, cellules: nc };
}

/** Grille plantaire d'un modèle générique (sans empreinte) : même forme que H_plantaire (z >= 0, NaN hors pied), repère de la semelle (talon en y = 0, x centré sur le talon). */
export function grilleDuModele(modele, { pas = 0.5 } = {}) {
  const L = modele.longueur_mm, x0 = modele.x0 ?? -70, nx = Math.round((modele.largeur_grille_mm ?? 140) / pas) + 1, ny = Math.round(L / pas) + 2, z = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * pas, y = j * pas; z[j * nx + i] = modele.dedans(x, y) ? modele.relief(x, y) : NaN; }
  return { nx, ny, pas, ox: x0, oy: 0, z };
}

/**
 * Ramène l'empreinte du pied dans le contour de la semelle (devant arrondi) : sur chaque rangée où la semelle est plus étroite que le pied, les cellules sont resserrées vers le milieu de la
 * semelle (facteur borné par `facteurMin`), si bien que les orteils ne dépassent plus de la semelle. Les rangées déjà contenues dans la semelle ne changent pas. Rend une NOUVELLE grille.
 */
export function ajusterAuContour(g, gs, facteurMin = 0.8) {
  const { nx, ny } = g, ext = (grille, j) => { let a = Infinity, b = -Infinity; for (let i = 0; i < nx; i++) if (estValide(grille.z[j * nx + i])) { if (i < a) a = i; if (i > b) b = i; } return a <= b ? [a, b] : null; };
  const flou = (t, r) => t.map((v, k) => { let s = 0, n = 0; for (let q = Math.max(0, k - r); q <= Math.min(t.length - 1, k + r); q++) { s += t[q]; n++; } return s / n; }); // lisse les facteurs pour ne pas créer de marches sur le contour des orteils
  const echant = (tab, w, x) => { const i0 = Math.floor(x); if (i0 < 0 || i0 >= w - 1) return NaN; return tab(i0, x - i0); };
  // sens médio-latéral : facteur et centres par rangée
  const sj = new Array(ny).fill(1), csj = new Array(ny).fill(0), cfj = new Array(ny).fill(0); let nbRetrecies = 0;
  for (let j = 0; j < ny; j++) { const e = ext(g, j), es = ext(gs, j); if (!e || !es || e[1] - e[0] < 2) continue; cfj[j] = 0.5 * (e[0] + e[1]); csj[j] = 0.5 * (es[0] + es[1]); const w = es[1] - es[0], f = e[1] - e[0]; if (w < f) { sj[j] = Math.max(facteurMin, w / f); nbRetrecies++; } else csj[j] = cfj[j]; }
  const sjl = flou(sj, 4), z = new Float32Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) {
    if (!ext(g, j)) continue;
    if (sj[j] === 1 && sjl[j] > 0.999) { for (let i = 0; i < nx; i++) z[j * nx + i] = g.z[j * nx + i]; continue; }
    const cs = csj[j] || cfj[j], cf = cfj[j] || cs;
    for (let i = 0; i < nx; i++) { const x = (i - cs) / sjl[j] + cf; z[j * nx + i] = echant((i0, f) => { const a = g.z[j * nx + i0], b = g.z[j * nx + i0 + 1]; return estValide(a) && estValide(b) ? a + (b - a) * f : estValide(a) && f < 0.5 ? a : estValide(b) && f >= 0.5 ? b : NaN; }, nx, x); }
  }
  // sens antéro-postérieur : colonne par colonne, les rangées au-delà du début du rétrécissement sont raccourcies (le bout des orteils reste dans le devant arrondi)
  let jDebut = Infinity; for (let j = 0; j < ny; j++) { const e = ext(g, j), es = ext(gs, j); if (e && es && es[1] - es[0] < e[1] - e[0]) { jDebut = j; break; } }
  let nbCol = 0; const ti = new Array(nx).fill(1);
  if (jDebut < Infinity) for (let i = 0; i < nx; i++) {
    let ft = -1, st = -1; for (let j = ny - 1; j >= 0; j--) { if (ft < 0 && estValide(z[j * nx + i])) ft = j; if (st < 0 && estValide(gs.z[j * nx + i])) st = j; }
    if (ft < 0 || ft <= jDebut + 2 || st >= ft) continue;
    ti[i] = Math.max(facteurMin, (Math.max(st, jDebut + 1) - jDebut) / (ft - jDebut)); nbCol++;
  }
  const til = flou(ti, 3), z2 = Float32Array.from(z);
  if (nbCol > 0) for (let i = 0; i < nx; i++) {
    if (til[i] > 0.999) continue;
    for (let j = jDebut + 1; j < ny; j++) { const y = jDebut + (j - jDebut) / til[i]; z2[j * nx + i] = echant((j0, f) => { const a = z[j0 * nx + i], b = z[(j0 + 1) * nx + i]; return estValide(a) && estValide(b) ? a + (b - a) * f : estValide(a) && f < 0.5 ? a : estValide(b) && f >= 0.5 ? b : NaN; }, ny, y); }
  }
  return { ...g, z: z2, retrecies: nbRetrecies, colonnes_raccourcies: nbCol };
}

// ---------------------------------------------------------------- couplage triplan
/**
 * Composantes de la rotation phi autour de l'axe de Henke, dans les 3 plans (axe unitaire u = (cos λ sin δ, cos λ cos δ, sin λ), rotation de vecteur phi·u) :
 *   frontal (autour de l'axe long)        = phi · cos λ · cos δ   (supination : inversion ; pronation : éversion)
 *   transversal (autour de la verticale)  = phi · sin λ           (supination : adduction ; pronation : abduction)
 *   sagittal (autour de l'axe médio-latéral) = phi · cos λ · sin δ  (supination : flexion plantaire ; pronation : flexion dorsale)
 * Petits angles : la somme vectorielle est exacte, la composition de 3 rotations successives n'est qu'une approximation au 2e ordre.
 */
export function composantesTriplan(phi_deg, axe) {
  if (!fini(phi_deg)) throw new TypeError('mannequin : phi doit être un nombre');
  const { u } = vecteursAxe(axe), sup = phi_deg >= 0;
  const c = (plan, axeNom, valeur, plus, moins) => ({ plan, axe: axeNom, deg: valeur, sens: valeur === 0 ? 'nul' : valeur > 0 ? plus : moins });
  return {
    frontal: c('frontal', 'long', phi_deg * u.y, 'inversion', 'éversion'),
    transversal: c('transversal', 'vertical', phi_deg * u.z, 'adduction', 'abduction'),
    sagittal: c('sagittal', 'medio-lateral', phi_deg * u.x, 'flexion plantaire', 'flexion dorsale'),
    mouvement: phi_deg === 0 ? 'neutre' : sup ? 'supination' : 'pronation',
  };
}
/** Phrase d'affichage : « Supination de 5° = inversion 3,6° + adduction 3,3° + flexion plantaire 1,0° ». */
export function texteTriplan(phi_deg, axe) {
  const t = composantesTriplan(phi_deg, axe), f = (v) => Math.abs(v).toFixed(1).replace('.', ',');
  if (t.mouvement === 'neutre') return 'Pied au neutre (phi = 0°).';
  return (t.mouvement === 'supination' ? 'Supination' : 'Pronation') + ' de ' + f(phi_deg) + '° = ' + t.frontal.sens + ' ' + f(t.frontal.deg) + '° + ' + t.transversal.sens + ' ' + f(t.transversal.deg) + '° + ' + t.sagittal.sens + ' ' + f(t.sagittal.deg) + '°';
}
/** Trois flèches de la vue 3D : une par plan, orientée selon son axe de rotation, longueur proportionnelle à la composante (mm par degré), avertissement si phi dépasse les seuils. */
export function fleches(phi_deg, axe, { mm_par_deg = 4, longueur_min_mm = 6 } = {}) {
  const t = composantesTriplan(phi_deg, axe), vec = { long: [0, 1, 0], vertical: [0, 0, 1], 'medio-lateral': [1, 0, 0] }, coul = { frontal: 'bleu', transversal: 'vert', sagittal: 'orange' };
  return ['frontal', 'transversal', 'sagittal'].map((p) => { const c = t[p], a = Math.abs(c.deg); return { plan: p, axe: c.axe, direction_henke: vec[c.axe], sens_positif: c.deg >= 0, deg: c.deg, sens: c.sens, longueur_mm: a < 1e-9 ? 0 : Math.max(longueur_min_mm, a * mm_par_deg), couleur: coul[p] }; });
}
/** Alerte de la valeur de phi (mêmes seuils que la torsion) : 'ok' | 'orange' | 'rouge' ; au-delà de 15° le curseur s'arrête. */
export function niveauPhiMannequin(phi_deg) {
  if (!fini(phi_deg)) throw new TypeError('mannequin : phi doit être un nombre');
  const a = Math.abs(phi_deg), P = HENKE.phi;
  return { niveau: a > P.rouge_deg ? 'rouge' : a > P.orange_deg ? 'orange' : 'ok', borne: Math.max(-P.blocage_deg, Math.min(P.blocage_deg, phi_deg)), borne_atteinte: a > P.blocage_deg };
}

// ---------------------------------------------------------------- pose du pied tourné
/**
 * Vecteur rotation (rad, repère de la semelle) du pied tourné de phi autour de l'axe : supination (phi > 0) = côté médial relevé. Pied D : le repère de l'axe est inversé en x
 * (le médial du D est à x négatif) : (x, y, z) -> (−x, y, z) pour la direction ET un signe de plus pour le sens (réflexion d'un pseudovecteur) ; pied G : sens −u.
 */
export function vecteurRotation(axe, phi_deg, cote) {
  if (cote !== 'D' && cote !== 'G') throw new TypeError('mannequin : côté D ou G exigé');
  const { u } = vecteursAxe(axe), t = phi_deg * RAD;
  return cote === 'D' ? [t * -u.x, t * u.y, t * u.z] : [-t * u.x, -t * u.y, -t * u.z];
}
/** Point de l'axe dans le repère de la semelle (le pivot) : p0 de l'axe, à la hauteur z0. */
export const pivotAxe = (axe, rep, cote, z0 = 0) => { const q = depuisHenke(axe.p0, rep, cote); return [q.x, q.y, z0]; };

/** Tourne des points (positions [x,y,z,…], repère de la semelle) de phi autour de l'axe (Rodrigues exacte). Retourne un NOUVEAU tableau ; l'entrée n'est jamais modifiée. */
export function poserPied(positions, axe, phi_deg, rep, cote, z0 = 0) {
  const w = vecteurRotation(axe, phi_deg, cote), th = Math.hypot(w[0], w[1], w[2]), out = Float32Array.from(positions);
  if (th < 1e-12) return out;
  const k = [w[0] / th, w[1] / th, w[2] / th], c = Math.cos(th), s = Math.sin(th), P = pivotAxe(axe, rep, cote, z0);
  for (let v = 0; v < out.length; v += 3) {
    const r = [positions[v] - P[0], positions[v + 1] - P[1], positions[v + 2] - P[2]], d = k[0] * r[0] + k[1] * r[1] + k[2] * r[2];
    const cr = [k[1] * r[2] - k[2] * r[1], k[2] * r[0] - k[0] * r[2], k[0] * r[1] - k[1] * r[0]];
    for (let q = 0; q < 3; q++) out[v + q] = P[q] + r[q] * c + cr[q] * s + k[q] * d * (1 - c);
  }
  return out;
}
/** Données pour la carte graphique (la rotation n'est pas recalculée sommet par sommet) : axe unitaire, angle (rad) et pivot dans le repère de la semelle. */
export function poseGPU(axe, phi_deg, rep, cote, z0 = 0) {
  const w = vecteurRotation(axe, phi_deg, cote), th = Math.hypot(w[0], w[1], w[2]);
  return { axe: th < 1e-12 ? [0, 0, 1] : [w[0] / th, w[1] / th, w[2] / th], angle_rad: th, pivot: pivotAxe(axe, rep, cote, z0) };
}
/**
 * Angle frontal (degrés, positif = côté médial relevé) du plan plantaire après rotation EXACTE, mesuré le long de x à y constant comme l'outil de coupe :
 * l'image du plan horizontal a pour normale n' = R·(0,0,1), donc dz/dx = −n'x / n'z ; vers le médial (direction x : −1 pour le D, +1 pour le G) la pente est med · dz/dx.
 * À comparer à angleFrontal(phi, axe) = atan(tan φ cos λ cos δ) (formule du script de la torsion).
 */
export function penteFrontaleExacte(axe, phi_deg, cote) {
  const w = vecteurRotation(axe, phi_deg, cote), th = Math.hypot(w[0], w[1], w[2]);
  if (th < 1e-12) return 0;
  const k = [w[0] / th, w[1] / th, w[2] / th], c = Math.cos(th), s = Math.sin(th), r = [0, 0, 1], d = k[2];
  const n = [k[1] * r[2] - k[2] * r[1], k[2] * r[0] - k[0] * r[2], k[0] * r[1] - k[1] * r[0]].map((cr, q) => r[q] * c + cr * s + k[q] * d * (1 - c));
  const med = cote === 'D' ? -1 : 1;
  return Math.atan((-med * n[0]) / n[2]) / RAD;
}
export { angleFrontal };
