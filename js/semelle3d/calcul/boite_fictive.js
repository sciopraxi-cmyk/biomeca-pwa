// Boîte d'empreinte FICTIVE (banc de contrôle et tests uniquement, jamais proposée dans Verticy) :
// bloc plat dont le dessus (le « bord » de la boîte) est un plan, creusé à la forme du pied.
// Le fond de la cavité reprend la face plantaire du modèle (talon et têtes métatarsiennes les plus profonds,
// voûte plus haute) : c'est ce que l'on voit en regardant d'en haut une boîte où le pied a été enfoncé.
// Surface OUVERTE (dessus seul, comme beaucoup de scanners), sans aucune donnée réelle.
import { modelePiedRealiste } from './pied_realiste.js';

// Retour : { positions, indices, modele, profondeur_mm } dans un repère « boîte » : bord à z = 0, cavité vers -z,
// talon vers y = 0, pied DROIT = côté médial en -x (même convention que les scans de pied du module).
export function boiteEmpreinteFictive({ cote = 'D', longueur_mm = 265, voute_mm = 15, profondeur_mm = 45, marge_mm = 28, pas_mm = 1 } = {}) {
  const modele = modelePiedRealiste({ cote, longueur_mm, voute_mm });
  if (!(profondeur_mm >= 30 && profondeur_mm <= 120)) throw new RangeError('boîte fictive : profondeur entre 30 et 120 mm');
  const x0 = modele.x0 - marge_mm, x1 = modele.x0 + modele.largeur_grille_mm + marge_mm;
  const y0 = -marge_mm, y1 = longueur_mm + marge_mm;
  const nx = Math.ceil((x1 - x0) / pas_mm) + 1, ny = Math.ceil((y1 - y0) / pas_mm) + 1;
  const pos = new Float64Array(3 * nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * pas_mm, y = y0 + j * pas_mm, k = 3 * (j * nx + i);
    pos[k] = x; pos[k + 1] = y;
    pos[k + 2] = modele.dedans(x, y) ? modele.relief(x, y) - profondeur_mm : 0;
  }
  const idx = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
    idx.push(a, b, c, a, c, d);
  }
  return { positions: pos, indices: Uint32Array.from(idx), modele, profondeur_mm };
}
