// Boîte d'empreinte FICTIVE (banc de contrôle et tests uniquement, jamais proposée dans Verticy) :
// bloc plat dont le dessus (le « bord » de la boîte) est un plan, creusé à la forme du pied.
// Le fond de la cavité reprend la face plantaire du modèle (talon et têtes métatarsiennes les plus profonds,
// voûte plus haute) : c'est ce que l'on voit en regardant d'en haut une boîte où le pied a été enfoncé.
// Surface OUVERTE (dessus seul, comme beaucoup de scanners), sans aucune donnée réelle.
import { modelePiedRealiste } from './pied_realiste.js';

// Retour : { positions, indices, modele, profondeur_mm } dans un repère « boîte » : bord à z = 0, cavité vers -z,
// talon vers y = 0, pied DROIT = côté médial en -x (même convention que les scans de pied du module).
export function boiteEmpreinteFictive({ cote = 'D', longueur_mm = 265, voute_mm = 15, profondeur_mm = 45, marge_mm = 28, pas_mm = 1, affaissement_mm = 0, marge_y_mm = marge_mm, pente_mm = 0, bord_irregulier_mm = 0 } = {}) {
  const modele = modelePiedRealiste({ cote, longueur_mm, voute_mm });
  if (!(profondeur_mm >= 30 && profondeur_mm <= 120)) throw new RangeError('boîte fictive : profondeur entre 30 et 120 mm');
  const x0 = modele.x0 - marge_mm, x1 = modele.x0 + modele.largeur_grille_mm + marge_mm;
  const y0 = -marge_y_mm, y1 = longueur_mm + marge_y_mm;
  const nx = Math.ceil((x1 - x0) / pas_mm) + 1, ny = Math.ceil((y1 - y0) / pas_mm) + 1;
  // bord_irregulier_mm > 0 : le contour du creux est dentelé (déchirures de la mousse) : chaque nœud est testé à un décalage pseudo-aléatoire (déterministe) de ±bord_irregulier_mm.
  const bruit = (i, j, c) => { let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ Math.imul(c, 83492791)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1; };
  const dedansB = (x, y, i, j) => modele.dedans(x + bord_irregulier_mm * bruit(i, j, 1), y + bord_irregulier_mm * bruit(i, j, 2));
  const pos = new Float64Array(3 * nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * pas_mm, y = y0 + j * pas_mm, k = 3 * (j * nx + i);
    pos[k] = x; pos[k + 1] = y;
    // affaissement_mm > 0 : la mousse d'une vraie boîte s'affaisse en bande sur toute la largeur du scan autour du pied (cas du premier vrai scan)
    const bande = affaissement_mm > 0 && y > -20 && y < longueur_mm + 20;
    pos[k + 2] = dedansB(x, y, i, j) ? modele.relief(x, y) - profondeur_mm : bande ? -affaissement_mm : 0;
  }
  // pente_mm > 0 : parois en pente (comme une vraie mousse) : de la profondeur du bord du pied jusqu'au bord de la boîte (z = 0) sur `pente_mm` mm
  // vers l'extérieur, au lieu d'une falaise verticale. Distance au pied par propagation 8-voisins (sources = cellules du pied).
  if (pente_mm > 0) {
    const src = new Int32Array(nx * ny).fill(-1), file = [];
    for (let k = 0; k < src.length; k++) { const i = k % nx, j = (k - i) / nx; if (modele.dedans(x0 + i * pas_mm, y0 + j * pas_mm)) { src[k] = k; file.push(k); } }
    for (let h = 0; h < file.length; h++) {
      const q = file[h], i = q % nx, j = (q - i) / nx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if ((!di && !dj) || ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const r = jj * nx + ii; if (src[r] < 0) { src[r] = src[q]; file.push(r); }
      }
    }
    for (let k = 0; k < src.length; k++) {
      if (src[k] === k || src[k] < 0) continue;
      const i = k % nx, j = (k - i) / nx, si = src[k] % nx, sj = (src[k] - si) / nx;
      const d = Math.hypot(i - si, j - sj) * pas_mm;
      if (d < pente_mm) pos[3 * k + 2] = pos[3 * src[k] + 2] * (1 - d / pente_mm);
    }
  }
  const idx = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
    idx.push(a, b, c, a, c, d);
  }
  return { positions: pos, indices: Uint32Array.from(idx), modele, profondeur_mm };
}
