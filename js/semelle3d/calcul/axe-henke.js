// Lot 4 bis : axe de Henke (axe sous-talien) et torsion de la semelle. Fonctions PURES.
// Repère de l'axe (celui du script) : pied droit, X+ = MÉDIAL, y vers l'avant depuis le talon, z vers le haut, mm. Pied gauche : miroir en X.
// Le prototype place le médial du D à x NÉGATIF (sensMedial) : les fonctions `versHenke` / `depuisHenke` font le passage, une seule fois, aux frontières.
// Toute valeur calculée est une PROPOSITION que le praticien valide (valide = false par défaut).
import { HENKE } from '../constantes.js';
import { estValide } from './grille.js';
import { reperTalon } from './reperage.js';

const RAD = Math.PI / 180;
const fini = (v) => typeof v === 'number' && Number.isFinite(v);

export const AXE_DEFAUT = Object.freeze({ inclinaison_deg: HENKE.inclinaison_defaut_deg });

// ---------------------------------------------------------------- repère
const sensMedialProto = (cote) => { if (cote !== 'D' && cote !== 'G') throw new TypeError('axe de Henke : latéralité D ou G exigée'); return cote === 'D' ? -1 : 1; };
// point du prototype (x, y absolus) -> repère de l'axe (relatif au talon, X+ médial) ; `rep` = reperTalon(base)
export const versHenke = (p, rep, cote) => ({ x: sensMedialProto(cote) * (p.x - rep.x_mm), y: p.y - rep.y_mm });
export const depuisHenke = (p, rep, cote) => ({ x: rep.x_mm + sensMedialProto(cote) * p.x, y: rep.y_mm + p.y });

// ---------------------------------------------------------------- axe
/** Point postérieur par défaut : 7 mm LATÉRAL à la bissectrice du talon, à 5 % de la longueur. */
export function p0ParDefaut(longueurMm) {
  if (!(longueurMm > 0)) throw new RangeError('axe de Henke : longueur du pied invalide');
  return { x: -HENKE.p0_lateral_mm, y: HENKE.p0_longueur_frac * longueurMm };
}

/** Têtes métatarsiennes de départ (SYNTHÉTIQUES, à confirmer) : M1, M2, M3 alignées sur la ligne des têtes ; largeur = largeur de l'avant-pied ;
 * bordMedialX = abscisse (repère de l'axe) du bord médial de l'avant-pied (défaut : largeur / 2, pied centré sur la bissectrice du talon). */
export function tetesParDefaut(longueurMm, largeurAvantPiedMm, bordMedialX) {
  if (!(longueurMm > 0) || !(largeurAvantPiedMm > 0)) throw new RangeError('têtes métatarsiennes : longueur et largeur de l\'avant-pied requises');
  const y = HENKE.tetes_y_frac * longueurMm, x1 = (fini(bordMedialX) ? bordMedialX : largeurAvantPiedMm / 2) - HENKE.tete_m1_depuis_bord_mm, e = HENKE.ecart_tetes_mm, r = HENKE.tete_rayon_mm;
  return { m1: { x: x1, y, rayon_mm: r }, m2: { x: x1 - e, y, rayon_mm: r }, m3: { x: x1 - 2 * e, y, rayon_mm: r }, source: 'defaut' };
}

const verifTetes = (t) => {
  if (!t || !t.m1 || !t.m2 || !t.m3) throw new TypeError('têtes métatarsiennes : M1, M2 et M3 exigées');
  for (const k of ['m1', 'm2', 'm3']) if (!fini(t[k].x) || !fini(t[k].y)) throw new TypeError('têtes métatarsiennes : ' + k + ' invalide');
  if (!(t.m1.rayon_mm > 0)) throw new TypeError('têtes métatarsiennes : rayon de M1 invalide');
  if (!(t.m1.x > t.m2.x && t.m2.x > t.m3.x)) throw new RangeError('têtes métatarsiennes : ordre attendu M1 (médial) > M2 > M3 (latéral)');
};
/** Ordonnée de la ligne des têtes = moyenne des centres M1, M2, M3. */
export const yTetes = (t) => { verifTetes(t); return (t.m1.y + t.m2.y + t.m3.y) / 3; };

/** Déviation (degrés) d'un axe défini par 2 points plantaires {x, y} ; le point antérieur doit être en avant. */
export function deviationDepuisPoints(post, ant) {
  if (!(ant.y - post.y > 0)) throw new Error('Le point antérieur doit être en avant du point postérieur');
  return Math.atan2(ant.x - post.x, ant.y - post.y) / RAD;
}

/** Axe déduit de deux points palpés (Kirby) : remplace les valeurs par défaut (source « palpation »). */
export function axeDepuisPalpation(post, ant, inclinaison_deg = HENKE.inclinaison_defaut_deg) {
  const deviation_deg = deviationDepuisPoints(post, ant);
  return { inclinaison_deg, deviation_deg, p0: { x: post.x, y: post.y }, p1: { x: ant.x, y: ant.y }, source: 'palpation', valide: false };
}

/** Axe par défaut défini par 2 REPÈRES : p0 (talon) et milieu des centres M1-M2 ; la déviation est CALCULÉE. Jamais validé d'office. */
export function axeParDefaut(longueurMm, tetes, inclinaison_deg = HENKE.inclinaison_defaut_deg) {
  verifTetes(tetes);
  const p0 = p0ParDefaut(longueurMm), p1 = { x: (tetes.m1.x + tetes.m2.x) / 2, y: (tetes.m1.y + tetes.m2.y) / 2 };
  return { inclinaison_deg, deviation_deg: deviationDepuisPoints(p0, p1), p0, p1, source: 'defaut', valide: false };
}

/** Alertes sur l'axe : déviation hors 4-47°, inclinaison hors 20-70°. */
export function alertesAxe(axe) {
  const a = [], d = HENKE.deviation_plage_deg, l = HENKE.inclinaison_plage_deg;
  if (axe.deviation_deg < d.min || axe.deviation_deg > d.max) a.push('déviation de ' + axe.deviation_deg.toFixed(1) + '° hors de la plage ' + d.min + '–' + d.max + '°');
  if (axe.inclinaison_deg < l.min || axe.inclinaison_deg > l.max) a.push('inclinaison de ' + axe.inclinaison_deg.toFixed(1) + '° hors de la plage ' + l.min + '–' + l.max + '°');
  return a;
}

/** Vecteurs de l'axe : direction plantaire a (2D) et direction 3D u (unitaire). */
export function vecteursAxe({ inclinaison_deg, deviation_deg }) {
  const d = deviation_deg * RAD, l = inclinaison_deg * RAD;
  const a = { x: Math.sin(d), y: Math.cos(d) };
  return { a, u: { x: Math.cos(l) * a.x, y: Math.cos(l) * a.y, z: Math.sin(l) } };
}

/** Distance signée à l'axe (positive côté médial) et abscisse le long de l'axe. */
export function coordonneesAxe(pt, axe) {
  const { a } = vecteursAxe(axe);
  const rx = pt.x - axe.p0.x, ry = pt.y - axe.p0.y;
  return { d: a.y * rx - a.x * ry, s: a.x * rx + a.y * ry };
}

/** Abscisse où la projection de l'axe coupe la ligne transversale y = yLigne (ex. ligne des têtes). */
export function xCroisement(axe, yLigne) {
  const { a } = vecteursAxe(axe);
  return axe.p0.x + (a.x / a.y) * (yLigne - axe.p0.y);
}

/** Bras de levier (mm) pour la carte de couleur : > 0 supinateur (dedans de l'axe), < 0 pronateur. */
export const brasDeLevier = (pt, axe) => coordonneesAxe(pt, axe).d;

/** Axe tel qu'il est enregistré dans le plan (par pied) : validé champ par champ, copie profonde ; valide = false si absent. */
export function normaliserAxe(a) {
  if (!a || typeof a !== 'object') throw new TypeError('axe de Henke : objet attendu');
  const pt = (q, nom) => { if (!q || !fini(q.x) || !fini(q.y)) throw new TypeError('axe de Henke : ' + nom + ' invalide'); return { x: q.x, y: q.y }; };
  if (!fini(a.inclinaison_deg) || !fini(a.deviation_deg)) throw new TypeError('axe de Henke : angles invalides');
  if (!['defaut', 'palpation', 'manuel'].includes(a.source)) throw new TypeError('axe de Henke : source « defaut », « palpation » ou « manuel »');
  const o = { inclinaison_deg: a.inclinaison_deg, deviation_deg: a.deviation_deg, p0: pt(a.p0, 'p0'), source: a.source, valide: a.valide === true };
  if (a.p1) o.p1 = pt(a.p1, 'p1');
  if (a.tetes) { verifTetes(a.tetes); o.tetes = JSON.parse(JSON.stringify({ m1: a.tetes.m1, m2: a.tetes.m2, m3: a.tetes.m3, source: a.tetes.source })); }
  return o;
}

// ---------------------------------------------------------------- catégorie (praticien, 03/11)
/** Seuils de catégorie (X+ médial) : bord médial de M1 > centre M1 > centre M2 > centre M3. */
export function seuilsCategorie(t) {
  verifTetes(t);
  return [{ nom: 'bord médial de M1', x: t.m1.x + t.m1.rayon_mm }, { nom: 'centre de M1', x: t.m1.x }, { nom: 'centre de M2', x: t.m2.x }, { nom: 'centre de M3', x: t.m3.x }];
}
/**
 * Catégorie selon le croisement de la projection plantaire avec la ligne des têtes :
 * tres_medialise (médial au bord médial de M1) · medialise (entre centre et bord médial de M1) · normal (centres M1-M2) · lateralise (centres M2-M3) · tres_lateralise (latéral au centre de M3).
 * `limite` = croisement à MOINS de 2 mm d'un seuil (affichage seulement : la catégorie ne bascule pas).
 */
export function categorieAxe(axe, t) {
  const S = seuilsCategorie(t), x = xCroisement(axe, yTetes(t));
  const rang = x > S[0].x ? 0 : x > S[1].x ? 1 : x > S[2].x ? 2 : x > S[3].x ? 3 : 4;
  let proche = null, ecart = Infinity;
  for (const s of S) if (Math.abs(x - s.x) < ecart) { ecart = Math.abs(x - s.x); proche = s; }
  const limite = ecart < HENKE.limite_mm;
  return { categorie: HENKE.categories[rang], limite, seuil_proche: limite ? proche.nom : null, x_croisement_mm: x, ecart_seuil_mm: ecart };
}

// ---------------------------------------------------------------- torsion
const lisse = (e0, e1, v) => { const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
/** Pondération de zone le long de l'axe : 'totale' | 'arriere' | 'avant', transition progressive (largeur >= 10 mm). */
export function poidsZone(s, zone, sCharniere, largeurTransition) {
  if (zone === 'totale') return 1;
  if (zone !== 'arriere' && zone !== 'avant') throw new RangeError('torsion : zone inconnue « ' + zone + ' »');
  const h = largeurTransition / 2, avant = lisse(sCharniere - h, sCharniere + h, s);
  return zone === 'avant' ? avant : 1 - avant;
}

/** Contrôle de phi : niveau 'ok' | 'orange' (> 6°) | 'rouge' (> 10°, confirmation) | 'bloque' (> 15°, refusé). phi > 0 = supination. */
export function controlerPhi(phi_deg) {
  if (!fini(phi_deg)) throw new TypeError('torsion : phi doit être un nombre');
  const P = HENKE.phi, a = Math.abs(phi_deg);
  const niveau = a > P.blocage_deg ? 'bloque' : a > P.rouge_deg ? 'rouge' : a > P.orange_deg ? 'orange' : 'ok';
  return { niveau, confirmation: niveau === 'rouge', bloque: niveau === 'bloque', multiple_du_pas: Math.abs(phi_deg / P.pas_deg - Math.round(phi_deg / P.pas_deg)) < 1e-9 };
}

/** Angle frontal réellement obtenu (degrés) = atan(tan(phi)·cos(λ)·cos(δ)) : l'inclinaison de l'axe réduit l'effet frontal. */
export const angleFrontal = (phi_deg, axe) => Math.atan(Math.tan(phi_deg * RAD) * Math.cos(axe.inclinaison_deg * RAD) * Math.cos(axe.deviation_deg * RAD)) / RAD;

/**
 * Torsion de la carte de hauteur autour de l'axe. phi > 0 : supination (relève le côté médial). Retourne une NOUVELLE carte.
 * H : Float32Array (ny*nx), masque : Uint8Array (1 = dans le contour), grille : {x0, y0, pas, nx, ny, pasX?} ; pasX (défaut pas) peut être NÉGATIF
 * (pied D du prototype : le repère de l'axe est inversé en x). Mode 'ajout' (défaut) : jamais de matière retirée (charnière au bord le plus bas).
 */
export function torsion(H, masque, grille, axe, { phi_deg, zone = 'totale', sCharniere = 0, largeurTransition = 20, mode = 'ajout' }) {
  const c = controlerPhi(phi_deg);
  if (c.bloque) throw new RangeError('torsion : |phi| = ' + Math.abs(phi_deg) + '° dépasse la limite de ' + HENKE.phi.blocage_deg + '° (refusé)');
  if (mode !== 'ajout') throw new RangeError('torsion : seul le mode « ajout » est disponible (la charnière sur l\'axe attend la décision du praticien)');
  if (zone !== 'totale' && !(largeurTransition >= 10)) throw new RangeError('torsion : largeur de transition >= 10 mm exigée');
  const { nx, ny, x0, y0, pas } = grille, pasX = grille.pasX === undefined ? pas : grille.pasX;
  const k = Math.tan(phi_deg * RAD) * Math.cos(axe.inclinaison_deg * RAD);
  const dz = new Float32Array(nx * ny), w = new Float32Array(nx * ny);
  let min = Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const idx = j * nx + i; if (!masque[idx]) continue;
    const { d, s } = coordonneesAxe({ x: x0 + i * pasX, y: y0 + j * pas }, axe);
    w[idx] = poidsZone(s, zone, sCharniere, largeurTransition);
    dz[idx] = k * d;
    if (w[idx] > 0 && dz[idx] < min) min = dz[idx];
  }
  const out = new Float32Array(H), base = Number.isFinite(min) ? min : 0; // ajout : charnière au bord le plus bas de la zone, (dz − min) >= 0
  for (let idx = 0; idx < nx * ny; idx++) if (masque[idx]) out[idx] = H[idx] + w[idx] * (dz[idx] - base);
  return out;
}

/** Couche de torsion pour une base du prototype : { z (couche signée >= 0, 0 hors contour), haut (surface après torsion) }. cote D/G confirmé. */
export function coucheTorsion(base, axe, options, cote) {
  const { nx, ny, pas, ox, oy, haut } = base, rep = reperTalon(base), med = sensMedialProto(cote);
  const masque = new Uint8Array(nx * ny); for (let k = 0; k < masque.length; k++) masque[k] = estValide(haut[k]) ? 1 : 0;
  const H = Float32Array.from(haut, (v) => (Number.isFinite(v) ? v : 0));
  const grille = { nx, ny, pas, x0: med * (ox - rep.x_mm), pasX: med * pas, y0: oy - rep.y_mm };
  const out = torsion(H, masque, grille, axe, options), z = new Float32Array(nx * ny), apres = Float32Array.from(haut);
  for (let k = 0; k < z.length; k++) if (masque[k]) { z[k] = out[k] - H[k]; apres[k] = out[k]; }
  return { z, haut: apres };
}

// ---------------------------------------------------------------- suggestions de skive (jamais appliquées seules)
/**
 * Suggestion de skive de Kirby selon la catégorie. null si l'axe est « normal » (aucune suggestion). Enfant = âge < 12 ans (fiche patient) ; âge inconnu = adulte, signalé.
 * medialise : skive médial 2 mm (enfant 4) · tres_medialise : 4 (6) · lateralise / tres_lateralise : skive latéral mêmes valeurs, ou coin valgisant.
 */
export function suggererSkive(categorie, { age_ans } = {}) {
  const S = HENKE.skive, prof = S.profondeur_mm[categorie];
  if (!prof) { if (categorie === 'normal') return null; throw new RangeError('skive : catégorie inconnue « ' + categorie + ' »'); }
  const age_inconnu = !fini(age_ans), enfant = !age_inconnu && age_ans < S.age_enfant_ans, medial = categorie.includes('medial');
  return {
    type: medial ? 'skive_medial' : 'skive_lateral', alternative: medial ? null : 'coin_valgisant', categorie, enfant, age_inconnu,
    profondeur_mm: enfant ? prof.enfant : prof.adulte, angle_deg: S.angle_defaut_deg,
    suggestion: true, appliquee: false, // jamais appliquée seule : donnée du plan seulement après validation du praticien
  };
}
/** Réglages d'une skive : angle 10–25°, profondeur 2–6 mm. */
export function validerSkive({ angle_deg, profondeur_mm }) {
  const A = HENKE.skive.angle_plage_deg, P = HENKE.skive.profondeur_plage_mm;
  if (!fini(angle_deg) || angle_deg < A.min || angle_deg > A.max) throw new RangeError('skive : angle entre ' + A.min + ' et ' + A.max + '°');
  if (!fini(profondeur_mm) || profondeur_mm < P.min || profondeur_mm > P.max) throw new RangeError('skive : profondeur entre ' + P.min + ' et ' + P.max + ' mm');
  return { angle_deg, profondeur_mm };
}

/** Rotation 3D (Rodrigues) d'un point du mannequin autour de l'axe (vue du pied, pas la semelle). phi > 0 = supination : rotation de sens −u. */
export function rotationAutourAxe(p, axe, phi_deg, z0 = 0) {
  const { u } = vecteursAxe(axe), c = Math.cos(phi_deg * RAD), s = Math.sin(phi_deg * RAD), sg = -1;
  const r = { x: p.x - axe.p0.x, y: p.y - axe.p0.y, z: p.z - z0 };
  const dot = u.x * r.x + u.y * r.y + u.z * r.z, cr = { x: u.y * r.z - u.z * r.y, y: u.z * r.x - u.x * r.z, z: u.x * r.y - u.y * r.x };
  return { x: axe.p0.x + r.x * c + sg * cr.x * s + u.x * dot * (1 - c), y: axe.p0.y + r.y * c + sg * cr.y * s + u.y * dot * (1 - c), z: z0 + r.z * c + sg * cr.z * s + u.z * dot * (1 - c) };
}

// ---------------------------------------------------------------- état éditable par pied (étape 2) : { axe, tetes } dans le repère de l'axe ; toute modification dé-valide l'axe
export const LIBELLES_CATEGORIE = Object.freeze({ tres_medialise: 'très médialisé', medialise: 'médialisé', normal: 'normal', lateralise: 'latéralisé', tres_lateralise: 'très latéralisé' });
const GAP_TETES_MM = 5; // écart minimal entre deux têtes voisines lors d'un déplacement

/** État de départ d'un pied : têtes synthétiques d'après la boîte du scan, axe par 2 repères. boite = { x_min, x_max } du scan (repère du prototype). */
export function etatParDefaut(longueurMm, boite, rep, cote) {
  const med = sensMedialProto(cote), bordProto = cote === 'D' ? boite.x_min : boite.x_max;
  const tetes = tetesParDefaut(longueurMm, boite.x_max - boite.x_min, med * (bordProto - rep.x_mm));
  return { axe: axeParDefaut(longueurMm, tetes), tetes };
}
const sansValidation = (e) => ({ ...e, axe: { ...e.axe, valide: false } });
const recalculer = (e) => (e.axe.source === 'defaut' ? { ...e, axe: { ...e.axe, p1: { x: (e.tetes.m1.x + e.tetes.m2.x) / 2, y: (e.tetes.m1.y + e.tetes.m2.y) / 2 }, deviation_deg: deviationDepuisPoints(e.axe.p0, { x: (e.tetes.m1.x + e.tetes.m2.x) / 2, y: (e.tetes.m1.y + e.tetes.m2.y) / 2 }) } } : e);
/** Déplace un repère ('p0', 'm1', 'm2', 'm3') : les 3 têtes restent sur la ligne des têtes (même y) et ordonnées ; l'axe « défaut » suit ses repères. */
export function deplacerRepere(etat, nom, pt) {
  if (!fini(pt.x) || !fini(pt.y)) throw new TypeError('repère : point invalide');
  let e = { axe: { ...etat.axe, p0: { ...etat.axe.p0 } }, tetes: { ...etat.tetes, m1: { ...etat.tetes.m1 }, m2: { ...etat.tetes.m2 }, m3: { ...etat.tetes.m3 } } };
  if (nom === 'p0') {
    const y = Math.min(pt.y, yTetes(e.tetes) - 10); // le point postérieur reste nettement en arrière de la ligne des têtes
    e.axe.p0 = { x: pt.x, y };
  } else if (['m1', 'm2', 'm3'].includes(nom)) {
    const ord = ['m1', 'm2', 'm3'], i = ord.indexOf(nom), t = e.tetes;
    const haut = i === 0 ? Infinity : t[ord[i - 1]].x - GAP_TETES_MM, bas = i === 2 ? -Infinity : t[ord[i + 1]].x + GAP_TETES_MM;
    const x = Math.min(haut, Math.max(bas, pt.x));
    for (const k of ord) t[k].y = pt.y; // glisser une tête déplace la ligne des têtes entière (elles restent alignées)
    t[nom].x = x;
  } else throw new RangeError('repère inconnu « ' + nom + ' »');
  return sansValidation(recalculer(e));
}
/** Saisie de l'inclinaison (20–70°) ou de la déviation (hors 4–47° : alerte, pas de refus) : source « manuel ». */
export function regler(etat, { inclinaison_deg, deviation_deg }) {
  let axe = { ...etat.axe };
  if (inclinaison_deg !== undefined) { if (!fini(inclinaison_deg) || inclinaison_deg <= 0 || inclinaison_deg >= 90) throw new RangeError('inclinaison entre 0 et 90°'); axe.inclinaison_deg = inclinaison_deg; }
  if (deviation_deg !== undefined) {
    if (!fini(deviation_deg) || Math.abs(deviation_deg) >= 89) throw new RangeError('déviation invalide');
    axe.deviation_deg = deviation_deg; axe.source = 'manuel';
    const dy = yTetes(etat.tetes) - axe.p0.y; axe.p1 = { x: axe.p0.x + Math.tan(deviation_deg * RAD) * dy, y: yTetes(etat.tetes) };
  }
  return sansValidation({ ...etat, axe });
}
/** Palpation : remplace l'axe (source « palpation ») ; les têtes restent. */
export const palper = (etat, post, ant) => sansValidation({ ...etat, axe: axeDepuisPalpation(post, ant, etat.axe.inclinaison_deg) });
/** Retour aux repères par défaut (sans toucher à l'inclinaison choisie). */
export const retablir = (etat, defaut) => sansValidation({ ...defaut, axe: { ...defaut.axe, inclinaison_deg: etat.axe.inclinaison_deg } });
/** Validation par le praticien. */
export const valider = (etat) => ({ ...etat, axe: { ...etat.axe, valide: true } });
/** Résumé affichable : catégorie, croisement, alertes. */
export function resumerAxe(etat, { age_ans } = {}) {
  const c = categorieAxe(etat.axe, etat.tetes), sk = suggererSkive(c.categorie, { age_ans });
  return { ...c, skive: sk, libelle: LIBELLES_CATEGORIE[c.categorie], deviation_deg: etat.axe.deviation_deg, inclinaison_deg: etat.axe.inclinaison_deg, alertes: alertesAxe(etat.axe), source: etat.axe.source, valide: etat.axe.valide, suggestion_skive: sk ? sk.type : null };
}
/** Bras de levier de chaque sommet (mm, signé : > 0 supinateur) pour la carte de couleur. positions = [x, y, z, ...] du prototype. */
export function brasDesSommets(positions, axe, rep, cote) {
  const n = positions.length / 3, d = new Float32Array(n);
  for (let v = 0; v < n; v++) d[v] = coordonneesAxe(versHenke({ x: positions[3 * v], y: positions[3 * v + 1] }, rep, cote), axe).d;
  return d;
}
/** Axe du plan : d'un état -> enregistrement (tête incluses pour être relues). */
export const enregistrer = (etat) => ({ ...etat.axe, tetes: JSON.parse(JSON.stringify(etat.tetes)) });
