// Pied « sculpté » (04/11, proposition à comparer aux modèles 3D de référence de Joël) : pied et court segment de jambe en UN volume fermé,
// construit à la main (champ implicite + tétraèdres marchants) à partir de PROPORTIONS anatomiques moyennes (rien n'est copié d'un fichier tiers).
// Repère : x médio-latéral (pied D : médial = x −), y d'arrière en avant (talon à 0), z vers le haut (sol = 0). Valeurs en mm pour un pied de 265 mm.
// Différences avec mannequin.js : forme libre (non liée à une empreinte) -> sert au MODE SANS EMPREINTE ; orteils en chaînes de capsules incurvées, hallux large et bulbeux,
// avant-pied large, voûte médiale creuse, tendons extenseurs marqués.
import { estValide } from './grille.js';
import { MANNEQUIN } from '../constantes.js';
import { champsPlantaires, ajusterAuContour, detecterOrteils, maillerChamp, voisins, lisserMaillage, moyennerVecteurs, normalesDuChamp, occlusionAmbiante, lisserScalaire, maillageOngle } from './mannequin.js';

const borne = (x, a, b) => Math.min(b, Math.max(a, x));
const lisse = (a, b, x) => { const t = borne((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; };
const smin = (a, b, k) => -smax(-a, -b, k);
/** Interpolation de Catmull-Rom d'un tableau [[y, valeur], ...]. */
const cr = (tab, y) => {
  if (y <= tab[0][0]) return tab[0][1]; if (y >= tab[tab.length - 1][0]) return tab[tab.length - 1][1];
  let i = 0; while (tab[i + 1][0] < y) i++;
  const [y1, v1] = tab[i], [y2, v2] = tab[i + 1], v0 = (tab[i - 1] || tab[i])[1], v3 = (tab[i + 2] || tab[i + 1])[1], t = (y - y1) / (y2 - y1);
  return 0.5 * (2 * v1 + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t * t + (-v0 + 3 * v1 - 3 * v2 + v3) * t * t * t);
};

export const PIED_SCULPTE = Object.freeze({
  longueur_ref_mm: 265,
  // contour de l'avant-pied et du médio-pied : bord médial (x −) et bord latéral (x +) selon y
  bord_medial: [[14, -27], [30, -30], [60, -33], [100, -36], [122, -39.4], [149, -47.8], [178, -52.6], [212, -53.3], [224, -52], [236, -49]],
  bord_lateral: [[14, 27], [30, 32], [60, 36], [100, 40], [115, 42.7], [154, 48.7], [190, 52.6], [212, 53.6], [224, 52.5], [236, 47]],
  // hauteur du dessus du pied (axe du pied) selon y
  hauteur: [[14, 40], [30, 60], [45, 80], [80, 84], [112, 70], [146, 54], [175, 42], [195, 37], [205, 34], [214, 30], [224, 27], [250, 21], [270, 15]],
  exposant_section: 2.3, voute_mm: 16, voute_de: 30, voute_a: 165,
  talon: { c: [0, 30, 27], r: [31, 25, 31] },
  // orteils (du médial au latéral) : x de la base, y du bout, rayons base / milieu / bout, aplatissement vertical, incurvation latérale du bout
  orteils: [
    { x: -36, bout: 268, L: 66, r: [11.8, 17, 18.4], rad: [11.8, 16.6, 17.2, 16.4, 17.4, 18.6], s: [1.25, 1.2, 1.15, 1.08, 1.0, 0.95], courbe: 1 },
    { x: -9.5, bout: 268, L: 62, r: [10.1, 9.7, 9.1], s: 1.0, courbe: 2.5 },
    { x: 9.2, bout: 262, L: 56, r: [9.3, 8.9, 8.3], s: 1.0, courbe: 2 },
    { x: 25.65, bout: 250, L: 48, r: [8.4, 8.0, 7.5], s: 1.0, courbe: 3 },
    { x: 42.6, bout: 239.5, L: 44, r: [9.2, 8.9, 8.3], s: 1.0, courbe: 2.5 },
  ],
  sillons: [], // creux sous les malléoles (entre malléole et talon)
  // modelage des orteils selon u (0 à la palmure, 1 au bout) : rayon relatif (base large qui se fond dans l'avant-pied, effilement, léger renflement de l'articulation, étranglement, bulbe de la pulpe) et hauteur relative (bosse de l'articulation interphalangienne proximale)
  modelage: { rayon: [[-0.5, 1.22], [0, 1.16], [0.38, 0.92], [0.55, 0.97], [0.72, 0.86], [0.88, 1.07], [1, 1.0]], hauteur: [[-0.5, 1], [0.3, 1.0], [0.52, 1.1], [0.7, 0.97], [0.86, 1.0], [1, 0.94]], hallux_rayon: [[-0.5, 1.1], [0, 1.1], [0.4, 0.97], [0.62, 0.93], [0.82, 1.06], [1, 1.04]] },
  y_base_orteils: 168, fusion_orteils_mm: 2.4, fusion_orteils_avant_pied_mm: 6,
  tendons: { decalages: [11, 5, -0.5, -6, -11], amplitudes: [3.8, 3.0, 2.5, 2.1, 1.8], sigmas: [4.6, 3.7, 3.5, 3.3, 3.2], depart_y: 62 },
  malleoles: { med: { dx: 28, dy: 4, z: 72, r: [7, 13, 19] }, lat: { dx: 29, dy: -8, z: 48, r: [7.5, 13, 16] } },
  jambe: { yc: 50, z_haut: 130, arrondi_haut: 10, a: [[0, 17], [30, 23], [76, 28.5], [130, 28]], b: [[0, 21], [30, 26], [76, 32], [130, 31]] },
  couleurs: { argile: [0.74, 0.74, 0.76], peau: [0.89, 0.69, 0.57] },
});

/** Champ implicite du pied (F > 0 dedans), en mm d'un pied de longueur de référence ; `med` = −1 (pied D) ou +1 (pied G). */
export function champDuPied({ med = -1, details = true, largeur = 1, voute = 1, sansOrteils = false, sansSol = false } = {}) {
  const P = PIED_SCULPTE, T = P.tendons, J = P.jambe, n = P.exposant_section, H = P.talon;
  const xc = 0, yc = J.yc;
  // tendons extenseurs : crêtes sur le dessus, du cou-de-pied vers la base de chaque orteil
  const crêtes = details ? P.orteils.map((o, i) => ({ ax: -T.decalages[i] * -med * -1 * -1, ay: T.depart_y, bx: o.x + o.courbe * 0.5, by: 0.5 * (190 + o.bout), amp: T.amplitudes[i], sig: T.sigmas[i] })) : [];
  for (let i = 0; i < crêtes.length; i++) crêtes[i].ax = (-1) * T.decalages[i]; // médial : x −
  const ridgeOne = (i, x, y) => { const c = crêtes[i]; if (!c) return 0; const dx = c.bx - c.ax, dy = c.by - c.ay, t = borne(((x - c.ax) * dx + (y - c.ay) * dy) / (dx * dx + dy * dy), 0, 1), px = c.ax + t * dx - x, py = c.ay + t * dy - y; return c.amp * lisse(0, 0.16, t) * (1 - lisse(0.82, 1, t)) * Math.exp(-(px * px + py * py) / (2 * c.sig * c.sig)); };
  const ridge = (x, y) => {
    let s = 0;
    for (const c of crêtes) { const dx = c.bx - c.ax, dy = c.by - c.ay, t = borne(((x - c.ax) * dx + (y - c.ay) * dy) / (dx * dx + dy * dy), 0, 1), px = c.ax + t * dx - x, py = c.ay + t * dy - y; s += c.amp * lisse(0, 0.16, t) * (1 - lisse(0.82, 1, t)) * Math.exp(-(px * px + py * py) / (2 * c.sig * c.sig)); }
    return s;
  };
  const ell = (x, y, z, c, r) => (1 - Math.hypot((x - c[0]) / r[0], (y - c[1]) / r[1], (z - c[2]) / r[2])) * Math.min(r[0], r[1], r[2]);
  const mal = [{ c: [xc + med * P.malleoles.med.dx * -1 * -1, yc + P.malleoles.med.dy, P.malleoles.med.z], r: P.malleoles.med.r }, { c: [xc - med * P.malleoles.lat.dx, yc + P.malleoles.lat.dy, P.malleoles.lat.z], r: P.malleoles.lat.r }];
  mal[0].c[0] = -P.malleoles.med.dx; mal[1].c[0] = P.malleoles.lat.dx; // pied D : médial en x −
  // orteils : chaînes de 2 segments (base -> milieu -> bout), espace aplati verticalement
  const orteils = P.orteils.map((o) => {
    const y0 = P.y_base_orteils, y2 = o.bout - o.r[2], y1 = y0 + 0.5 * (y2 - y0);
    const u = [0, 0.3, 0.46, 0.7, 0.84, 1], mix = (a, b, t) => a + (b - a) * t, base = o.rad || [o.r[0], mix(o.r[0], o.r[1], 0.75), o.r[1], mix(o.r[1], o.r[2], 0.45), mix(o.r[1], o.r[2], 0.8), o.r[2]], rad = o.rad ? base : base.map((v, i) => v * [1, 1, 0.95, 1.0, 1.04, 0.99][i]); // rayons réguliers, sans renflement ni pli (pas de bourrelet)
    return { L: o.L, pts: u.map((t, i) => [o.x + o.courbe * t * t, y0 + t * (y2 - y0), rad[i], Array.isArray(o.s) ? o.s[i] : o.s]) };
  });
  const toes = (x0, y0, z, mapTo) => { // `mapTo(i, x, y)` -> [x, y] de référence : place chaque orteil dans son propre repère (pied sur empreinte) ; chaque orteil = section demi-superellipse dont la HAUTEUR suit le profil dorsal du pied (continuité avec le cou-de-pied), bout en dôme
    let m = -1e9;
    for (let i = 0; i < orteils.length; i++) {
      const [x, y] = mapTo ? mapTo(i, x0, y0) : [x0, y0], o = orteils[i], p = o.pts; if (Math.abs(x - p[0][0]) > 30 || y < p[0][1] - 42) continue;
      const t = borne((y - p[0][1]) / (p[p.length - 1][1] - p[0][1]), 0, 1), k = Math.min(p.length - 2, Math.floor(t * (p.length - 1))), tt = t * (p.length - 1) - k;
      const xc = p[k][0] + (p[k + 1][0] - p[k][0]) * tt, r = p[k][2] + (p[k + 1][2] - p[k][2]) * tt, sc = p[k][3] + (p[k + 1][3] - p[k][3]) * tt;
      const yEnd = p[p.length - 1][1], uu = (y - (yEnd - o.L)) / o.L, M = P.modelage, rm = cr(i === 0 ? M.hallux_rayon : M.rayon, uu), hm = i === 0 ? 1 + 0.3 * (cr(M.hauteur, uu) - 1) : cr(M.hauteur, uu), dome = y > yEnd ? Math.sqrt(Math.max(0.0004, 1 - ((y - yEnd) / (r * rm)) ** 2)) : 1;
      const yb = borne(y, 14, 224), cb = 0.5 * (cr(P.bord_medial, yb) + cr(P.bord_lateral, yb)), ab = 0.5 * (cr(P.bord_lateral, yb) - cr(P.bord_medial, yb)), Xb = Math.min(0.97, Math.abs(xc - cb) / ab), supb = i === 0 ? (0.92 + 0.26 * lisse(186, 232, y)) * (1 - 0.3 * (1 - Math.pow(1 - Math.pow(Xb, 2.3), 1 / 2.3))) : Math.pow(1 - Math.pow(Xb, 2.3), 1 / 2.3), Ht = (cr(P.hauteur, y) * hm * supb * Math.min(1, 0.55 + 0.45 * sc) + (details ? ridgeOne(i, x, y) : 0)) * dome * lisse(p[0][1] - 42, p[0][1] + 12, y), rr = r * rm * dome * (i === 4 ? 0.35 + 0.65 * lisse(p[0][1] - 40, p[0][1] + 44, y) : 1); // le 5e orteil prend sa largeur progressivement : plus de marche sur le bord latéral de l'avant-pied // hauteur dorsale (profil du pied) × aplatissement propre à l'orteil
      if (!(Ht > 0.5) || !(rr > 0.5)) continue;
      const X = Math.abs(x - xc) / rr, Z = Math.abs(z) / Ht, sd = Math.pow(Math.pow(X, 2.4) + Math.pow(Z, 2.4), 1 / 2.4);
      let f = (1 - sd) * Math.min(rr, Ht);
      m = i === 0 ? f : smax(m, f, P.fusion_orteils_mm);
    }
    return m;
  };
  const F = (x0, y, z) => {
    const x = x0 * (largeur === 1 ? 1 : 1) / 1;
    let f;
    // corps : section « demi-superellipse » le long de y (hauteur de l'axe du pied, bords médial et latéral), arrondi aux deux bouts
    const yy = borne(y, 14, 224), dome = y > 196 ? Math.pow(Math.max(0.0004, 1 - ((y - 196) / 30) ** 2), 0.9) : 1, xm = cr(P.bord_medial, yy) * largeur, xl = cr(P.bord_lateral, yy) * largeur, cx = 0.5 * (xm + xl), a = 0.5 * (xl - xm) * (0.5 + 0.5 * (y > 214 ? Math.pow(Math.max(0.0004, 1 - ((y - 214) / 22) ** 2), 0.9) : 1)), domeInt = y > 188 ? Math.pow(Math.max(0.0004, 1 - ((y - 188) / 26) ** 2), 0.9) : 1;
    const Hs = cr(P.hauteur, yy) * (1 - 0.38 * lisse(196, 232, y)) * (1 - 0.13 * Math.exp(-(((y - 142) / 20) ** 2)) * lisse(0.05, 0.7, (cx - x) / a)) + (details && y > 55 && y < 232 ? ridge(x, y) * lisse(55, 80, y) : 0);
    const X = Math.abs(x - cx) / a, Z = Math.abs(z) / Hs, s = Math.pow(Math.pow(X, n) + Math.pow(Z, n), 1 / n);
    f = smin((1 - s) * Math.min(a, Hs), Math.min(y - 36, 236 - y), 14);
    f -= (Hs + 12) * lisse(206, 232, y) * lisse(206, 232, y); // au-delà de la base des orteils, seul le profil des orteils subsiste (palmure qui s'efface en pente) // au-delà de l'avant-pied le corps s'efface : seuls les orteils restent (sinon l'union douce fabrique une lamelle entre eux)
    f = smax(f, ell(x, y, z, H.c, H.r), 10);
    if (details && y > 150 && y < 232) f += 2.0 * ridgeOne(4, x, y) / 1.8 * (lisse(158, 176, y) * (1 - lisse(198, 214, y))); // le tendon du 5e orteil garde son relief là où le corps cède la place à l'orteil (pas de cassure)
    // segment de jambe + malléoles
    if (z > -50) {
      const sj = { a: cr(J.a, Math.max(z, 0)), b: cr(J.b, Math.max(z, 0)), dy: 0 }, rho = Math.hypot((x - xc) / sj.a, (y - yc - sj.dy) / sj.b);
      let fj = smin(Math.min(sj.a, sj.b) * (1 - rho), J.z_haut - z, J.arrondi_haut);
      for (const m of mal) fj = smax(fj, ell(x, y, z, m.c, m.r), 16);
      f = smax(f, fj, 16);
    }
    if (details) { for (const g of P.sillons) f = smin(f, -ell(x, y, z, g.c, g.r), 5); }
    if (!sansOrteils && y > P.y_base_orteils - 40) f = smax(f, toes(x, y, z), P.fusion_orteils_avant_pied_mm);
    // sol : le dessous est plat (z = 0), la voûte médiale est creusée, arête basse arrondie
    const A = voute * P.voute_mm * Math.pow(Math.sin(Math.PI * borne((y - P.voute_de) / (P.voute_a - P.voute_de), 0, 1)), 1.4), zb = A * lisse(-2, -34, x);
    return sansSol ? f : smin(f, z - zb, 12);
  };
  return { F, ridge, toes };
}

/** Hauteur du dessus (mm) au point (x, y) : cherche la surface du champ en descendant (pour poser les ongles). */
function hauteurDessus(F, x, y, zHaut = 60, zBas = 0) {
  let z = zHaut; if (F(x, y, z) > 0) return z;
  for (; z > zBas; z -= 1) if (F(x, y, z) > 0) { let a = z, b = z + 1; for (let i = 0; i < 10; i++) { const m = 0.5 * (a + b); if (F(x, y, m) > 0) a = m; else b = m; } return 0.5 * (a + b); }
  return NaN;
}

/** Maille un champ { Fk, boîte } et fabrique couleurs, normales et ongles. `versReel(xr, yr)` -> { x, y, e (échelle médio-latérale), ey (échelle antéro-postérieure) } place les ongles. */
function fabriquer({ Fk, X0, Y0, Z0, X1, Y1, Z1, h, k, mir, details, rendu, versReel, decalDe, zHaut = 60 }) {
  const nx = Math.ceil((X1 - X0) / h) + 1, ny = Math.ceil((Y1 - Y0) / h) + 1, nz = Math.ceil((Z1 - Z0) / h) + 1, F = new Float32Array(nx * ny * nz);
  for (let q = 0; q < nz; q++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = Fk(X0 + i * h, Y0 + j * h, Z0 + q * h); F[(q * ny + j) * nx + i] = v === 0 ? -1e-6 : v; }
  const m = maillerChamp(F, nx, ny, nz, h, X0, Y0, Z0);
  if (m.nbTriangles === 0) throw new RangeError('pied sculpté : aucune surface');
  const champ = { F, nx, ny, nz, h, x0: X0, y0: Y0, z0: Z0 }, nv = m.nbSommets, vois = voisins(nv, m.indices), fixe = new Uint8Array(nv);
  lisserMaillage(m.positions, vois, fixe, 8); // pas de sommet immobile : un bord de plante figé ferait un rebord
  const nrm = moyennerVecteurs(normalesDuChamp(champ, m.positions, null), vois, 3), ao = lisserScalaire(occlusionAmbiante(champ, m.positions, nrm), vois, 6);
  const C = PIED_SCULPTE.couleurs[rendu] || PIED_SCULPTE.couleurs.argile, col = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) { const lum = 0.55 + 0.45 * ao[v]; for (let q = 0; q < 3; q++) col[3 * v + q] = borne(C[q] * lum, 0, 1); }
  const ong = { positions: [], indices: [], normales: [] };
  if (details) for (const [io, o] of PIED_SCULPTE.orteils.entries()) { // une coque sur chaque orteil, posée sur le dessus
    const c0 = versReel(o.x + o.courbe * 0.9, o.bout - 2.6, io), largeur = 1.45 * o.r[2] * c0.e * 0.95, long = borne(0.78 * largeur, 4.5 * k, 14 * k), cy = c0.y - long / 2, cxn = c0.x;
    const zt = hauteurDessus(Fk, cxn, cy, zHaut, Z0); if (!Number.isFinite(zt)) continue;
    const g = maillageOngle(cxn, cy, largeur, long, (x, y) => { const z = hauteurDessus(Fk, x, y, zHaut, Z0); return Number.isFinite(z) ? Math.max(z, zt - 4 * k) : zt; }, { bombe: 0.35 });
    const base = ong.positions.length / 3; for (let i = 0; i < g.positions.length; i++) ong.positions.push(g.positions[i]); for (let i = 0; i < g.normales.length; i++) ong.normales.push(g.normales[i]); for (let i = 0; i < g.indices.length; i++) ong.indices.push(g.indices[i] + base);
  }
  const ongles = { positions: Float32Array.from(ong.positions), indices: Uint32Array.from(ong.indices), normales: Float32Array.from(ong.normales) };
  let decal = null; if (decalDe) { decal = new Float32Array(nv); for (let v = 0; v < nv; v++) decal[v] = decalDe(m.positions[3 * v], m.positions[3 * v + 1], m.positions[3 * v + 2]); ongles.decal = new Float32Array(ongles.positions.length / 3); for (let v = 0; v < ongles.decal.length; v++) ongles.decal[v] = decalDe(ongles.positions[3 * v], ongles.positions[3 * v + 1], ongles.positions[3 * v + 2]); }
  ongles.nb = ongles.indices.length ? PIED_SCULPTE.orteils.length : 0;
  return { positions: m.positions, indices: m.indices, normales: nrm, couleurs: col, ongles, decal, nbSommets: nv, nbTriangles: m.nbTriangles };
}

/**
 * Pied sculpté complet SANS empreinte (proportions moyennes mises à l'échelle de la longueur).
 * Rend { positions, indices, normales, couleurs, ongles, nbSommets, nbTriangles, longueur_mm, cote }.
 * `rendu` : 'argile' (gris, comme les modèles de référence) ou 'peau'.
 */
export function creerPiedSculpte({ longueur_mm = 265, cote = 'D', details = true, rendu = 'argile', pas_mm = 1.5, largeur_rel = 1 } = {}) {
  if (!(longueur_mm > 100 && longueur_mm < 400)) throw new RangeError('pied sculpté : longueur invalide');
  const k = longueur_mm / PIED_SCULPTE.longueur_ref_mm, med = cote === 'G' ? 1 : -1, mir = cote === 'G' ? -1 : 1;
  const { F: F0 } = champDuPied({ med, details, largeur: largeur_rel });
  const Fk = (x, y, z) => F0(mir * x / k, y / k, z / k) * k; // coordonnées réelles -> mm de référence (pied G = miroir)
  const X0 = -70 * k * Math.max(1, largeur_rel);
  const r = fabriquer({ Fk, X0, Y0: -4 * k, Z0: -3 * k, X1: -X0, Y1: 280 * k, Z1: 222 * k, h: pas_mm, k, mir, details, rendu, versReel: (xr, yr) => ({ x: mir * xr * k, y: yr * k, e: k }) });
  return { ...r, longueur_mm, cote, rendu };
}

// ---------------------------------------------------------------- pied sur l'empreinte
const ORTEIL_LARGEUR = Object.freeze({ facteur: 1.18, facteur_gros: 1.05, facteur_petit: 1.75 }); // largeur des orteils par rapport à celle mesurée sur l'empreinte (gros orteil : appuyé sur le bord médial ; 5e : sur le bord latéral)
const MARGE_CONTOUR_MM = 0.5, Y_TALON_REF = 5, Y_BOUT_REF = 267.3, Z_MESURE_REF = 24;
let tableRef = null;
/** Largeur et centre du pied de référence rangée par rangée (y de référence, pas 1 mm), mesurés sur le champ à Z_MESURE_REF au-dessus du sol : sert au resserrement sur l'empreinte. */
function largeursReference(med) {
  if (tableRef && tableRef.med === med) return tableRef;
  const { F } = champDuPied({ med, details: false, voute: 0 }), n = 276, a = new Float32Array(n), b = new Float32Array(n);
  for (let y = 0; y < n; y++) { // bords par interpolation linéaire du passage de F par zéro (un bord quantifié à 0,5 mm donne des stries sur les flancs)
    let lo = NaN, hi = NaN, prec = F(-75, y, Z_MESURE_REF);
    for (let x = -74.5; x <= 75; x += 0.5) { const v = F(x, y, Z_MESURE_REF); if (prec <= 0 && v > 0) { const c = x - 0.5 + 0.5 * (-prec) / (v - prec); if (lo !== lo) lo = c; } if (prec > 0 && v <= 0) hi = x - 0.5 + 0.5 * prec / (prec - v); prec = v; }
    a[y] = lo; b[y] = hi;
  }
  for (let y = 0; y < n; y++) if (a[y] !== a[y]) { let q = y; while (q < n && a[q] !== a[q]) q++; if (q < n) { a[y] = a[q]; b[y] = b[q]; } else { a[y] = a[y - 1]; b[y] = b[y - 1]; } } // hors du pied : première ou dernière rangée valide
  const lis = (t) => { const c = Float32Array.from(t); for (let y = 0; y < n; y++) { let sm = 0, q = 0; for (let d = -4; d <= 4; d++) { const yy = borne(y + d, 0, n - 1); sm += t[yy]; q++; } c[y] = sm / q; } return c; };
  a.set(lis(a)); b.set(lis(b));
  tableRef = { med, a, b, ech: (t, y) => { const f = borne(y, 0, n - 1.001), i = Math.floor(f); return t[i] + (t[i + 1] - t[i]) * (f - i); } };
  return tableRef;
}
/** Étendues rangée par rangée de l'empreinte (centre et largeur lissés sur ±5 mm (un lissage court laisse des stries sur les flancs)), prolongées par la dernière rangée valide. */
function etenduesEmpreinte(grille) {
  const { nx, ny, pas, ox, oy, z } = grille, ca = new Float64Array(ny), la = new Float64Array(ny), ok = new Uint8Array(ny);
  for (let j = 0; j < ny; j++) { let a = Infinity, b = -Infinity; for (let i = 0; i < nx; i++) if (estValide(z[j * nx + i])) { if (i < a) a = i; if (i > b) b = i; } if (a <= b) { ok[j] = 1; ca[j] = ox + 0.5 * (a + b) * pas; la[j] = (b - a) * pas; } }
  let j0 = ok.indexOf(1), j1 = ny - 1 - Array.from(ok).reverse().indexOf(1);
  if (j0 < 0) throw new RangeError('mannequin : grille plantaire vide');
  for (let j = 0; j < ny; j++) if (!ok[j]) { const q = j < j0 ? j0 : j > j1 ? j1 : -1; if (q >= 0) { ca[j] = ca[q]; la[j] = la[q]; } else { let p = j; while (!ok[p]) p--; let n = j; while (!ok[n]) n++; const t = (j - p) / (n - p); ca[j] = ca[p] + (ca[n] - ca[p]) * t; la[j] = la[p] + (la[n] - la[p]) * t; } }
  const r = Math.max(1, Math.round(5 / pas)), flou = (t) => t.map((v, j) => { let s = 0, c = 0; for (let q = Math.max(0, j - r); q <= Math.min(ny - 1, j + r); q++) { s += t[q]; c++; } return s / c; });
  const cs = flou(Array.from(ca)), ws = flou(Array.from(la));
  return { cs, ws, j0, j1, ech: (t, y) => { const f = borne((y - oy) / pas, 0, ny - 1.001), i = Math.floor(f); return t[i] + (t[i + 1] - t[i]) * (f - i); } };
}
const echBilin = (grille, tab, x, y) => { const fx = borne((x - grille.ox) / grille.pas, 0, grille.nx - 1.001), fy = borne((y - grille.oy) / grille.pas, 0, grille.ny - 1.001), i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, k = j * grille.nx + i; return (tab[k] * (1 - a) + tab[k + 1] * a) * (1 - b) + (tab[k + grille.nx] * (1 - a) + tab[k + grille.nx + 1] * a) * b; };

/**
 * Pied sculpté posé SUR l'empreinte (grille plantaire) : le pied de référence est resserré rangée par rangée sur le contour de l'empreinte (talon et bout calés sur la première et la dernière rangée),
 * la plante suit le relief de l'empreinte (hauteur + socle). `marge_mm` = débord toléré hors du contour (0,5 mm ; une grande valeur supprime le recadrage : sert aux tests du resserrement seul). Rend les mêmes champs que creerPiedSculpte, plus decal (hauteur de plante sous chaque sommet), centre, z_cheville_mm.
 */
export function maillagePiedEmpreinte(grille, { longueur_mm, cote = 'D', details = true, rendu = 'argile', pas_mm = 1.5, socle_mm = MANNEQUIN.socle_mm, marge_mm = MARGE_CONTOUR_MM } = {}) {
  if (cote !== 'D' && cote !== 'G') throw new TypeError('mannequin : côté D ou G exigé');
  const E = etenduesEmpreinte(grille), { ny, pas, oy, z } = grille;
  if (E.j1 - E.j0 < 20) throw new RangeError('mannequin : grille plantaire vide');
  const Lg = (E.j1 - E.j0) * pas, ymin = oy + E.j0 * pas, L = Number.isFinite(longueur_mm) && longueur_mm > 100 ? longueur_mm : Lg;
  const k = L / PIED_SCULPTE.longueur_ref_mm, med = cote === 'G' ? 1 : -1, mir = cote === 'G' ? -1 : 1, R = largeursReference(med), ch = champsPlantaires(grille), det = detecterOrteils(grille, ch, cote, 1), ajuste = det.length === PIED_SCULPTE.orteils.length;
  const { F: F0, toes: toesRef } = champDuPied({ med, details, voute: 0, sansOrteils: ajuste, sansSol: ajuste }), bas = Float32Array.from(ch.bas);
  { const r = Math.max(1, Math.round(3 / pas)), tmp = new Float32Array(bas.length), w = 2 * r + 1, nxg = grille.nx; for (let passe = 0; passe < 2; passe++) { for (let j = 0; j < ny; j++) for (let i = 0; i < nxg; i++) { let t = 0; for (let a = -r; a <= r; a++) t += bas[j * nxg + borne(i + a, 0, nxg - 1)]; tmp[j * nxg + i] = t / w; } for (let j = 0; j < ny; j++) for (let i = 0; i < nxg; i++) { let t = 0; for (let b = -r; b <= r; b++) t += tmp[borne(j + b, 0, ny - 1) * nxg + i]; bas[j * nxg + i] = t / w; } } } // plante prolongée au-delà du contour (moyenne des voisines) ; distance signée au contour (> 0 dedans)
  const yRef = (y) => Y_TALON_REF + (y - ymin) / Lg * (Y_BOUT_REF - Y_TALON_REF), ySc = (yr) => ymin + (yr - Y_TALON_REF) / (Y_BOUT_REF - Y_TALON_REF) * Lg;
  const yLeg = ySc(PIED_SCULPTE.jambe.yc), csLeg = E.ech(E.cs, yLeg), crLeg = 0.5 * (R.ech(R.a, PIED_SCULPTE.jambe.yc) + R.ech(R.b, PIED_SCULPTE.jambe.yc));
  const echelle = (y) => { const yr = yRef(y), wr = Math.max(8, R.ech(R.b, yr) - R.ech(R.a, yr)), ws = Math.max(8, E.ech(E.ws, y)); return borne(wr / ws, 0.5, 2); };
  // Orteils : chacun est placé dans SON repère (bout, largeur et position lus sur l'empreinte), pour que 2e à 5e orteil gardent leur longueur propre au lieu d'être coupés par le contour.
  const yBaseRef = PIED_SCULPTE.y_base_orteils, ySB = ySc(yBaseRef);
  // Largeur et centre de chaque orteil : le gros orteil prolonge le bord MÉDIAL de l'empreinte (et non le bord mesuré au bout, trop étroit), le 5e orteil rejoint le bord LATÉRAL, les autres sont élargis (retours de Joël).
  const bordE = (y, sens) => { const f = E.ech(E.cs, y) + sens * 0.5 * E.ech(E.ws, y); return f; }; // sens −1 : x le plus petit, +1 : le plus grand
  const reperes = ajuste ? det.map((d, i) => {
    const o = PIED_SCULPTE.orteils[i], haut = Math.max(25, d.y - ySB), W = ORTEIL_LARGEUR;
    let cx = d.cx, w = d.largeur_mm * W.facteur;
    if (i === 0) { const m = bordE(d.y - 18, med), l = d.cx - med * 0.5 * d.largeur_mm; cx = 0.5 * (m + l); w = Math.max(w, Math.abs(l - m) * W.facteur_gros); }
    else if (i === det.length - 1) { const l = bordE(d.y - 8, -med), m = d.cx + med * 0.5 * d.largeur_mm; cx = 0.5 * (m + l); w = Math.max(w * W.facteur_petit / W.facteur, Math.abs(l - m)); }
    return { ky: (o.bout - yBaseRef) / haut, q: borne(o.r[1] / (0.5 * w), 0.6, 1.8), cx, o };
  }) : [];
  const versOrteil = (i, x, y) => { const r = reperes[i], o = r.o; return [o.x + o.courbe + mir * (x - r.cx) * r.q, yBaseRef + (y - ySB) * r.ky]; };
  const debordGrille = (x, y) => Math.hypot(Math.max(0, grille.ox - x, x - (grille.ox + (grille.nx - 1) * grille.pas)), Math.max(0, grille.oy - y, y - (grille.oy + (grille.ny - 1) * grille.pas))); // la distance au contour continue de croître au-delà de la grille
  // Bord médial : la tête du 1er métatarsien ne fait pas de bosse, le bord du pied rejoint progressivement celui du gros orteil (y 170 -> 222 mm de l'empreinte).
  const xMedGros = ajuste ? reperes[0].cx + med * 0.5 * (2 * PIED_SCULPTE.orteils[0].r[1] / reperes[0].q) : 0, yEpaule0 = ySc(170), yEpaule1 = ySc(222);
  const limiteMedial = (y) => { const t = lisse(yEpaule0, yEpaule1, y); return (1 - t) * bordE(y, med) + t * xMedGros; };
  const Fk = (x, y, zz) => {
    const b = echBilin(grille, bas, x, y), zr = (zz - b - socle_mm) / k, yr = yRef(y), wz = lisse(30, 90, zr), s0 = echelle(y), s = 1 + (s0 - 1) * (1 - wz);
    const cs = E.ech(E.cs, y) * (1 - wz) + csLeg * wz, cr0 = 0.5 * (R.ech(R.a, yr) + R.ech(R.b, yr)), cr = cr0 * (1 - wz) + crLeg * wz;
    let f = F0(cr + mir * (x - cs) * s, yr, zr) * k;
    if (ajuste && y > ySB - 40 * Lg / 262) f = smax(f, toesRef(x, y, zr, versOrteil) * k, PIED_SCULPTE.fusion_orteils_avant_pied_mm * k);
    if (ajuste) f = smin(f, (x - limiteMedial(y)) * -med + 0.5 + 1e3 * lisse(50, 80, zr), 3);
    if (ajuste) f = smin(f, zr * k, 12 * k); // sol : le dessous est plat (zr = 0 = relief de l'empreinte + socle), arête basse arrondie
    return smin(f, echBilin(grille, ch.d, x, y) - debordGrille(x, y) + marge_mm + 6 * lisse(15, 60, zr) + 1e3 * lisse(60, 90, zr), 3); // jamais au-delà du contour de l'empreinte (bout des orteils plus étroit que le pied de référence)
  };
  const xs = []; for (let j = E.j0; j <= E.j1; j++) xs.push(E.cs[j] - 0.5 * E.ws[j], E.cs[j] + 0.5 * E.ws[j]);
  const X0 = Math.min(...xs) - 14, X1 = Math.max(...xs) + 14, zMaxBas = bas.reduce((m, v) => (v > m ? v : m), 0), Y0 = ymin - 8, Y1 = ymin + Lg + 10;
  const xc = csLeg, yc = yLeg, basCentre = echBilin(grille, bas, xc, yc) + socle_mm, zA = 76 * k, Xl = Math.max(X1, xc + 60 * k), Xm = Math.min(X0, xc - 60 * k);
  const decalDe = (x, y, zz) => { const w = borne((zz - zA) / (60 * k), 0, 1); return (1 - w) * (echBilin(grille, bas, x, y) + socle_mm) + w * basCentre; };
  const versReel = (xr, yr, i) => {
    if (ajuste) { const r = reperes[i]; return { x: r.cx + mir * (xr - r.o.x - r.o.courbe) / r.q, y: ySB + (yr - yBaseRef) / r.ky, e: k / r.q }; }
    const y = ySc(yr), s = echelle(y), cr0 = 0.5 * (R.ech(R.a, yr) + R.ech(R.b, yr)); return { x: E.ech(E.cs, y) + mir * (xr - cr0) / s, y, e: k / s };
  };
  const r = fabriquer({ Fk, X0: Xm, Y0, Z0: -3 * k, X1: Xl, Y1, Z1: zMaxBas + 140 * k, h: pas_mm, k, mir, details, rendu, versReel, decalDe, zHaut: zMaxBas + 60 * k });
  return { ...r, longueur_mm: L, cote, rendu, centre: { x_mm: xc, y_mm: yc }, z_cheville_mm: zA, z_plante_mm: basCentre, pas_mm };
}

/** Pied mannequin : sur l'empreinte si `grille` est donnée (avec `contour` de la semelle classique : l'empreinte est d'abord ramenée dans ce contour), sinon pied sculpté sans empreinte à l'échelle de la longueur. */
export function creerMannequin({ grille = null, contour = null, longueur_mm, cote = 'D', details = true, rendu = 'argile' } = {}) {
  if (grille) {
    const g = contour ? ajusterAuContour(grille, contour) : grille, pied = maillagePiedEmpreinte(g, { longueur_mm, cote, details, rendu });
    return { pied, source: 'empreinte', longueur_mm: pied.longueur_mm, cote };
  }
  const pied = creerPiedSculpte({ longueur_mm, cote, details, rendu });
  const pl = { x_mm: 0, y_mm: PIED_SCULPTE.jambe.yc * pied.longueur_mm / PIED_SCULPTE.longueur_ref_mm };
  return { pied: { ...pied, decal: new Float32Array(pied.nbSommets), centre: pl, z_cheville_mm: 76 * pied.longueur_mm / PIED_SCULPTE.longueur_ref_mm }, source: 'sans_empreinte', longueur_mm: pied.longueur_mm, cote };
}
