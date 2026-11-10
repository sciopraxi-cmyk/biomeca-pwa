// V1b : règle « dessin gardé / 3D » d'un bilan (fonction pure, sans DOM).
// Un bilan qui a déjà un dessin des pieds (valeur ou chemin Storage) garde son dessin, sans bloc 3D.
// Un bilan neuf, ou ancien sans dessin, reçoit le bloc 3D à la place du dessin.
// cle : '_pieds' (sport), '_feetComposite' (postural, V1b2) ou '_podo_pieds' (podopédiatrie, V1b3).
export function modeSemelleBilan(bilanData, cle = '_pieds') {
  const d = bilanData && typeof bilanData === 'object' ? bilanData : null;
  if (!d) return '3d';
  const aDessin = (v) => typeof v === 'string' && v.length > 0;
  return aDessin(d[cle]) || aDessin(d[cle + 'Path']) ? 'dessin' : '3d';
}
