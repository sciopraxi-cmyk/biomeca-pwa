// Hauteur / épaisseur réglée automatiquement sur l'épaisseur écrite dans le titre du matériau choisi (demande de Joël, 01/11).
// Pur. Pour un ÉLÉMENT : ne s'applique PAS aux points curseurs (hauteur signée, tirée à la souris), aux coins (réglés en degrés) ni aux creux (profondeur voulue).
import { TYPES_ELEMENTS } from './elements.js';

// Épaisseur de la BASE (et de la zone devant) : lecture du titre, sans restriction de type ; les limites de la base sont contrôlées par l'appelant.
export function epaisseurBaseApplicable(mat) {
  if (!mat || !Number.isFinite(mat.epaisseur_mm) || !(mat.epaisseur_mm > 0)) return null;
  return Math.round(mat.epaisseur_mm * 100) / 100;
}

export function epaisseurApplicable(el, mat) {
  const T = TYPES_ELEMENTS[el && el.type];
  if (!T) return null;
  if (T.point || T.coteHaut || T.pinceau) return null; // coteHaut = tous les coins (postérieur, supinateur, antérieur…)
  if (T.signe_defaut === -1 || el.signe === -1) return null;
  return epaisseurBaseApplicable(mat);
}
