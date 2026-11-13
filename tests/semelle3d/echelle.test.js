import test from 'node:test';
import assert from 'node:assert/strict';
import { calculerEchelle, validerLongueurPied } from '../../js/semelle3d/calcul/echelle.js';

test('échelle : facteur = longueur saisie / boîte du scan ; scan déjà en mm -> pas de confirmation', () => {
  const e = calculerEchelle(265, 265);
  assert.equal(e.facteur_echelle, 1);
  assert.equal(e.ecart_echelle_pct, 0);
  assert.equal(e.confirmation_requise, false);
  const f = calculerEchelle(260, 265);
  assert.ok(Math.abs(f.facteur_echelle - 265 / 260) < 1e-12);
  assert.ok(Math.abs(f.ecart_echelle_pct - ((265 / 260 - 1) * 100)) < 1e-9);
});

test('échelle : un scan en mètres est détecté (×1000, confirmation obligatoire)', () => {
  const e = calculerEchelle(0.265, 265);
  assert.ok(Math.abs(e.facteur_echelle - 1000) < 1e-9);
  assert.equal(e.confirmation_requise, true);
  assert.equal(e.unite_probable, 'm');
});

test('échelle : pouces (×25,4) et centimètres (×10) détectés, confirmation obligatoire', () => {
  const p = calculerEchelle(265 / 25.4, 265);
  assert.equal(p.unite_probable, 'pouce');
  assert.equal(p.confirmation_requise, true);
  const c = calculerEchelle(26.5, 265);
  assert.equal(c.unite_probable, 'cm');
  assert.equal(c.confirmation_requise, true);
});

test('échelle : seuil de confirmation à 15 % (15 % exactement = pas de confirmation, 16 % = confirmation)', () => {
  assert.equal(calculerEchelle(200, 230).confirmation_requise, false); // +15,0 %
  assert.equal(calculerEchelle(200, 232).confirmation_requise, true); // +16 %
  assert.equal(calculerEchelle(200, 172).confirmation_requise, false); // -14 %
  assert.equal(calculerEchelle(200, 168).confirmation_requise, true); // -16 %
  assert.equal(calculerEchelle(230, 200).confirmation_requise, false); // -13 %
});

test('longueur du pied : absente, non numérique ou hors plage plausible -> refusée', () => {
  for (const v of [undefined, null, NaN, Infinity, '265', 0, -5, 99, 401, 5000]) assert.throws(() => validerLongueurPied(v), RangeError, String(v));
  assert.equal(validerLongueurPied(265), 265);
  assert.throws(() => calculerEchelle(0, 265), RangeError);
  assert.throws(() => calculerEchelle(NaN, 265), RangeError);
});
