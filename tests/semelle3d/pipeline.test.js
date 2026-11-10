import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { traiterMessage } from '../../js/semelle3d/calcul/pipeline.js';
import { ajouterJournal } from '../../js/semelle3d/calcul/journal.js';

test('pipeline : construire puis exporter, rapport cohérent', () => {
  const etat = { dernier: null };
  const c = traiterMessage({ type: 'construire' }, etat);
  assert.equal(c.rapport.ferme, true);
  assert.ok(c.rapport.volume_mm3 > 0);
  assert.equal(c.positions.length / 3, c.rapport.nbSommets);
  const e = traiterMessage({ type: 'exporter' }, etat);
  assert.equal(e.octets, 84 + 50 * c.rapport.nbTriangles);
  assert.ok(Math.abs(e.volume_mm3 - c.rapport.volume_mm3) / c.rapport.volume_mm3 < 1e-9);
});

test('pipeline : deux exports successifs = même empreinte SHA-256', () => {
  const h = () => {
    const etat = { dernier: null };
    traiterMessage({ type: 'construire' }, etat);
    return createHash('sha256').update(Buffer.from(traiterMessage({ type: 'exporter' }, etat).stl)).digest('hex');
  };
  assert.equal(h(), h());
});

test('pipeline : exporter sans construire, ou message inconnu, est refusé', () => {
  assert.throws(() => traiterMessage({ type: 'exporter' }, { dernier: null }), /rien à exporter/);
  assert.throws(() => traiterMessage({ type: 'zzz' }, { dernier: null }), TypeError);
  assert.throws(() => traiterMessage(null, { dernier: null }), TypeError);
});

test('pipeline : un paramètre qui produit une épaisseur nulle est refusé, pas exporté', () => {
  assert.throws(() => traiterMessage({ type: 'construire', params: { epaisseur_mm: 0, hauteur_dome_mm: 0 } }, { dernier: null }), RangeError);
});

test('journal : ajout seulement, entrées figées, action et date validées', () => {
  const j0 = Object.freeze([]);
  const j1 = ajouterJournal(j0, 'creation', 'dôme synthétique', '2026-10-31T10:00:00Z');
  assert.equal(j0.length, 0);
  assert.equal(j1.length, 1);
  assert.throws(() => { j1[0].action = 'x'; }, TypeError);
  assert.throws(() => ajouterJournal(j1, 'suppression', 'x', '2026-10-31T10:00:00Z'), RangeError);
  assert.throws(() => ajouterJournal(j1, 'export', 'x', 'hier'), RangeError);
});
