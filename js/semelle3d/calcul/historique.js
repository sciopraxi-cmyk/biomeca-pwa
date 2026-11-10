// Annuler / Rétablir (lot 4b) : pile d'instantanés immuables (JSON). Fonctions pures : chaque appel renvoie une nouvelle pile.
// Un instantané = tout le plan (éléments, points, portées, base commune, dérogations D/G, détachements) ; le contenu n'est pas interprété ici.
export const PAS_MAX = 100;

export function historiqueNeuf(instantane, max = PAS_MAX) {
  if (!Number.isInteger(max) || max < 1) throw new RangeError('historique : taille maximale entière >= 1');
  return Object.freeze({ pile: Object.freeze([JSON.stringify(instantane)]), i: 0, max });
}
// Nouveau pas. Identique au pas courant : rien ne change. Tout ce qui suivait le pas courant (rétablir) est perdu, comme partout.
export function valider(h, instantane) {
  const s = JSON.stringify(instantane);
  if (s === h.pile[h.i]) return h;
  let pile = [...h.pile.slice(0, h.i + 1), s];
  if (pile.length > h.max) pile = pile.slice(pile.length - h.max);
  return Object.freeze({ pile: Object.freeze(pile), i: pile.length - 1, max: h.max });
}
export const peutAnnuler = (h) => h.i > 0;
export const peutRetablir = (h) => h.i < h.pile.length - 1;
export const annuler = (h) => (peutAnnuler(h) ? Object.freeze({ ...h, i: h.i - 1 }) : h);
export const retablir = (h) => (peutRetablir(h) ? Object.freeze({ ...h, i: h.i + 1 }) : h);
export const courant = (h) => JSON.parse(h.pile[h.i]);
// Remplace le pas courant sans créer de pas (ex. : calcul qui complète des valeurs dérivées).
export function remplacerCourant(h, instantane) { const pile = [...h.pile]; pile[h.i] = JSON.stringify(instantane); return Object.freeze({ ...h, pile: Object.freeze(pile) }); }
