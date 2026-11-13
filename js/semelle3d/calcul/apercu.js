// Lot 4d : calculs purs des aides d'affichage (aucun effet sur la semelle, le STL ni Annuler).
import { ordreEmpilement } from './elements.js';

export const ECLATEMENT = Object.freeze({ defaut_mm: 12, min_mm: 0, max_mm: 30 });
export const FANTOME = Object.freeze({ opacite: 0.25, couleur: 0x8a929e, souleve_mm: 0.3 });

export const espaceValide = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? Math.min(ECLATEMENT.max_mm, Math.max(ECLATEMENT.min_mm, n)) : ECLATEMENT.defaut_mm;
};

// Soulèvement (mm) de chaque élément en vue éclatée : dans l'ordre d'empilement (recouvrement en dernier), un élément est soulevé de
// l'épaisseur des éléments qui le précèdent + un espace par rang. Un élément sans géométrie (masqué, vide) n'occupe pas de rang.
// liste = surimpressions (type, cellules, visible) ; epaisseurs = strates (epaisseur_max_mm) dans le même ordre. Renvoie un tableau (0 pour les absents).
export function decalagesEclatement(liste, epaisseurs, espace_mm = ECLATEMENT.defaut_mm) {
  const e = espaceValide(espace_mm), sortie = new Array(liste.length).fill(0);
  let cumul = 0, rang = 0;
  for (const k of ordreEmpilement(liste)) {
    const s = liste[k];
    if (!s || !s.visible || !(s.cellules > 0)) continue;
    rang++;
    sortie[k] = cumul + rang * e;
    cumul += epaisseurs && epaisseurs[k] && Number.isFinite(epaisseurs[k].epaisseur_max_mm) ? epaisseurs[k].epaisseur_max_mm : 0;
  }
  return sortie;
}

// Couleurs d'affichage de H_plantaire (lot 4 bis, rendu lisible de l'empreinte) : dégradé bleu (appui) → cyan → vert → jaune → rouge (haut), plus des « marches » de 2 mm
// (le ton s'assombrit légèrement en bas de chaque marche : les courbes de niveau se lisent sans quadrillage). Pur ; positions = [x, y, z, ...] avec z = hauteur + socle.
export const COULEURS_HAUTEUR = Object.freeze({ socle_mm: 1, pas_marche_mm: 2, arrets: Object.freeze([[0, [0.26, 0.42, 0.88]], [0.25, [0.2, 0.76, 0.88]], [0.5, [0.35, 0.78, 0.4]], [0.75, [0.94, 0.82, 0.24]], [1, [0.86, 0.24, 0.16]]]) });
export function couleurDeHauteur(t) {
  const A = COULEURS_HAUTEUR.arrets, u = Math.min(1, Math.max(0, t));
  for (let i = 0; i < A.length - 1; i++) if (u <= A[i + 1][0]) { const f = (u - A[i][0]) / (A[i + 1][0] - A[i][0]); return [0, 1, 2].map((k) => A[i][1][k] + (A[i + 1][1][k] - A[i][1][k]) * f); }
  return [...A[A.length - 1][1]];
}
export function couleursHauteur(positions) {
  const { socle_mm, pas_marche_mm } = COULEURS_HAUTEUR, n = positions.length / 3, col = new Float32Array(positions.length);
  let zmax = socle_mm + 1e-9;
  for (let v = 0; v < n; v++) if (positions[3 * v + 2] > zmax) zmax = positions[3 * v + 2];
  const etendue = Math.max(zmax - socle_mm, 1e-9);
  for (let v = 0; v < n; v++) {
    const h = Math.max(0, positions[3 * v + 2] - socle_mm), c = couleurDeHauteur(h / etendue);
    const marche = 0.86 + 0.14 * (h / pas_marche_mm - Math.floor(h / pas_marche_mm)); // sombre en bas de la marche, clair en haut
    col[3 * v] = c[0] * marche; col[3 * v + 1] = c[1] * marche; col[3 * v + 2] = c[2] * marche;
  }
  return col;
}
