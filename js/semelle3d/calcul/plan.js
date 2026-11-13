// Plan de semelle pour 2 pieds : éléments COMMUNS (appliqués aux 2 pieds, côté inversé automatiquement par `cote`)
// et éléments PROPRES à un pied. Fonctions pures, jamais destructives : elles renvoient un nouveau plan.
// plan = { base: { commun: {...}, derogations: { D: {...}, G: {...} } }, elements: [{ uid, portee: 'commun'|'D'|'G', ...élément }] }
import { normaliserAxe } from './axe-henke.js';
export const PORTEES = Object.freeze(['commun', 'D', 'G']);

export function planVide() { return { base: { commun: {}, derogations: { D: {}, G: {} } }, elements: [] }; }

export function normaliserPlan(plan) {
  const p = plan || planVide();
  const base = p.base || {};
  const elements = (p.elements || []).map((e, n) => {
    const portee = e.portee === undefined ? 'commun' : e.portee;
    if (!PORTEES.includes(portee)) throw new TypeError('plan : portée inconnue « ' + portee + ' » (commun, D ou G)');
    return { ...e, portee, uid: e.uid === undefined ? 'u' + (n + 1) : e.uid };
  });
  const uids = new Set(elements.map((e) => e.uid));
  if (uids.size !== elements.length) throw new TypeError('plan : identifiants d\'éléments en double');
  const sortie = { base: { commun: { ...(base.commun || {}) }, derogations: { D: { ...((base.derogations || {}).D || {}) }, G: { ...((base.derogations || {}).G || {}) } } }, elements };
  if (p.axe_henke) { // lot 4 bis : axe de Henke PAR PIED (repère de l'axe : propre à chaque pied, donc identique D/G pour un miroir)
    sortie.axe_henke = {};
    for (const c of ['D', 'G']) if (p.axe_henke[c]) sortie.axe_henke[c] = normaliserAxe(p.axe_henke[c]);
  }
  return sortie;
}

const verifCote = (cote) => { if (cote !== 'D' && cote !== 'G') throw new TypeError('plan : côté D ou G attendu'); };

export function paramsBasePour(plan, cote) {
  verifCote(cote);
  const p = normaliserPlan(plan);
  return { ...p.base.commun, ...p.base.derogations[cote] };
}

// Liste d'éléments du pied `cote`, dans l'ordre de saisie, sans les champs propres au plan (portee, uid).
export function elementsPour(plan, cote) {
  verifCote(cote);
  return normaliserPlan(plan).elements.filter((e) => e.portee === 'commun' || e.portee === cote).map(({ portee, uid, ...el }) => { void portee; void uid; return el; });
}

// Remplace un élément commun par deux copies identiques (D et G) au même rang : plus rien n'est perdu, les deux se modifient ensuite séparément.
export function detacher(plan, uid) {
  const p = normaliserPlan(plan);
  const i = p.elements.findIndex((e) => e.uid === uid);
  if (i < 0) throw new RangeError('plan : élément introuvable « ' + uid + ' »');
  if (p.elements[i].portee !== 'commun') throw new RangeError('plan : seul un élément commun peut être détaché');
  const e = p.elements[i];
  const copies = ['D', 'G'].map((c) => ({ ...e, portee: c, uid: e.uid + c }));
  if (p.elements.some((x) => copies.some((c) => c.uid === x.uid))) throw new RangeError('plan : identifiant déjà utilisé après détachement');
  return { ...p, elements: [...p.elements.slice(0, i), ...copies, ...p.elements.slice(i + 1)] };
}

export function ajouterElement(plan, element, portee = 'commun') {
  const p = normaliserPlan(plan);
  if (!PORTEES.includes(portee)) throw new TypeError('plan : portée inconnue « ' + portee + ' »');
  let n = p.elements.length + 1;
  while (p.elements.some((e) => e.uid === 'u' + n)) n++;
  return { ...p, elements: [...p.elements, { ...element, portee, uid: 'u' + n }] };
}

export function retirerElement(plan, uid) {
  const p = normaliserPlan(plan);
  if (!p.elements.some((e) => e.uid === uid)) throw new RangeError('plan : élément introuvable « ' + uid + ' »');
  return { ...p, elements: p.elements.filter((e) => e.uid !== uid) };
}

export function derogerBase(plan, cote, params) {
  verifCote(cote);
  const p = normaliserPlan(plan);
  return { ...p, base: { ...p.base, derogations: { ...p.base.derogations, [cote]: { ...p.base.derogations[cote], ...params } } } };
}

export function effacerDerogation(plan, cote) { verifCote(cote); const p = normaliserPlan(plan); return { ...p, base: { ...p.base, derogations: { ...p.base.derogations, [cote]: {} } } }; }
