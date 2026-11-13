// Pied SYNTHÉTIQUE « réaliste » (fictif : aucune donnée réelle) : empreinte plantaire en décharge, lisible en 3D.
// Même interface que `modelePied` (synthetique.js) : { longueur_mm, cote, dedans, relief, epaisseurDessus, centre, x0, largeur_grille_mm } :
// utilisable par scanPiedSurface / scanPiedSolide. Pur, sans dépendance au DOM.
//
// Repère interne « canonique » (pied de 265 mm, mm) : S = abscisse MÉDIALE (positive côté médial), Y = distance au talon. Pour un pied DROIT le médial est en −X (S = −x),
// pour un GAUCHE en +X (S = x) ; le pied de longueur L est la forme canonique mise à l'échelle k = L / 265 (y, S, largeurs ; les hauteurs avec un facteur adouci).
// Valeurs de DÉMONSTRATION (proportions moyennes d'un adulte), pas des normes cliniques.
//
// Contour : talon arrondi (rayon ≈ 31 mm), creux médial au niveau de la voûte, avant-pied large (tête de M1 côté médial), 5 orteils (gros orteil le plus long, chaque orteil
// est un « stade » : segment + demi-cercle) légèrement chevauchés, séparés par des encoches entre les bouts.
// Relief (z = 0 aux points d'appui du talon et des têtes métatarsiennes) : voûte médiale (pic ≈ 15 mm, réglable), colonne latérale (≈ 3 mm), diaphyses métatarsiennes,
// 5 têtes métatarsiennes en arc (M1 la plus basse), bords arrondis (relevés de ≈ 4 mm), orteils relevés vers leur bout avec une gouttière entre chacun.

const L_REF = 265;
const lisse = (t) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

// Contour du corps du pied (jusqu'à U = 0,83, les palmures) : [U, bord médial (S > 0), bord latéral (S < 0)]
const CONTOUR = [
  [0, 0, 0], [0.0057, 9.8, -9.5], [0.015, 15.5, -15], [0.03, 21, -20.5], [0.053, 26, -25.5], [0.083, 30, -29.5], [0.117, 31.5, -31],
  [0.19, 30, -30], [0.27, 26.5, -28.5], [0.36, 22, -28.5], [0.46, 24, -30], [0.56, 31, -35], [0.66, 40, -40], [0.72, 47, -44], [0.77, 46.5, -45], [0.8, 43.5, -44], [0.83, 41, -43.5],
];
const U_ORTEILS = 0.83; // le contour du corps s'arrête aux palmures ; au-delà : les 5 orteils
// Orteils (S du centre, rayon, bout en fraction de la longueur, hauteur au bout) : gros orteil → petit orteil. Les centres sont posés pour que chaque orteil recouvre le suivant de 0,5 mm.
const RAYONS = [12.5, 8.5, 8, 7.25, 6.5], BOUTS = [1, 0.985, 0.955, 0.925, 0.89], HAUTEURS_BOUT = [6, 8.5, 9.5, 10.5, 11.5];
const CENTRES = (() => { const c = [28]; for (let i = 1; i < 5; i++) c.push(c[i - 1] - (RAYONS[i - 1] + RAYONS[i] - 0.5)); return c; })();
const Y_ORTEIL_BASE = 0.8 * L_REF, Z_ORTEIL_BASE = 2.2;

// Spline de Hermite sur des nœuds non uniformes (tangentes par différences finies centrées) : contour lisse sans plateau.
function splineSur(pts, col) {
  const n = pts.length, m = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    m[i] = (b[col] - a[col]) / Math.max(1e-9, b[0] - a[0]);
  }
  return (u) => {
    if (u <= pts[0][0]) return pts[0][col];
    if (u >= pts[n - 1][0]) return pts[n - 1][col];
    let i = 0; while (u > pts[i + 1][0]) i++;
    const h = pts[i + 1][0] - pts[i][0], t = (u - pts[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * pts[i][col] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * pts[i + 1][col] + (t3 - t2) * h * m[i + 1];
  };
}
const bordMedial = splineSur(CONTOUR, 1), bordLateral = splineSur(CONTOUR, 2);

// Distance d'un point au segment vertical (x = s, y de y0 à y1)
const distSegment = (S, Y, s, y0, y1) => Math.hypot(S - s, Y - Math.min(y1, Math.max(y0, Y)));

// Dans l'empreinte ? (coordonnées canoniques)
function dedansCanonique(S, Y) {
  if (Y <= 0 || Y >= L_REF) return false;
  const U = Y / L_REF;
  if (U < U_ORTEILS) return S <= bordMedial(U) && S >= bordLateral(U);
  for (let i = 0; i < 5; i++) {
    const yFin = BOUTS[i] * L_REF - RAYONS[i];
    if (distSegment(S, Y, CENTRES[i], Y_ORTEIL_BASE, yFin) <= RAYONS[i]) return true;
  }
  return false;
}

// Distance au bord (mm, canonique) sur une grille de 0,5 mm : transformée en distance à 2 passes (chanfrein 1 / √2), interpolée.
function grilleDistance() {
  const pas = 0.5, S0 = -52, Y0 = -2, nx = Math.round(110 / pas) + 1, ny = Math.round((L_REF + 6) / pas) + 1;
  const d = new Float32Array(nx * ny), INF = 1e9;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) d[j * nx + i] = dedansCanonique(S0 + i * pas, Y0 + j * pas) ? INF : 0;
  const D2 = Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (d[k] === 0) continue; let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 1); if (j > 0) { v = Math.min(v, d[k - nx] + 1); if (i > 0) v = Math.min(v, d[k - nx - 1] + D2); if (i < nx - 1) v = Math.min(v, d[k - nx + 1] + D2); }
    d[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; if (d[k] === 0) continue; let v = d[k];
    if (i < nx - 1) v = Math.min(v, d[k + 1] + 1); if (j < ny - 1) { v = Math.min(v, d[k + nx] + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1] + D2); if (i > 0) v = Math.min(v, d[k + nx - 1] + D2); }
    d[k] = v;
  }
  for (let k = 0; k < d.length; k++) d[k] = d[k] >= INF / 2 ? 0 : d[k] * pas;
  return (S, Y) => {
    const fx = (S - S0) / pas, fy = (Y - Y0) / pas, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return 0;
    const tx = fx - i, ty = fy - j, a = d[j * nx + i], b = d[j * nx + i + 1], c = d[(j + 1) * nx + i], e = d[(j + 1) * nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
  };
}
let distanceBord = null; // calculée une fois (forme canonique unique)

// Têtes métatarsiennes M1 … M5 : [S, Y, sigma] (mm canoniques)
const TETES = [[29, 0.752 * L_REF, 6.5], [15, 0.775 * L_REF, 5.5], [1, 0.772 * L_REF, 5.5], [-12.5, 0.755 * L_REF, 5.5], [-26, 0.728 * L_REF, 5.5]];

/** Hauteur de la face plantaire (mm, >= 0) au point canonique (S, Y). `voute_mm` = pic de la voûte médiale (15 normal ; ~4 pied plat ; ~24 pied creux). */
function reliefCanonique(S, Y, voute_mm) {
  const U = Y / L_REF, d = distanceBord(S, Y);
  const med = bordMedial(Math.min(U, U_ORTEILS - 1e-6)), lat = bordLateral(Math.min(U, U_ORTEILS - 1e-6));
  const t = Math.min(1, Math.max(0, (S - lat) / Math.max(1e-6, med - lat))); // 0 = bord latéral, 1 = bord médial
  // corps du pied
  let z = voute_mm * gauss(U - 0.38, 0.13) * Math.pow(t, 1.5); // voûte longitudinale médiale (large : du bord médial vers le milieu)
  z += 1.6 * gauss(U - 0.6, 0.08) * (0.3 + 0.7 * t); // diaphyses métatarsiennes
  z += 3.0 * lisse((U - 0.5) / 0.17) * (1 - lisse((U - 0.82) / 0.04)); // niveau entre les têtes (monte progressivement du médio-pied vers l'avant-pied)
  for (const [s, y, sg] of TETES) z -= 3.2 * gauss(Math.hypot(S - s, Y - y), sg); // têtes : points d'appui
  if (U < 0.2) z += 1.1 * Math.pow(Math.hypot(S, Y - 33) / 33, 2) * (1 - lisse((U - 0.12) / 0.08)); // talon légèrement bombé (jamais un plateau parfait)
  const largeurRoll = 11 - 5 * lisse((U - 0.72) / 0.1);
  z += 3.8 * Math.pow(1 - lisse(d / largeurRoll), 1.4); // bords arrondis
  // appui latéral (retour de Joël 04/11) : le bord latéral du pied repose SUR LE SOL du talon à la tête du 5e métatarsien (colonne latérale : cuboïde, 5e métatarsien) ; seule la voûte médiale est creuse
  const contactLat = (1 - lisse((t - 0.12) / 0.4)) * lisse((U - 0.05) / 0.05) * (1 - lisse((U - 0.8) / 0.05));
  z *= 1 - contactLat;
  // orteils (fondus avec l'avant-pied entre U = 0,79 et 0,84)
  const wt = lisse((U - 0.79) / 0.05);
  if (wt > 0) {
    let zt = Infinity;
    for (let i = 0; i < 5; i++) {
      const y1 = BOUTS[i] * L_REF - RAYONS[i], dseg = distSegment(S, Y, CENTRES[i], Y_ORTEIL_BASE, y1), rho = Math.min(1.3, dseg / RAYONS[i]);
      const avance = lisse((Math.min(Y, y1 + RAYONS[i]) - Y_ORTEIL_BASE) / (BOUTS[i] * L_REF - Y_ORTEIL_BASE));
      zt = Math.min(zt, Z_ORTEIL_BASE + (HAUTEURS_BOUT[i] - Z_ORTEIL_BASE) * avance + 4 * rho * rho); // pulpe ronde ; gouttière entre deux orteils
    }
    z = z * (1 - wt) + zt * wt;
  }
  return Math.max(0, z);
}

/** Modèle de pied réaliste. Options : longueur_mm (265), cote ('D' | 'G'), voute_mm (15). */
export function modelePiedRealiste({ longueur_mm = 265, cote = 'D', voute_mm = 15 } = {}) {
  if (!(longueur_mm >= 150 && longueur_mm <= 360)) throw new RangeError('pied réaliste : longueur entre 150 et 360 mm');
  if (cote !== 'D' && cote !== 'G') throw new TypeError('pied réaliste : côté D ou G');
  if (!(voute_mm >= 0 && voute_mm <= 40)) throw new RangeError('pied réaliste : voûte entre 0 et 40 mm');
  if (!distanceBord) distanceBord = grilleDistance();
  const med = cote === 'D' ? -1 : 1, k = longueur_mm / L_REF, kz = 0.5 + 0.5 * k;
  const canon = (x, y) => [(med * x) / k, y / k];
  return {
    longueur_mm, cote, voute_mm, x0: -70, largeur_grille_mm: 140,
    centre: () => 0, // le pied est centré sur le talon ; l'avant-pied part naturellement côté médial
    dedans: (x, y) => { const [S, Y] = canon(x, y); return dedansCanonique(S, Y); },
    relief: (x, y) => { const [S, Y] = canon(x, y); return kz * reliefCanonique(S, Y, voute_mm); },
    epaisseurDessus: (x, y) => { // dôme dorsal (variante solide) : jamais plat
      const [S, Y] = canon(x, y), U = Y / L_REF, d = distanceBord(S, Y);
      return kz * (20 + 32 * lisse(d / 18) * Math.sin(Math.PI * Math.min(1, Math.max(0, U))) ** 0.5);
    },
  };
}

export const PIED_REALISTE = Object.freeze({ longueur_reference_mm: L_REF, voute_normale_mm: 15, voute_plate_mm: 4, voute_creuse_mm: 24, nb_orteils: 5, centres_orteils: Object.freeze([...CENTRES]), rayons_orteils: Object.freeze([...RAYONS]) });
