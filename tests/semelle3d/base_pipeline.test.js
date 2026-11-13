import test from 'node:test';
import assert from 'node:assert/strict';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { lireSTLBinaire, indexerSommets } from '../../js/semelle3d/calcul/stl.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { aireContour } from './aides_base.js';

async function prepare(scenario = 'droit_stl_mm') {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  const r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  assert.equal(r.type, 'recale');
  return etat;
}
const base = (etat, params) => traiterMessageA({ type: 'base', params }, etat);

test('pipeline : base avant analyse du scan -> refusée avec un message clair', async () => {
  await assert.rejects(() => traiterMessageA({ type: 'base', params: {} }, {}), /analyser le scan/);
  await assert.rejects(() => traiterMessageA({ type: 'coupe', mode: 'T', position_mm: 10 }, {}), /construire la base/);
});

test('pipeline : les 3 types donnent un maillage fermé, sans dégénéré, volume > 0 ; l\'intermédiaire est plus lourde', async () => {
  const etat = await prepare();
  const vol = {};
  for (const type of ['plate', 'thermoformee', 'pleine_dessous']) {
    const r = await base(etat, { type, cote: 'D' });
    assert.equal(r.rapport.ferme, true, type); assert.equal(r.rapport.degeneres, 0, type); assert.ok(r.rapport.volume_mm3 > 0);
    assert.ok(r.rapport.epaisseur_min_mm >= 1.5 - 1e-4);
    vol[type] = r.rapport.volume_mm3;
  }
  assert.ok(Math.abs(vol.plate - vol.thermoformee) / vol.plate < 1e-4, 'plate et thermoformée : même volume (même épaisseur, même contour)');
  assert.ok(vol.pleine_dessous > 1.3 * vol.plate, 'intermédiaire pleine : ' + vol.pleine_dessous + ' vs ' + vol.plate);
});

test('volume de la base plate = épaisseur × aire du contour (aire lue indépendamment sur le maillage, formule du lacet)', async () => {
  const etat = await prepare();
  const r = await base(etat, { type: 'plate', epaisseur_mm: 2, contour_lisse: true });
  const aire = aireContour({ positions: r.positions, indices: r.indices });
  assert.ok(Math.abs(r.rapport.volume_mm3 / (2 * aire) - 1) < 1e-4, `volume ${r.rapport.volume_mm3} vs 2 x ${aire}`);
  assert.ok(aire > 10000 && aire < 25000, 'aire plausible ' + aire);
});

test('export de la base : STL relu fermé, volume = celui du maillage ; refusé sans latéralité confirmée', async () => {
  const etat = await prepare();
  const r = await base(etat, { type: 'thermoformee' });
  await assert.rejects(() => traiterMessageA({ type: 'exporter' }, etat), /latéralité non confirmée/);
  await assert.rejects(() => traiterMessageA({ type: 'exporter', cote: 'X' }, etat), /latéralité non confirmée/);
  const e = await traiterMessageA({ type: 'exporter', cote: 'D' }, etat);
  const v = verifierMaillage(indexerSommets(lireSTLBinaire(e.stl)));
  assert.equal(v.ferme, true); assert.equal(v.degeneres, 0); assert.ok(v.volume > 0);
  assert.ok(Math.abs(v.volume / r.rapport.volume_mm3 - 1) < 1e-4);
});

test('export refusé si l\'épaisseur minimale tombe sous 0,9 mm (garde indépendante de la construction)', async () => {
  const etat = await prepare();
  await base(etat, { type: 'plate', epaisseur_mm: 0.9 });
  await assert.doesNotReject(() => traiterMessageA({ type: 'exporter', cote: 'D' }, etat), 'une base de 0,9 mm doit pouvoir être exportée');
  etat.dernier.rapport.epaisseur_min_mm = 0.85;
  await assert.rejects(() => traiterMessageA({ type: 'exporter', cote: 'D' }, etat), /épaisseur minimale/);
});

test('pipeline : intermédiaire sans latéralité -> erreur explicite ; avertissement si épaisseur totale > 12 mm', async () => {
  const etat = await prepare();
  await assert.rejects(() => base(etat, { type: 'pleine_dessous' }), /latéralité/);
  const r = await base(etat, { type: 'thermoformee', taux: 1, epaisseur_mm: 5 });
  assert.ok(r.rapport.avertissements.length >= 1 && /chaussure/.test(r.rapport.avertissements[0]), JSON.stringify(r.rapport.avertissements));
  const r2 = await base(etat, { type: 'thermoformee', taux: 0, epaisseur_mm: 1.5 });
  assert.equal(r2.rapport.avertissements.length, 0);
});

test('pipeline : la coupe demandée après une base redonne les profils de CETTE base', async () => {
  const etat = await prepare();
  await base(etat, { type: 'pleine_dessous', cote: 'D', taux: 1 });
  const c = await traiterMessageA({ type: 'coupe', mode: 'T', position_mm: 100 }, etat);
  assert.equal(c.type, 'coupe');
  let bas0 = 0, n = 0;
  for (let k = 0; k < c.haut.length; k++) if (Number.isFinite(c.haut[k])) { n++; if (c.bas[k] === 0) bas0++; assert.ok(c.haut[k] > c.bas[k]); }
  assert.ok(n > 50 && bas0 > 20, 'dessous plan attendu au centre : ' + bas0 + '/' + n);
});
