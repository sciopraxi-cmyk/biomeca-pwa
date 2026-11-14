// Base de la semelle (lot 2) : moulage, épaisseur, lissage, trois types, contour lissé, biseau médial.
// Fonctions pures. Script §5.5 : H_base = épaisseur + taux × (G_σ(H_plantaire) − min(H_plantaire)).
import { flouGauss } from './flou.js';
import { lisserContour, distanceAuxSources, regulariserMasque } from './contour.js';
import { formeSemelle, aplatirTetes } from './forme_semelle.js';
import { estValide } from './grille.js';
import { TYPES_BASE, BASE_DEFAUTS, CONTOUR_LISSAGE, EPAISSEUR_BASE_MIN_MM, EPAISSEUR_BASE_MAX_MM, LISSAGE_SIGMA_MM, BISEAU_MEDIAL, EPAISSEUR_TOTALE_AVERTISSEMENT_MM, DEMI_SEMELLE } from '../constantes.js';
import { trouverMateriau } from './materiaux.js';
import { smoothstep } from './elements.js';

// Lissage gaussien séparable qui respecte le masque (NaN hors contour, rien ne traverse un trou).
export function lisserGauss(g, sigma_mm) {
  if (!(sigma_mm > 0)) throw new RangeError('lissage : sigma > 0 requis');
  return { ...g, z: Float32Array.from(flouGauss(g.z, g.nx, g.ny, g.pas, sigma_mm, 'masque')) };
}

export function validerParametresBase(p = {}) {
  const q = { ...BASE_DEFAUTS, ...p };
  const nombre = (v, nom) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('base : ' + nom + ' doit être un nombre'); return v; };
  if (!TYPES_BASE.includes(q.type)) throw new TypeError('base : type inconnu « ' + q.type + ' » (attendu : ' + TYPES_BASE.join(', ') + ')');
  nombre(q.taux, 'taux'); nombre(q.epaisseur_mm, 'épaisseur'); nombre(q.lissage_mm, 'lissage');
  if (q.taux < 0 || q.taux > 1) throw new RangeError('base : taux de moulage hors de 0 à 100 %');
  if (q.epaisseur_mm < EPAISSEUR_BASE_MIN_MM || q.epaisseur_mm > EPAISSEUR_BASE_MAX_MM) {
    throw new RangeError('base : épaisseur ' + q.epaisseur_mm + ' mm hors de ' + EPAISSEUR_BASE_MIN_MM + ' à ' + EPAISSEUR_BASE_MAX_MM + ' mm');
  }
  if (q.lissage_mm < LISSAGE_SIGMA_MM.min || q.lissage_mm > LISSAGE_SIGMA_MM.max) {
    throw new RangeError('base : lissage ' + q.lissage_mm + ' mm hors de ' + LISSAGE_SIGMA_MM.min + ' à ' + LISSAGE_SIGMA_MM.max + ' mm');
  }
  // Lot 3 bis : étendue (entière / demi-semelle) et 2e matériau devant.
  if (q.etendue !== 'entiere' && q.etendue !== 'demi') throw new TypeError('base : étendue « ' + q.etendue + ' » inconnue (attendu : entiere, demi)');
  if (q.devant !== 'rien' && q.devant !== 'materiau2') throw new TypeError('base : « devant » doit être rien ou materiau2');
  nombre(q.limite_pct, 'limite de la demi-semelle');
  if (q.limite_pct < DEMI_SEMELLE.limite_min_pct || q.limite_pct > DEMI_SEMELLE.limite_max_pct) {
    throw new RangeError('base : limite ' + q.limite_pct + ' % hors de ' + DEMI_SEMELLE.limite_min_pct + ' à ' + DEMI_SEMELLE.limite_max_pct + ' %');
  }
  if (q.epaisseur_devant_mm === null || q.epaisseur_devant_mm === undefined) q.epaisseur_devant_mm = q.epaisseur_mm; // décision de Joël : même épaisseur par défaut
  nombre(q.epaisseur_devant_mm, 'épaisseur devant');
  if (q.epaisseur_devant_mm < EPAISSEUR_BASE_MIN_MM || q.epaisseur_devant_mm > EPAISSEUR_BASE_MAX_MM) {
    throw new RangeError('base : épaisseur devant ' + q.epaisseur_devant_mm + ' mm hors de ' + EPAISSEUR_BASE_MIN_MM + ' à ' + EPAISSEUR_BASE_MAX_MM + ' mm');
  }
  nombre(q.raccord_devant_mm, 'raccord devant');
  if (q.raccord_devant_mm < DEMI_SEMELLE.raccord_min_mm || q.raccord_devant_mm > DEMI_SEMELLE.raccord_max_mm) {
    throw new RangeError('base : raccord devant ' + q.raccord_devant_mm + ' mm hors de ' + DEMI_SEMELLE.raccord_min_mm + ' à ' + DEMI_SEMELLE.raccord_max_mm + ' mm (jamais nul)');
  }
  for (const [champ, v] of [['matériau de la base', q.materiau_id], ['matériau devant', q.materiau_devant_id]]) {
    if (v !== null && v !== undefined && typeof v !== 'string') throw new TypeError('base : ' + champ + ' invalide');
  }
  if (typeof q.forme_semelle !== 'boolean') throw new TypeError('base : forme_semelle doit être vrai ou faux');
  if (typeof q.moulage_tetes !== 'boolean') throw new TypeError('base : moulage_tetes doit être vrai ou faux');
  nombre(q.arrondi_mm, 'arrondi des angles de la demi-semelle');
  if (q.arrondi_mm < DEMI_SEMELLE.arrondi_min_mm || q.arrondi_mm > DEMI_SEMELLE.arrondi_max_mm) throw new RangeError('base : arrondi ' + q.arrondi_mm + ' mm hors de ' + DEMI_SEMELLE.arrondi_min_mm + ' à ' + DEMI_SEMELLE.arrondi_max_mm + ' mm');
  if (q.type === 'pleine_dessous') {
    if (q.cote !== 'D' && q.cote !== 'G') throw new Error('base intermédiaire : la latéralité (D/G) doit être confirmée pour placer le biseau médial');
    nombre(q.biseau_deg, 'angle du biseau');
    if (q.biseau_deg < BISEAU_MEDIAL.angle_min_deg || q.biseau_deg > BISEAU_MEDIAL.angle_max_deg) {
      throw new RangeError('base : angle du biseau hors de ' + BISEAU_MEDIAL.angle_min_deg + ' à ' + BISEAU_MEDIAL.angle_max_deg + '°');
    }
    nombre(q.biseau_lateral_deg, 'angle du biseau latéral');
    if (q.biseau_lateral_deg !== 0 && (q.biseau_lateral_deg < BISEAU_MEDIAL.angle_min_deg || q.biseau_lateral_deg > BISEAU_MEDIAL.angle_max_deg)) {
      throw new RangeError('base : angle du biseau latéral hors de ' + BISEAU_MEDIAL.angle_min_deg + ' à ' + BISEAU_MEDIAL.angle_max_deg + '° (0 = aucun biseau latéral)');
    }
  }
  return q;
}

// Dessous de la base intermédiaire : partant du dessous « thermoformé » (haut − épaisseur), il s'abaisse jusqu'au plan
// z = 0 en s'éloignant du contour médial, à l'angle donné : bas = max(0, haut − épaisseur − d × tan(angle)).
export function biseauMedial(haut, epaisseur_mm, distanceMedial, angle_deg) {
  const t = Math.tan((angle_deg * Math.PI) / 180);
  const bas = new Float32Array(haut.length);
  for (let k = 0; k < haut.length; k++) {
    const e = typeof epaisseur_mm === 'number' ? epaisseur_mm : epaisseur_mm[k]; // épaisseur variable (2e matériau devant)
    bas[k] = estValide(haut[k]) ? Math.max(0, haut[k] - e - distanceMedial[k] * t) : NaN;
  }
  return bas;
}

// Distance au contour LISSÉE : la distance calculée depuis des cellules en marches de 0,5 mm est quantifiée ; le dessous de la biseau en gardait
// des dents (retour de Joël : « les bords sont dentelés »). Un flou léger (sigma en mm) rend la pente continue ; 0 sur les sources n'est plus exact (<= sigma / 2 d'écart).
export function lisserDistance(g, d, sigma_mm) {
  const f = Float64Array.from(d, (v) => (Number.isFinite(v) ? v : 1e4));
  return Float32Array.from(flouGauss(f, g.nx, g.ny, g.pas, sigma_mm, 'zero'));
}

// Fin d'une demi-semelle : rangées au-delà de jl retirées, puis OUVERTURE morphologique (érosion puis dilatation par un disque de rayon R)
// limitée à la bande proche de la coupe : les deux pointes (médiale et latérale) deviennent des arcs de rayon R ; le reste du contour ne bouge pas.
export function arrondirFin(g, jl, rayon_mm) {
  const { nx, ny, pas } = g, n = nx * ny;
  const z = Float32Array.from(g.z);
  for (let k = 0; k < n; k++) if (Math.floor(k / nx) > jl) z[k] = NaN;
  if (!(rayon_mm > 0)) return { ...g, z };
  const invalide = new Uint8Array(n);
  for (let k = 0; k < n; k++) invalide[k] = estValide(z[k]) ? 0 : 1;
  const d1 = distanceAuxSources(nx, ny, pas, invalide);
  const eroded = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const i = k % nx, j = Math.floor(k / nx);
    const dBord = Math.min(i + 1, nx - i, j + 1, ny - j) * pas; // l'extérieur de la grille compte comme « hors contour »
    eroded[k] = !invalide[k] && Math.min(d1[k], dBord) >= rayon_mm - 1e-9 ? 1 : 0;
  }
  const d2 = distanceAuxSources(nx, ny, pas, eroded);
  const bande = jl - Math.ceil((5 * rayon_mm) / pas); // les pointes très aiguës s'étendent jusqu'à plusieurs rayons le long du bord
  for (let k = 0; k < n; k++) if (!invalide[k] && d2[k] > rayon_mm + 1e-9 && Math.floor(k / nx) > bande) z[k] = NaN;
  return { ...g, z };
}

export function construireBase(plantaire, params = {}, cat = null) {
  const p = validerParametresBase(params);
  const infoMat = (id) => {
    if (id === null || id === undefined) return null;
    if (!cat) throw new Error('matériaux : tableau non chargé (impossible de vérifier « ' + id + ' »)');
    const m = trouverMateriau(cat, id);
    return { id: m.id, libelle: m.libelle, shore: m.shore, resistance_kgm3: m.resistance_kgm3, epaisseur_feuille_mm: m.epaisseur_mm };
  };
  const matBase = infoMat(p.materiau_id);
  // Retouches du devant (l'empreinte d'origine n'est jamais modifiée) : 1) têtes métatarsiennes non moulées (la voûte est gardée), 2) devant arrondi sans orteils.
  const plantaire0 = plantaire; // empreinte d'origine : sert à garder le MÊME niveau de base (la voûte ne bouge pas)
  const at = p.moulage_tetes ? null : aplatirTetes(plantaire);
  if (at) plantaire = at.grille;
  const fs = p.forme_semelle ? formeSemelle(plantaire) : null;
  if (fs) plantaire = fs.grille;
  // Contour lissé : masque régularisé (dents et vagues effacées) AVANT le calcul de la hauteur.
  // Étendue : rangées de l'empreinte (talon = 1re rangée valide) ; en demi-semelle la base va du talon à la rangée limite.
  let jmin = Infinity, jmax = -Infinity;
  for (let j = 0; j < plantaire.ny; j++) for (let i = 0; i < plantaire.nx; i++) if (estValide(plantaire.z[j * plantaire.nx + i])) { if (j < jmin) jmin = j; if (j > jmax) jmax = j; }
  if (jmin === Infinity) throw new RangeError('base : empreinte vide');
  const demi = p.etendue === 'demi';
  const jl = demi ? jmin + Math.round((p.limite_pct / 100) * (jmax - jmin)) : jmax; // dernière rangée de la base (matériau 1)
  const avecDevant = demi && p.devant === 'materiau2';
  const matDevant = avecDevant ? infoMat(p.materiau_devant_id) : null;
  // Demi-semelle SANS rien devant : coupe droite sur la rangée limite, angles avant ARRONDIS (retour de Joël : « 2 pointes à l'avant »).
  const src = demi && !avecDevant ? arrondirFin(plantaire, jl, p.arrondi_mm) : plantaire;
  const reg = p.contour_lisse ? regulariserMasque(src, CONTOUR_LISSAGE.sigma_masque_mm) : null;
  const g = reg ? reg.grille : src;
  const n = g.z.length;
  let mn = Infinity;
  for (let k = 0; k < n; k++) if (estValide(g.z[k]) && g.z[k] < mn) mn = g.z[k];
  if (mn === Infinity) throw new RangeError('base : empreinte vide');
  if (at || fs) { // le niveau de référence reste celui de l'empreinte d'origine : aplatir les têtes ou arrondir le devant ne soulève ni ne baisse la voûte
    const lim = demi && !avecDevant ? jl : plantaire0.ny - 1;
    for (let j = 0; j <= lim; j++) for (let i = 0; i < plantaire0.nx; i++) { const v = plantaire0.z[j * plantaire0.nx + i]; if (estValide(v) && v < mn) mn = v; }
  }
  // Bords qui remontent d'une empreinte creusée (grille.murs, hors du pied) : ils ne changent JAMAIS le contour de la semelle (le pied seul le fixe)
  // mais entrent dans le lissage du moulage, pour que le bord de la base épouse la paroi.
  const murs = plantaire0.murs && plantaire0.murs.length === g.z.length ? plantaire0.murs : null;
  let gMoulage = g;
  if (murs) {
    // Les cellules du pied retirées par la régularisation du contour (dents effacées) n'ont ni hauteur ni mur : elles laissaient des TROUS dans le
    // champ du lissage, d'où des sauts de ~2 mm sur le bord (retour de Joël : « les bords sont dentelés »). On y remet la hauteur d'origine du pied.
    const z = new Float32Array(g.z.length), z0 = plantaire0.z, rMax = demi && !avecDevant ? jl : Infinity;
    for (let k = 0; k < z.length; k++) {
      if (estValide(g.z[k])) z[k] = g.z[k];
      else if (Number.isFinite(murs[k])) z[k] = murs[k];
      else if (reg && z0.length === z.length && Number.isFinite(z0[k]) && Math.floor(k / g.nx) <= rMax) z[k] = z0[k];
      else z[k] = NaN;
    }
    gMoulage = { ...g, z };
  }
  const G = lisserGauss(gMoulage, p.lissage_mm);
  const taux = p.type === 'plate' ? 0 : p.taux;
  const haut = new Float32Array(n), bas = new Float32Array(n);
  // Épaisseur par rangée : celle de la base, puis (2e matériau devant) transition lisse vers l'épaisseur de devant, centrée sur la limite.
  const yLim = (jl - jmin + 0.5) * g.pas; // frontière entre la rangée jl (base) et jl + 1 (devant)
  const ep = new Float32Array(n);
  const zone = new Uint8Array(n); // 0 hors contour, 1 base, 2 2e matériau devant
  for (let k = 0; k < n; k++) {
    const j = Math.floor(k / g.nx);
    const y = (j - jmin) * g.pas;
    ep[k] = avecDevant ? p.epaisseur_mm + (p.epaisseur_devant_mm - p.epaisseur_mm) * smoothstep(yLim - p.raccord_devant_mm / 2, yLim + p.raccord_devant_mm / 2, y) : p.epaisseur_mm;
    zone[k] = !estValide(g.z[k]) ? 0 : (j <= jl ? 1 : (avecDevant ? 2 : 0));
  }
  const masqueComplet = new Uint8Array(n);
  for (let k = 0; k < n; k++) masqueComplet[k] = estValide(plantaire.z[k]) ? 1 : 0;
  for (let k = 0; k < n; k++) {
    if (!estValide(g.z[k])) { haut[k] = NaN; bas[k] = NaN; continue; }
    haut[k] = p.type === 'plate' ? ep[k] : ep[k] + taux * Math.max(0, G.z[k] - mn);
    bas[k] = p.type === 'thermoformee' || p.type === 'pleine_dessous' ? Math.max(0, haut[k] - ep[k]) : 0;
  }
  const base = { nx: g.nx, ny: g.ny, pas: g.pas, ox: g.ox, oy: g.oy, haut, bas, dx: null, dy: null };
  let contour = null;
  if (p.contour_lisse) contour = lisserContour({ ...g, z: haut }, { champ: reg.champ, deplacementMaxPas: CONTOUR_LISSAGE.deplacement_max_regularise_pas });
  else if (p.type === 'pleine_dessous') contour = lisserContour({ ...g, z: haut });
  if (p.contour_lisse && contour) { base.dx = contour.dx; base.dy = contour.dy; }
  // Hauteur AU POINT DÉPLACÉ : un nœud du contour glisse de dx, dy vers le vrai bord, mais gardait la hauteur de sa cellule : le long d'un bord oblique,
  // la hauteur montait par marches de ~0,3 mm (×3 avec le relief : « les bords sont dentelés »). On la corrige au 1er ordre avec la pente locale du moulage.
  if (p.contour_lisse && contour) {
    const nx = g.nx, ny = g.ny, h0 = Float32Array.from(haut);
    const pente = (k, i, j, di, dj) => { // dérivée de h0 selon (di, dj), centrée si les deux voisins existent, sinon unilatérale, 0 si aucun
      const kp = (j + dj) * nx + (i + di), km = (j - dj) * nx + (i - di);
      const vp = i + di >= 0 && i + di < nx && j + dj >= 0 && j + dj < ny && estValide(h0[kp]), vm = i - di >= 0 && i - di < nx && j - dj >= 0 && j - dj < ny && estValide(h0[km]);
      if (vp && vm) return (h0[kp] - h0[km]) / (2 * g.pas);
      if (vp) return (h0[kp] - h0[k]) / g.pas;
      if (vm) return (h0[k] - h0[km]) / g.pas;
      return 0;
    };
    for (let k = 0; k < n; k++) {
      if (!contour.bord[k] || !estValide(haut[k]) || (contour.dx[k] === 0 && contour.dy[k] === 0)) continue;
      const i = k % nx, j = Math.floor(k / nx);
      const dh = pente(k, i, j, 1, 0) * contour.dx[k] + pente(k, i, j, 0, 1) * contour.dy[k];
      const borne = Math.max(-1, Math.min(1, dh)); // la correction reste petite (déplacement <= 1,2 pas)
      haut[k] += borne;
      if (p.type === 'thermoformee' || p.type === 'pleine_dessous') bas[k] = Math.max(0, haut[k] - ep[k]);
    }
  }
  // Nœuds du contour de l'empreinte COMPLÈTE (avant la coupe en demi-semelle) : servent aux éléments de bord (voûte…).
  if (!contour) contour = lisserContour({ ...g, z: haut });
  base.contourBord = { bord: contour.bord, normX: contour.normX, normY: contour.normY };
  base.ep = ep; base.zone = zone; base.masqueComplet = masqueComplet;
  let biseau = null;
  if (p.type === 'pleine_dessous') {
    const med = p.cote === 'D' ? -1 : 1; // pied droit : côté médial en -X (repère du lot 1)
    const cosOuv = Math.cos((BISEAU_MEDIAL.ouverture_deg * Math.PI) / 180);
    const sources = new Uint8Array(n);
    let ns = 0;
    // Talon : chaque biseau contourne l'arrière du talon jusqu'à son milieu (retour de Joël : « on doit voir un talon qui a le biseau »).
    // Axe du talon = x moyen des cellules des rangées du talon ; sont ajoutés les nœuds du contour qui regardent vers l'arrière, du côté du biseau.
    const jTalon = jmin + Math.round(BISEAU_MEDIAL.talon_pct / 100 * (jmax - jmin));
    let sxT = 0, nT = 0;
    for (let j = jmin; j <= jmin + Math.round(0.15 * (jmax - jmin)); j++) for (let i = 0; i < g.nx; i++) if (estValide(haut[j * g.nx + i])) { sxT += g.ox + i * g.pas; nT++; }
    const axeTalon = nT ? sxT / nT : 0;
    const surTalon = (k, signe) => { // signe = +1 : côté médial ; -1 : côté latéral
      const j = Math.floor(k / g.nx), i = k % g.nx;
      return j <= jTalon && contour.normY[k] < 0 && (g.ox + i * g.pas - axeTalon) * med * signe >= 0;
    };
    let talonMed = 0, talonLat = 0;
    for (let k = 0; k < n; k++) if (contour.bord[k] && (contour.normX[k] * med >= cosOuv || surTalon(k, 1))) { sources[k] = 1; ns++; if (surTalon(k, 1)) talonMed++; }
    if (ns === 0) throw new Error('base intermédiaire : aucun contour médial trouvé');
    const d = lisserDistance(g, distanceAuxSources(g.nx, g.ny, g.pas, sources), BISEAU_MEDIAL.lissage_mm);
    base.bas = biseauMedial(haut, ep, d, p.biseau_deg);
    let largeur = 0;
    for (let k = 0; k < n; k++) if (estValide(haut[k]) && base.bas[k] > 0 && d[k] > largeur) largeur = d[k];
    biseau = { angle_deg: p.biseau_deg, cote: p.cote, noeuds_contour_medial: ns, largeur_max_mm: largeur, lateral: null, talon: { noeuds_medial: talonMed, noeuds_lateral: 0, axe_x_mm: axeTalon } };
    // Biseau LATÉRAL : même règle, avec le contour dont la normale pointe vers l'extérieur du pied du côté latéral (opposé au médial) ; talon et avant-pied inchangés.
    // Le dessous est le plus haut des deux dessous (le biseau le plus proche du point domine).
    if (p.biseau_lateral_deg > 0) {
      const srcL = new Uint8Array(n);
      let nl = 0;
      for (let k = 0; k < n; k++) if (contour.bord[k] && (contour.normX[k] * med <= -cosOuv || surTalon(k, -1))) { srcL[k] = 1; nl++; if (surTalon(k, -1)) talonLat++; }
      if (nl === 0) throw new Error('base intermédiaire : aucun contour latéral trouvé');
      const dl = lisserDistance(g, distanceAuxSources(g.nx, g.ny, g.pas, srcL), BISEAU_MEDIAL.lissage_mm);
      const basL = biseauMedial(haut, ep, dl, p.biseau_lateral_deg);
      let largL = 0;
      for (let k = 0; k < n; k++) if (estValide(haut[k])) { if (basL[k] > base.bas[k]) base.bas[k] = basL[k]; if (basL[k] > 0 && dl[k] > largL) largL = dl[k]; }
      biseau.talon.noeuds_lateral = talonLat; biseau.lateral = { angle_deg: p.biseau_lateral_deg, noeuds_contour_lateral: nl, largeur_max_mm: largL };
    }
  }
  let ep0 = Infinity, ep1 = -Infinity, h1 = -Infinity;
  for (let k = 0; k < n; k++) {
    if (!estValide(haut[k])) continue;
    ep0 = Math.min(ep0, haut[k] - base.bas[k]); ep1 = Math.max(ep1, haut[k] - base.bas[k]); h1 = Math.max(h1, haut[k]);
  }
  const avertissements = [];
  if (h1 > EPAISSEUR_TOTALE_AVERTISSEMENT_MM) avertissements.push('Épaisseur totale de ' + h1.toFixed(1) + ' mm (> ' + EPAISSEUR_TOTALE_AVERTISSEMENT_MM + ' mm) : risque de ne pas tenir dans la chaussure.');
  const longueur = (jmax - jmin) * g.pas;
  const zones = [{ zone: 'base', y_de_mm: 0, y_a_mm: (jl - jmin) * g.pas, materiau: matBase, epaisseur_mm: p.epaisseur_mm }];
  if (avecDevant) zones.push({ zone: 'devant', y_de_mm: (jl + 1 - jmin) * g.pas, y_a_mm: longueur, materiau: matDevant, epaisseur_mm: p.epaisseur_devant_mm });
  if (avecDevant && !matDevant) avertissements.push('2e matériau devant non choisi');
  if (avecDevant && matBase && matDevant && matBase.id !== matDevant.id) avertissements.push('Base en 2 matériaux : le STL ne contient qu\'un seul volume ; le matériau de chaque zone est dans le rapport (3MF multi-volumes = version 2).');
  for (const [nom, m, e] of [['base', matBase, p.epaisseur_mm], ['devant', matDevant, p.epaisseur_devant_mm]]) {
    if (m && m.epaisseur_feuille_mm !== null && e > m.epaisseur_feuille_mm + 1e-6) avertissements.push('épaisseur ' + e + ' mm (' + nom + ') plus grande que la feuille du matériau « ' + m.libelle + ' » (' + m.epaisseur_feuille_mm + ' mm)');
  }
  const rapport = {
    etendue: { mode: p.etendue, limite_pct: demi ? p.limite_pct : 100, limite_mm: (jl - jmin) * g.pas, y_limite_abs_mm: g.oy + (jl - jmin + 0.5) * g.pas + jmin * g.pas, longueur_empreinte_mm: longueur, devant: demi ? p.devant : null, epaisseur_devant_mm: avecDevant ? p.epaisseur_devant_mm : null, raccord_devant_mm: avecDevant ? p.raccord_devant_mm : null },
    zones,
    forme_semelle: fs ? { ...fs.rapport } : { applique: false },
    moulage_tetes: p.moulage_tetes, tetes_aplaties: at ? { ...at.rapport } : { applique: false },
    type: p.type, taux_effectif: taux, epaisseur_mm: p.epaisseur_mm, lissage_mm: p.lissage_mm, contour_lisse: !!p.contour_lisse,
    hauteur_plantaire_min_mm: mn,
    epaisseur_min_mm: ep0, epaisseur_max_mm: ep1, hauteur_max_mm: h1,
    contour: contour ? (p.contour_lisse ? { ...contour.stats, ...reg.stats, sigma_masque_mm: CONTOUR_LISSAGE.sigma_masque_mm } : { ...contour.stats, deplacement_max_mm: 0, deplacement_moyen_mm: 0, non_applique: true }) : null,
    biseau, avertissements,
  };
  return { ...base, rapport };
}

// Coupe 2D pour contrôle visuel : T = transversale à y = pos_mm, L = longitudinale à x = pos_mm.
export function extraireCoupe(b, plantaire, mode, pos_mm) {
  const { nx, ny, pas, ox, oy } = b;
  const T = mode === 'T';
  if (!T && mode !== 'L') throw new TypeError('coupe : mode T ou L');
  const j0 = Math.min(ny - 1, Math.max(0, Math.round((pos_mm - oy) / pas)));
  const i0 = Math.min(nx - 1, Math.max(0, Math.round((pos_mm - ox) / pas)));
  const m = T ? nx : ny;
  const coord = new Float32Array(m), haut = new Float32Array(m), bas = new Float32Array(m), scan = new Float32Array(m);
  for (let a = 0; a < m; a++) {
    const k = T ? j0 * nx + a : a * nx + i0;
    coord[a] = T ? ox + a * pas + (b.dx ? b.dx[k] : 0) : oy + a * pas + (b.dy ? b.dy[k] : 0);
    haut[a] = b.haut[k]; bas[a] = b.bas[k]; scan[a] = plantaire.z[k];
  }
  return { mode, position_mm: T ? oy + j0 * pas : ox + i0 * pas, coord, haut, bas, scan };
}
