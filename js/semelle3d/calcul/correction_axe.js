// Lot 4 bis, étape 5 : axe de Henke CORRIGÉ par la torsion de la semelle (pur, affichage seulement : aucun effet sur la semelle, le STL, Annuler).
// Question du praticien : « quand le pied est posé sur la semelle corrigée, que devient la déviation de l'axe ? ». Le pied ne bouge pas par rapport à la semelle : c'est l'AXE qui se déplace.
// Modèle indicatif (constantes.js : AXE_CORRIGE, à valider cliniquement) : déviation corrigée = déviation de départ − facteur · phi · sin λ (composante transversale du couplage triplan).
import { HENKE, AXE_CORRIGE } from '../constantes.js';
import { categorieAxe, xCroisement, yTetes, vecteursAxe, LIBELLES_CATEGORIE } from './axe-henke.js';

const RAD = Math.PI / 180;
const fini = (v) => typeof v === 'number' && Number.isFinite(v);

/** Déviation (°) de l'axe après correction de phi (°), bornée à ±47° (limite haute de la plage anatomique). */
export function deviationCorrigee(axe, phi_deg, { facteur = AXE_CORRIGE.facteur } = {}) {
  if (!fini(phi_deg)) throw new TypeError('axe corrigé : phi doit être un nombre');
  if (!fini(axe.deviation_deg) || !fini(axe.inclinaison_deg)) throw new TypeError('axe corrigé : axe invalide');
  const brute = axe.deviation_deg - facteur * phi_deg * Math.sin(axe.inclinaison_deg * RAD), { max } = HENKE.deviation_plage_deg;
  return Math.min(max, Math.max(-max, brute)); // la déviation est signée (X+ médial) : bornée à ±47° ; sous 4° l'alerte « hors plage » de l'axe s'affiche, la valeur n'est pas modifiée
}
/** Axe corrigé : même p0, même inclinaison, déviation corrigée ; source « corrige », jamais validé (c'est une proposition). */
export const axeCorrige = (axe, phi_deg, options) => ({ ...axe, deviation_deg: deviationCorrigee(axe, phi_deg, options), source: 'corrige', valide: false });

/** Distance (mm, >= 0) du croisement à la zone « normal » (entre les centres de M1 et M2) : 0 = dans la zone. */
export function ecartAuNormal(x, tetes) { const a = Math.min(tetes.m1.x, tetes.m2.x), b = Math.max(tetes.m1.x, tetes.m2.x); return x < a ? a - x : x > b ? x - b : 0; }

const etat = (axe, tetes) => { const c = categorieAxe(axe, tetes); return { deviation_deg: axe.deviation_deg, categorie: c.categorie, libelle: LIBELLES_CATEGORIE[c.categorie], limite: c.limite, seuil_proche: c.seuil_proche, x_croisement_mm: c.x_croisement_mm, ecart_normal_mm: ecartAuNormal(c.x_croisement_mm, tetes) }; };

/**
 * Bilan avant / après : { avant, apres, axe_apres, delta_deviation_deg, deplacement_croisement_mm (négatif = vers le latéral), amelioration (le croisement se rapproche de la zone normale),
 * sature (la déviation corrigée a atteint la borne ±47°), meme (phi = 0) }.
 */
export function bilanCorrection(axe, tetes, phi_deg, options) {
  const apresAxe = axeCorrige(axe, phi_deg, options), avant = etat(axe, tetes), apres = etat(apresAxe, tetes), brute = axe.deviation_deg - (options && options.facteur !== undefined ? options.facteur : AXE_CORRIGE.facteur) * phi_deg * Math.sin(axe.inclinaison_deg * RAD);
  return {
    phi_deg, avant, apres, axe_apres: apresAxe, delta_deviation_deg: apres.deviation_deg - avant.deviation_deg, deplacement_croisement_mm: apres.x_croisement_mm - avant.x_croisement_mm,
    amelioration: apres.ecart_normal_mm < avant.ecart_normal_mm - 0.05, aggravation: apres.ecart_normal_mm > avant.ecart_normal_mm + 0.05, meme: phi_deg === 0,
    sature: Math.abs(brute - apres.deviation_deg) > 1e-9, y_tetes_mm: yTetes(tetes),
  };
}
/** Phrases d'affichage : [« Déviation 11,1° → 7,8° (−3,3°) », « Croisement avec la ligne des têtes : … », « Catégorie : médialisé → normal ✓ »]. */
export function textesCorrection(b) {
  const f = (v, n = 1) => Math.abs(v).toFixed(n).replace('.', ','), sg = (v) => (v < -1e-9 ? '−' : v > 1e-9 ? '+' : '±');
  if (b.meme) return ['Pas de correction (phi = 0°) : l\'axe reste celui de départ.'];
  const mm = b.deplacement_croisement_mm;
  return [
    'Déviation de l\'axe : ' + f(b.avant.deviation_deg) + '° → ' + f(b.apres.deviation_deg) + '° (' + sg(b.delta_deviation_deg) + f(b.delta_deviation_deg) + '°)' + (b.sature ? ' — borne de 47° atteinte' : ''),
    'Croisement avec la ligne des têtes : déplacé de ' + f(mm) + ' mm vers le ' + (mm < 0 ? 'latéral' : 'médial'),
    'Catégorie : ' + b.avant.libelle + ' → ' + b.apres.libelle + (b.amelioration ? ' ✓ amélioration' : b.aggravation ? ' ⚠ éloignement de la zone normale' : ' (inchangée)'),
  ];
}
/** Segment de l'axe corrigé pour l'affichage (repère Henke) : de p0 jusqu'à la ligne des têtes + 25 mm, et pointe 3D limitée à 70 mm de hauteur ; mêmes règles que l'axe de départ. */
export function traceAxe(axe, tetes) {
  const { a, u } = vecteursAxe(axe), y0 = axe.p0.y, yFin = yTetes(tetes) + 25, sFin = (yFin - y0) / a.y, yT = yTetes(tetes), tAxe = Math.min((yT - y0) / u.y, 70 / u.z);
  return { projection: { de: { x: axe.p0.x, y: y0 }, a: { x: axe.p0.x + a.x * sFin, y: yFin } }, axe3d: { de: { x: axe.p0.x, y: y0, z: 0 }, a: { x: axe.p0.x + u.x * tAxe, y: axe.p0.y + u.y * tAxe, z: u.z * tAxe } }, croisement: { x: xCroisement(axe, yT), y: yT } };
}
