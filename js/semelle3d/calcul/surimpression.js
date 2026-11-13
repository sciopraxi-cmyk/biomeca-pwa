// Lot 4c : emprise exacte de chaque élément (surimpression colorée, semi-transparente) et ligne fictive du bord médial de l'isthme.
// Pur : aucune dépendance au DOM. Entrée : la « finale » d'appliquerElements (couches par élément) ; sortie : triangles + liseré de chaque emprise.
import { estValide } from './grille.js';
import { TYPES_ELEMENTS, ordreEmpilement } from './elements.js';
import { ISTHME, APPUI } from '../constantes.js';

// Palette fixe (10 teintes bien distinctes, lisibles sur les semelles bleue et vert-bleu) ; la teinte d'un élément est son indice (champ `teinte`).
export const PALETTE_ELEMENTS = Object.freeze([
  '#e6194b', '#ffe119', '#f58231', '#911eb4', '#f032e6', '#ffffff', '#9a6324', '#e6beff', '#bfef45', '#800000',
]); // pas de vert/bleu/cyan : la semelle est bleue (pied D) ou vert-bleu (pied G) en 2 pieds ; pas de rose ni de gris : réservés aux matériaux de ces couleurs
export const SEUIL_EMPRISE_MM = 0.05; // une cellule fait partie de l'emprise si la couche y dépasse 0,05 mm (queue du flou exclue, comme le calcul de l'emprise)
export const POINTS_ISTHME = 7; // nombre de points curseurs de la ligne de l'isthme

export const teinteSuivante = (elements) => {
  const prises = new Set((elements || []).map((e) => e.teinte).filter(Number.isInteger));
  for (let t = 0; t < PALETTE_ELEMENTS.length; t++) if (!prises.has(t)) return t;
  return (elements || []).length % PALETTE_ELEMENTS.length;
};
export const couleurTeinte = (t, n = 0) => PALETTE_ELEMENTS[(Number.isInteger(t) ? t : n) % PALETTE_ELEMENTS.length];

// Masque des nœuds de la grille (Uint8Array nx*ny) appartenant à l'emprise de l'élément n de `finale`.
export function masqueElement(finale, n, cote) {
  const { nx, ny, pas, ox, oy, haut } = finale;
  const el = finale.elements[n], T = TYPES_ELEMENTS[el.type], m = new Uint8Array(nx * ny);
  if (!el.visible) return m;
  if (T.point) { // un point à 0 mm ne change rien à la surface : son emprise est le disque (rayon réglé)
    const rep = finale.rapport_elements.repere_talon, med = cote === 'D' ? -1 : 1;
    const cx = rep.x_mm + med * el.dx_mm, cy = rep.y_mm + el.dy_mm, r = el.rayon_mm;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; if (!estValide(haut[k])) continue;
      if (Math.hypot(ox + i * pas - cx, oy + j * pas - cy) < r) m[k] = 1;
    }
    return m;
  }
  const z = finale.couches[n].z;
  for (let k = 0; k < m.length; k++) if (estValide(haut[k]) && Math.abs(z[k]) > SEUIL_EMPRISE_MM) m[k] = 1;
  return m;
}

// Triangles (face supérieure seulement) des cellules de l'emprise + segments du liseré. Cellule retenue : valide (4 nœuds) et au moins 2 nœuds dans le masque.
export function surimpressionDeMasque(finale, m) {
  const { nx, ny, pas, ox, oy, haut, dx, dy } = finale;
  const valide = (i, j) => i >= 0 && j >= 0 && i <= nx - 2 && j <= ny - 2 && estValide(haut[j * nx + i]) && estValide(haut[j * nx + i + 1]) && estValide(haut[(j + 1) * nx + i]) && estValide(haut[(j + 1) * nx + i + 1]);
  const dans = (i, j) => valide(i, j) && (m[j * nx + i] + m[j * nx + i + 1] + m[(j + 1) * nx + i] + m[(j + 1) * nx + i + 1]) >= 2;
  const num = new Int32Array(nx * ny).fill(-1), pos = [], idx = [], seg = [];
  const nœud = (i, j) => {
    const k = j * nx + i;
    if (num[k] === -1) { num[k] = pos.length / 3; pos.push(ox + i * pas + (dx ? dx[k] : 0), oy + j * pas + (dy ? dy[k] : 0), haut[k]); }
    return num[k];
  };
  const pt = (i, j) => { const k = j * nx + i; seg.push(ox + i * pas + (dx ? dx[k] : 0), oy + j * pas + (dy ? dy[k] : 0), haut[k]); };
  let cellules = 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!dans(i, j)) continue;
    cellules++;
    const a = nœud(i, j), b = nœud(i + 1, j), c = nœud(i + 1, j + 1), d = nœud(i, j + 1);
    idx.push(a, b, c, a, c, d);
    if (!dans(i, j - 1)) { pt(i, j); pt(i + 1, j); }
    if (!dans(i + 1, j)) { pt(i + 1, j); pt(i + 1, j + 1); }
    if (!dans(i, j + 1)) { pt(i + 1, j + 1); pt(i, j + 1); }
    if (!dans(i - 1, j)) { pt(i, j + 1); pt(i, j); }
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), contour: Float32Array.from(seg), cellules, aire_mm2: cellules * pas * pas };
}

// Champ continu de l'emprise (positif = dedans) : |couche| - seuil (relief) ou rayon - distance (point), borné pour que les grandes hauteurs ne dominent pas le lissage.
export function champElement(finale, n, cote) {
  const { nx, ny, pas, ox, oy, haut } = finale;
  const el = finale.elements[n], T = TYPES_ELEMENTS[el.type], f = new Float32Array(nx * ny).fill(-1);
  if (!el.visible) return f;
  const borne = (v, b) => Math.max(-b, Math.min(b, v));
  if (T.point) {
    const rep = finale.rapport_elements.repere_talon, med = cote === 'D' ? -1 : 1;
    const cx = rep.x_mm + med * el.dx_mm, cy = rep.y_mm + el.dy_mm, r = el.rayon_mm;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (estValide(haut[k])) f[k] = borne(r - Math.hypot(ox + i * pas - cx, oy + j * pas - cy), 1); }
    return f;
  }
  const z = finale.couches[n].z;
  for (let k = 0; k < f.length; k++) if (estValide(haut[k])) f[k] = borne(Math.abs(z[k]) - SEUIL_EMPRISE_MM, 0.2);
  return f;
}

// Affichage lissé (lot 4d bis) : le masque (0/1 par nœud) est flou 3x3 binomial (seuls les nœuds valides comptent, le bord de la semelle ne rogne donc pas l'emprise),
// puis la zone « flou >= 0,5 » est découpée dans chaque cellule par interpolation linéaire (marching squares) : liseré et surface sans escalier de 0,5 mm.
// Affichage SEULEMENT : le calcul, l'aire, `cellules` et le STL ne changent pas.
export function surimpressionLisse(finale, m, champ) {
  const { nx, ny, pas, ox, oy, haut, dx, dy } = finale;
  const ok = (k) => estValide(haut[k]);
  const f = new Float32Array(nx * ny), W = [1, 2, 1];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!ok(k)) continue;
    let a = 0, b = 0;
    for (let v = -1; v <= 1; v++) for (let u = -1; u <= 1; u++) {
      const ii = i + u, jj = j + v; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii; if (!ok(kk)) continue;
      const w = W[u + 1] * W[v + 1]; a += w * (champ ? champ[kk] : m[kk] - 0.5); b += w;
    }
    f[k] = a / b;
  }
  const pos = [], idx = [], seg = [], cle = new Map();
  const sommet = (i0, j0, i1, j1, t) => { // point sur l'arête (i0,j0)-(i1,j1), à la fraction t ; hauteur et déplacement du contour interpolés
    const k0 = j0 * nx + i0, k1 = j1 * nx + i1, c = (a, b) => a + (b - a) * t;
    const x = c(ox + i0 * pas + (dx ? dx[k0] : 0), ox + i1 * pas + (dx ? dx[k1] : 0)), y = c(oy + j0 * pas + (dy ? dy[k0] : 0), oy + j1 * pas + (dy ? dy[k1] : 0));
    return [x, y, c(haut[k0], haut[k1])];
  };
  const ajoute = (P) => { const n = pos.length / 3; pos.push(P[0], P[1], P[2]); return n; };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const K = [j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i], C = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    if (!K.every(ok)) continue;
    const v = K.map((k) => f[k]), in_ = v.map((x) => x >= 0);
    if (!in_.some(Boolean)) continue;
    const poly = []; // sommets du polygone découpé : { P, cross }
    for (let q = 0; q < 4; q++) {
      const r = (q + 1) % 4;
      if (in_[q]) poly.push({ P: [...sommet(C[q][0], C[q][1], C[q][0], C[q][1], 0)], cross: false });
      if (in_[q] !== in_[r]) poly.push({ P: sommet(C[q][0], C[q][1], C[r][0], C[r][1], (0 - v[q]) / (v[r] - v[q])), cross: true });
    }
    if (poly.length < 3) continue;
    const num = poly.map((o) => ajoute(o.P));
    for (let q = 1; q < poly.length - 1; q++) idx.push(num[0], num[q], num[q + 1]);
    for (let q = 0; q < poly.length; q++) { const r = (q + 1) % poly.length; if (poly[q].cross && poly[r].cross) seg.push(...poly[q].P, ...poly[r].P); }
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), contour: Float32Array.from(seg) };
}

// Une surimpression par élément, dans l'ordre des éléments de `finale` (un élément masqué : aucune géométrie, mais il reste dans la liste).
export function surimpressions(finale, cote) {
  return (finale.elements || []).map((el, n) => {
    const infos = finale.infos[n];
    const mk = masqueElement(finale, n, cote), s = surimpressionDeMasque(finale, mk);
    s.lisse = s.cellules > 0 ? surimpressionLisse(finale, mk, champElement(finale, n, cote)) : { positions: new Float32Array(0), indices: new Uint32Array(0), contour: new Float32Array(0) };
    return { index: n, id: el.id, teinte: Number.isInteger(el.teinte) ? el.teinte : null, type: el.type, libelle: infos.libelle, shore_a: el.shore_a === undefined ? null : el.shore_a, visible: el.visible, ...s };
  });
}

// Ligne fictive de l'isthme = limite d'appui estimée EN CHARGE (règle de Joël, 01/11) : l'empreinte est prise le pied en décharge ; dans chaque rangée,
// la zone qui ne touche pas le sol s'étend du bord médial jusqu'à la première cellule d'appui (z <= APPUI.seuil_mm) ; on estime que les
// APPUI.part_externe (30 %) les plus EXTERNES de cette zone touchent en fait le sol : la ligne est à 30 % de la largeur sans appui, côté externe.
// Aucune voûte détectée (pied plat, scan sans creux) : repli THÉORIQUE = courbe où l'appui mesure 1/3 de la plus grande largeur du pied, marquée « à confirmer ».
// Sortie : points [x, y, x, y, …] (coordonnées de la scène), du talon vers l'avant ; methode 'appui' | 'theorique'.
export function ligneIsthme({ nx, ny, pas, ox, oy, valide, z }, cote, { part = APPUI.part_externe } = {}) {
  if (cote !== 'D' && cote !== 'G') throw new Error('ligne de l\'isthme : latéralité (D/G) requise');
  if (!(part > 0 && part < 1)) throw new RangeError('ligne de l\'isthme : part externe entre 0 et 1 (exclus)');
  let jmin = -1, jmax = -1; const ext = new Array(ny).fill(null);
  for (let j = 0; j < ny; j++) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < nx; i++) if (valide[j * nx + i]) { if (i < a) a = i; if (i > b) b = i; }
    if (a <= b) { ext[j] = [a, b]; if (jmin < 0) jmin = j; jmax = j; }
  }
  if (jmin < 0 || jmax <= jmin) throw new RangeError('ligne de l\'isthme : empreinte vide');
  const med = cote === 'D' ? -1 : 1, pas_i = med < 0 ? 1 : -1, runMin = Math.max(1, Math.round(APPUI.appui_min_mm / pas));
  const x = (i) => ox + i * pas;
  // 1. mesure par rangée : limite externe de la zone sans appui (indice de colonne, fractionnaire)
  const larg = new Array(ny).fill(0), xl = new Array(ny).fill(NaN);
  if (z) for (let j = jmin; j <= jmax; j++) {
    if (!ext[j]) continue;
    const i0 = med < 0 ? ext[j][0] : ext[j][1], iExt = med < 0 ? ext[j][1] : ext[j][0];
    if (!(z[j * nx + i0] > APPUI.seuil_mm)) continue; // le bord médial touche le sol : pas de zone sans appui ici
    let i = i0, fin = iExt;
    for (let c = i0; c !== iExt + pas_i; c += pas_i) { // premier appui d'au moins runMin cellules consécutives
      let n = 0; while (n < runMin && c + n * pas_i !== iExt + pas_i && Number.isFinite(z[j * nx + c + n * pas_i]) && z[j * nx + c + n * pas_i] <= APPUI.seuil_mm) n++;
      if (n >= runMin) { fin = c - pas_i; break; }
      i = c;
    }
    void i;
    larg[j] = Math.abs(fin - i0) * pas; xl[j] = fin;
  }
  // 2. plus longue suite de rangées dont la zone sans appui dépasse APPUI.largeur_min_mm
  let meilleur = null, debut = -1;
  for (let j = jmin; j <= jmax + 1; j++) {
    const bon = j <= jmax && larg[j] >= APPUI.largeur_min_mm;
    if (bon && debut < 0) debut = j;
    if (!bon && debut >= 0) { if (!meilleur || j - debut > meilleur[1] - meilleur[0]) meilleur = [debut, j - 1]; debut = -1; }
  }
  const pts = []; let methode = 'appui', raison = 'limite d\'appui estimée en charge : ' + Math.round(100 * part) + ' % les plus externes de la zone sans appui touchent le sol';
  if (meilleur && meilleur[1] - meilleur[0] >= 0.1 * (jmax - jmin)) {
    const [j0, j1] = meilleur, brut = [];
    for (let j = j0; j <= j1; j++) { const i0 = med < 0 ? ext[j][0] : ext[j][1]; brut.push(x(xl[j] + (i0 - xl[j]) * part)); } // à `part` de la limite externe, vers le médial
    // courbe : moyenne glissante (±2,5 mm) pour enlever l'escalier des cellules, extrémités conservées
    const w = Math.max(1, Math.round(APPUI.lissage_mm / pas));
    for (let r = 0; r < brut.length; r++) { let t = 0, n = 0; for (let q = Math.max(0, r - w); q <= Math.min(brut.length - 1, r + w); q++) { t += brut[q]; n++; } pts.push(t / n, oy + (j0 + r) * pas); }
  } else { // repli théorique
    methode = 'theorique'; raison = 'aucune voûte détectée sur le scan : trajet théorique (appui = 1/3 de la plus grande largeur du pied), à confirmer ou à corriger à la main';
    let wmax = 0; for (let j = jmin; j <= jmax; j++) if (ext[j]) wmax = Math.max(wmax, (ext[j][1] - ext[j][0]) * pas);
    for (let j = jmin; j <= jmax; j++) {
      const f = (j - jmin) / (jmax - jmin);
      if (f < ISTHME.debut || f > ISTHME.fin || !ext[j]) continue;
      const lat = med < 0 ? ext[j][1] : ext[j][0], k = Math.sin((Math.PI * (f - ISTHME.debut)) / (ISTHME.fin - ISTHME.debut)); // 0 aux extrémités, 1 au milieu : la ligne rejoint le bord médial puis s'en écarte en courbe
      const dist = Math.min((ext[j][1] - ext[j][0]) * pas, (wmax / 3) + (1 - k) * Math.max(0, (ext[j][1] - ext[j][0]) * pas - wmax / 3));
      pts.push(x(lat) + med * dist, oy + j * pas);
    }
  }
  if (pts.length < 4) throw new RangeError('ligne de l\'isthme : empreinte trop courte');
  return { cote, points: Float32Array.from(pts), y_de: pts[1], y_a: pts[pts.length - 1], methode, a_confirmer: methode === 'theorique', raison, part };
}

// Points curseurs de la ligne : POINTS_ISTHME rangées régulièrement espacées (y fixe) ; `decalages` (mm, vers +x) les déplace ; la ligne
// affichée = ligne automatique + décalage interpolé linéairement entre ces points (aucun décalage = la proposition du scan, intacte).
export function pointsDeControle(ligne, n = POINTS_ISTHME) {
  const m = ligne.points.length / 2, out = [];
  for (let c = 0; c < n; c++) { const r = Math.round((c * (m - 1)) / (n - 1)); out.push({ r, x: ligne.points[2 * r], y: ligne.points[2 * r + 1] }); }
  return out;
}
export function ligneCorrigee(ligne, decalages) {
  const ctrl = pointsDeControle(ligne, decalages && decalages.length ? decalages.length : POINTS_ISTHME), m = ligne.points.length / 2, out = new Float32Array(ligne.points.length);
  for (let r = 0; r < m; r++) {
    let c = 0; while (c < ctrl.length - 2 && r > ctrl[c + 1].r) c++;
    const a = ctrl[c], b = ctrl[c + 1], t = b.r === a.r ? 0 : Math.min(1, Math.max(0, (r - a.r) / (b.r - a.r)));
    const d = decalages ? (decalages[c] || 0) * (1 - t) + (decalages[c + 1] || 0) * t : 0;
    out[2 * r] = ligne.points[2 * r] + d; out[2 * r + 1] = ligne.points[2 * r + 1];
  }
  return out;
}

// Hauteur de la semelle FINALE le long de la ligne et jusqu'à ±demi mm de part et d'autre (en x) : sert à poser la ligne (et ses points déplacés) sur la surface.
// z[r * n + c] = hauteur au nœud le plus proche de (x_r - demi + c·pas, y_r) ; NaN hors contour.
export function hauteursLigne(finale, ligne, demi = 12) {
  const { nx, ny, pas, ox, oy, haut } = finale, m = ligne.points.length / 2, n = Math.round((2 * demi) / pas) + 1, z = new Float32Array(m * n).fill(NaN);
  for (let r = 0; r < m; r++) {
    const j = Math.round((ligne.points[2 * r + 1] - oy) / pas); if (j < 0 || j >= ny) continue;
    for (let c = 0; c < n; c++) { const i = Math.round((ligne.points[2 * r] - demi + c * pas - ox) / pas); if (i >= 0 && i < nx && estValide(haut[j * nx + i])) z[r * n + c] = haut[j * nx + i]; }
  }
  return { n, pas, demi, z };
}

// ---- Strates (lot 4c, vue médiale) : tranche colorée de chaque matériau sur les parois de la semelle ----
// Ordre d'empilement = celui d'appliquerElements (le recouvrement passe en dernier). Chaque élément visible qui ajoute de la matière
// (couche > 0) occupe, en chaque nœud, l'intervalle [cumul avant, cumul après] limité à [dessous, dessus final]. Parois = mêmes arêtes que maillerBase.
export { ordreEmpilement };
export function strates(finale) {
  const { nx, ny, pas, ox, oy, haut, bas, haut_base, dx, dy } = finale, els = finale.elements || [];
  if (els.length === 0) return [];
  const ordre = ordreEmpilement(els), n = nx * ny;
  const cellule = (i, j) => i >= 0 && j >= 0 && i <= nx - 2 && j <= ny - 2 && estValide(haut[j * nx + i]) && estValide(haut[j * nx + i + 1]) && estValide(haut[(j + 1) * nx + i]) && estValide(haut[(j + 1) * nx + i + 1]);
  const sortie = els.map((el, index) => ({ index, id: el.id, teinte: Number.isInteger(el.teinte) ? el.teinte : null, type: el.type, positions: [], indices: [], epaisseur_max_mm: 0 }));
  const bornes = (k) => { // intervalle [lo, hi] de chaque élément au nœud k (null : pas de matière ajoutée)
    const r = new Array(els.length).fill(null), top = haut[k], bot = bas[k];
    let c = haut_base[k];
    for (const idx of ordre) {
      const z = finale.couches[idx].z[k], avant = c; c += z;
      if (!(z > 0)) continue;
      const lo = Math.min(top, Math.max(bot, avant)), hi = Math.min(top, Math.max(bot, c));
      if (hi - lo > 1e-4) r[idx] = [lo, hi];
    }
    return r;
  };
  const xy = (i, j) => { const k = j * nx + i; return [ox + i * pas + (dx ? dx[k] : 0), oy + j * pas + (dy ? dy[k] : 0), k]; };
  const paroi = (pi, pj, qi, qj) => {
    const [px, py, pk] = xy(pi, pj), [qx, qy, qk] = xy(qi, qj), bp = bornes(pk), bq = bornes(qk);
    for (let e = 0; e < els.length; e++) {
      const a = bp[e], b = bq[e]; if (!a && !b) continue;
      const S = sortie[e], v = S.positions.length / 3;
      const alo = a ? a[0] : (b[0] + b[0]) / 2, ahi = a ? a[1] : alo, blo = b ? b[0] : alo, bhi = b ? b[1] : blo; // une extrémité sans matière : la tranche se resserre en pointe
      S.positions.push(px, py, alo, px, py, ahi, qx, qy, bhi, qx, qy, blo);
      S.indices.push(v, v + 1, v + 2, v, v + 2, v + 3);
      S.epaisseur_max_mm = Math.max(S.epaisseur_max_mm, ahi - alo, bhi - blo);
    }
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    if (!cellule(i, j)) continue;
    if (!cellule(i, j - 1)) paroi(i, j, i + 1, j);
    if (!cellule(i + 1, j)) paroi(i + 1, j, i + 1, j + 1);
    if (!cellule(i, j + 1)) paroi(i + 1, j + 1, i, j + 1);
    if (!cellule(i - 1, j)) paroi(i, j + 1, i, j);
  }
  void n;
  return sortie.map((S) => ({ ...S, positions: Float32Array.from(S.positions), indices: Uint32Array.from(S.indices) }));
}
