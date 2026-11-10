// Lot 4d : Miroir (pur). Copie les éléments PROPRES à un pied sur l'autre pied, en symétrie, après confirmation côté interface.
// Les éléments « communs » sont déjà en miroir (le côté médial est calculé par `cote`) : ils ne sont ni copiés ni touchés.
// Les paramètres d'un élément (dx_mm, dy_mm, angle_plan_deg, ancrage, côté haut…) sont exprimés dans le repère MÉDIAL du pied (positif = vers le médial) :
// la même valeur posée sur l'autre pied donne donc la forme symétrique (propriété vérifiée par test sur la géométrie, pas supposée).
const AUTRE = { D: 'G', G: 'D' };
export const autrePied = (c) => { if (!AUTRE[c]) throw new TypeError('miroir : pied D ou G attendu'); return AUTRE[c]; };

// Ce que ferait un miroir de `de` vers l'autre pied, sans rien modifier : { de, vers, copies, remplaces, rien }
export function apercuMiroir(elements, de) {
  const vers = autrePied(de), els = elements || [];
  const copies = els.filter((e) => e.portee === de).length, remplaces = els.filter((e) => e.portee === vers).length;
  return { de, vers, copies, remplaces, rien: copies === 0 && remplaces === 0 };
}

// Nouvelle liste d'éléments : les éléments propres à `vers` disparaissent, chaque élément propre à `de` est copié juste après lui
// (même rang d'empilement dans les deux pieds), avec un identifiant neuf. La liste d'origine n'est jamais modifiée.
export function miroirElements(elements, de) {
  const vers = autrePied(de), els = elements || [];
  const pris = new Set(els.map((e) => e.uid).filter(Boolean));
  const neuf = (uid) => { let u = (uid || 'e') + 'm', n = 1; while (pris.has(u)) u = (uid || 'e') + 'm' + (++n); pris.add(u); return u; };
  const sortie = [];
  for (const e of els) {
    if (e.portee === vers) continue;
    sortie.push(e);
    if (e.portee === de) sortie.push({ ...JSON.parse(JSON.stringify(e)), portee: vers, uid: neuf(e.uid) });
  }
  return sortie;
}
