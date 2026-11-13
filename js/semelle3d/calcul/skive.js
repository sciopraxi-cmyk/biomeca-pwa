// Lot 4 bis, étape 4 : skive de Kirby (pur). Rainure le long du bord médial (ou latéral) de l'ARRIÈRE-PIED : profondeur maximale `profondeur_mm` AU bord,
// qui diminue vers l'intérieur selon la pente `angle_deg` (largeur = profondeur / tan(angle)), sur `longueur_skive_mm` depuis `debut_mm` derrière le repère du talon,
// avec une fin progressive (lisse) vers l'avant. Couche NÉGATIVE (retire de la matière) bornée par l'épaisseur minimale : jamais de trou.
// Une skive n'existe dans le plan qu'après la validation du praticien (la suggestion, elle, n'est jamais appliquée seule).
import { HENKE, EPAISSEUR_BASE_MIN_MM } from '../constantes.js';
import { estValide } from './grille.js';
import { distanceBords } from './bords.js';

const RAD = Math.PI / 180;
const lisse = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export const BORDS_SKIVE = Object.freeze(['medial', 'lateral']);

/** Largeur (mm) de la pente d'une skive : profondeur / tan(angle). */
export const largeurSkive = (profondeur_mm, angle_deg) => profondeur_mm / Math.tan(angle_deg * RAD);

/** Validation des réglages (RangeError hors limites). Renvoie les réglages nettoyés. */
export function validerSkiveEl(p) {
  const S = HENKE.skive, nb = (v) => typeof v === 'number' && Number.isFinite(v);
  if (!BORDS_SKIVE.includes(p.bord_skive)) throw new RangeError('skive : bord « medial » ou « lateral »');
  if (!nb(p.profondeur_mm) || p.profondeur_mm < S.profondeur_plage_mm.min || p.profondeur_mm > S.profondeur_plage_mm.max) throw new RangeError('skive : profondeur entre ' + S.profondeur_plage_mm.min + ' et ' + S.profondeur_plage_mm.max + ' mm');
  if (!nb(p.angle_skive_deg) || p.angle_skive_deg < S.angle_plage_deg.min || p.angle_skive_deg > S.angle_plage_deg.max) throw new RangeError('skive : angle entre ' + S.angle_plage_deg.min + ' et ' + S.angle_plage_deg.max + '°');
  if (!nb(p.longueur_skive_mm) || p.longueur_skive_mm < S.longueur_plage_mm.min || p.longueur_skive_mm > S.longueur_plage_mm.max) throw new RangeError('skive : longueur entre ' + S.longueur_plage_mm.min + ' et ' + S.longueur_plage_mm.max + ' mm');
  if (!nb(p.debut_skive_mm) || p.debut_skive_mm < 0) throw new RangeError('skive : début >= 0 mm derrière le talon');
  return p;
}

/**
 * Couche de la skive sur la surface `finale` (éléments précédents compris) ; `base` fournit le contour pour la distance au bord. rep = repère du talon.
 * Retourne { z (<= 0), cellules, limitees, profondeur_reelle_mm, largeur_mm, avertissements }.
 */
export function coucheSkive(finale, base, el, rep, cote) {
  validerSkiveEl(el);
  const { nx, ny, pas, oy, haut, bas } = finale, n = nx * ny, z = new Float32Array(n);
  const dist = distanceBords(base, cote, [el.bord_skive]);
  const w = largeurSkive(el.profondeur_mm, el.angle_skive_deg), S = HENKE.skive, y0 = rep.y_mm + el.debut_skive_mm, L = el.longueur_skive_mm;
  const fin0 = L - Math.min(S.transition_fin_mm, L / 2);
  let cellules = 0, limitees = 0, zmin = 0, emprise = 0;
  for (let k = 0; k < n; k++) {
    if (!estValide(haut[k])) continue;
    emprise++;
    const u = oy + Math.floor(k / nx) * pas - y0; if (u < 0 || u > L) continue;
    const d = dist[k]; if (!(d < w)) continue;
    const profil = el.profondeur_mm * (1 - d / w) * (1 - lisse(fin0, L, u));
    if (profil <= 1e-6) continue;
    const plancher = Math.min(haut[k], bas[k] + EPAISSEUR_BASE_MIN_MM); // jamais plus fin que la base ne l'était, ni sous l'épaisseur minimale
    let v = -profil; if (haut[k] + v < plancher) { v = plancher - haut[k]; limitees++; }
    if (v < -1e-6) { z[k] = v; cellules++; if (v < zmin) zmin = v; }
  }
  const avertissements = [];
  if (cellules === 0) avertissements.push('skive sans effet : ' + (limitees ? 'épaisseur de la semelle insuffisante sous la skive' : 'aucune zone du pied dans la longueur demandée'));
  else if (limitees > 0) avertissements.push('profondeur limitée par l\'épaisseur minimale de ' + EPAISSEUR_BASE_MIN_MM + ' mm : ' + (-zmin).toFixed(2) + ' mm obtenus au lieu de ' + el.profondeur_mm + ' mm (' + limitees + ' cellule(s))');
  return { z, cellules, limitees, emprise, profondeur_reelle_mm: -zmin, largeur_mm: w, avertissements };
}
