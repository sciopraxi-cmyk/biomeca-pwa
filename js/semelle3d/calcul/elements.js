// Éléments paramétriques (lot 3) : coin pronateur postérieur en degrés, soutien de voûte, couches signées, outil de coupe.
// Fonctions pures. Script §5.6 : E = signe × hauteur × profil(t, u) × raccord(d) dans le repère local de l'élément.
// Formules reprises de celles de PODAXIA (documents/elements-podaxia/extrait/generer_elements.py), sans le plancher de 0,4 mm
// (l'élément s'ajoute à la base : sa couche vaut 0 au bord, le raccord smoothstep la fait arriver à plat).
//
// Repère local : t = distance vers le MÉDIAL (le fichier PODAXIA a le médial en X+ ; le prototype l'a en -X pour un pied droit),
// u = distance depuis le bord postérieur de l'emprise. Plan : x = cx + med × t, med = -1 (pied D) ou +1 (pied G).
import { estValide } from './grille.js';
import { reperTalon } from './reperage.js';
import { coucheSkive, validerSkiveEl } from './skive.js';
import { controlerPhi, coucheTorsion, angleFrontal, vecteursAxe, poidsZone, coordonneesAxe, versHenke } from './axe-henke.js';
import { trouverMateriau, controlerChoixMateriau } from './materiaux.js';
import { HENKE, ELEMENTS, POINT_CURSEUR, ROTATION_PLAN, COIN_POSTERIEUR, SOUTIEN_VOUTE, ELEMENT_BORD, BISEAU_ELEMENT, EPAISSEUR_BASE_MIN_MM, EPAISSEUR_TOTALE_AVERTISSEMENT_MM, RECOUVREMENT, PERCAGE } from '../constantes.js';
import { distanceBords, biseauDessous } from './bords.js';
import { couchePinceau, validerCoups } from './pinceau.js';
import { typesBibliotheque, HAUTEUR_IMPORTE_MM, ANGLE_COIN_IMPORTE_DEG, ETIREMENT_IMPORTE, DOUCEUR_IMPORTE_MM, hauteurMinimaleImporte } from './bibliotheque.js';

function maxTableau(t) { let m = -Infinity; for (let k = 0; k < t.length; k++) if (t[k] > m) m = t[k]; return m; } // Math.max(...t) déborde de la pile sur une grille entière
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
export function smoothstep(e0, e1, v) { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
function sdfRectArrondi(x, y, cx, cy, w, l, r) {
  const qx = Math.abs(x - cx) - (w / 2 - r), qy = Math.abs(y - cy) - (l / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sdfTalon(t, u, w, l) {
  const r = w / 2;
  return Math.min(Math.hypot(t, u - r) - r, sdfRectArrondi(t, u, 0, r + (l - r) / 2, w, l - r, 6));
}
function sdfEllipse(t, u, cx, cy, a, b) { return (Math.sqrt(((t - cx) / a) ** 2 + ((u - cy) / b) ** 2) - 1) * Math.min(a, b); }

const LICENCE = 'PODAXIA — usage Verticy autorisé par le fondateur, 31/10/2026';
// Éléments de BORD (lot 3 bis, décision de Joël 31/10) : ils se collent au bord par définition -> même règle que la voûte.
// Dessus : sommet AU bord (sans décroissance, pente nulle au bord), descente en cosinus sur `largeur_mm` vers le milieu de la semelle ;
// dessous : biseau (angle réglable, 45° par défaut) comme la base intermédiaire. Position : seulement le long du pied (dy_mm).
// Pente d'extrémité (raccord) par défaut = la MOITIÉ de la longueur de l'élément (retour de Joël : « on dirait des marches d'escalier ») :
// l'élément est une bosse continue, sans plateau raide ; réglable (jamais nul, plafonné à la moitié de la longueur).
const bordType = (libelle, zone, ref, bords, h, largeur, longueur, dy, raccord = longueur / 2) => Object.freeze({
  libelle, zone, reference_fournisseur: 'PODAXIA ' + ref, licence: LICENCE, bord: true, bords: Object.freeze(bords),
  defauts: Object.freeze({ dx_mm: 0, hauteur_mm: h, largeur_mm: largeur, longueur_mm: longueur, dy_mm: dy, raccord_mm: raccord, biseau_deg: BISEAU_ELEMENT.defaut_deg }),
});
const TYPES_PARAMETRIQUES = {
  // Matériau de RECOUVREMENT (retour de Joël 31/10) : une couche d'épaisseur constante sur TOUTE la semelle, par-dessus les éléments (appliquée en dernier).
  recouvrement: Object.freeze({
    libelle: 'Matériau de recouvrement (toute la semelle)', zone: 'Toute la semelle', reference_fournisseur: 'PODAXIA — matériau du tableau', licence: LICENCE, recouvrement: true,
    defauts: Object.freeze({ dx_mm: 0, dy_mm: 0, hauteur_mm: 1, largeur_mm: 1, longueur_mm: 1, raccord_mm: 1 }),
    u0: () => 0, distance: () => -1, profil: () => 0, plateau_fin: () => Infinity,
  }),

  // POINT CURSEUR (lot 4b) : poignée posée sur la surface ; on la monte (bosse, hauteur > 0) ou on la descend (creux, hauteur < 0) ; 0 = au niveau de la semelle ; profil en cosinus surélevé, hauteur au 1/10 mm, rayon réglable.
  // Pas de second raccord (le profil est déjà doux) ; jamais de perçage : un creux s'arrête à EPAISSEUR_BASE_MIN_MM de reste.
  point_curseur: Object.freeze({
    libelle: 'Point curseur', zone: 'Points', reference_fournisseur: 'Verticy — point curseur', licence: 'Verticy', point: true,
    defauts: Object.freeze({ dx_mm: 0, dy_mm: 100, hauteur_mm: 0, rayon_mm: 10, largeur_mm: 20, longueur_mm: 20, raccord_mm: 1 }),
    u0: () => 0,
    distance: (p, t, u) => p.rayon_mm - Math.hypot(t, u),
    profil: (p, t, u) => p.hauteur_mm * (0.5 + 0.5 * Math.cos((Math.PI * Math.hypot(t, u)) / p.rayon_mm)),
    plateau_fin: () => Infinity,
  }),

  // PINCEAU (lot 4d) : lissage / remplissage local par des passages de disque (voir calcul/pinceau.js). Couche signée, sans géométrie propre : ni poignée, ni matériau, ni rotation.
  pinceau: Object.freeze({
    libelle: 'Pinceau (lissage / remplissage)', zone: 'Retouches', reference_fournisseur: 'Verticy — pinceau', licence: 'Verticy', pinceau: true,
    defauts: Object.freeze({ dx_mm: 0, dy_mm: 0, hauteur_mm: 0, largeur_mm: 1, longueur_mm: 1, raccord_mm: 1, coups: Object.freeze([]) }),
    u0: () => 0, distance: () => -1, profil: () => 0, plateau_fin: () => Infinity,
  }),

  // TORSION (lot 4 bis) : torsion de la semelle autour de l'axe de Henke du pied (voir calcul/axe-henke.js). Couche >= 0 (mode « ajout »), sans géométrie propre : ni poignée, ni matériau, ni rotation.
  torsion: Object.freeze({
    libelle: 'Torsion autour de l\'axe de Henke', zone: 'Retouches', reference_fournisseur: 'Verticy — axe de Henke', licence: 'Verticy', pinceau: true, torsion: true,
    defauts: Object.freeze({ dx_mm: 0, dy_mm: 0, hauteur_mm: 0, largeur_mm: 1, longueur_mm: 1, raccord_mm: 1, phi_deg: HENKE.phi.defaut_deg, zone_torsion: 'totale', s_charniere_mm: 100, transition_mm: 20, mode: 'ajout', phi_confirme: false }),
    u0: () => 0, distance: () => -1, profil: () => 0, plateau_fin: () => Infinity,
  }),

  // SKIVE DE KIRBY (lot 4 bis, étape 4) : rainure au bord médial ou latéral de l'arrière-pied (voir calcul/skive.js). Couche négative bornée par l'épaisseur minimale ; sans matériau, poignée ni rotation.
  skive: Object.freeze({
    libelle: 'Skive de Kirby (talon)', zone: 'Retouches', reference_fournisseur: 'Verticy — skive de Kirby', licence: 'Verticy', pinceau: true, skive: true,
    defauts: Object.freeze({ dx_mm: 0, dy_mm: 0, hauteur_mm: 0, largeur_mm: 1, longueur_mm: 1, raccord_mm: 1, bord_skive: 'medial', profondeur_mm: 2, angle_skive_deg: HENKE.skive.angle_defaut_deg, longueur_skive_mm: HENKE.skive.longueur_defaut_mm, debut_skive_mm: 0 }),
    u0: () => 0, distance: () => -1, profil: () => 0, plateau_fin: () => Infinity,
  }),

  // Contour en DEMI-ELLIPSE vue de dessus (demande de Joël, 02/11) : côté plat sur le bord médial, arrondi vers le bord externe, grand axe d'avant en arrière (longueur) et demi-axe = étendue.
  voute_bord: Object.freeze({ ...bordType('Voûte au bord médial', 'Médio-pied', '10_soutien_de_voute', ['medial'], 7, 36, 78, 109), demiEllipse: true }),
  flange_mediale: bordType('Flange médiale', 'Arrière-pied', '08_flange_mediale', ['medial'], 10, 7, 70, 35),
  arche_externe: bordType('Arche externe', 'Médio-pied', '14_arche_externe', ['lateral'], 3, 20, 60, 110),
  aileron: bordType('Aileron', 'Avant-pied', '25_aileron', ['lateral'], 2.5, 14, 50, 170),
  cuvette_talonniere: bordType('Cuvette talonnière', 'Arrière-pied', '06_cuvette_talonniere', ['medial', 'lateral', 'posterieur'], 10, 30, 70, 35),
  coin_pronateur_posterieur: Object.freeze({
    libelle: 'Coin pronateur postérieur', zone: 'Arrière-pied', reference_fournisseur: 'PODAXIA 01_coin_pronateur_posterieur', licence: LICENCE,
    defauts: Object.freeze({ largeur_mm: 56, longueur_mm: 70, angle_deg: 4, raccord_mm: ELEMENTS.raccord_defaut_mm, dx_mm: 0, dy_mm: 0, ancrage: 'bord' }),
    coteHaut: 'lateral', plateauRatio: COIN_POSTERIEUR.decroissance_debut, // ancrage 'bord' : dy = début du coin (0 = bord du talon) ; 'libre' : dy = centre de l'emprise
    u0: (p) => p.longueur_mm / 2, // le centre de l'emprise est à mi-longueur
    distance: (p, t, u) => -sdfTalon(t, u, p.largeur_mm, p.longueur_mm),
    // rampe transversale : haut côté LATÉRAL (t = -largeur/2), nulle côté médial ; diminue vers l'avant
    profil: (p, t, u) => (p.largeur_mm / 2 - t) * Math.tan(rad(p.angle_deg)) * (1 - smoothstep(COIN_POSTERIEUR.decroissance_debut * p.longueur_mm, p.longueur_mm, u)),
    plateau_fin: (p) => COIN_POSTERIEUR.decroissance_debut * p.longueur_mm,
  }),
  soutien_de_voute: Object.freeze({
    libelle: 'Soutien de voûte', zone: 'Médio-pied', reference_fournisseur: 'PODAXIA 10_soutien_de_voute', licence: LICENCE,
    defauts: Object.freeze({ largeur_mm: 36, longueur_mm: 78, hauteur_mm: 7, raccord_mm: 10, dx_mm: 8, dy_mm: 100 }),
    u0: (p) => p.longueur_mm / 2,
    distance: (p, t, u) => -sdfEllipse(t, u, 0, p.longueur_mm / 2, p.largeur_mm / 2, p.longueur_mm / 2),
    // cloche gaussienne décalée côté médial (proportions du fichier fourni : 6/18, 2/39, 12/18, 22/39)
    profil: (p, t, u) => {
      const a = p.largeur_mm / 2, b = p.longueur_mm / 2;
      return p.hauteur_mm * Math.exp(-(((t - a / 3) / (a * 2 / 3)) ** 2 + ((u - b - b * 2 / 39) / (b * 22 / 39)) ** 2));
    },
    plateau_fin: () => Infinity,
  }),
};
// + les 23 éléments de la bibliothèque PODAXIA (lot 4a), importés depuis les STL (cartes de hauteur)
export const TYPES_ELEMENTS = Object.freeze({ ...TYPES_PARAMETRIQUES, ...typesBibliotheque() });

export const TYPES_BORD = Object.freeze(Object.keys(TYPES_ELEMENTS).filter((k) => TYPES_ELEMENTS[k].bord));

const nombre = (v, nom) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('élément : ' + nom + ' doit être un nombre'); return v; };
const dans = (v, nom, { min, max }, unite) => { nombre(v, nom); if (v < min || v > max) throw new RangeError('élément : ' + nom + ' ' + v + ' hors de ' + min + ' à ' + max + ' ' + unite); return v; };

// Valide et complète un élément. Coin : angle (°) OU hauteur au bord (mm), l'autre est déduit (h = largeur × tan θ, script §5.7).
export function validerElement(el, cat) {
  if (!el || typeof el !== 'object') throw new TypeError('élément invalide');
  const T = TYPES_ELEMENTS[el.type];
  if (!T) throw new TypeError('élément : type inconnu « ' + el.type + ' » (attendu : ' + Object.keys(TYPES_ELEMENTS).join(', ') + ')');
  const p = { ...T.defauts, ...el };
  nombre(p.dx_mm, 'dx'); nombre(p.dy_mm, 'dy'); nombre(p.raccord_mm, 'raccord');
  if (!(p.raccord_mm > 0)) throw new RangeError('élément : le raccord ne peut pas être nul (script §5.6)');
  p.signe = el.signe === undefined ? (T.signe_defaut === undefined ? 1 : T.signe_defaut) : el.signe;
  if (p.signe !== 1 && p.signe !== -1) throw new RangeError('élément : signe 1 (ajout) ou -1 (décharge)');
  const avert = [];
  if (!T.importe && !T.pinceau && p.raccord_mm < ELEMENTS.raccord_min_mm) avert.push('raccord de ' + p.raccord_mm + ' mm (< ' + ELEMENTS.raccord_min_mm + ' mm) : confort réduit');
  if (T.torsion) {
    const c = controlerPhi(p.phi_deg); // refuse NaN ; indique le niveau d'alerte
    if (c.bloque) throw new RangeError('torsion : |phi| = ' + Math.abs(p.phi_deg) + '° dépasse la limite de ' + HENKE.phi.blocage_deg + '° (refusé)');
    const arrondi = Math.round(p.phi_deg / HENKE.phi.pas_deg) * HENKE.phi.pas_deg;
    if (Math.abs(arrondi - p.phi_deg) > 1e-9) { avert.push('phi arrondi au pas de ' + HENKE.phi.pas_deg + '° : ' + arrondi + '°'); p.phi_deg = arrondi; }
    if (!['totale', 'arriere', 'avant'].includes(p.zone_torsion)) throw new RangeError('torsion : zone « totale », « arriere » ou « avant »');
    if (p.mode !== 'ajout') throw new RangeError('torsion : seul le mode « ajout » est disponible (on n\'enlève jamais de matière)');
    nombre(p.s_charniere_mm, 'position de la charnière');
    if (!(p.transition_mm >= 10)) throw new RangeError('torsion : largeur de transition >= 10 mm exigée');
    p.phi_confirme = p.phi_confirme === true; p.angle_deg = null; p.signe = 1; p.materiau_id = null; p.shore_a = null; p.coups = [];
    const n = controlerPhi(p.phi_deg).niveau;
    if (n === 'orange') avert.push('⚠ |phi| = ' + Math.abs(p.phi_deg) + '° dépasse ' + HENKE.phi.orange_deg + '° (alerte orange)');
    if (n === 'rouge') avert.push('🔴 |phi| = ' + Math.abs(p.phi_deg) + '° dépasse ' + HENKE.phi.rouge_deg + '° : ' + (p.phi_confirme ? 'confirmé par le praticien' : 'CONFIRMATION requise (torsion non appliquée)'));
  } else if (T.skive) {
    validerSkiveEl(p); p.angle_deg = null; p.signe = 1; p.materiau_id = null; p.shore_a = null; p.coups = [];
  } else if (T.pinceau) {
    p.coups = validerCoups(el.coups); p.angle_deg = null; p.signe = 1; p.materiau_id = null; p.shore_a = null;
  } else if (T.bord) {
    dans(p.hauteur_mm, 'hauteur', ELEMENT_BORD.hauteur_mm, 'mm'); dans(p.largeur_mm, 'largeur', ELEMENT_BORD.largeur_mm, 'mm'); dans(p.longueur_mm, 'longueur', ELEMENT_BORD.longueur_mm, 'mm');
    dans(p.biseau_deg, 'biseau', { min: BISEAU_ELEMENT.min_deg, max: BISEAU_ELEMENT.max_deg }, '°');
    p.angle_deg = null; p.bords = T.bords;
  } else if (T.point) {
    dans(p.rayon_mm, 'rayon du point', POINT_CURSEUR.rayon_mm, 'mm'); p.rayon_mm = Math.round(p.rayon_mm * 10) / 10; p.largeur_mm = p.longueur_mm = 2 * p.rayon_mm;
    dans(p.hauteur_mm, 'hauteur du point', POINT_CURSEUR.hauteur_mm, 'mm'); p.hauteur_mm = Math.round(p.hauteur_mm * 10) / 10;
    p.angle_deg = null; p.signe = 1;
  } else if (T.recouvrement) {
    dans(p.hauteur_mm, 'épaisseur du recouvrement', RECOUVREMENT.epaisseur_mm, 'mm'); p.angle_deg = null; p.signe = 1;
  } else if (T.importe) {
    const F = T.fiche; // élément importé : emprise (largeur, longueur) fixée par le fichier ; hauteur (ou angle pour un coin) réglable
    p.raccord_mm = T.defauts.raccord_mm; // pas de second raccord : celui du fichier est dans le relief
    // étirement en plan : largeur et longueur réglables (facteur 0,5 à 3 de l'emprise du fichier) ; la pente d'un coin est conservée (hauteur ∝ largeur)
    dans(p.largeur_mm, 'largeur', { min: T.largeur_ref_mm * ETIREMENT_IMPORTE.facteur_min, max: T.largeur_ref_mm * ETIREMENT_IMPORTE.facteur_max }, 'mm');
    dans(p.longueur_mm, 'longueur', { min: T.longueur_ref_mm * ETIREMENT_IMPORTE.facteur_min, max: T.longueur_ref_mm * ETIREMENT_IMPORTE.facteur_max }, 'mm');
    if (F.coin) p.douceur_mm = 0; else dans(p.douceur_mm, 'douceur des bords', DOUCEUR_IMPORTE_MM, 'mm');
    if (F.coin) {
      const aDonne = el.angle_deg !== undefined && el.angle_deg !== null, hDonne = el.hauteur_mm !== undefined && el.hauteur_mm !== null;
      if (aDonne && hDonne) throw new TypeError('coin : donner l\'angle OU la hauteur, pas les deux');
      if (hDonne) { nombre(el.hauteur_mm, 'hauteur'); if (!(el.hauteur_mm > 0)) throw new RangeError('élément : hauteur > 0 requise'); p.angle_deg = deg(Math.atan(el.hauteur_mm / (F.coin.largeur_ref_mm * (p.largeur_mm / T.largeur_ref_mm)))); }
      else if (!aDonne) p.angle_deg = F.coin.angle_ref_deg;
      dans(p.angle_deg, 'angle', ANGLE_COIN_IMPORTE_DEG, '°');
      p.hauteur_mm = F.coin.largeur_ref_mm * (p.largeur_mm / T.largeur_ref_mm) * Math.tan(rad(p.angle_deg)); // hauteur au bord nominale = largeur du fichier × tan θ (comme le coin du lot 3)
    } else {
      dans(p.hauteur_mm, p.signe < 0 ? 'profondeur' : 'hauteur', { min: hauteurMinimaleImporte(F), max: HAUTEUR_IMPORTE_MM.max }, 'mm');
      p.angle_deg = null;
    }
  } else if (el.type === 'coin_pronateur_posterieur') {
    dans(p.largeur_mm, 'largeur', COIN_POSTERIEUR.largeur_mm, 'mm'); dans(p.longueur_mm, 'longueur', COIN_POSTERIEUR.longueur_mm, 'mm');
    const aDonne = el.angle_deg !== undefined && el.angle_deg !== null, hDonne = el.hauteur_mm !== undefined && el.hauteur_mm !== null;
    if (aDonne && hDonne) throw new TypeError('coin : donner l\'angle OU la hauteur au bord, pas les deux');
    if (hDonne) { nombre(el.hauteur_mm, 'hauteur'); if (!(el.hauteur_mm > 0)) throw new RangeError('élément : hauteur > 0 requise'); p.angle_deg = deg(Math.atan(el.hauteur_mm / p.largeur_mm)); }
    dans(p.angle_deg, 'angle', COIN_POSTERIEUR.angle_deg, '°');
    p.hauteur_mm = p.largeur_mm * Math.tan(rad(p.angle_deg));
  } else {
    dans(p.largeur_mm, 'largeur', SOUTIEN_VOUTE.largeur_mm, 'mm'); dans(p.longueur_mm, 'longueur', SOUTIEN_VOUTE.longueur_mm, 'mm');
    dans(p.hauteur_mm, 'hauteur', SOUTIEN_VOUTE.hauteur_mm, 'mm');
    p.angle_deg = null;
  }
  if (T.coteHaut) { // coin : ancrage au bord de la semelle (côté haut, sommet plein au bord) ou libre (position libre, ancien comportement)
    p.ancrage = el.ancrage === undefined ? 'bord' : el.ancrage;
    if (p.ancrage !== 'bord' && p.ancrage !== 'libre') throw new RangeError('coin : ancrage « bord » ou « libre »');
    if (p.ancrage === 'bord') p.dx_mm = 0;
  }
  // rotation dans le plan (lot 4b), autour du centre de l'élément : ni bord, ni recouvrement, ni coin (l'angle de coin se mesure sur la coupe), ni coin ancré
  const rotable = !T.bord && !T.recouvrement && !T.coteHaut && !(T.importe && T.fiche.coin);
  p.angle_plan_deg = rotable && el.angle_plan_deg !== undefined && el.angle_plan_deg !== null ? dans(el.angle_plan_deg, 'rotation', ROTATION_PLAN, '°') : 0;
  p.materiau_id = el.materiau_id === undefined ? null : el.materiau_id;
  p.shore_a = el.shore_a === undefined ? null : el.shore_a;
  p.visible = el.visible === undefined ? true : !!el.visible;
  p.id = el.id || 'el';
  p.source = T.importe ? { type: 'stl', fichier: T.fiche.fichier, mode_hauteur: T.fiche.coin ? 'angle' : T.fiche.mode_hauteur, reference_fournisseur: T.reference_fournisseur, licence: T.licence } : { type: 'parametrique', reference_fournisseur: T.reference_fournisseur, licence: T.licence };
  p.comblement_materiau_id = el.comblement_materiau_id === undefined ? null : el.comblement_materiau_id; // décharge : matériau qui comble le trou percé
  if (p.comblement_materiau_id !== null) trouverMateriau(cat, p.comblement_materiau_id);
  if (p.materiau_id !== null) trouverMateriau(cat, p.materiau_id);
  return { ...p, avertissements: avert };
}

// Repère « talon_centre » : milieu du contour à 30 mm du point le plus postérieur ; y = point le plus postérieur.
export { reperTalon };

const sensMedial = (cote) => { if (cote !== 'D' && cote !== 'G') throw new Error('éléments : la latéralité (D/G) doit être confirmée pour placer un élément (elle décide du côté médial)'); return cote === 'D' ? -1 : 1; };

// ---- Coin ANCRÉ AU BORD (retour de Joël 31/10) : la partie la plus haute démarre directement au bord de la semelle, côté haut, sans déport ni retombée.
// Dans chaque rangée de la grille, t' = distance TRANSVERSALE depuis le dernier nœud du côté haut (t' = 0 au bord) ; hauteur = tan θ × (largeur − t') : rampe plane,
// pleine hauteur au bord (h = largeur × tan θ), nulle à `largeur` du bord. Un coude lisse (genou de k mm) évite l'arête à l'extrémité intérieure de la rampe sans changer
// la pente ni la hauteur au bord. Le long du pied : début adouci sur `raccord_mm` (sauf coin qui démarre au talon, dy ≤ 0,5), décroissance vers l'avant comme le fichier PODAXIA.
export const genouCoin = (largeur_mm) => Math.min(8, largeur_mm / 3);
function indicesBordRangee(haut, nx, j, versX) { // premier/dernier nœud valide d'une rangée, côté demandé (versX = +1 : bord en +X)
  let a = -1, b = -1;
  for (let i = 0; i < nx; i++) if (estValide(haut[j * nx + i])) { if (a < 0) a = i; b = i; }
  return a < 0 ? null : (versX > 0 ? b : a);
}
function profilCoinBord(el, t, u, T) { // t = distance au bord (mm, ≥ 0), u = distance depuis le début du coin (mm)
  const W = el.largeur_mm, k = genouCoin(W), r = W + k / 2 - t;
  if (!(r > 0) || u < 0 || u > el.longueur_mm) return 0;
  const g = r >= k ? r - k / 2 : (r * r) / (2 * k);
  const fin = 1 - smoothstep(T.plateauRatio * el.longueur_mm, el.longueur_mm, u);
  const debut = el.dy_mm <= 0.5 ? 1 : smoothstep(0, Math.min(el.raccord_mm, el.longueur_mm / 4), u);
  return Math.tan(rad(el.angle_deg)) * g * fin * debut;
}
function coucheCoinBord(base, el, rep, med) {
  const T = TYPES_ELEMENTS[el.type];
  const { nx, ny, pas, oy, haut } = base;
  const versX = (T.coteHaut === 'medial' ? med : -med); // côté du bord, en X
  const z = new Float32Array(nx * ny);
  const y0 = rep.y_mm + el.dy_mm;
  let emprise = 0, hmax = 0;
  for (let j = 0; j < ny; j++) {
    const u = oy + j * pas - y0;
    if (u < 0 || u > el.longueur_mm) continue;
    const e = indicesBordRangee(haut, nx, j, versX);
    if (e === null) continue;
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!estValide(haut[k])) continue;
      const t = (e - i) * versX * pas;
      if (t < 0) continue;
      const v = profilCoinBord(el, t, u, T);
      if (v > 0) { z[k] = v; if (v > 0.05) emprise++; if (v > hmax) hmax = v; }
    }
  }
  return { z, emprise_cellules: emprise, dehors_cellules: 0, hauteur_max_mm: hmax, hauteur_min_mm: 0, centre: { x_mm: rep.x_mm, y_mm: y0 + 0.25 * el.longueur_mm } };
}

// Couche d'un élément de BORD : h × (0,5 + 0,5 cos(π d / largeur)) × enveloppe longitudinale ; d = distance au(x) bord(s) de l'élément.
function coucheBord(base, el, rep, cote) {
  const T = TYPES_ELEMENTS[el.type];
  const { nx, ny, pas, oy, haut } = base;
  const dist = distanceBords(base, cote, T.bords);
  const cy = rep.y_mm + el.dy_mm, demiL = el.longueur_mm / 2;
  const posterieur = T.bords.includes('posterieur'); // le bord postérieur est le bord du pied : pas d'extrémité arrière à adoucir
  const z = new Float32Array(nx * ny);
  let emprise = 0, hmax = 0, hmin = 0;
  // Demi-ellipse : rho = sqrt((d / étendue)² + ((y - milieu) / (longueur / 2))²) ; l'emprise est exactement rho < 1. Plateau au centre (rho <= p) puis descente en cosinus ;
  // p = 1 - raccord / (longueur / 2) : le raccord par défaut (la moitié de la longueur) donne une calotte douce, un raccord plus petit un sommet plus plat et des flancs plus raides.
  if (T.demiEllipse) {
    const p = Math.min(0.95, Math.max(0, 1 - Math.min(el.raccord_mm, demiL) / demiL));
    for (let j = 0; j < ny; j++) {
      const s = (oy + j * pas - cy) / demiL; if (!(Math.abs(s) < 1)) continue;
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (!estValide(haut[k])) continue;
        const rho = Math.hypot(dist[k] / el.largeur_mm, s); if (!(rho < 1)) continue;
        emprise++;
        const f = rho <= p ? 1 : 0.5 + 0.5 * Math.cos((Math.PI * (rho - p)) / (1 - p));
        const v = el.signe * el.hauteur_mm * f; z[k] = v; if (v > hmax) hmax = v; if (v < hmin) hmin = v;
      }
    }
    return { z, emprise_cellules: emprise, dehors_cellules: 0, hauteur_max_mm: hmax, hauteur_min_mm: hmin, centre: { x_mm: rep.x_mm, y_mm: cy } };
  }
  for (let j = 0; j < ny; j++) {
    const y = oy + j * pas, dl = Math.min(demiL - (y - cy), posterieur ? Infinity : demiL + (y - cy));
    if (!(dl > 0)) continue;
    const env = smoothstep(0, Math.min(el.raccord_mm, demiL), dl); // jamais plus que la moitié de la longueur : le sommet reste atteint
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (!estValide(haut[k]) || !(dist[k] < el.largeur_mm)) continue;
      emprise++;
      const v = el.signe * el.hauteur_mm * (0.5 + 0.5 * Math.cos((Math.PI * dist[k]) / el.largeur_mm)) * env;
      z[k] = v; if (v > hmax) hmax = v; if (v < hmin) hmin = v;
    }
  }
  return { z, emprise_cellules: emprise, dehors_cellules: 0, hauteur_max_mm: hmax, hauteur_min_mm: hmin, centre: { x_mm: rep.x_mm, y_mm: cy } };
}

// Couche d'un élément sur la grille de la base : Float32Array (0 hors emprise, hors contour = 0).
export function coucheElement(base, el, rep, cote) {
  const T = TYPES_ELEMENTS[el.type];
  if (T.recouvrement) { // épaisseur constante sur tout le contour du pied
    const z = new Float32Array(base.haut.length); let n = 0;
    for (let k = 0; k < z.length; k++) if (estValide(base.haut[k])) { z[k] = el.hauteur_mm; n++; }
    return { z, emprise_cellules: n, dehors_cellules: 0, hauteur_max_mm: el.hauteur_mm, hauteur_min_mm: 0, centre: { x_mm: rep.x_mm, y_mm: rep.y_mm } };
  }
  const med = sensMedial(cote);
  if (T.coteHaut && el.ancrage === 'bord') return coucheCoinBord(base, el, rep, med);
  if (T.bord) return coucheBord(base, el, rep, cote);
  const { nx, ny, pas, ox, oy, haut } = base;
  const cx = rep.x_mm + med * el.dx_mm, cy = rep.y_mm + el.dy_mm, u0 = T.u0(el);
  const z = new Float32Array(nx * ny);
  let emprise = 0, dehors = 0, hmax = 0, hmin = 0;
  // On parcourt l'emprise de l'élément, grille du scan ou non : une partie hors de la grille est « hors contour » aussi.
  const theta = rad(el.angle_plan_deg || 0), cs = Math.cos(theta), sn = Math.sin(theta), tourne = theta !== 0;
  const pu = T.importe ? el.longueur_mm / 2 : u0; // pivot de la rotation (repère local t, u) : centre de l'élément
  const R = (tourne ? Math.hypot(el.largeur_mm, el.longueur_mm) : Math.max(el.largeur_mm, el.longueur_mm)) + 2 + (T.importe ? 30 : 0);
  const i0 = Math.floor((cx - R - ox) / pas), i1 = Math.ceil((cx + R - ox) / pas);
  // élément importé : y part du BORD ARRIÈRE (u0 = 0) ; la marge de 30 mm couvre le flou des bords
  const j0 = Math.floor((cy - (T.importe && !tourne ? 30 : R) - oy) / pas), j1 = Math.ceil((cy + (T.importe && !tourne ? el.longueur_mm + 30 : R) - oy) / pas);
  for (let j = j0; j <= j1; j++) {
    const y = oy + j * pas, u = y - cy + u0;
    for (let i = i0; i <= i1; i++) {
      const x = ox + i * pas; let t = (x - cx) * med, uu = u;
      if (tourne) { const a = t, b = u - pu; t = a * cs - b * sn; uu = a * sn + b * cs + pu; } // coordonnées dans le repère de l'élément avant rotation
      const d = T.distance(el, t, uu);
      if (!(d > 0)) continue;
      const pr = T.profil(el, t, uu), visible = T.point || !T.importe || pr > 0.05; // queue du flou (< 0,05 mm) : écrite, mais ni emprise ni « hors contour »
      if (visible) emprise++;
      if (i < 0 || j < 0 || i >= nx || j >= ny) { if (visible) dehors++; continue; }
      const k = j * nx + i;
      if (!estValide(haut[k])) { if (visible) dehors++; continue; }
      const v = el.signe * pr * ((T.importe || T.point) ? 1 : smoothstep(0, el.raccord_mm, d));
      z[k] = v; if (v > hmax) hmax = v; if (v < hmin) hmin = v;
    }
  }
  return { z, emprise_cellules: emprise, dehors_cellules: dehors, hauteur_max_mm: hmax, hauteur_min_mm: hmin, centre: { x_mm: cx, y_mm: cy } };
}

// Pinceau : agit sur la surface TELLE QU'ELLE EST à son rang (éléments précédents compris).
function coucheDuPinceau(finale, el, rep, cote) {
  const r = couchePinceau(finale, el, rep, sensMedial(cote));
  return { z: r.z, emprise_cellules: r.cellules, dehors_cellules: 0, hauteur_max_mm: r.hauteur_max_mm, hauteur_min_mm: r.hauteur_min_mm, centre: r.centre };
}

// Skive : retire de la matière au bord de l'arrière-pied, sur la surface TELLE QU'ELLE EST à son rang (éléments précédents compris).
function coucheDeLaSkive(finale, base, el, rep, cote) {
  const r = coucheSkive(finale, base, el, rep, cote);
  return { z: r.z, emprise_cellules: r.emprise, dehors_cellules: 0, hauteur_max_mm: 0, hauteur_min_mm: 0, // pas de « décharge » : le plancher d'épaisseur est déjà appliqué
    centre: { x_mm: rep.x_mm, y_mm: rep.y_mm + el.debut_skive_mm + el.longueur_skive_mm / 2 }, avertissements: r.avertissements,
    skive: { bord: el.bord_skive, profondeur_mm: el.profondeur_mm, profondeur_reelle_mm: r.profondeur_reelle_mm, angle_deg: el.angle_skive_deg, largeur_mm: r.largeur_mm, longueur_mm: el.longueur_skive_mm, debut_mm: el.debut_skive_mm, cellules: r.cellules, limitees: r.limitees } };
}

// Torsion : agit sur la surface TELLE QU'ELLE EST à son rang (éléments précédents compris), autour de l'axe de Henke VALIDÉ du pied. Sans axe validé (ou phi > 10° non confirmé) : aucune matière, signalé.
function coucheDeLaTorsion(finale, el, rep, cote, axe) {
  const n = finale.haut.length;
  let raison = null;
  if (!axe) raison = 'axe de Henke absent : torsion non appliquée';
  else if (axe.valide !== true) raison = 'axe de Henke NON VALIDÉ : torsion non appliquée (validez l\'axe dans la carte « Axe de Henke »)';
  else if (controlerPhi(el.phi_deg).confirmation && !el.phi_confirme) raison = 'phi supérieur à ' + HENKE.phi.rouge_deg + '° non confirmé : torsion non appliquée';
  let emprise = 0, jmin = Infinity, jmax = -Infinity; for (let k = 0; k < n; k++) if (estValide(finale.haut[k])) { emprise++; const j = Math.floor(k / finale.nx); if (j < jmin) jmin = j; if (j > jmax) jmax = j; }
  const yMilieu = finale.oy + ((jmin + jmax) / 2) * finale.pas; // la coupe se place au milieu du pied (la torsion n'a pas de position propre)
  const nul = { z: new Float32Array(n), emprise_cellules: emprise, dehors_cellules: 0, hauteur_max_mm: 0, hauteur_min_mm: 0, centre: { x_mm: rep.x_mm, y_mm: yMilieu }, torsion: { appliquee: false, raison, phi_deg: el.phi_deg, axe: axe || null, angle_frontal_deg: axe ? angleFrontal(el.phi_deg, axe) : null } };
  if (raison) return nul;
  const r = coucheTorsion(finale, axe, { phi_deg: el.phi_deg, zone: el.zone_torsion, sCharniere: el.s_charniere_mm, largeurTransition: el.transition_mm }, cote);
  let hmax = 0; for (let k = 0; k < n; k++) if (r.z[k] > hmax) hmax = r.z[k];
  return { ...nul, z: r.z, hauteur_max_mm: hmax, torsion: { ...nul.torsion, appliquee: el.phi_deg !== 0 } };
}

// H_finale = H_base + Σ couches. Le dessous (bas) ne change pas : l'élément s'ajoute sur la face fonctionnelle.
export function appliquerElements(base, elementsBruts, { cote, cat, axe } = {}) {
  const elements = (elementsBruts || []).map((e, n) => validerElement({ id: 'el_' + String(n + 1).padStart(3, '0'), ...e }, cat));
  const n = base.haut.length;
  const finale = { ...base, haut: Float32Array.from(base.haut), bas: Float32Array.from(base.bas), haut_base: base.haut, couches: [] };
  const avertissements = [];
  const infos = [];
  const rep = reperTalon(base);
  if (elements.length === 0) return { ...finale, elements: [], infos, rapport_elements: { nb: 0, avertissements, elements: infos, cumul_max_mm: 0, repere_talon: rep } };
  const ordre = [...elements.keys()].sort((a, b) => (TYPES_ELEMENTS[elements[a].type].recouvrement ? 1 : 0) - (TYPES_ELEMENTS[elements[b].type].recouvrement ? 1 : 0) || a - b); // le recouvrement passe en dernier
  const couchesIdx = [], infosIdx = [], torsionsBloquees = [];
  for (const idx of ordre) {
    const el = elements[idx];
    const T = TYPES_ELEMENTS[el.type];
    const c = T.torsion ? coucheDeLaTorsion(finale, el, rep, cote, axe) : T.skive ? coucheDeLaSkive(finale, base, el, rep, cote) : T.pinceau ? coucheDuPinceau(finale, el, rep, cote) : coucheElement(base, el, rep, cote);
    if (c.emprise_cellules === 0 || c.emprise_cellules === c.dehors_cellules) throw new RangeError('élément ' + el.id + ' (' + TYPES_ELEMENTS[el.type].libelle + ') entièrement hors du contour du pied : déplacement refusé');
    const pct = (100 * c.dehors_cellules) / c.emprise_cellules;
    const av = [...el.avertissements];
    if (pct > ELEMENTS.depassement_contour_avertissement_pct) av.push(pct.toFixed(1) + ' % de l\'emprise sort du contour du pied (partie coupée au contour)');
    const hMax = Math.max(c.hauteur_max_mm, -c.hauteur_min_mm);
    const choix = T.pinceau ? { materiau: null, avertissements: [] } : controlerChoixMateriau(el, hMax, cat); // le pinceau retouche la surface : pas de matériau propre
    av.push(...choix.avertissements);
    if (c.avertissements && el.visible) av.push(...c.avertissements);
    if (el.visible && T.point && el.hauteur_mm !== 0) { // creux d'un point curseur : on s'arrête à EPAISSEUR_BASE_MIN_MM de reste (jamais de trou)
      let limite = 0;
      for (let k = 0; k < n; k++) if (c.z[k] !== 0) {
        const nv = finale.haut[k] + c.z[k], plancher = Math.min(finale.haut[k], finale.bas[k] + EPAISSEUR_BASE_MIN_MM);
        if (c.z[k] < 0 && nv < plancher) { finale.haut[k] = plancher; limite++; } else finale.haut[k] = nv;
      }
      if (limite > 0) av.push('creux limité : ' + limite + ' cellule(s) arrêtées à ' + EPAISSEUR_BASE_MIN_MM + ' mm d\'épaisseur restante (pas de trou avec un point curseur)');
    } else if (el.visible && !T.point) for (let k = 0; k < n; k++) if (c.z[k] !== 0) finale.haut[k] += c.z[k];
    let perce = null;
    if (el.visible && !T.point && c.hauteur_min_mm < 0) { // décharge : creux jusqu'à la hauteur de la base = SEMELLE PERCÉE (voulu) ; comblement possible par un autre matériau
      const traversantes = [];
      let e = Infinity; for (let k = 0; k < n; k++) if (c.z[k] < 0) { const r = finale.haut[k] - finale.bas[k]; if (r < PERCAGE.seuil_mm) traversantes.push(k); else e = Math.min(e, r); }
      if (traversantes.length > 0) {
        const comble = el.comblement_materiau_id !== null;
        for (const k of traversantes) { if (comble) finale.haut[k] -= c.z[k]; else finale.haut[k] = NaN; } // comblé : la surface revient au niveau de la base ; sinon : trou
        const mm2 = traversantes.length * base.pas * base.pas;
        const mat = comble ? trouverMateriau(cat, el.comblement_materiau_id) : null;
        perce = { cellules: traversantes.length, surface_mm2: mm2, comble, comblement_materiau_id: el.comblement_materiau_id, comblement_materiau: mat ? mat.libelle : null };
        av.push(comble ? 'creux traversant de ' + mm2.toFixed(0) + ' mm² comblé par « ' + mat.libelle + ' » (même épaisseur que la base ; un STL ne porte qu\'un matériau : la zone est notée dans le rapport)' : 'semelle PERCÉE sur ' + mm2.toFixed(0) + ' mm² (creux jusqu\'au dessous)');
      }
      if (e < EPAISSEUR_BASE_MIN_MM) av.push('décharge : épaisseur restante autour du creux ' + e.toFixed(2) + ' mm (< ' + EPAISSEUR_BASE_MIN_MM + ' mm) : bord du trou fin');
    }
    if (T.bord && el.visible) { // dessous en biseau (règle de la base intermédiaire, appliquée à la semelle finie), seulement sous l'élément
      const ep = new Float32Array(n);
      for (let k = 0; k < n; k++) ep[k] = base.haut[k] - base.bas[k];
      const nouveau = biseauDessous(finale.haut, base.bas, ep, distanceBords(base, cote, T.bords), el.biseau_deg);
      for (let k = 0; k < n; k++) if (c.z[k] > 0 && nouveau[k] > finale.bas[k]) finale.bas[k] = nouveau[k];
    }
    if (T.torsion && el.visible) { // garde-fous d'épaisseur (la torsion n'enlève jamais de matière) : mesurés sur la semelle après cette couche
      if (c.torsion.raison) { torsionsBloquees.push(el.id + ' : ' + c.torsion.raison); av.push('⛔ ' + c.torsion.raison); }
      else if (c.torsion.appliquee) {
        let emax = -Infinity, emin = Infinity; for (let k = 0; k < n; k++) if (estValide(finale.haut[k])) { const e = finale.haut[k] - finale.bas[k]; if (e > emax) emax = e; if (e < emin) emin = e; }
        if (emax > EPAISSEUR_TOTALE_AVERTISSEMENT_MM) av.push('⚠ épaisseur totale de ' + emax.toFixed(1) + ' mm (> ' + EPAISSEUR_TOTALE_AVERTISSEMENT_MM + ' mm : chaussant)');
        if (emin < HENKE.epaisseur_min_alerte_mm) av.push('⚠ épaisseur minimale de ' + emin.toFixed(2) + ' mm (< ' + HENKE.epaisseur_min_alerte_mm + ' mm)');
      }
    }
    couchesIdx[idx] = { id: el.id, z: el.visible ? c.z : new Float32Array(n) };
    infosIdx[idx] = ({ id: el.id, type: el.type, libelle: TYPES_ELEMENTS[el.type].libelle, centre: c.centre, hauteur_max_mm: c.hauteur_max_mm, hauteur_min_mm: c.hauteur_min_mm,
      angle_deg: el.angle_deg, angle_plan_deg: el.angle_plan_deg, rayon_mm: el.rayon_mm === undefined ? null : el.rayon_mm, biseau_deg: T.bord ? el.biseau_deg : null, bords: T.bord ? T.bords : null, hauteur_reglee_mm: el.hauteur_mm, largeur_mm: el.largeur_mm, longueur_mm: el.longueur_mm, raccord_mm: el.raccord_mm,
      depassement_pct: pct, materiau_id: el.materiau_id, materiau: choix.materiau ? choix.materiau.libelle : null, resistance_kgm3: choix.materiau ? choix.materiau.resistance_kgm3 : null, shore_a: el.shore_a, visible: el.visible,
      reference_fournisseur: el.source.reference_fournisseur, licence: el.source.licence, avertissements: av, perce, douceur_mm: el.douceur_mm === undefined ? null : el.douceur_mm, comblement_materiau_id: el.comblement_materiau_id, skive: c.skive || null, torsion: c.torsion ? { appliquee: c.torsion.appliquee, raison: c.torsion.raison, phi_deg: c.torsion.phi_deg, angle_frontal_deg: c.torsion.angle_frontal_deg, zone: el.zone_torsion, s_charniere_mm: el.s_charniere_mm, transition_mm: el.transition_mm, axe: c.torsion.axe } : null });
    for (const a of av) avertissements.push(el.id + ' : ' + a);
  }
  for (let k = 0; k < elements.length; k++) { finale.couches.push(couchesIdx[k]); infos.push(infosIdx[k]); }
  // Deux éléments de bord qui se partagent un bord ne doivent pas se chevaucher le long du pied (sinon « montagne »).
  for (let a = 0; a < elements.length; a++) for (let b = a + 1; b < elements.length; b++) {
    const A = elements[a], B = elements[b], TA = TYPES_ELEMENTS[A.type], TB = TYPES_ELEMENTS[B.type];
    if (!TA.bord || !TB.bord || !A.visible || !B.visible || !TA.bords.some((x) => TB.bords.includes(x))) continue;
    const rec = Math.min(A.dy_mm + A.longueur_mm / 2, B.dy_mm + B.longueur_mm / 2) - Math.max(A.dy_mm - A.longueur_mm / 2, B.dy_mm - B.longueur_mm / 2);
    if (rec > 0.5) { const m = A.id + ' / ' + B.id + ' : ' + TA.libelle + ' et ' + TB.libelle + ' se chevauchent de ' + rec.toFixed(0) + ' mm sur le même bord (les hauteurs s\'additionnent)'; avertissements.push(m); infos[a].avertissements.push('chevauche ' + TB.libelle + ' de ' + rec.toFixed(0) + ' mm'); infos[b].avertissements.push('chevauche ' + TA.libelle + ' de ' + rec.toFixed(0) + ' mm'); }
  }
  let cumul = 0, hTot = -Infinity, e0 = Infinity;
  for (let k = 0; k < n; k++) {
    if (!estValide(finale.haut[k])) continue;
    let s = 0; for (const c of finale.couches) s += c.z[k];
    if (s > cumul) cumul = s;
    hTot = Math.max(hTot, finale.haut[k]); e0 = Math.min(e0, finale.haut[k] - finale.bas[k]);
  }
  if (cumul > ELEMENTS.cumul_max_mm) avertissements.push('cumul d\'éléments superposés de ' + cumul.toFixed(1) + ' mm (> ' + ELEMENTS.cumul_max_mm + ' mm)');
  return { ...finale, elements, infos, rapport_elements: { nb: elements.length, avertissements, elements: infos, cumul_max_mm: cumul, repere_talon: rep, hauteur_max_mm: hTot, epaisseur_min_mm: e0, torsions_bloquees: torsionsBloquees } };
}

// ---- Outil de coupe : angle réel mesuré par régression sur la surface supérieure (script §5.8) ----
export function mesurerAngle(coord, z, a, b) {
  let n = 0, sx = 0, sz = 0, sxx = 0, sxz = 0;
  for (let k = 0; k < coord.length; k++) {
    if (!(coord[k] >= a && coord[k] <= b) || !Number.isFinite(z[k])) continue;
    n++; sx += coord[k]; sz += z[k]; sxx += coord[k] * coord[k]; sxz += coord[k] * z[k];
  }
  if (n < 8) return null;
  const den = n * sxx - sx * sx;
  if (!(den > 0)) return null;
  const pente = (n * sxz - sx * sz) / den, orig = (sz - pente * sx) / n;
  let ecart = 0;
  for (let k = 0; k < coord.length; k++) if (coord[k] >= a && coord[k] <= b && Number.isFinite(z[k])) ecart = Math.max(ecart, Math.abs(z[k] - (orig + pente * coord[k])));
  return { angle_deg: deg(Math.atan(pente)), pente, n, ecart_plan_mm: ecart };
}

// Ordre d'empilement des éléments (indices) : le recouvrement passe toujours en dernier, les autres dans l'ordre de saisie (comme appliquerElements).
export function ordreEmpilement(elements) {
  return [...elements.keys()].sort((a, b) => (TYPES_ELEMENTS[elements[a].type].recouvrement ? 1 : 0) - (TYPES_ELEMENTS[elements[b].type].recouvrement ? 1 : 0) || a - b);
}

// Épaisseur réelle (dessus final - dessous) à un nœud k, avec sa décomposition par matériau dans l'ordre d'empilement :
// base, puis chaque élément visible qui ajoute de la matière (tranche bornée par [dessous, dessus final]). Les creux ne comptent pas comme une couche.
export function decomposerEpaisseur(finale, k) {
  const top = finale.haut[k], bot = finale.bas[k], hb = finale.haut_base[k], couches = [];
  const base = Math.min(hb, top) - bot;
  if (base > 1e-4) couches.push({ nom: 'Base', epaisseur_mm: base, index: null });
  const els = finale.elements || [];
  let c = hb;
  for (const idx of ordreEmpilement(els)) {
    const z = finale.couches[idx].z[k], avant = c; c += z;
    if (!(z > 0)) continue;
    const lo = Math.min(top, Math.max(bot, avant)), hi = Math.min(top, Math.max(bot, c));
    if (hi - lo > 1e-4) couches.push({ nom: finale.infos[idx].libelle, epaisseur_mm: hi - lo, index: idx });
  }
  return { total_mm: top - bot, couches };
}

// Torsion sur une coupe en travers : angle frontal MESURÉ (régression de la couche seule le long de x) comparé à l'angle attendu atan(tan(phi)·cos λ·cos δ).
function mesureTorsion(finale, n, j, y, couche, cote) {
  const el = finale.elements[n], info = finale.infos[n], t = info.torsion, { nx, ox, pas } = finale;
  const r = { id: el.id, type: el.type, libelle: TYPES_ELEMENTS.torsion.libelle, angle_regle_deg: el.phi_deg, hauteur_regle_mm: null, applicable: false, raison: null, torsion: true, angle_frontal_attendu_deg: t.angle_frontal_deg };
  if (!t.axe || !t.appliquee) { r.raison = t.raison || 'torsion nulle (phi = 0)'; return r; }
  const xs = [], zl = []; let xa = Infinity, xb = -Infinity, wmin = 1;
  for (let a = 0; a < nx; a++) {
    const k = j * nx + a; if (!estValide(finale.haut_base[k])) continue;
    const x = ox + a * pas, xm = x + (finale.dx ? finale.dx[k] : 0);
    const w = poidsZone(coordonneesAxe(versHenke({ x, y }, finale.rapport_elements.repere_talon, cote), t.axe).s, t.zone, t.s_charniere_mm, t.transition_mm);
    wmin = Math.min(wmin, w); xs.push(xm); zl.push(couche[k]); xa = Math.min(xa, xm); xb = Math.max(xb, xm);
  }
  if (!(xb - xa >= ELEMENTS.fenetre_min_mm)) { r.raison = 'coupe hors du pied'; return r; }
  if (wmin < 0.999) { r.raison = 'coupe dans la transition ou hors de la zone de torsion (' + t.zone + ') : angle non mesurable ici'; return r; }
  const mC = mesurerAngle(xs, zl, xa, xb);
  r.applicable = !!mC; r.fenetre_mm = [xa, xb]; r.zone = 'plateau';
  if (mC) { r.angle_mesure_deg = Math.abs(mC.angle_deg); r.ecart_plan_mm = mC.ecart_plan_mm; r.points = mC.n; r.ecart_attendu_deg = Math.abs(r.angle_mesure_deg - Math.abs(t.angle_frontal_deg)); }
  return r;
}

// Mesures d'une coupe (transversale : angle de chaque élément sur sa couche seule et sur la surface totale, dans la zone plane
// hors raccord, côté haut ; toujours : épaisseur minimale du profil).
export function mesurerCoupe(finale, mode, pos_mm, cote) {
  const { nx, ny, pas, ox, oy } = finale;
  const sortie = { mode, epaisseur_min_mm: null, elements: [] };
  const j = Math.min(ny - 1, Math.max(0, Math.round((pos_mm - oy) / pas)));
  const i = Math.min(nx - 1, Math.max(0, Math.round((pos_mm - ox) / pas)));
  let e0 = Infinity, e1 = -Infinity, k0 = -1, k1 = -1, a0 = 0, a1 = 0;
  const m = mode === 'T' ? nx : ny;
  for (let a = 0; a < m; a++) {
    const k = mode === 'T' ? j * nx + a : a * nx + i;
    if (!estValide(finale.haut[k])) continue;
    const e = finale.haut[k] - finale.bas[k];
    if (e < e0) { e0 = e; k0 = k; a0 = a; }
    if (e > e1) { e1 = e; k1 = k; a1 = a; }
  }
  sortie.epaisseur_min_mm = e0 === Infinity ? null : e0;
  // épaisseur RÉELLE de la coupe (avec les éléments) : le plus épais, avec sa position le long de la coupe et le détail par matériau ; le plus mince aussi, avec sa position
  const pos = (a) => (mode === 'T' ? ox + a * pas : oy + a * pas) + ((mode === 'T' ? finale.dx : finale.dy) ? (mode === 'T' ? finale.dx : finale.dy)[mode === 'T' ? j * nx + a : a * nx + i] : 0);
  // plateau : le point extrême est le CENTRE de la première zone continue à moins de 0,0001 mm de la valeur (vrai plateau : recouvrement seul, base plate) ;
  // un sommet arrondi garde son nœud exact, pour que le chiffre et le détail restent cohérents
  const ep = (a) => { const k = mode === 'T' ? j * nx + a : a * nx + i; return estValide(finale.haut[k]) ? finale.haut[k] - finale.bas[k] : NaN; };
  const centre = (a, e) => { let d0 = a, d1 = a; while (d0 > 0 && Math.abs(ep(d0 - 1) - e) <= 1e-4) d0--; while (d1 < m - 1 && Math.abs(ep(d1 + 1) - e) <= 1e-4) d1++; return Math.round((d0 + d1) / 2); };
  if (k1 >= 0) { a1 = centre(a1, e1); k1 = mode === 'T' ? j * nx + a1 : a1 * nx + i; a0 = centre(a0, e0); }
  if (k1 >= 0) { sortie.epaisseur_max_mm = e1; sortie.epaisseur_max_pos_mm = pos(a1); sortie.epaisseur_max_detail = decomposerEpaisseur(finale, k1).couches; sortie.epaisseur_min_pos_mm = pos(a0); void k0; }
  else { sortie.epaisseur_max_mm = null; sortie.epaisseur_max_pos_mm = null; sortie.epaisseur_max_detail = []; sortie.epaisseur_min_pos_mm = null; }
  if (mode !== 'T' || !finale.elements || finale.elements.length === 0) return sortie;
  const med = sensMedial(cote);
  const y = oy + j * pas;
  finale.elements.forEach((el, n) => {
    const T = TYPES_ELEMENTS[el.type];
    const info = finale.infos[n], couche = finale.couches[n].z;
    if (T.skive) { sortie.elements.push({ id: el.id, type: el.type, libelle: T.libelle, angle_regle_deg: el.angle_skive_deg, hauteur_regle_mm: null, applicable: false, raison: 'skive de Kirby : ' + el.profondeur_mm + ' mm au bord ' + (el.bord_skive === 'medial' ? 'médial' : 'latéral') + ' sur l\'arrière-pied (voir la coupe)', skive: true }); return; }
    if (T.torsion) { sortie.elements.push(mesureTorsion(finale, n, j, y, couche, cote)); return; }
    if (T.pinceau) { sortie.elements.push({ id: el.id, type: el.type, libelle: T.libelle, angle_regle_deg: null, hauteur_regle_mm: null, applicable: false, raison: 'retouche au pinceau : ' + el.coups.length + ' passage(s), pas d\'angle à mesurer' }); return; }
    if (T.recouvrement) { sortie.elements.push({ id: el.id, type: el.type, libelle: T.libelle, angle_regle_deg: null, hauteur_regle_mm: el.hauteur_mm, applicable: false, raison: 'recouvrement : couche de ' + el.hauteur_mm + ' mm sur toute la semelle', hauteur_couche_max_mm: el.hauteur_mm }); return; }
    if (T.bord) { sortie.elements.push({ id: el.id, type: el.type, libelle: T.libelle, angle_regle_deg: null, hauteur_regle_mm: el.hauteur_mm, applicable: false, raison: 'élément de bord : le biseau de ' + el.biseau_deg + '° est sous l\'élément (voir la coupe)', hauteur_couche_max_mm: maxTableau(couche) }); return; }
    const r = { id: el.id, type: el.type, libelle: T.libelle, angle_regle_deg: el.angle_deg, hauteur_regle_mm: el.hauteur_mm, applicable: false, raison: null };
    if (T.coteHaut && el.ancrage === 'bord') { // coin ancré au bord : mesure sur la rampe, de 2 mm du bord jusqu'au genou
      const versX = (T.coteHaut === 'medial' ? med : -med), e = indicesBordRangee(finale.haut_base, nx, j, versX);
      const u = y - (info.centre.y_mm - 0.25 * el.longueur_mm), k = genouCoin(el.largeur_mm), xs = [], zl = [], zt = [];
      r.hauteur_couche_max_mm = maxTableau(couche);
      if (e !== null) for (let a = 0; a < nx; a++) { const t = (e - a) * versX * pas; if (t >= 2 && t <= el.largeur_mm - k - 1 && estValide(finale.haut_base[j * nx + a])) { xs.push(ox + a * pas + (finale.dx ? finale.dx[j * nx + a] : 0)); zl.push(couche[j * nx + a]); zt.push(finale.haut[j * nx + a]); } }
      if (xs.length * pas < ELEMENTS.fenetre_min_mm || u < 0 || u > el.longueur_mm) { r.raison = 'coupe hors de la zone plane de l\'élément (début, fin ou largeur trop courte)'; sortie.elements.push(r); return; }
      const mC = mesurerAngle(xs, zl, -Infinity, Infinity), mT = mesurerAngle(xs, zt, -Infinity, Infinity);
      r.applicable = !!mC; r.fenetre_mm = [Math.min(...xs), Math.max(...xs)];
      r.zone = u <= T.plateauRatio * el.longueur_mm ? 'plateau' : 'decroissance';
      if (mC) { r.angle_mesure_deg = Math.abs(mC.angle_deg); r.cote_haut = T.coteHaut === 'medial' ? 'médial' : 'latéral'; r.ecart_plan_mm = mC.ecart_plan_mm; r.points = mC.n; }
      if (mT) r.angle_surface_totale_deg = Math.abs(mT.angle_deg);
      sortie.elements.push(r); return;
    }
    const cx = info.centre.x_mm, cy = info.centre.y_mm, u = y - cy + T.u0(el);
    const xs = new Float32Array(nx), zl = new Float32Array(nx), zt = new Float32Array(nx);
    let xa = Infinity, xb = -Infinity;
    for (let a = 0; a < nx; a++) {
      const k = j * nx + a, x = ox + a * pas;
      xs[a] = x + (finale.dx ? finale.dx[k] : 0); zl[a] = couche[k]; zt[a] = finale.haut[k];
      const d = T.distance(el, (x - cx) * med, u);
      if (d >= (T.importe ? T.fiche.raccord_ref_mm : el.raccord_mm) && (!T.importe || couche[k] > T.fiche.plancher_bord_mm + 0.02) && estValide(finale.haut_base[k])) { xa = Math.min(xa, xs[a]); xb = Math.max(xb, xs[a]); }
    }
    r.hauteur_couche_max_mm = Math.max(...zl);
    if (el.angle_deg === null) { r.raison = 'élément sans angle (voir la hauteur au point haut)'; sortie.elements.push(r); return; }
    if (!(xb - xa >= ELEMENTS.fenetre_min_mm)) { r.raison = 'coupe hors de la zone plane de l\'élément (raccord ou hors emprise)'; sortie.elements.push(r); return; }
    const mC = mesurerAngle(xs, zl, xa, xb), mT = mesurerAngle(xs, zt, xa, xb);
    r.applicable = !!mC; r.fenetre_mm = [xa, xb];
    r.zone = u <= T.plateau_fin(el) ? 'plateau' : 'decroissance';
    if (mC) {
      // la couche monte vers +X si la pente est positive ; la direction du côté haut en « t » (vers le médial) = signe(pente) × med
      r.angle_mesure_deg = Math.abs(mC.angle_deg);
      r.cote_haut = Math.sign(mC.pente) * med > 0 ? 'médial' : 'latéral';
      r.ecart_plan_mm = mC.ecart_plan_mm; r.points = mC.n;
    }
    if (mT) r.angle_surface_totale_deg = Math.abs(mT.angle_deg);
    sortie.elements.push(r);
  });
  return sortie;
}

// Position par défaut d'un élément de bord : il DÉMARRE après les éléments déjà posés sur le même bord ET placés derrière lui (décision de Joël :
// la voûte démarre après la cuvette ; l'ordre d'ajout ne compte pas : une cuvette ajoutée après la voûte reste au talon). Si le décalage sortirait
// du pied (yMax), la position demandée est conservée et `impossible` est vrai (le chevauchement sera alors signalé par un avertissement).
export function positionApres(existants, type, longueur_mm, dyVoulu, yMax = Infinity) {
  const T = TYPES_ELEMENTS[type];
  if (!T || !T.bord) throw new TypeError('positionApres : type de bord attendu');
  let dyMin = -Infinity, apres = null;
  for (const e of existants || []) {
    const TE = TYPES_ELEMENTS[e.type];
    if (!TE || !TE.bord || e.visible === false || !TE.bords.some((x) => T.bords.includes(x))) continue;
    if (!(e.dy_mm <= dyVoulu)) continue; // un élément placé plus en avant n'impose rien
    const fin = e.dy_mm + e.longueur_mm / 2;
    if (fin + longueur_mm / 2 > dyMin) { dyMin = fin + longueur_mm / 2; apres = TE.libelle; }
  }
  if (dyVoulu >= dyMin) return { dy_mm: dyVoulu, decale: false, apres: null, impossible: false };
  if (dyMin + longueur_mm / 2 > yMax) return { dy_mm: dyVoulu, decale: false, apres, impossible: true };
  return { dy_mm: dyMin, decale: true, apres, impossible: false };
}
