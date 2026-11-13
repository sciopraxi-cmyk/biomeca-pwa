// Forme de semelle CLASSIQUE (demande de Joël, 04/11) : la semelle suit l'empreinte du pied le long du bord médial, du bord latéral et du pourtour talonnier, mais son DEVANT est arrondi comme
// une semelle du commerce : on n'y voit ni les orteils, ni les encoches entre eux. Pur : prend la grille plantaire { nx, ny, pas, ox, oy, z } (NaN = hors pied), en rend une NOUVELLE ;
// l'empreinte d'origine n'est jamais modifiée (le pied fantôme, le mannequin et le recalage continuent d'utiliser les orteils).
//
// Contour : au-delà de la rangée de départ (u_depart de la longueur, au niveau des têtes métatarsiennes) les bords médial et latéral se referment en demi super-ellipse jusqu'à la pointe
// (même longueur que le pied). Relief : celui de l'empreinte jusqu'à u_fondu_de, puis il s'estompe vers un plateau (relief moyen des têtes) à u_fondu_a : plus de bosses d'orteils.
import { FORME_SEMELLE } from '../constantes.js';
import { estValide } from './grille.js';

const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Rend { grille, rapport } ; si le pied est trop petit ou sans orteils distincts, la grille est rendue telle quelle (rapport.applique = false). */
export function formeSemelle(g, params = {}) {
  const P = { ...FORME_SEMELLE, ...params }, { nx, ny, pas } = g;
  let jmin = Infinity, jmax = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (estValide(g.z[j * nx + i])) { if (j < jmin) jmin = j; if (j > jmax) jmax = j; }
  if (jmin === Infinity) throw new RangeError('forme de semelle : empreinte vide');
  const span = jmax - jmin;
  if (span * pas < 120) return { grille: g, rapport: { applique: false, raison: 'pied trop court' } };
  const etendue = (j) => { let a = Infinity, b = -Infinity; for (let i = 0; i < nx; i++) if (estValide(g.z[j * nx + i])) { if (i < a) a = i; if (i > b) b = i; } return a <= b ? [a, b] : null; };
  // rangée de départ = la plus large entre u_depart_min et u_depart_max (têtes métatarsiennes) : le devant se referme depuis le point où le bord ne s'écarte plus (pas de décrochement)
  let jS = jmin + Math.round(P.u_depart * span), largeur = -1;
  for (let j = jmin + Math.round(P.u_depart_min * span); j <= jmin + Math.round(P.u_depart_max * span); j++) { const e = etendue(j); if (e && e[1] - e[0] > largeur) { largeur = e[1] - e[0]; jS = j; } }
  const eS = etendue(jS); if (!eS) return { grille: g, rapport: { applique: false, raison: 'rangée de départ vide' } };
  const [a0, b0] = eS, W = b0 - a0;
  // pointe : milieu des cellules valides des 3 dernières rangées, ramené dans le tiers central pour une pointe de semelle (pas celle d'un seul orteil)
  let sx = 0, c = 0; for (let j = Math.max(jS + 1, jmax - 2); j <= jmax; j++) for (let i = 0; i < nx; i++) if (estValide(g.z[j * nx + i])) { sx += i; c++; }
  const iPointe = Math.min(a0 + P.pointe_max * W, Math.max(a0 + P.pointe_min * W, c ? sx / c : (a0 + b0) / 2));
  const z = Float32Array.from(g.z), long = jmax - jS;
  // plateau : relief médian des rangées de 0,74 à 0,78 de la longueur
  const val = []; for (let j = jmin + Math.round(0.74 * span); j <= jmin + Math.round(0.78 * span); j++) for (let i = 0; i < nx; i++) { const v = g.z[j * nx + i]; if (estValide(v)) val.push(v); }
  val.sort((x, y) => x - y); const plateau = val.length ? val[val.length >> 1] : 0;
  let retires = 0, ajoutes = 0;
  const jFonduDe = jmin + P.u_fondu_de * span, jFonduA = jmin + P.u_fondu_a * span;
  for (let j = jS + 1; j <= jmax; j++) {
    const t = (j - jS) / long, f = Math.pow(Math.max(0, 1 - Math.pow(t, P.exposant)), 1 / P.exposant); // 1 à la rangée de départ, 0 à la pointe
    const iM = iPointe + (a0 - iPointe) * f, iL = iPointe + (b0 - iPointe) * f;
    const ligne = etendue(j); // pour le relief de remplissage : plus proche cellule valide de la même rangée (ou de la rangée de départ)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, dans = i >= iM - 1e-9 && i <= iL + 1e-9 && j < jmax + 0.5 && (f > 0 || i === Math.round(iPointe));
      const avant = estValide(g.z[k]);
      if (!dans) { if (avant) { z[k] = NaN; retires++; } continue; }
      let v = g.z[k];
      if (!avant) {
        const e = ligne || eS, ii = Math.min(e[1], Math.max(e[0], i)); v = g.z[j * nx + ii]; if (!estValide(v)) v = g.z[jS * nx + Math.min(b0, Math.max(a0, i))]; ajoutes++;
      }
      z[k] = v + (plateau - v) * lisse(jFonduDe, jFonduA, j);
    }
  }
  return { grille: { ...g, z }, rapport: { applique: true, rangee_depart: jS, pointe_i: iPointe, plateau_mm: plateau, noeuds_retires: retires, noeuds_ajoutes: ajoutes } };
}

/**
 * Case « Moulage des têtes métatarsiennes » décochée : le relief du devant (têtes, espaces entre les têtes) devient un plateau (relief médian des têtes), raccordé en douceur à la voûte qui,
 * elle, est GARDÉE. Le contour n'est pas modifié. Pur : rend { grille, rapport } (grille neuve, entrée intacte).
 */
export function aplatirTetes(g, params = {}) {
  const P = { ...FORME_SEMELLE, ...params }, { nx, ny, pas } = g;
  let jmin = Infinity, jmax = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (estValide(g.z[j * nx + i])) { if (j < jmin) jmin = j; if (j > jmax) jmax = j; }
  if (jmin === Infinity) throw new RangeError('têtes métatarsiennes : empreinte vide');
  const span = jmax - jmin;
  if (span * pas < 120) return { grille: g, rapport: { applique: false, raison: 'pied trop court' } };
  const val = []; for (let j = jmin + Math.round(0.74 * span); j <= jmin + Math.round(0.78 * span); j++) for (let i = 0; i < nx; i++) { const v = g.z[j * nx + i]; if (estValide(v)) val.push(v); }
  val.sort((x, y) => x - y); const plateau = val.length ? val[val.length >> 1] : 0;
  const z = Float32Array.from(g.z), d0 = jmin + P.tetes_de * span, d1 = jmin + (P.tetes_de + P.tetes_fondu) * span, f0 = jmin + P.tetes_fin * span, f1 = jmin + (P.tetes_fin + P.tetes_fin_fondu) * span;
  let cellules = 0, ecart_max = 0;
  for (let j = Math.floor(d0); j <= jmax; j++) {
    const w = lisse(d0, d1, j) * (1 - lisse(f0, f1, j)); if (w <= 0) continue;
    for (let i = 0; i < nx; i++) { const k = j * nx + i, v = g.z[k]; if (!estValide(v)) continue; z[k] = v + (plateau - v) * w; cellules++; ecart_max = Math.max(ecart_max, Math.abs(v - z[k])); }
  }
  return { grille: { ...g, z }, rapport: { applique: true, plateau_mm: plateau, cellules, ecart_max_mm: ecart_max } };
}
