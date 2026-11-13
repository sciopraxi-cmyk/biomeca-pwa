// Bibliothèque d'éléments PODAXIA (lot 4a) : fiches (cartes de hauteur issues des STL, voir element_stl.js) -> types d'éléments utilisables
// comme les autres (même interface : distance, profil, u0, plateau_fin). Fonctions pures, aucune dépendance.
//
// Repère local d'un élément importé : t = vers le MÉDIAL (le fichier a le médial en X+ pour un pied DROIT ; le miroir en X pour un pied
// gauche vient de `med` dans coucheElement), u = distance depuis le bord arrière du relief. Le relief a déjà son raccord propre (celui du
// fichier) : il n'est PAS multiplié par un second raccord. Le plancher de bord de 0,4 mm du fichier est retiré (l'élément arrive à 0 au bord).
//
// Réglage de hauteur (décision de Joël 31/10, choix 1 « par type d'élément ») :
//   - « conservee » (talonnettes, heel skive) : une partie FIXE (plancher_fixe_mm) est gardée, seul le reste est mis à l'échelle ;
//     pour une talonnette (plancher fixe nul) le résultat est identique à l'étirement : seule la forme en plan compte ;
//   - « etirement » (dômes, appuis, barres, plaques, décharges) : étirement vertical simple, hauteur_cible / hauteur_ref ;
//   - coins : réglage en DEGRÉS, échelle = tan(angle) / tan(angle de référence du fichier).
import { FICHES_PODAXIA } from '../donnees/bibliotheque.js';
import { ECHELLE_RELIEF } from './element_stl.js';

export const HAUTEUR_IMPORTE_MM = Object.freeze({ min: 0.2, max: 15 });
export const ANGLE_COIN_IMPORTE_DEG = Object.freeze({ min: 0.1, max: 15 });
// Étirement en plan (retour de Joël 31/10) : facteur largeur/longueur réglée ÷ emprise du fichier ; douceur = flou gaussien (mm) des bords. Bornes PROVISOIRES.
export const ETIREMENT_IMPORTE = Object.freeze({ facteur_min: 0.5, facteur_max: 3 });
export const DOUCEUR_IMPORTE_MM = Object.freeze({ min: 0, max: 12 });
const SEUIL_FLOU_MM = 0.02; // sous cette hauteur le relief flouté est ramené à 0 (emprise nette)

function decoderBase64(b64) { const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

// Distance (mm) de chaque nœud de relief au plus proche nœud sans relief (ou au bord de la grille) : chamfer 3-4 en deux passes.
function distanceAuBord(r, nx, ny, pas) {
  const A = 3, B = 4, INF = 1e9, d = new Float32Array(nx * ny);
  const val = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? 0 : d[j * nx + i]);
  for (let k = 0; k < r.length; k++) d[k] = r[k] > 0 ? INF : 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (d[k] === 0) continue;
    d[k] = Math.min(d[k], val(i - 1, j) + A, val(i, j - 1) + A, val(i - 1, j - 1) + B, val(i + 1, j - 1) + B);
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; if (d[k] === 0) continue;
    d[k] = Math.min(d[k], val(i + 1, j) + A, val(i, j + 1) + A, val(i + 1, j + 1) + B, val(i - 1, j + 1) + B);
  }
  for (let k = 0; k < d.length; k++) d[k] = (d[k] / A) * pas;
  return d;
}

// Interpolation bilinéaire d'un tableau de nœuds ; hors de la grille = 0.
function bilineaire(a, nx, ny, fx, fy) {
  if (!(fx > -1 && fy > -1 && fx < nx && fy < ny)) return 0;
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
  const v = (ii, jj) => (ii < 0 || jj < 0 || ii >= nx || jj >= ny ? 0 : a[jj * nx + ii]);
  return v(i, j) * (1 - tx) * (1 - ty) + v(i + 1, j) * tx * (1 - ty) + v(i, j + 1) * (1 - tx) * ty + v(i + 1, j + 1) * tx * ty;
}

const rad = (d) => (d * Math.PI) / 180;
const arrondi3 = (v) => Math.round(v * 1000) / 1000;


// Flou gaussien séparable d'un relief, sur une grille agrandie de 3σ de chaque côté ; la hauteur maximale est RESTITUÉE (le flou adoucit les pentes
// sans abaisser le sommet) ; sous 0,02 mm = 0.
function flouter(F, sigma_mm) {
  const pas = F.pas, sp = sigma_mm / pas, P = Math.ceil(3 * sp), nx = F.nx + 2 * P, ny = F.ny + 2 * P;
  let a = new Float32Array(nx * ny);
  for (let j = 0; j < F.ny; j++) for (let i = 0; i < F.nx; i++) a[(j + P) * nx + i + P] = F.relief[j * F.nx + i];
  const noy = []; for (let k = -P; k <= P; k++) noy.push(Math.exp(-(k * k) / (2 * sp * sp)));
  const som = noy.reduce((x, y) => x + y, 0); for (let k = 0; k < noy.length; k++) noy[k] /= som;
  const passe = (src, horiz) => {
    const o = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      let v = 0;
      for (let k = -P; k <= P; k++) { const ii = horiz ? i + k : i, jj = horiz ? j : j + k; if (ii >= 0 && jj >= 0 && ii < nx && jj < ny) v += noy[k + P] * src[jj * nx + ii]; }
      o[j * nx + i] = v;
    }
    return o;
  };
  a = passe(passe(a, true), false);
  let m0 = 0, m1 = 0; for (let k = 0; k < F.relief.length; k++) if (F.relief[k] > m0) m0 = F.relief[k];
  for (let k = 0; k < a.length; k++) if (a[k] > m1) m1 = a[k];
  const e = m1 > 0 ? m0 / m1 : 1;
  for (let k = 0; k < a.length; k++) { a[k] *= e; if (a[k] < SEUIL_FLOU_MM) a[k] = 0; }
  return { rel: a, nx, ny, pad: P, dist: distanceAuBord(a, nx, ny, pas) };
}

export function ouvrirFiche(f) {
  const u16 = new Uint16Array(decoderBase64(f.relief_b64).buffer);
  const relief = new Float32Array(u16.length);
  for (let k = 0; k < u16.length; k++) relief[k] = u16[k] * ECHELLE_RELIEF;
  const F = { ...f, relief, dist: distanceAuBord(relief, f.nx, f.ny, f.pas), flous: new Map() };
  F.grille = (sigma_mm) => {
    const s = Math.round(sigma_mm * 2) / 2; // paliers de 0,5 mm (cache)
    if (!(s > 0)) return { rel: F.relief, nx: F.nx, ny: F.ny, pad: 0, dist: F.dist };
    if (!F.flous.has(s)) F.flous.set(s, flouter(F, s));
    return F.flous.get(s);
  };
  return F;
}

// Coordonnées dans la grille (éventuellement floutée) d'un point local (t, u) ; le facteur d'étirement agit EN PLAN seulement.
function coord(F, p, t, u) {
  const G = F.grille(F.coin ? 0 : p.douceur_mm || 0), sx = p.largeur_mm / ((F.nx - 1) * F.pas), sy = p.longueur_mm / ((F.ny - 1) * F.pas);
  return { G, sx, sy, fx: (t / sx + ((G.nx - 1) * F.pas) / 2) / F.pas, fy: u / sy / F.pas + G.pad };
}

// Relief d'un élément importé à la position locale (t, u), hauteur réglée comprise (valeur POSITIVE ; le signe est appliqué par l'appelant).
export function reliefAjuste(F, p, t, u) {
  const { G, sx, fx, fy } = coord(F, p, t, u);
  const r = bilineaire(G.rel, G.nx, G.ny, fx, fy);
  if (!(r > 0)) return 0;
  if (F.coin) return r * (Math.tan(rad(p.angle_deg)) / Math.tan(rad(F.coin.angle_ref_deg))) * sx; // × sx : la pente (angle) est conservée quand on élargit
  const p0 = F.mode_hauteur === 'conservee' ? F.plancher_fixe_mm : 0;
  if (r <= p0) return r;
  return p0 + (r - p0) * ((p.hauteur_mm - p0) / (F.hauteur_ref_mm - p0));
}
export const hauteurMinimaleImporte = (F) => (F.mode_hauteur === 'conservee' ? Math.max(HAUTEUR_IMPORTE_MM.min, F.plancher_fixe_mm + 0.1) : HAUTEUR_IMPORTE_MM.min);

// Types d'éléments issus des fiches. `licence` et `libelleZone` viennent de la fiche (jamais inventés).
// POSITION : dy_mm = distance du BORD ARRIÈRE de l'élément au point le plus postérieur du pied (0 = démarre au bord du talon) ; dx_mm = décalage du centre vers le médial.
export function typesBibliotheque() {
  const types = {};
  for (const f of FICHES_PODAXIA) {
    const F = ouvrirFiche(f);
    const lRef = arrondi3((F.nx - 1) * F.pas), LRef = arrondi3((F.ny - 1) * F.pas), ech = F.echelle_defaut || { x: 1, y: 1 };
    const largeur = arrondi3(lRef * ech.x), longueur = arrondi3(LRef * ech.y);
    const defauts = { dx_mm: F.dx_defaut_mm, dy_mm: F.dy_defaut_mm, hauteur_mm: F.hauteur_ref_mm, largeur_mm: largeur, longueur_mm: longueur, raccord_mm: 1, signe: F.signe };
    if (F.coin) { defauts.angle_deg = F.coin.angle_ref_deg; delete defauts.hauteur_mm; defauts.raccord_mm = 8; defauts.ancrage = 'bord'; } // coin : démarre au BORD de la semelle (côté haut), raccord de début 8 mm // coin : angle OU hauteur, jamais les deux (la hauteur au bord se déduit de l'angle)
    else defauts.douceur_mm = arrondi3(Math.min(6, Math.max(1.5, 0.15 * Math.min(largeur, longueur)))); // bords doux par défaut (retour de Joël : « marche d'escalier »)
    types[F.cle] = Object.freeze({
      libelle: F.libelle, zone: F.zone, reference_fournisseur: F.reference_fournisseur, licence: F.licence, importe: true, fiche: F, signe_defaut: F.signe,
      largeur_ref_mm: lRef, longueur_ref_mm: LRef, ...(F.coin ? { coteHaut: F.coin.cote_haut, plateauRatio: F.coin.plateau_ratio } : {}),
      defauts: Object.freeze(defauts),
      u0: () => 0,
      // d > 0 là où il y a du relief ; valeur = distance (mm) au bord du relief (sert à situer la zone plane pour mesurer un angle)
      distance: (p, t, u) => { const { G, fx, fy } = coord(F, p, t, u); return bilineaire(G.rel, G.nx, G.ny, fx, fy) > 1e-9 ? Math.max(bilineaire(G.dist, G.nx, G.ny, fx, fy), 1e-3) : -1; },
      profil: (p, t, u) => reliefAjuste(F, p, t, u),
      plateau_fin: (p) => (F.plateau_fin_mm === null || F.plateau_fin_mm === undefined ? Infinity : (F.plateau_fin_mm - F.decalage_y_mm) * (p.longueur_mm / LRef)),
    });
  }
  return types;
}
