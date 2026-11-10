// Éléments de bord (lot 3 bis) : tout élément qui se colle au bord de la semelle par définition suit la MÊME règle que la voûte
// (décision de Joël, 31/10/2026) : sommet AU bord, sans décroissance vers le bord ; le DESSOUS suit le dessus à l'épaisseur de la base
// puis redescend en biseau (angle réglable) vers le milieu de la semelle, exactement comme le biseau médial de la base intermédiaire :
//   bas = max(bas_base, haut_finale − épaisseur − d × tan(angle)),  d = distance au(x) bord(s) concerné(s).
// Fonctions pures.
import { lisserContour, distanceAuxSources } from './contour.js';
import { estValide } from './grille.js';
import { BISEAU_MEDIAL, ISTHME } from '../constantes.js';

export const BORDS = Object.freeze(['medial', 'lateral', 'posterieur']);

// Nœuds du contour (bord, normales) : fournis par la base (calculés avant la coupe en demi-semelle), sinon calculés ici sur le masque.
export function contourDeBase(base) {
  if (base.contourBord) return base.contourBord;
  const c = lisserContour({ nx: base.nx, ny: base.ny, pas: base.pas, ox: base.ox, oy: base.oy, z: base.haut });
  return { bord: c.bord, normX: c.normX, normY: c.normY };
}

// Sources de distance : nœuds du bord dont la normale sortante est à moins de 60° de la direction du bord demandé.
export function sourcesBords(cb, cote, bords) {
  if (cote !== 'D' && cote !== 'G') throw new Error('bords : la latéralité (D/G) doit être confirmée (elle décide du côté médial)');
  if (!Array.isArray(bords) || bords.length === 0) throw new TypeError('bords : liste vide');
  const med = cote === 'D' ? -1 : 1; // pied droit : médial en -X (repère du lot 1)
  const cosOuv = Math.cos((BISEAU_MEDIAL.ouverture_deg * Math.PI) / 180);
  const n = cb.bord.length, src = new Uint8Array(n);
  let ns = 0;
  for (const b of bords) if (!BORDS.includes(b)) throw new TypeError('bords : « ' + b + ' » inconnu (attendu : ' + BORDS.join(', ') + ')');
  for (let k = 0; k < n; k++) {
    if (!cb.bord[k]) continue;
    const nx = cb.normX[k], ny = cb.normY[k];
    const dedans = (bords.includes('medial') && nx * med >= cosOuv) || (bords.includes('lateral') && -nx * med >= cosOuv) || (bords.includes('posterieur') && -ny >= cosOuv);
    if (dedans) { src[k] = 1; ns++; }
  }
  if (ns === 0) throw new Error('bords : aucun nœud de contour pour ' + bords.join(' + '));
  return src;
}

// Distance (mm) de chaque nœud au bord le plus proche parmi ceux demandés (plusieurs bords = le plus proche).
export function distanceBords(base, cote, bords) {
  const cle = cote + ':' + [...bords].sort().join('+');
  base._distBords = base._distBords || new Map();
  if (!base._distBords.has(cle)) {
    const cb = contourDeBase(base);
    base._distBords.set(cle, distanceAuxSources(base.nx, base.ny, base.pas, sourcesBords(cb, cote, bords)));
  }
  return base._distBords.get(cle);
}

// Dessous avec biseau : même formule que biseauMedial de la base, appliquée à la surface FINIE. Ne descend jamais sous le dessous de la base.
export function biseauDessous(hautFinale, basBase, epaisseur, distance, angle_deg) {
  const t = Math.tan((angle_deg * Math.PI) / 180);
  const out = new Float32Array(hautFinale.length);
  for (let k = 0; k < out.length; k++) {
    if (!estValide(hautFinale[k])) { out[k] = NaN; continue; }
    const e = typeof epaisseur === 'number' ? epaisseur : epaisseur[k];
    out[k] = Math.max(basBase[k], hautFinale[k] - e - distance[k] * t);
  }
  return out;
}

// Suggestion (bleue, jamais appliquée seule) du milieu de la voûte : rangée la plus étroite de l'empreinte entre 15 % et 55 % de la longueur
// (zone étroite = rangées à moins de 1,5 mm du minimum, on prend le milieu de cette zone) ; appui le plus médial = nœud médial de cette rangée.
// masque : Uint8Array/Float32Array (valide si fini/non nul) de l'empreinte COMPLÈTE (avant coupe en demi-semelle).
export function suggererMilieuVoute({ nx, ny, pas, ox, valide }, cote) {
  if (cote !== 'D' && cote !== 'G') throw new Error('suggestion : latéralité (D/G) requise');
  let jmin = -1, jmax = -1;
  const ext = new Array(ny).fill(null);
  for (let j = 0; j < ny; j++) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < nx; i++) if (valide[j * nx + i]) { if (i < a) a = i; if (i > b) b = i; }
    if (a <= b) { ext[j] = [a, b]; if (jmin < 0) jmin = j; jmax = j; }
  }
  if (jmin < 0) throw new RangeError('suggestion : empreinte vide');
  const L = (jmax - jmin) * pas;
  const rangees = [];
  for (let j = jmin; j <= jmax; j++) {
    const f = (j - jmin) / (jmax - jmin);
    if (f >= ISTHME.debut && f <= ISTHME.fin && ext[j]) rangees.push({ j, w: (ext[j][1] - ext[j][0]) * pas });
  }
  if (rangees.length === 0) throw new RangeError('suggestion : empreinte trop courte');
  const wmin = Math.min(...rangees.map((r) => r.w)), wmax = Math.max(...rangees.map((r) => r.w));
  const zone = rangees.filter((r) => r.w <= wmin + ISTHME.tolerance_mm);
  const jc = zone[Math.floor((zone.length - 1) / 2)].j; // médiane des rangées de la zone étroite
  const med = cote === 'D' ? -1 : 1;
  const xm = ox + (med < 0 ? ext[jc][0] : ext[jc][1]) * pas;
  const y0 = (zone[0].j - jmin) * pas, y1 = (zone[zone.length - 1].j - jmin) * pas;
  const mal = wmax - wmin < ISTHME.contraste_min_mm || y1 - y0 > 0.4 * L;
  return {
    dy_mm: (jc - jmin) * pas, pourcentage: (100 * (jc - jmin) * pas) / L, x_medial_mm: xm, largeur_mm: wmin, zone_mm: [y0, y1], longueur_pied_mm: L,
    a_confirmer: mal,
    raison: mal ? 'isthme mal défini sur cette empreinte (contour presque droit entre 15 % et 55 % de la longueur) : à placer à la main si besoin' : 'rangée la plus étroite de l\'empreinte, au milieu de la zone étroite',
  };
}
