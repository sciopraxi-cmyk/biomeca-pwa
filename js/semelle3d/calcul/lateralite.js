// Latéralité PROPOSÉE (jamais décisive : le praticien confirme). Deux signaux indépendants :
//  - « voûte » : sur la face plantaire rasterisée, le côté médial est le côté de la voûte la plus haute
//    (entre 25 % et 50 % de la longueur) ;
//  - « contour » : courbure de la ligne médiane (voir recalage.js).
// Convention du repère final (vu de dessus, pied vers +Z) : le côté médial d'un pied DROIT est en -X.
// Ces heuristiques sont de notre fait, non validées cliniquement : elles ne servent qu'à pré-sélectionner.
import { RECALAGE as P } from '../constantes.js';
import { minMax } from './grille.js';

export function signalVoute(g, L) {
  let somG = 0, nG = 0, somD = 0, nD = 0;
  const mm = minMax(g);
  if (!mm) return { valeur: null, confiance: 0, ambigu: true };
  for (let j = 0; j < g.ny; j++) {
    const y = g.oy + j * g.pas;
    if (y < 0.25 * L || y > 0.5 * L) continue;
    let i0 = -1, i1 = -1;
    for (let i = 0; i < g.nx; i++) if (Number.isFinite(g.z[j * g.nx + i])) { if (i0 < 0) i0 = i; i1 = i; }
    if (i0 < 0) continue;
    const milieu = (i0 + i1) / 2;
    for (let i = i0; i <= i1; i++) {
      const h = g.z[j * g.nx + i];
      if (!Number.isFinite(h)) continue;
      if (i < milieu) { somG += h; nG++; } else if (i > milieu) { somD += h; nD++; }
    }
  }
  if (!nG || !nD) return { valeur: null, confiance: 0, ambigu: true };
  const ecart = somG / nG - somD / nD; // > 0 : le côté -X est plus haut
  const confiance = Math.abs(ecart) / Math.max(mm.max - mm.min, 1e-9);
  return { valeur: ecart > 0 ? 'D' : 'G', ecart_mm: ecart, confiance, ambigu: confiance < P.seuil_confiance_voute };
}

export function proposerLateralite(contour, voute) {
  const valeur = voute.valeur || contour.valeur;
  const concordants = voute.valeur && contour.valeur ? voute.valeur === contour.valeur : null;
  const ambigu = !valeur || voute.ambigu || concordants === false;
  return { valeur, signaux: { voute, contour }, concordants, ambigu, a_confirmer: true };
}

// Deux pieds sur la même empreinte (A et B) : proposition CONJOINTE sous la contrainte « un droit et un gauche ».
// Score d'un pied = somme signée (D = +, G = −) de ses signaux, chacun normalisé par son seuil de confiance (plafonné à 3).
// On retient l'affectation (A=D,B=G) ou (A=G,B=D) de score total le plus grand ; jamais décisif : le praticien confirme.
export function proposerPaire(propA, propB) {
  const score = (p) => {
    let s = 0;
    const s1 = p && p.signaux && p.signaux.voute, s2 = p && p.signaux && p.signaux.contour;
    if (s1 && s1.valeur) s += (s1.valeur === 'D' ? 1 : -1) * Math.min(3, s1.confiance / P.seuil_confiance_voute);
    if (s2 && s2.valeur) s += (s2.valeur === 'D' ? 1 : -1) * Math.min(3, s2.confiance / P.seuil_confiance_contour);
    return s;
  };
  const sA = score(propA), sB = score(propB);
  const total = sA - sB; // > 0 : A = D et B = G
  const seul = (s) => (s > 0 ? 'D' : s < 0 ? 'G' : null);
  const concordants = seul(sA) && seul(sB) ? seul(sA) !== seul(sB) : null; // chaque pied, pris seul, désigne-t-il des côtés opposés ?
  const marge = Math.abs(total);
  const ambigu = marge < 2 || concordants === false;
  return { affectation: total >= 0 ? { A: 'D', B: 'G' } : { A: 'G', B: 'D' }, scores: { A: sA, B: sB }, marge, concordants, ambigu, a_confirmer: true };
}
