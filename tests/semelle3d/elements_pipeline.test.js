import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { lireSTLBinaire, indexerSommets } from '../../js/semelle3d/calcul/stl.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { mesurerAngle } from '../../js/semelle3d/calcul/elements.js';

const materiaux = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
async function prepare(scenario = 'droit_stl_mm') {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  const r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  assert.equal(r.type, 'recale');
  await traiterMessageA({ type: 'materiaux', json: materiaux }, etat);
  return { etat, cote: d.cote_reel };
}
const base = (etat, cote, params, elements) => traiterMessageA({ type: 'base', cote, params: { cote, ...params }, elements }, etat);
const coupe = (etat, y, mode = 'T') => traiterMessageA({ type: 'coupe', mode, position_mm: y }, etat);
const coin = (extra = {}) => ({ type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, ...extra }); // ancienne position libre (centre) : les tests du lot 3 la gardent ; l'ancrage au bord a ses propres tests (bibliotheque.test.js)

test('OUTIL DE COUPE : l\'angle saisi (1° à 10°) est retrouvé à ± 0,2° sur la couche de l\'élément, base plate ET thermoformée, pied D et pied G', async () => {
  for (const scenario of ['droit_stl_mm', 'gauche_obj_mm']) {
    const { etat, cote } = await prepare(scenario);
    for (const type of ['plate', 'thermoformee']) {
      for (const th of [1, 2, 3, 4, 6, 8, 10]) {
        await base(etat, cote, { type }, [coin({ angle_deg: th })]);
        for (const y of [20, 30, 36]) {
          const c = await coupe(etat, y);
          const e = c.mesures.elements[0];
          assert.equal(e.applicable, true, `${scenario} ${type} ${th}° y=${y} : ${e.raison}`);
          assert.equal(e.zone, 'plateau');
          assert.ok(Math.abs(e.angle_mesure_deg - th) <= 0.2, `${scenario} ${type} : réglé ${th}°, mesuré ${e.angle_mesure_deg} (y = ${y})`);
          assert.equal(e.cote_haut, 'latéral', 'pronateur : le côté haut est le latéral (formule PODAXIA)');
          assert.ok(e.ecart_plan_mm < 0.01, 'la couche est bien plane dans la fenêtre : ' + e.ecart_plan_mm);
        }
      }
    }
  }
});

test('outil de coupe : sur une base PLATE la surface totale donne aussi l\'angle réglé ; sur une base moulée il le dit (la forme du pied s\'ajoute)', async () => {
  const { etat, cote } = await prepare();
  await base(etat, cote, { type: 'plate' }, [coin({ angle_deg: 5 })]);
  const e = (await coupe(etat, 30)).mesures.elements[0];
  assert.ok(Math.abs(e.angle_surface_totale_deg - 5) <= 0.2, String(e.angle_surface_totale_deg));
  await base(etat, cote, { type: 'thermoformee', taux: 1 }, [coin({ angle_deg: 5 })]);
  const m = (await coupe(etat, 30)).mesures.elements[0];
  assert.ok(Math.abs(m.angle_mesure_deg - 5) <= 0.2 && Math.abs(m.angle_surface_totale_deg - 5) > 0.3, `couche ${m.angle_mesure_deg} / totale ${m.angle_surface_totale_deg}`);
});

test('outil de coupe sur le STL EXPORTÉ et relu : l\'angle redonne le réglage à ± 0,2° (pas seulement sur le calcul en mémoire)', async () => {
  const { etat, cote } = await prepare();
  for (const th of [3, 6]) {
    await base(etat, cote, { type: 'plate', contour_lisse: true }, [coin({ angle_deg: th })]);
    const e = await traiterMessageA({ type: 'exporter', cote }, etat);
    const m = indexerSommets(lireSTLBinaire(e.stl));
    const c = await coupe(etat, 30);
    const [xa, xb] = c.mesures.elements[0].fenetre_mm;
    const y0 = c.position_mm, xs = [], zs = [];
    for (let k = 0; k < m.positions.length; k += 3) if (Math.abs(m.positions[k + 1] - y0) < 0.3 && m.positions[k + 2] > 0.5) { xs.push(m.positions[k]); zs.push(m.positions[k + 2]); }
    const r = mesurerAngle(xs, zs, xa, xb);
    assert.ok(r && r.n >= 20, 'sommets de la coupe relus : ' + (r && r.n));
    assert.ok(Math.abs(r.angle_deg - th) <= 0.2 && r.pente * (cote === 'D' ? 1 : -1) > 0, `STL relu : ${r.angle_deg}° pour ${th}°`);
  }
});

test('hauteur au bord saisie à la place de l\'angle : l\'angle déduit est retrouvé par la coupe (2,8 mm sur 56 mm = 2,86°)', async () => {
  const { etat, cote } = await prepare();
  const r = await base(etat, cote, { type: 'plate' }, [coin({ hauteur_mm: 2.8 })]);
  assert.ok(Math.abs(r.rapport.elements[0].angle_deg - 2.862) < 1e-3);
  const e = (await coupe(etat, 30)).mesures.elements[0];
  assert.ok(Math.abs(e.angle_mesure_deg - 2.862) <= 0.2);
});

test('l\'élément s\'ajoute : maillage fermé, volume gagné = somme exacte de la couche (triangles lus), coin D/G', async () => {
  const { etat, cote } = await prepare();
  const sans = await base(etat, cote, { type: 'plate', contour_lisse: false });
  const avec = await base(etat, cote, { type: 'plate', contour_lisse: false }, [coin({ angle_deg: 6 })]);
  assert.equal(avec.rapport.ferme, true); assert.equal(avec.rapport.degeneres, 0);
  const g = etat.finale; const L = g.couches[0].z, nx = g.nx;
  let gain = 0;
  for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = j * nx + i, v = [g.haut_base[k], g.haut_base[k + 1], g.haut_base[k + nx], g.haut_base[k + nx + 1]];
    if (!v.every(Number.isFinite)) continue;
    const a = L[k], b = L[k + 1], c = L[k + nx], d = L[k + nx + 1], A = g.pas * g.pas / 2;
    gain += A * (a + b + d) / 3 + A * (a + d + c) / 3;
  }
  assert.ok(gain > 500, 'gain ' + gain);
  assert.ok(Math.abs((avec.rapport.volume_mm3 - sans.rapport.volume_mm3) / gain - 1) < 1e-4, `${avec.rapport.volume_mm3 - sans.rapport.volume_mm3} vs ${gain}`);
  assert.ok(avec.rapport.hauteur_max_mm > sans.rapport.hauteur_max_mm + 3);
});

test('hauteur, Shore et matériau par élément : le matériau et le Shore n\'ont AUCUN effet sur la géométrie, la hauteur en a un', async () => {
  const { etat, cote } = await prepare();
  const a = await base(etat, cote, { type: 'plate' }, [{ type: 'soutien_de_voute', hauteur_mm: 7, materiau_id: 'PE-4.0-70S', shore_a: 70 }]);
  const b = await base(etat, cote, { type: 'plate' }, [{ type: 'soutien_de_voute', hauteur_mm: 7, materiau_id: 'EVA-2.0-30S', shore_a: 30 }]);
  const c = await base(etat, cote, { type: 'plate' }, [{ type: 'soutien_de_voute', hauteur_mm: 10, materiau_id: 'PE-4.0-70S', shore_a: 70 }]);
  assert.equal(a.rapport.volume_mm3, b.rapport.volume_mm3);
  assert.ok(c.rapport.volume_mm3 > a.rapport.volume_mm3 + 100);
  assert.equal(a.rapport.elements[0].shore_a, 70); assert.equal(b.rapport.elements[0].shore_a, 30);
  assert.match(a.rapport.elements[0].materiau, /./); assert.notEqual(a.rapport.elements[0].materiau, b.rapport.elements[0].materiau);
  assert.equal(a.rapport.elements[0].materiau_id, 'PE-4.0-70S');
  assert.ok(a.rapport.elements[0].avertissements.every((x) => !/Shore/.test(x)), 'Shore saisi = Shore du tableau : pas d\'avertissement');
  const d = await base(etat, cote, { type: 'plate' }, [{ type: 'soutien_de_voute', hauteur_mm: 7, materiau_id: 'PE-4.0-70S', shore_a: 30 }]);
  assert.ok(d.rapport.avertissements.some((x) => /Shore saisi 30 ≠ Shore du tableau/.test(x)));
  assert.ok(c.rapport.avertissements.some((x) => /plus haut que le matériau choisi \(4 mm\)/.test(x)), 'voûte de 10 mm sur un matériau de 4 mm : ' + JSON.stringify(c.rapport.avertissements));
  assert.ok(a.rapport.avertissements.some((x) => /plus haut que le matériau/.test(x)), 'voûte de 7 mm sur un matériau de 4 mm : avertit aussi');
});

test('fiche de l\'élément : référence fournisseur et licence accompagnent chaque élément du rapport (règle 5 du script)', async () => {
  const { etat, cote } = await prepare();
  const r = await base(etat, cote, { type: 'plate' }, [coin({ angle_deg: 3 })]);
  assert.equal(r.rapport.elements[0].reference_fournisseur, 'PODAXIA 01_coin_pronateur_posterieur');
  assert.match(r.rapport.elements[0].licence, /usage Verticy autorisé par le fondateur, 31\/10\/2026/);
});

test('modifier un élément ne recalcule pas la base (même objet) ; message « elements » refusé sans base ; latéralité et matériau contrôlés', async () => {
  const { etat, cote } = await prepare();
  await assert.rejects(() => traiterMessageA({ type: 'elements', elements: [], cote }, etat), /construire la base/);
  await base(etat, cote, { type: 'thermoformee' });
  const b0 = etat.base;
  const r = await traiterMessageA({ type: 'elements', cote, elements: [coin({ angle_deg: 4 })] }, etat);
  assert.equal(r.type, 'base'); assert.ok(etat.base === b0, 'la base seule est conservée telle quelle (même objet)'); // pas assert.equal : l'échec afficherait des millions de valeurs
  assert.equal(r.rapport.nb_elements, 1);
  await assert.rejects(() => traiterMessageA({ type: 'elements', cote: undefined, elements: [coin()] }, etat), /latéralité/);
  await assert.rejects(() => traiterMessageA({ type: 'elements', cote, elements: [coin({ materiau_id: 'INCONNU' })] }, etat), /inconnu/);
  const sansCat = await prepare(); delete sansCat.etat.materiaux; await base(sansCat.etat, cote, { type: 'plate' });
  await assert.rejects(() => traiterMessageA({ type: 'elements', cote, elements: [coin({ materiau_id: 'PE-4.0-70S' })] }, sansCat.etat), /non chargé|inconnu/);
  const vide = await traiterMessageA({ type: 'elements', cote, elements: [] }, etat);
  assert.equal(vide.rapport.nb_elements, 0);
});

test('une nouvelle empreinte invalide la base et les éléments (pas de coupe sur l\'ancienne forme)', async () => {
  const { etat, cote } = await prepare();
  await base(etat, cote, { type: 'plate' }, [coin()]);
  assert.ok(etat.finale);
  await traiterMessageA({ type: 'recaler', longueur_mm: 263 }, etat);
  assert.ok(etat.finale === null && etat.base === null, 'base et finale invalidées');
  await assert.rejects(() => coupe(etat, 30), /construire la base/);
});

test('export avec éléments : STL relu fermé ; refusé si une décharge amène l\'épaisseur sous 0,9 mm ; refusé sans latéralité', async () => {
  const { etat, cote } = await prepare();
  const r = await base(etat, cote, { type: 'plate', epaisseur_mm: 1.5 }, [coin({ angle_deg: 4 }), { type: 'soutien_de_voute', hauteur_mm: 4 }]);
  const e = await traiterMessageA({ type: 'exporter', cote }, etat);
  const v = verifierMaillage(indexerSommets(lireSTLBinaire(e.stl)));
  assert.equal(v.ferme, true); assert.equal(v.degeneres, 0);
  assert.ok(Math.abs(v.volume / r.rapport.volume_mm3 - 1) < 1e-4);
  assert.ok(v.bbox.max[2] > 1.5 + 3.5 && v.bbox.max[2] < 1.5 + 4.1, 'hauteur max du STL relu ' + v.bbox.max[2]);
  await assert.rejects(() => traiterMessageA({ type: 'exporter' }, etat), /latéralité non confirmée/);
  const d = await base(etat, cote, { type: 'plate', epaisseur_mm: 1.5 }, [{ type: 'soutien_de_voute', hauteur_mm: 1, signe: -1, dx_mm: 0 }]);
  assert.ok(d.rapport.epaisseur_min_mm < 0.9, String(d.rapport.epaisseur_min_mm));
  await assert.rejects(() => traiterMessageA({ type: 'exporter', cote }, etat), /épaisseur minimale/);
});

test('plusieurs éléments : cumul superposé signalé au-delà de 10 mm, épaisseur totale > 12 mm signalée', async () => {
  const { etat, cote } = await prepare();
  const r = await base(etat, cote, { type: 'plate' }, [{ type: 'soutien_de_voute', hauteur_mm: 8 }, { type: 'soutien_de_voute', hauteur_mm: 8, dy_mm: 100 }]);
  assert.ok(r.rapport.cumul_elements_max_mm > 10);
  assert.ok(r.rapport.avertissements.some((a) => /cumul d'éléments superposés/.test(a)), JSON.stringify(r.rapport.avertissements));
  assert.ok(r.rapport.avertissements.some((a) => /Épaisseur totale/.test(a)));
});

test('coupe : le résultat contient la base seule et chaque couche (de quoi colorer l\'élément selon son Shore)', async () => {
  const { etat, cote } = await prepare();
  await base(etat, cote, { type: 'plate' }, [coin({ angle_deg: 4, materiau_id: 'PE-4.0-70S', shore_a: 70 })]);
  const c = await coupe(etat, 30);
  assert.equal(c.couches.length, 1); assert.equal(c.couches[0].shore_a, 70);
  let n = 0; for (let k = 0; k < c.haut.length; k++) if (Number.isFinite(c.haut[k])) { n++; assert.ok(Math.abs(c.haut[k] - (c.haut_base[k] + c.couches[0].z[k])) < 1e-5); }
  assert.ok(n > 50);
});

test('la résistance (kg/m3) du matériau choisi figure sur la fiche de l\'élément ; non indiquée = null, jamais une valeur par défaut', async () => {
  const { etat, cote } = await prepare();
  const a = await base(etat, cote, { type: 'plate' }, [coin({ materiau_id: 'PE-4.0-70S', shore_a: 70 })]);
  assert.equal(a.rapport.elements[0].resistance_kgm3, 360);
  const b = await base(etat, cote, { type: 'plate' }, [coin({ materiau_id: 'PORON XRD3', shore_a: 5 })]);
  assert.equal(b.rapport.elements[0].resistance_kgm3, 240);
  const c = await base(etat, cote, { type: 'plate' }, [coin({ materiau_id: 'RES-FLEX-1.3' })]);
  assert.equal(c.rapport.elements[0].resistance_kgm3, null);
  const d = await base(etat, cote, { type: 'plate' }, [coin()]);
  assert.equal(d.rapport.elements[0].resistance_kgm3, null);
});
