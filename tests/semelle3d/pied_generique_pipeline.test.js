// Mode B (B2) : message « pied_generique » du worker — empreinte virtuelle posée dans l'état, base / mannequin / export en aval, retour au mode scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';

const gen = (etat, o = {}) => traiterMessageA({ type: 'pied_generique', longueur_mm: 262, cote: 'D', largeur_rel: 1, voute_mm: 15, ...o }, etat);

test('pied_generique : empreinte posée dans l\'état, rapport « générique » complet (boîte, grille, côté choisi, avertissement indicatif), affichage fourni', async () => {
  const etat = {}, r = await gen(etat, { cote: 'G', largeur_rel: 1.1, voute_mm: 24 });
  assert.equal(r.type, 'recale'); assert.equal(r.rapport.generique, true); assert.equal(etat.generique, true); assert.ok(etat.plantaire && etat.plantaire.grille.z.length > 0); assert.ok(etat.base === null);
  assert.equal(r.rapport.acquisition.mode, 'B_generique'); assert.equal(r.rapport.acquisition.cote, 'G'); assert.equal(r.rapport.acquisition.largeur_rel, 1.1); assert.equal(r.rapport.acquisition.voute_mm, 24); assert.equal(r.rapport.propositions.cote.valeur, 'G');
  assert.ok(Math.abs(r.rapport.boite.y_max - 262) < 1.5, 'longueur ' + r.rapport.boite.y_max); assert.ok(r.rapport.boite.x_max - r.rapport.boite.x_min > 80); assert.ok(r.rapport.avertissements.some((t) => /INDICATIF/.test(t)));
  assert.ok(r.positions.length > 3000 && r.indices.length > 3000); assert.ok(r.rapport.grille.cellules_valides > 50000); assert.ok(r.rapport.grille.hauteur_max_mm > r.rapport.grille.hauteur_min_mm);
});
test('pied_generique : le côté, la largeur et la voûte demandés changent bien l\'empreinte (G = miroir du D ; ×1,1 plus large ; voûte 24 plus haute que 15)', async () => {
  const D = await gen({}, { cote: 'D' }), G = await gen({}, { cote: 'G' }), L = await gen({}, { cote: 'D', largeur_rel: 1.1 }), H = await gen({}, { cote: 'D', voute_mm: 24 });
  assert.ok(Math.abs(D.rapport.boite.x_min + G.rapport.boite.x_max) < 1 && Math.abs(D.rapport.boite.x_max + G.rapport.boite.x_min) < 1, 'miroir D/G'); assert.ok(Math.abs(D.rapport.boite.x_min - G.rapport.boite.x_min) > 1.5, 'le côté G n\'est pas le D');
  const w = (r) => r.rapport.boite.x_max - r.rapport.boite.x_min; assert.ok(Math.abs(w(L) / w(D) - 1.1) < 0.03, 'largeur ' + w(L) / w(D)); assert.ok(H.rapport.grille.hauteur_max_mm > D.rapport.grille.hauteur_max_mm + 5, 'voûte ' + H.rapport.grille.hauteur_max_mm + ' / ' + D.rapport.grille.hauteur_max_mm);
});
test('pied_generique : paramètres invalides = erreur claire, état inchangé', async () => {
  const etat = { plantaire: 'avant', generique: false };
  await assert.rejects(() => gen(etat, { longueur_mm: 90 }), /pied générique : longueur/); await assert.rejects(() => gen(etat, { cote: 'X' }), /côté/); await assert.rejects(() => gen(etat, { largeur_rel: 3 }), /largeur/); await assert.rejects(() => gen(etat, { voute_mm: 99 }), /voûte/);
  assert.ok(etat.plantaire === 'avant'); assert.ok(etat.generique === false);
});
test('en aval : base thermoformée fermée, mannequin (pied sculpté sur l\'empreinte virtuelle), appui, export STL marqué « indicatif »', async () => {
  const etat = {}; await gen(etat);
  const b = await traiterMessageA({ type: 'base', cote: 'D', params: { type: 'thermoformee', cote: 'D', forme_semelle: true, moulage_tetes: false }, elements: [] }, etat); assert.equal(b.rapport.ferme, true); assert.equal(b.rapport.moulage_tetes, false);
  const m = await traiterMessageA({ type: 'mannequin', cote: 'D', longueur_mm: 262, forme_semelle: true }, etat); assert.ok(m.indices.length / 3 > 100000); assert.equal(m.ongles.nb, 5);
  const a = await traiterMessageA({ type: 'appui_mannequin' }, etat); assert.ok(a.a_mm >= 0 && a.penetration_mm < 1e-6);
  const e = await traiterMessageA({ type: 'exporter', cote: 'D' }, etat); assert.equal(e.indicatif, true); assert.ok(e.nbTriangles > 1000);
  assert.ok(etat.base && etat.finale !== undefined); await gen(etat, { longueur_mm: 250 }); assert.ok(etat.base === null, 'nouvelle empreinte : base invalidée'); assert.ok(etat.finale === null, 'nouvelle empreinte : finale invalidée'); // booléens : un assert.equal sur un objet géant fait calculer un diff de plusieurs minutes
});
test('retour au mode scan : importer / recaler remettent « générique » à faux (l\'export d\'un vrai scan n\'est jamais marqué indicatif)', async () => {
  const etat = {}; await gen(etat); assert.equal(etat.generique, true);
  const d = await traiterMessageA({ type: 'demo', scenario: 'reel_droit_stl' }, etat); await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat); assert.ok(etat.generique === false); assert.ok(etat.plantaire === null);
  await gen(etat); assert.equal(etat.generique, true);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat); etat.generique = true; /* état forcé : l'analyse d'un scan doit remettre « générique » à faux d'elle-même (défense en profondeur, même si l'import le fait déjà) */ const r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat); assert.ok(r.rapport.generique === undefined); assert.ok(etat.generique === false);
  await traiterMessageA({ type: 'base', cote: 'D', params: { type: 'plate', cote: 'D' }, elements: [] }, etat); assert.equal((await traiterMessageA({ type: 'exporter', cote: 'D' }, etat)).indicatif, false);
});
test('mannequin du mode B : pied sculpté à ses proportions validées (largeur ≈ 108 mm pour 265 mm), pas rétréci par l\'empreinte virtuelle ; avec un scan (non générique) le pied reste adapté à l\'empreinte', async () => {
  const etat = {}; await gen(etat, { longueur_mm: 265 });
  const largeur = (m) => { let a = Infinity, b = -Infinity; for (let v = 0; v < m.positions.length; v += 3) { const x = m.positions[v]; if (x < a) a = x; if (x > b) b = x; } return b - a; };
  const m = await traiterMessageA({ type: 'mannequin', cote: 'D', longueur_mm: 265, forme_semelle: true }, etat);
  const w = largeur(m); assert.ok(w > 103 && w < 114, 'pied générique : largeur ' + w.toFixed(1) + ' mm attendue ≈ 108');
  assert.equal(m.ongles.nb, 5);
  assert.ok(m.ongles.decal && m.ongles.decal.length === m.ongles.positions.length / 3, 'ongles.decal : lu par l\'affichage'); assert.ok(m.decal && m.decal.length === m.positions.length / 3);
  etat.generique = false; // même empreinte, mais traitée comme celle d'un scan : le pied s'y adapte (plus étroit)
  const s = await traiterMessageA({ type: 'mannequin', cote: 'D', longueur_mm: 265, forme_semelle: false }, etat);
  assert.ok(largeur(s) < 100, 'avec une empreinte, le pied est adapté (largeur ' + largeur(s).toFixed(1) + ' mm)');
});
