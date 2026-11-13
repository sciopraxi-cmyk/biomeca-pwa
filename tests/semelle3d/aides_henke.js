// Aide des tests de l'axe de Henke : état de pipeline avec un scan SYNTHÉTIQUE analysé et une base thermoformée du pied D.
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
export async function etatAvecBase(scenario = 'droit_stl_mm') {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  await traiterMessageA({ type: 'base', params: { type: 'thermoformee', cote: 'D' }, cote: 'D', elements: [] }, etat);
  return etat;
}
