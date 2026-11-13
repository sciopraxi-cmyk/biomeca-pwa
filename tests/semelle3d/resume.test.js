import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { resumerPlan } from '../../js/semelle3d/calcul/resume.js';

const materiaux = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
async function calculer(params, elements) {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario: 'droit_stl_mm' }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  await traiterMessageA({ type: 'materiaux', json: materiaux }, etat);
  const r = await traiterMessageA({ type: 'base', cote: d.cote_reel, params: { cote: d.cote_reel, ...params }, elements }, etat);
  return r.rapport;
}

test('RÉSUMÉ : base, éléments et recouvrement choisis ressortent dans le texte du rapport', async () => {
  const R = await calculer(
    { type: 'thermoformee', materiau_id: 'PE-2.0-50S' },
    [
      { type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 3, materiau_id: 'PE-4.0-70S', shore_a: 70 },
      { type: 'recouvrement', hauteur_mm: 1, materiau_id: 'PE-REC-MP-1.0-N' },
    ],
  );
  const s = resumerPlan(R);
  assert.equal(s.base.type, 'thermoformee');
  assert.equal(s.base.type_nom, 'Thermoformée');
  assert.match(s.base.materiau, /Poly-éthylène 2\.0mm 50S/);
  assert.equal(s.elements.length, 1, 'le recouvrement n\'est pas dans la liste des éléments');
  assert.equal(s.elements[0].type, 'coin_pronateur_posterieur');
  assert.match(s.elements[0].reglage, /angle 3,00°/);
  assert.ok(s.recouvrement, 'recouvrement présent');
  assert.match(s.recouvrement.materiau, /Recouvrement Poly-éthylène micro-perforé 1\.0mm/);
  assert.equal(s.recouvrement.epaisseur_mm, 1);
  const texte = s.lignes.join('\n');
  assert.match(texte, /Base thermoformée/);
  assert.match(texte, /Coin pronateur postérieur/);
  assert.match(texte, /Recouvrement : Recouvrement/);
});

test('RÉSUMÉ : sans recouvrement ni élément, le texte le dit (aucune ligne inventée)', async () => {
  const R = await calculer({ type: 'plate' }, []);
  const s = resumerPlan(R);
  assert.equal(s.elements.length, 0);
  assert.equal(s.recouvrement, null);
  assert.equal(s.base.moulage_pct, 0);
  assert.match(s.base.materiau, /non choisi/);
  assert.deepEqual(s.lignes.slice(-1), ['Recouvrement : aucun']);
});

test('RÉSUMÉ : un élément masqué n\'apparaît pas ; un rapport absent est refusé', async () => {
  const R = await calculer({ type: 'plate' }, [{ type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 3, visible: false }]);
  assert.equal(resumerPlan(R).elements.length, 0);
  assert.throws(() => resumerPlan(null), /rapport de base absent/);
});
