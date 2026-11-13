// Gravure sous la semelle (lot 4c, demande de Joël 02/11) : NOM COMPLET du patient, lettre du pied (D / G) et DATE, en creux sur le DESSOUS.
// Pur : aucune dépendance au DOM. Police bitmap gras intégrée (donnees/police_gravure.js, générée sans dépendance d'exécution).
//
// Repère du texte : on le lit en RETOURNANT la semelle (vue de dessous, non miroir) ; le sens de lecture est le long du pied, du talon vers l'avant-pied (+y),
// le haut des lettres vers +x. (Vu de dessous, droite × haut doit pointer vers l'observateur, donc vers -z : y × x = -z.)
// Lignes : 1 = nom complet ; 2 = « D · JJ/MM/AAAA » (ou G). La ligne 1 est la plus haute (x le plus grand).
import { POLICE } from '../donnees/police_gravure.js';
import { estValide } from './grille.js';
import { EPAISSEUR_BASE_MIN_MM } from '../constantes.js';

export const GRAVURE = Object.freeze({
  profondeur_defaut_mm: 0.4, profondeur_max_mm: 1.0, // un creux plus profond n'a pas de sens sur une base de 1 à 2 mm
  hauteurs_mm: Object.freeze([7, 6, 5.5, 5, 4.5]),    // hauteur de capitale, essayée de la plus grande à la plus petite
  interligne: 0.5,                                    // écart entre les lignes, en fraction de la hauteur de capitale
  marge_mm: 2.5,                                      // marge entre le texte et le contour du pied
  epaisseur_gravee_min_mm: 0.1,                       // en dessous, la profondeur réellement obtenue est trop faible : cellule non gravée, avertissement
  centre_pct: 0.55, plage_pct: Object.freeze([0.2, 0.9]),
});

const CAPITALE_PX = POLICE.capitale;

// Nettoie un texte : espaces normalisés ; les caractères absents de la police sont remplacés par « ? ».
export function nettoyerTexte(t) {
  return String(t ?? '').replace(/\s+/g, ' ').trim().split('').map((c) => (POLICE.glyphes[c] ? c : '?')).join('');
}
export const lettrePied = (cote) => { if (cote !== 'D' && cote !== 'G') throw new TypeError('gravure : pied D ou G attendu'); return cote; };
export function lignesGravure({ nom, date }, cote) {
  const n = nettoyerTexte(nom), d = nettoyerTexte(date);
  return [n, lettrePied(cote) + (d ? ' · ' + d : '')].filter((l) => l.length > 0);
}

// Largeur d'une ligne en pixels de police.
export function largeurPx(ligne) { let w = 0; for (const c of ligne) w += POLICE.glyphes[c].a; return w; }

// Pixels allumés d'une ligne : tableau de Uint8Array(rangée haut->bas) de largeur largeurPx. Retourne { w, h, get(col, rangee) }.
export function bitmapLigne(ligne) {
  const w = largeurPx(ligne), h = POLICE.haut + POLICE.bas, cases = new Uint8Array(w * h);
  let x0 = 0;
  for (const c of ligne) {
    const g = POLICE.glyphes[c];
    for (let y = 0; y < h; y++) for (let x = 0; x < g.l; x++) if ((g.r[y] >> x) & 1 && x0 + x < w) cases[y * w + x0 + x] = 1;
    x0 += g.a;
  }
  return { w, h, cases };
}

// Gravure : modifie finale.bas (le dessous remonte dans les pixels du texte) et renvoie le compte rendu.
// finale : { nx, ny, pas, ox, oy, haut, bas, dx?, dy? } ; options : { nom, date, profondeur_mm, actif }.
export function graver(finale, options, cote) {
  const info = { actif: false, lignes: [], hauteur_lettre_mm: 0, profondeur_mm: 0, cellules: 0, cellules_trop_minces: 0, bloc: null, avertissements: [] };
  if (!options || options.actif === false) return info;
  const lignes = lignesGravure(options, cote);
  if (lignes.length === 0) { info.avertissements.push('gravure : aucun texte à graver'); return info; }
  const prof = Number.isFinite(options.profondeur_mm) ? options.profondeur_mm : GRAVURE.profondeur_defaut_mm;
  if (!(prof > 0) || prof > GRAVURE.profondeur_max_mm) throw new RangeError('gravure : profondeur de ' + prof + ' mm hors de 0 à ' + GRAVURE.profondeur_max_mm + ' mm');
  const { nx, ny, pas, ox, oy, haut, bas, dx, dy } = finale;
  // étendue en y de l'empreinte et nœuds valides
  let jmin = -1, jmax = -1;
  for (let j = 0; j < ny; j++) { let v = false; for (let i = 0; i < nx && !v; i++) if (estValide(haut[j * nx + i])) v = true; if (v) { if (jmin < 0) jmin = j; jmax = j; } }
  if (jmin < 0) { info.avertissements.push('gravure : empreinte vide'); return info; }
  const longueur = (jmax - jmin) * pas;
  const posX = (i, j) => ox + i * pas + (dx ? dx[j * nx + i] : 0), posY = (i, j) => oy + j * pas + (dy ? dy[j * nx + i] : 0);
  const bitmaps = lignes.map(bitmapLigne);
  const epaisseurMin = EPAISSEUR_BASE_MIN_MM + GRAVURE.epaisseur_gravee_min_mm;
  const ok = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && estValide(haut[j * nx + i]) && haut[j * nx + i] - bas[j * nx + i] >= epaisseurMin;
  // Bloc de texte en repère (u = le long de +y, v = vers +x) ; pxmm = taille d'un pixel de police.
  const essai = (hcap, yc) => {
    const pxmm = hcap / CAPITALE_PX, hl = (POLICE.haut + POLICE.bas) * pxmm, inter = GRAVURE.interligne * hcap;
    const largeurs = bitmaps.map((b) => b.w * pxmm), W = Math.max(...largeurs), Hb = bitmaps.length * hl + (bitmaps.length - 1) * inter;
    // centre en x : milieu de l'empreinte à la rangée centrale du bloc ; on cherche le x qui garde tout le rectangle dans le pied
    const jc = Math.round((yc - oy) / pas); if (jc < 0 || jc >= ny) return null;
    let a = Infinity, b = -Infinity; for (let i = 0; i < nx; i++) if (estValide(haut[jc * nx + i])) { const x = posX(i, jc); if (x < a) a = x; if (x > b) b = x; }
    if (!(b > a)) return null;
    const xc = (a + b) / 2, u0 = yc - W / 2, v1 = xc + Hb / 2; // v1 = haut du bloc (x le plus grand)
    // test du rectangle (marge comprise) : tous les nœuds valides et assez épais
    const m = GRAVURE.marge_mm;
    for (let j = Math.floor((u0 - m - oy) / pas); j <= Math.ceil((u0 + W + m - oy) / pas); j++) for (let i = Math.floor((v1 - Hb - m - ox) / pas); i <= Math.ceil((v1 + m - ox) / pas); i++) { if (!ok(i, j)) return null; }
    return { pxmm, hl, inter, W, Hb, u0, v1, xc, yc, largeurs };
  };
  let choix = null;
  const centres = [GRAVURE.centre_pct]; for (let d = 0.03; d <= 0.5; d += 0.03) { centres.push(GRAVURE.centre_pct + d, GRAVURE.centre_pct - d); }
  const yDe = (pct) => oy + jmin * pas + pct * longueur;
  for (const h of GRAVURE.hauteurs_mm) { for (const pct of centres) { if (pct < GRAVURE.plage_pct[0] || pct > GRAVURE.plage_pct[1]) continue; const r = essai(h, yDe(pct)); if (r) { choix = { ...r, hcap: h, pct }; break; } } if (choix) break; }
  if (!choix) {
    let epMax = 0; for (let k = 0; k < haut.length; k++) if (estValide(haut[k])) epMax = Math.max(epMax, haut[k] - bas[k]);
    if (epMax < epaisseurMin) { info.avertissements.push('gravure : semelle trop fine (' + epMax.toFixed(2) + ' mm, il en faut au moins ' + epaisseurMin.toFixed(1) + ' mm) : non gravé'); info.lignes = lignes; return info; }
  }
  if (!choix) { info.avertissements.push('gravure : le texte « ' + lignes[0] + ' » ne tient pas sous la semelle (même à ' + GRAVURE.hauteurs_mm[GRAVURE.hauteurs_mm.length - 1] + ' mm de haut) : non gravé. Raccourcir le nom.'); info.lignes = lignes; return info; }
  if (choix.hcap < GRAVURE.hauteurs_mm[0]) info.avertissements.push('gravure : lettres réduites à ' + choix.hcap + ' mm de haut pour tenir sous la semelle');
  // Gravure nœud par nœud : le nœud est dans un pixel allumé ?
  const { pxmm, hl, inter, u0, v1, largeurs, W } = choix;
  let cellules = 0, minces = 0, profMax = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!estValide(haut[k])) continue;
    const u = posY(i, j), v = posX(i, j);
    if (u < u0 || u >= u0 + W || v > v1 || v < v1 - choix.Hb) continue;
    // quelle ligne ? (v1 - v) mesure la distance depuis le haut du bloc
    const dv = v1 - v, nl = Math.min(lignes.length - 1, Math.floor(dv / (hl + inter))), reste = dv - nl * (hl + inter);
    if (reste >= hl) continue; // dans l'interligne
    const bm = bitmaps[nl], decal = (W - largeurs[nl]) / 2; // lignes centrées entre elles
    const col = Math.floor((u - u0 - decal) / pxmm), row = Math.floor(reste / pxmm);
    if (col < 0 || col >= bm.w || row < 0 || row >= bm.h || !bm.cases[row * bm.w + col]) continue;
    const d = Math.min(prof, haut[k] - bas[k] - EPAISSEUR_BASE_MIN_MM);
    if (d < GRAVURE.epaisseur_gravee_min_mm) { minces++; continue; }
    bas[k] += d; cellules++; if (d > profMax) profMax = d;
  }
  info.actif = cellules > 0; info.lignes = lignes; info.hauteur_lettre_mm = choix.hcap; info.profondeur_mm = Math.round(profMax * 100) / 100; info.cellules = cellules; info.cellules_trop_minces = minces;
  info.bloc = { u0, u1: u0 + W, v0: v1 - choix.Hb, v1, centre_pct: Math.round(choix.pct * 100) };
  if (profMax < prof - 1e-6 && cellules > 0) info.avertissements.push('gravure : profondeur limitée à ' + info.profondeur_mm.toFixed(2) + ' mm (il doit rester ' + EPAISSEUR_BASE_MIN_MM + ' mm de semelle)');
  if (minces > 0) info.avertissements.push('gravure : ' + minces + ' point(s) du texte non gravés (semelle trop fine à cet endroit)');
  return info;
}
