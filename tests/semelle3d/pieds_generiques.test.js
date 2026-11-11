// Mode B pour les 2 pieds : message « pieds_generiques » du worker (un pied générique D et un G, réglages propres à chaque pied, sans scan).
import test from 'node:test';
import assert from 'node:assert/strict';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { planVide, ajouterElement } from '../../js/semelle3d/calcul/plan.js';

const T = async (m, etat) => { try { return await traiterMessageA(m, etat); } catch (e) { throw new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message), operator: 'fail' }); } };
const PIEDS = { D: { longueur_mm: 265, largeur_rel: 1, voute_mm: 15 }, G: { longueur_mm: 252, largeur_rel: 1.1, voute_mm: 24 } };
const gen = (etat, pieds = PIEDS) => traiterMessageA({ type: 'pieds_generiques', pieds }, etat);

test('pieds_generiques : D et G imposés, chaque pied garde SA longueur, SA largeur et SA voûte (D 265 ≠ G 252)', async () => {
  const etat = {}, r = await T({ type: 'pieds_generiques', pieds: PIEDS }, etat);
  assert.equal(r.type, 'pieds_generiques'); assert.deepEqual(r.affectation, { A: 'D', B: 'G' }); assert.ok(etat.generique === true);
  assert.ok(etat.pieds.D && etat.pieds.G && etat.pieds.D.generique === true && etat.pieds.G.generique === true);
  assert.equal(r.rapports.A.acquisition.cote, 'D'); assert.equal(r.rapports.B.acquisition.cote, 'G');
  assert.equal(etat.pieds.D.plantaire.rapport.acquisition.longueur_pied_mm, 265); assert.equal(etat.pieds.G.plantaire.rapport.acquisition.longueur_pied_mm, 252);
  assert.equal(etat.pieds.G.plantaire.rapport.acquisition.largeur_rel, 1.1); assert.equal(etat.pieds.G.plantaire.rapport.acquisition.voute_mm, 24);
  assert.equal(etat.pieds.D.plantaire.rapport.acquisition.voute_mm, 15);
  assert.ok(Math.abs(etat.pieds.D.plantaire.rapport.boite.y_max - 265) < 1.5 && Math.abs(etat.pieds.G.plantaire.rapport.boite.y_max - 252) < 1.5);
  assert.ok(r.affichage.A.positions.length > 3000 && r.affichage.B.indices.length > 3000);
  assert.ok(etat.pieds.G.plantaire.grille.z.length > 0 && etat.pieds.G.plantaire.grille !== etat.pieds.D.plantaire.grille);
});
test('pieds_generiques : le pied G est le miroir du D (même réglages -> boîtes symétriques)', async () => {
  const same = { longueur_mm: 262, largeur_rel: 1, voute_mm: 15 }, etat = {}; await T({ type: 'pieds_generiques', pieds: { D: same, G: same } }, etat);
  const bD = etat.pieds.D.plantaire.rapport.boite, bG = etat.pieds.G.plantaire.rapport.boite;
  assert.ok(Math.abs(bD.x_min + bG.x_max) < 1 && Math.abs(bD.x_max + bG.x_min) < 1, 'miroir D/G');
});
test('pieds_generiques : réglages manquants ou invalides = erreur claire, état inchangé', async () => {
  const etat = { pieds: 'avant', plantaire: 'avant', generique: false };
  await assert.rejects(() => gen(etat, { D: PIEDS.D }), /pied G manquants/);
  await assert.rejects(() => gen(etat, { D: PIEDS.D, G: { ...PIEDS.G, longueur_mm: 90 } }), /longueur/);
  await assert.rejects(() => gen(etat, { D: { ...PIEDS.D, largeur_rel: 3 }, G: PIEDS.G }), /larg/);
  assert.ok(etat.pieds === 'avant' && etat.plantaire === 'avant' && etat.generique === false);
});
test('en aval : plan2 construit 2 bases fermées de longueurs différentes, élément commun en miroir, export des 2 STL marqué « indicatif »', async () => {
  const etat = {}; await T({ type: 'pieds_generiques', pieds: PIEDS }, etat);
  let plan = planVide(); plan = ajouterElement(plan, { uid: 'u1', type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 4 }, 'commun');
  const r = await T({ type: 'plan2', plan: { ...plan, base: { commun: { type: 'thermoformee', forme_semelle: true, moulage_tetes: false }, derogations: { D: {}, G: {} } } } }, etat);
  assert.equal(r.pieds.D.rapport.ferme, true); assert.equal(r.pieds.G.rapport.ferme, true);
  assert.ok(r.pieds.D.rapport.bbox && r.pieds.G.rapport.bbox);
  assert.ok(r.pieds.D.rapport.nb_elements === 1 && r.pieds.G.rapport.nb_elements === 1);
  const yD = r.pieds.D.rapport.bbox.max[1] - r.pieds.D.rapport.bbox.min[1], yG = r.pieds.G.rapport.bbox.max[1] - r.pieds.G.rapport.bbox.min[1];
  assert.ok(yD - yG > 8, 'la semelle D est plus longue que la G : ' + yD + ' / ' + yG);
  for (const c of ['D', 'G']) { const e = await T({ type: 'exporter', pied: c }, etat); assert.equal(e.indicatif, true); assert.ok(e.nbTriangles > 1000); }
});
test('retour au mode scan : importer / pied_generique remettent les 2 pieds génériques à zéro', async () => {
  const etat = {}; await T({ type: 'pieds_generiques', pieds: PIEDS }, etat); assert.ok(etat.pieds !== null);
  await T({ type: 'pied_generique', longueur_mm: 262, cote: 'D', largeur_rel: 1, voute_mm: 15 }, etat);
  assert.ok(etat.pieds === null, 'un pied générique seul invalide la paire');
  await T({ type: 'pieds_generiques', pieds: PIEDS }, etat);
  const d = await T({ type: 'demo', scenario: 'reel_droit_stl' }, etat); await T({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  assert.ok(etat.pieds === null && etat.generique === false, 'un scan importé remet la paire à zéro');
});
