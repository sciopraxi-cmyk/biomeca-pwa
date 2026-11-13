import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const j = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
const get = (id) => j.materiaux.find((m) => m.item_id === id);

test('matériaux PODAXIA : 80 lignes, identifiants uniques, colonnes attendues, colonne G absente', () => {
  assert.equal(j.materiaux.length, 80);
  const ids = j.materiaux.map((m) => m.item_id);
  assert.equal(new Set(ids).size, 80);
  const cles = ['item_id', 'reference_interne', 'specification_materiau', 'epaisseur', 'durete', 'finition_support', 'ligne_excel', 'durete_shore', 'durete_kgm3'];
  for (const m of j.materiaux) assert.deepEqual(Object.keys(m), cles);
});

test('matériaux : corrections et retraits dictés par Joël appliqués et tracés, rien d\'autre modifié', () => {
  assert.equal(get('EVA-6.0-70S').reference_interne, 'Ethylène Vinyl acétate 6.0mm 70S');
  assert.equal(get('EVA-6.0-70S-NA').reference_interne, 'Ethylène Vinyl acétate 6.0mm 70S Non adhésivé');
  assert.equal(get('ABSORB-4.0').epaisseur, '4.0mm');
  for (const id of ['ADH-NITTO', 'SCRATCH-CRO', 'SCRATH-AST']) assert.equal(get(id), undefined, id);
  assert.equal(j.corrections_et_retraits.length, 6);
  // valeurs non dictées : restent telles que dans l'Excel (formats hétérogènes conservés)
  assert.equal(get('MF-CUIR-MP-N').epaisseur, '0,7mm');
  assert.equal(get('AMORT-2.0-8S').epaisseur, '2.0');
  assert.equal(get('EVA-6.0-70S').epaisseur, '6.0mm');
});

test('matériaux : dureté Shore = premier nombre seulement ; sans nombre -> null (jamais inventé)', () => {
  assert.equal(get('PE-4.0-70S').durete, '70/360');
  assert.equal(get('PE-4.0-70S').durete_shore, 70);
  assert.equal(get('PORON XRD3').durete_shore, 5);
  assert.equal(get('EVA-2.0-30S').durete_shore, 30);
  assert.equal(get('RES-FLEX-1.3').durete_shore, null); // « N/A »
  assert.equal(get('MF-CUIR-MP-N').durete_shore, null); // « N-A »
  assert.equal(j.materiaux.filter((m) => m.durete_shore === null).length, 8);
});
