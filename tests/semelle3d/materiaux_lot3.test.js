import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chargerMateriaux, trouverMateriau, controlerChoixMateriau, nombreDuTexte } from '../../js/semelle3d/calcul/materiaux.js';

const json = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
const cat = chargerMateriaux(json);

test('matériaux lot 3 : 80 lignes chargées, textes du tableau intacts, épaisseurs numériques lues (formats « 0,7mm », « 2.0 », « 1.3 mm »)', () => {
  assert.equal(cat.liste.length, 80);
  assert.equal(trouverMateriau(cat, 'MF-CUIR-MP-N').epaisseur_mm, 0.7);
  assert.equal(trouverMateriau(cat, 'MF-CUIR-MP-N').epaisseur_texte, '0,7mm'); // texte conservé tel quel
  assert.equal(trouverMateriau(cat, 'AMORT-2.0-8S').epaisseur_mm, 2);
  assert.equal(trouverMateriau(cat, 'RES-FLEX-1.3').epaisseur_mm, 1.3);
  assert.equal(trouverMateriau(cat, 'ABSORB-4.0').epaisseur_mm, 4);
  for (const m of cat.liste) assert.ok(Number.isFinite(m.epaisseur_mm) && m.epaisseur_mm > 0, m.id);
  assert.equal(nombreDuTexte('N/A'), null);
});

test('matériaux lot 3 : Shore = valeur du tableau (null si « N/A »), liste des Shore disponibles triée et sans doublon', () => {
  assert.equal(trouverMateriau(cat, 'PE-4.0-70S').shore, 70);
  assert.equal(trouverMateriau(cat, 'PORON XRD3').shore, 5);
  assert.equal(trouverMateriau(cat, 'RES-FLEX-1.3').shore, null);
  assert.deepEqual(cat.shores, [5, 8, 10, 15, 22, 30, 32, 35, 36, 50, 60, 70]);
});

test('matériaux lot 3 : doublon, tableau vide ou identifiant manquant refusés ; matériau inconnu refusé avec son nom', () => {
  assert.throws(() => chargerMateriaux({ materiaux: [] }), TypeError);
  assert.throws(() => chargerMateriaux(null), TypeError);
  const m = json.materiaux[0];
  assert.throws(() => chargerMateriaux({ materiaux: [m, m] }), /en double/);
  assert.throws(() => chargerMateriaux({ materiaux: [{ ...m, item_id: '' }] }), /item_id manquant/);
  assert.throws(() => trouverMateriau(cat, 'INCONNU-9'), /INCONNU-9/);
});

test('choix matériau/Shore : erreurs bloquantes (Shore hors plage, tableau absent) et avertissements non bloquants', () => {
  const h = 3;
  assert.throws(() => controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 0 }, h, cat), /hors de/);
  assert.throws(() => controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 101 }, h, cat), /hors de/);
  assert.throws(() => controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: NaN }, h, cat), /hors de/);
  assert.throws(() => controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 70 }, h, null), /non chargé/);
  assert.throws(() => controlerChoixMateriau({ materiau_id: 'XXX', shore_a: 70 }, h, cat), /inconnu/);
  const ok = controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 70 }, 3, cat);
  assert.deepEqual(ok.avertissements, []);
  assert.equal(ok.materiau.id, 'PE-4.0-70S');
  const autre = controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 50 }, 3, cat);
  assert.ok(autre.avertissements.some((a) => /Shore saisi 50 ≠ Shore du tableau .* \(70\)/.test(a)), JSON.stringify(autre.avertissements));
  const absent = controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 41 }, 3, cat);
  assert.ok(absent.avertissements.some((a) => /absent du tableau/.test(a)));
  const sans = controlerChoixMateriau({ materiau_id: 'RES-FLEX-1.3', shore_a: 60 }, 1, cat);
  assert.ok(sans.avertissements.some((a) => /ne donne pas de Shore/.test(a)));
  const aucun = controlerChoixMateriau({ materiau_id: null, shore_a: null }, 3, cat);
  assert.deepEqual(aucun.avertissements, ['matériau non choisi']);
});

test('choix matériau : un élément plus haut que l\'épaisseur du matériau avertit (pas à égalité)', () => {
  const haut = controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 70 }, 4.3, cat);
  assert.ok(haut.avertissements.some((a) => /plus haut que le matériau choisi \(4 mm\)/.test(a)), JSON.stringify(haut.avertissements));
  assert.deepEqual(controlerChoixMateriau({ materiau_id: 'PE-4.0-70S', shore_a: 70 }, 4, cat).avertissements, []);
});

test('résistance en kg/m3 = 2e nombre de la colonne dureté (explication de Joël, 31/10) ; Shore = 1er ; null quand « N/A » ; jamais inventée', () => {
  const get = (id) => json.materiaux.find((m) => m.item_id === id);
  assert.equal(get('PE-4.0-70S').durete, '70/360');
  assert.equal(get('PE-4.0-70S').durete_shore, 70); assert.equal(get('PE-4.0-70S').durete_kgm3, 360);
  assert.equal(get('PORON XRD3').durete_shore, 5); assert.equal(get('PORON XRD3').durete_kgm3, 240);
  assert.equal(get('RES-FLEX-1.3').durete_kgm3, null); assert.equal(get('MF-CUIR-MP-N').durete_kgm3, null);
  // cohérence ligne par ligne : les deux nombres du texte sont exactement les deux champs dérivés
  let avec = 0;
  for (const m of json.materiaux) {
    const r = /^(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(m.durete);
    if (r) { avec++; assert.equal(m.durete_shore, Number(r[1].replace(',', '.')), m.item_id); assert.equal(m.durete_kgm3, Number(r[2].replace(',', '.')), m.item_id); }
    else { assert.equal(m.durete_shore, null, m.item_id); assert.equal(m.durete_kgm3, null, m.item_id); }
  }
  assert.equal(avec, 72);
  assert.equal(cat.parId.get('PE-4.0-70S').resistance_kgm3, 360);
  assert.equal(cat.parId.get('RES-FLEX-1.3').resistance_kgm3, null);
  assert.match(json.note, /kg\/m3/);
});
