import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { analyserScan, importerScan, fabriquerDemo, SCENARIOS_DEMO } from '../../js/semelle3d/calcul/modeA.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { ecrireSTLBinaireScan, ecrire3MF } from '../../js/semelle3d/calcul/ecrivains_scans.js';
import { ajouterJournal } from '../../js/semelle3d/calcul/journal.js';
import { pose } from './aides.js';

function erreurs(g, sc, L, mesh0) {
  let xmn = Infinity, xmx = -Infinity, ymn = Infinity;
  for (let v = 0; v < sc.positions.length; v += 3) { xmn = Math.min(xmn, sc.positions[v]); xmx = Math.max(xmx, sc.positions[v]); ymn = Math.min(ymn, sc.positions[v + 1]); }
  const x0 = (xmn + xmx) / 2;
  const e = [];
  const ok = (x, y) => sc.modele.dedans(x, y);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const h = g.z[j * g.nx + i];
    if (!Number.isFinite(h)) continue;
    const x = g.ox + i * g.pas + x0, y = g.oy + j * g.pas + ymn;
    if (![[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]].every(([a, b]) => ok(x + a, y + b))) continue; // à plus de 2 mm du bord
    e.push(Math.abs(h - sc.modele.relief(x, y)));
  }
  void L; void mesh0;
  return e.sort((a, b) => a - b);
}

test('mode A : scan tourné de 30° et décalé -> H_plantaire fidèle au relief d\'origine, à l\'échelle de la longueur saisie', () => {
  const { sc, mesh, L } = pose({ decalage: 0, lacet: 30, roulis: 5 });
  const r = analyserScan(mesh, { longueur_mm: L });
  assert.equal(r.confirmation_requise, false);
  assert.ok(Math.abs(r.rapport.acquisition.facteur_echelle - 1) < 1e-6);
  const e = erreurs(r.grille, sc);
  assert.ok(e.length > 50000);
  const moy = e.reduce((a, b) => a + b, 0) / e.length;
  assert.ok(moy < 0.2, 'écart moyen ' + moy);
  assert.ok(e[Math.floor(0.999 * e.length)] < 0.5, 'écart au 99,9e centile ' + e[Math.floor(0.999 * e.length)]);
  assert.ok(Math.abs(r.rapport.boite.y_max - L) < 1e-3);
});

test('mode A : la même forme en MÈTRES -> confirmation exigée, aucune rasterisation ; une fois confirmée, même H_plantaire qu\'en mm', () => {
  const mm = pose({ decalage: 0 });
  const m = pose({ decalage: 0, facteur: 0.001 });
  const sans = analyserScan(m.mesh, { longueur_mm: mm.L });
  assert.equal(sans.confirmation_requise, true);
  assert.equal(sans.grille, undefined);
  assert.equal(sans.echelle.unite_probable, 'm');
  const avec = analyserScan(m.mesh, { longueur_mm: mm.L, confirmeEcart: true });
  const ref = analyserScan(mm.mesh, { longueur_mm: mm.L });
  assert.equal(avec.rapport.acquisition.ecart_confirme, true);
  assert.ok(Math.abs(avec.rapport.acquisition.facteur_echelle / 1000 - 1) < 2e-3); // l'axe ACP s'écarte de <0,1° de Y
  assert.equal(avec.grille.z.length, ref.grille.z.length);
  let d = 0;
  for (let k = 0; k < ref.grille.z.length; k++) { const a = avec.grille.z[k], b = ref.grille.z[k]; if (Number.isNaN(a) !== Number.isNaN(b)) d = 99; else if (!Number.isNaN(a)) d = Math.max(d, Math.abs(a - b)); }
  assert.ok(d < 0.01, 'écart max ' + d);
});

test('mode A : longueur absente ou hors plage -> refus, rien n\'est calculé', () => {
  const { mesh } = pose({});
  for (const v of [undefined, NaN, 5, 9999]) assert.throws(() => analyserScan(mesh, { longueur_mm: v }), RangeError);
});

test('mode A : scan écrasé par erreur d\'unité inverse (pouces) détecté et facteur stocké dans le rapport', () => {
  const { mesh, L } = pose({ facteur: 1 / 25.4 });
  const r = analyserScan(mesh, { longueur_mm: L, confirmeEcart: true });
  assert.equal(r.rapport.acquisition.unite_probable, 'pouce');
  assert.ok(Math.abs(r.rapport.acquisition.facteur_echelle / 25.4 - 1) < 2e-2); // pied courbé : axe ACP à ~2°
  assert.ok(Math.abs(r.rapport.acquisition.ecart_echelle_pct - (r.rapport.acquisition.facteur_echelle - 1) * 100) < 1e-9);
});

test('mode A : 4 scénarios de démonstration (STL, OBJ, PLY, 3MF) de bout en bout par le pipeline, côté proposé = côté réel, < 10 s', async () => {
  const etat = { dernier: null, scan: null, plantaire: null };
  for (const nom of Object.keys(SCENARIOS_DEMO)) {
    const t0 = Date.now();
    const d = fabriquerDemo(nom);
    const imp = await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
    assert.equal(imp.type, 'importe');
    let r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
    if (/_m\.|pouces/.test(d.nom)) {
      assert.equal(r.type, 'confirmation_requise', nom);
      r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm, confirmeEcart: true }, etat);
    }
    assert.equal(r.type, 'recale', nom);
    assert.equal(r.rapport.propositions.cote.valeur, d.cote_reel, nom);
    assert.equal(r.rapport.propositions.cote.ambigu, false, nom);
    assert.ok(r.positions.length > 0 && r.indices.length > 0);
    assert.ok(Date.now() - t0 < 10000, nom + ' trop lent');
  }
});

test('mode A : recaler avant tout import est refusé ; un fichier illisible vide l\'état', async () => {
  const etat = { dernier: null, scan: null, plantaire: null };
  await assert.rejects(() => traiterMessageA({ type: 'recaler', longueur_mm: 265 }, etat), /importer d'abord/);
  const d = fabriquerDemo('droit_stl_mm');
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: 'a.stl' }, etat);
  await assert.rejects(() => traiterMessageA({ type: 'importer', buffer: new ArrayBuffer(10), nom: 'b.stl' }, etat));
  assert.equal(etat.scan, null);
});

test('mode A : 3MF compressé (deflate) importé par le pipeline', async () => {
  const { mesh } = pose({});
  const buf = ecrire3MF(mesh, { compresseur: (u8) => new Uint8Array(deflateRawSync(u8)) });
  const { info } = await importerScan(buf, 'x.3mf');
  assert.equal(info.format, '3mf');
  assert.equal(info.nbTriangles, mesh.indices.length / 3);
});

test('mode A : scan lourd (~330 000 triangles, STL binaire de 18 Mo) analysé en moins de 10 s', async () => {
  const { mesh, L } = pose({ pas: 0.3, lacet: 30 });
  const buf = ecrireSTLBinaireScan(mesh);
  assert.ok(mesh.indices.length / 3 > 300000);
  const t0 = Date.now();
  const { mesh: lu } = await importerScan(buf, 'gros.stl');
  const r = analyserScan(lu, { longueur_mm: L });
  const ms = Date.now() - t0;
  assert.ok(ms < 10000, ms + ' ms');
  assert.equal(r.rapport.propositions.cote.valeur, 'D');
});

test('journal : les actions « import » et « confirmation » sont acceptées, pas les autres', () => {
  let j = Object.freeze([]);
  j = ajouterJournal(j, 'import', 'x.stl', '2026-10-31T10:00:00Z');
  j = ajouterJournal(j, 'confirmation', 'côté D', '2026-10-31T10:00:01Z');
  assert.equal(j.length, 2);
  assert.throws(() => ajouterJournal(j, 'effacement', 'x', '2026-10-31T10:00:02Z'), RangeError);
});
