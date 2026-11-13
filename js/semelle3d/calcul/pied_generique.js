// Mode B (sans scan) : empreinte plantaire VIRTUELLE d'un pied générique (proportions moyennes FICTIVES), au même format que H_plantaire (z >= 0 en mm, NaN hors pied,
// talon en y = 0, x centré sur le talon, pas 0,5 mm). Elle alimente le noyau existant sans le modifier : base, éléments, coupe, axe de Henke, torsion, appui, mannequin.
// Base : le pied synthétique « réaliste » (pied_realiste.js : talon, voûte médiale, têtes métatarsiennes, 5 orteils), mis à l'échelle de la longueur ; largeur et voûte réglables.
// Ce n'est PAS une mesure du patient : toute sortie issue de ce modèle est marquée « indicative » (export de production verrouillé, bandeau de l'interface).
import { grilleDuModele } from './mannequin.js';
import { modelePiedRealiste } from './pied_realiste.js';
import { estValide } from './grille.js';

export const PIED_GENERIQUE = Object.freeze({
  longueur_min_mm: 150, longueur_max_mm: 350, // adulte et grand enfant ; l'enfant plus petit relèvera d'un modèle propre (V2)
  largeur_rel: Object.freeze({ min: 0.8, max: 1.25, etroit: 0.9, moyen: 1, large: 1.1 }),
  voute_mm: Object.freeze({ min: 0, max: 35, basse: 8, moyenne: 15, haute: 24 }),
});

/** Grille plantaire du pied générique. `largeur_rel` : facteur sur la largeur (0,9 étroit, 1 moyen, 1,1 large) ; `voute_mm` : hauteur de la voûte médiale (8 bas, 15 moyen, 24 haut). */
export function grilleDuPiedGenerique({ longueur_mm = 265, cote = 'D', largeur_rel = 1, voute_mm = 15, pas = 0.5 } = {}) {
  const G = PIED_GENERIQUE;
  if (!(Number.isFinite(longueur_mm) && longueur_mm >= G.longueur_min_mm && longueur_mm <= G.longueur_max_mm)) throw new RangeError('pied générique : longueur entre ' + G.longueur_min_mm + ' et ' + G.longueur_max_mm + ' mm');
  if (cote !== 'D' && cote !== 'G') throw new TypeError('pied générique : côté D ou G exigé');
  if (!(Number.isFinite(largeur_rel) && largeur_rel >= G.largeur_rel.min && largeur_rel <= G.largeur_rel.max)) throw new RangeError('pied générique : largeur relative entre ' + G.largeur_rel.min + ' et ' + G.largeur_rel.max);
  if (!(Number.isFinite(voute_mm) && voute_mm >= G.voute_mm.min && voute_mm <= G.voute_mm.max)) throw new RangeError('pied générique : voûte entre ' + G.voute_mm.min + ' et ' + G.voute_mm.max + ' mm');
  const g = grilleDuModele(modelePiedRealiste({ longueur_mm, cote, voute_mm }), { pas });
  if (largeur_rel === 1) return g;
  // largeur : rééchantillonnage en x autour de l'axe du talon (x = 0) ; les hauteurs ne changent pas
  const { nx, ny } = g, z = new Float32Array(nx * ny).fill(NaN);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const f = (g.ox + i * pas) / largeur_rel, s = (f - g.ox) / pas, i0 = Math.floor(s), t = s - i0; if (i0 < 0 || i0 >= nx - 1) continue;
    const a = g.z[j * nx + i0], b = g.z[j * nx + i0 + 1];
    z[j * nx + i] = estValide(a) && estValide(b) ? a + (b - a) * t : estValide(a) && t < 0.5 ? a : estValide(b) && t >= 0.5 ? b : NaN;
  }
  return { ...g, z };
}
