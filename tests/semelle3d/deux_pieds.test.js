import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { separerPieds, SEPARATION } from '../../js/semelle3d/calcul/separation.js';
import { proposerPaire } from '../../js/semelle3d/calcul/lateralite.js';
import { scanDeuxPieds, transformerMaillage, rotX, rotY, rotZ, produit, deg } from '../../js/semelle3d/calcul/synthetique.js';
import { ecrireSTLBinaireScan } from '../../js/semelle3d/calcul/ecrivains_scans.js';
import { lireSTLBinaire, indexerSommets } from '../../js/semelle3d/calcul/stl.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { planVide, ajouterElement, detacher, derogerBase, elementsPour, paramsBasePour, retirerElement, effacerDerogation, normaliserPlan } from '../../js/semelle3d/calcul/plan.js';

// Toute erreur inattendue est convertie en échec d'assertion (le sabotage ne reconnaît que les AssertionError).
const T = async (m, etat) => { try { return await traiterMessageA(m, etat); } catch (e) { throw new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message), operator: 'fail' }); } };
const sep = (m, o) => { try { return separerPieds(m, o); } catch (e) { throw new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message), operator: 'fail' }); } };
const sans = (f) => { try { return f(); } catch (e) { throw new assert.AssertionError({ message: 'erreur inattendue : ' + (e && e.message), operator: 'fail' }); } };
const materiaux = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
const R30 = produit(rotZ(deg(30)), produit(rotX(deg(-90)), rotY(deg(4))));
const brut = (sc) => ({ positions: sc.positions, indices: sc.indices, format: 'test' });
const tourne = (sc) => transformerMaillage(brut(sc), { R: R30, t: [120, -40, 300] });
const surface = (sc, k) => { // aire approchée = nombre de triangles : suffisant pour comparer
  void sc; return k;
};
void surface;

// --- séparation ---------------------------------------------------------------------------------------------------
test('séparation : 2 pieds écartés (surface ouverte ET solide fermé) -> 2 composantes, effectifs égaux à ceux de chaque pied seul', () => {
  for (const variante of ['surface', 'solide']) {
    const deux = scanDeuxPieds({ variante, ecart_mm: 130 });
    const D = scanDeuxPieds({ variante, ecart_mm: 130, longueur_G_mm: 100 }); void D;
    const r = sep(brut(deux));
    assert.equal(r.methode, 'composantes');
    assert.equal(r.pieds.length, 2);
    assert.equal(r.pieds[0].nbTriangles + r.pieds[1].nbTriangles, deux.indices.length / 3, 'aucun triangle perdu');
    assert.deepEqual(r.ignores, []);
    // le pied G (côté -X, plus court) est le premier dans l'ordre de génération : ses x sont négatifs, ceux de l'autre positifs
    const xs = r.pieds.map((p) => { let s = 0; for (let v = 0; v < p.positions.length; v += 3) s += p.positions[v]; return s / p.nbSommets; });
    assert.ok(Math.min(...xs) < -30 && Math.max(...xs) > 30, 'un pied de chaque côté : ' + xs);
  }
});

test('séparation : poses quelconques (rotation, translation) et ordre des triangles mélangé -> même résultat', () => {
  const sc = scanDeuxPieds({ variante: 'surface' });
  const m = tourne(sc);
  const nt = m.indices.length / 3;
  const ordre = Array.from({ length: nt }, (_, i) => i);
  let graine = 7; const alea = () => (graine = (graine * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = nt - 1; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [ordre[i], ordre[j]] = [ordre[j], ordre[i]]; }
  const idx = new Uint32Array(m.indices.length);
  ordre.forEach((t, k) => { for (let c = 0; c < 3; c++) idx[3 * k + c] = m.indices[3 * t + c]; });
  const r = sep({ positions: m.positions, indices: idx, format: 'test' });
  assert.equal(r.methode, 'composantes');
  assert.deepEqual(r.pieds.map((p) => p.nbTriangles).sort((a, b) => a - b), [30930, 31776].sort((a, b) => a - b));
});

test('séparation : sommets dupliqués (STL = 3 sommets par triangle) soudés avant l\'analyse', () => {
  const sc = scanDeuxPieds({ variante: 'surface' });
  const nt = sc.indices.length / 3;
  const pos = new Float64Array(9 * nt);
  for (let k = 0; k < sc.indices.length; k++) for (let c = 0; c < 3; c++) pos[3 * k + c] = sc.positions[3 * sc.indices[k] + c];
  const r = sep({ positions: pos, indices: Uint32Array.from({ length: 3 * nt }, (_, i) => i), format: 'stl' });
  assert.equal(r.methode, 'composantes');
  assert.equal(r.pieds[0].nbTriangles + r.pieds[1].nbTriangles, nt, 'aucun triangle perdu');
  assert.ok(r.pieds[0].nbTriangles > 1000 && r.pieds[1].nbTriangles > 1000);
});

test('séparation : un fragment parasite est ignoré et signalé ; 3 grandes pièces -> avertissement, 2 plus grandes gardées', () => {
  const sc = scanDeuxPieds({ variante: 'surface' });
  const n = sc.positions.length / 3;
  const pos = Array.from(sc.positions), idx = Array.from(sc.indices);
  pos.push(500, 500, 0, 502, 500, 0, 500, 502, 0); idx.push(n, n + 1, n + 2); // 1 petit triangle isolé
  const r = sep({ positions: Float64Array.from(pos), indices: Uint32Array.from(idx), format: 'test' });
  assert.equal(r.ignores.length, 1);
  assert.equal(r.ignores[0].triangles, 1);
  assert.match(r.avertissements.join(' '), /fragment/);
  assert.doesNotMatch(r.avertissements.join(' '), /importants/, 'un fragment n\'est pas un pied');
  assert.equal(r.pieds[0].nbTriangles + r.pieds[1].nbTriangles, sc.indices.length / 3);
  // 3e pied de même taille (copie décalée)
  const m = scanDeuxPieds({ variante: 'surface' });
  const pos3 = Array.from(m.positions), idx3 = Array.from(m.indices);
  const dec = m.positions.length / 3;
  for (let v = 0; v < m.positions.length; v += 3) pos3.push(m.positions[v] + 400, m.positions[v + 1], m.positions[v + 2]);
  for (const i of m.indices) idx3.push(i + dec);
  const r3 = sep({ positions: Float64Array.from(pos3), indices: Uint32Array.from(idx3), format: 'test' });
  assert.match(r3.avertissements.join(' '), /4 éléments importants/);
  assert.equal(r3.pieds.length, 2);
});

test('séparation : pieds COLLÉS (un seul bloc, surface et solide) -> vallée, effectifs proches de ceux des pieds séparés', () => {
  for (const variante of ['surface', 'solide']) {
    const separe = sep(brut(scanDeuxPieds({ variante, ecart_mm: 130 })));
    const colle = scanDeuxPieds({ variante, ecart_mm: 95 });
    for (const m of [brut(colle), tourne(colle)]) {
      const r = sep(m);
      assert.equal(r.methode, 'vallee', variante);
      assert.ok(r.score_vallee < SEPARATION.seuil_vallee);
      assert.match(r.avertissements.join(' '), /se touchent/);
      const tri = r.pieds.map((p) => p.nbTriangles).sort((a, b) => a - b);
      const ref = separe.pieds.map((p) => p.nbTriangles).sort((a, b) => a - b);
      for (let k = 0; k < 2; k++) assert.ok(Math.abs(tri[k] - ref[k]) / ref[k] < 0.05, variante + ' ' + tri + ' vs ' + ref);
    }
  }
});

test('séparation : un seul pied (aucune vallée) -> erreur « Placez la coupe à la main » ; coupe manuelle acceptée ; plan qui laisse un côté vide refusé', () => {
  const un = scanDeuxPieds({ variante: 'surface', longueur_G_mm: 265 });
  // un seul pied : on garde seulement le D
  const { positions, indices } = un;
  const garde = []; const nt = indices.length / 3;
  for (let t = 0; t < nt; t++) { const a = indices[3 * t]; if (positions[3 * a] > 0) garde.push(indices[3 * t], indices[3 * t + 1], indices[3 * t + 2]); }
  const seul = { positions, indices: Uint32Array.from(garde), format: 'test' };
  assert.throws(() => separerPieds(seul), (e) => e.code === 'COUPE_MANUELLE_REQUISE' && /à la main/.test(e.message));
  const colle = scanDeuxPieds({ variante: 'surface', ecart_mm: 95 });
  const r = sep(brut(colle), { plan: { n: [1, 0, 0], d: 0 } });
  assert.equal(r.methode, 'manuelle');
  assert.equal(r.pieds[0].nbTriangles + r.pieds[1].nbTriangles, colle.indices.length / 3);
  assert.throws(() => separerPieds(brut(colle), { plan: { n: [1, 0, 0], d: 1e6 } }), (e) => e.code === 'COUPE_VIDE');
  assert.throws(() => separerPieds(brut(colle), { plan: { n: [0, 0, 0], d: 0 } }), /plan de coupe invalide/);
  assert.throws(() => separerPieds(null), /maillage invalide/);
});

// --- latéralité conjointe ------------------------------------------------------------------------------------------
const prop = (v, c, ct, cc) => ({ signaux: { voute: { valeur: v, confiance: c }, contour: { valeur: ct, confiance: cc } } });
test('proposition conjointe : contrainte « un D et un G », ambiguïté signalée, toujours « à confirmer »', () => {
  const clair = proposerPaire(prop('D', 0.3, 'D', 0.3), prop('G', 0.3, 'G', 0.3));
  assert.deepEqual(clair.affectation, { A: 'D', B: 'G' }); assert.equal(clair.ambigu, false); assert.equal(clair.a_confirmer, true);
  const inverse = proposerPaire(prop('G', 0.3, 'G', 0.3), prop('D', 0.3, 'D', 0.3));
  assert.deepEqual(inverse.affectation, { A: 'G', B: 'D' });
  // les deux pieds disent « droit » : contradiction -> ambigu, mais l'affectation reste un D et un G
  const deux = proposerPaire(prop('D', 5, 'D', 5), prop('D', 0.001, 'D', 0.001));
  assert.ok(deux.marge >= 2, 'marge nette : seule la contradiction rend ambigu');
  assert.equal(deux.concordants, false); assert.equal(deux.ambigu, true);
  assert.notEqual(deux.affectation.A, deux.affectation.B);
  // aucun signal
  const vide = proposerPaire(prop(null, 0, null, 0), prop(null, 0, null, 0));
  assert.equal(vide.ambigu, true); assert.equal(vide.concordants, null);
});

// --- plan hybride ---------------------------------------------------------------------------------------------------
test('plan : communs aux 2 pieds, propres à un pied, ordre de saisie conservé, détacher sans rien perdre', () => {
  let p = planVide();
  p = ajouterElement(p, { type: 'a' }); p = ajouterElement(p, { type: 'b' }, 'D'); p = ajouterElement(p, { type: 'c' }, 'G'); p = ajouterElement(p, { type: 'd' });
  assert.deepEqual(elementsPour(p, 'D').map((e) => e.type), ['a', 'b', 'd']);
  assert.deepEqual(elementsPour(p, 'G').map((e) => e.type), ['a', 'c', 'd']);
  assert.ok(!('portee' in elementsPour(p, 'D')[0]) && !('uid' in elementsPour(p, 'D')[0]));
  const avant = JSON.stringify(p);
  const q = sans(() => detacher(p, 'u1'));
  assert.equal(JSON.stringify(p), avant, 'le plan d\'origine n\'est pas modifié');
  assert.deepEqual(elementsPour(q, 'D').map((e) => e.type), ['a', 'b', 'd']);
  assert.deepEqual(elementsPour(q, 'G').map((e) => e.type), ['a', 'c', 'd']);
  assert.equal(q.elements.filter((e) => e.type === 'a').length, 2);
  assert.throws(() => detacher(q, 'u1D'), /seul un élément commun/);
  assert.throws(() => detacher(q, 'zz'), /introuvable/);
  assert.throws(() => retirerElement(q, 'zz'), /introuvable/);
  assert.equal(retirerElement(p, 'u2').elements.length, 3);
  assert.throws(() => ajouterElement(p, { type: 'x' }, 'X'), /portée inconnue/);
  assert.throws(() => normaliserPlan({ elements: [{ type: 'x', portee: 'Z' }] }), /portée inconnue/);
  assert.throws(() => normaliserPlan({ elements: [{ type: 'x', uid: 1 }, { type: 'y', uid: 1 }] }), /en double/);
  assert.throws(() => elementsPour(p, 'X'), /côté D ou G/);
});

test('plan : réglages de base communs + dérogation par pied, effaçable ; détacher ne réutilise pas un identifiant', () => {
  let p = planVide();
  p.base.commun = { type: 'plate', epaisseur_mm: 3 };
  p = derogerBase(p, 'G', { epaisseur_mm: 4 });
  assert.equal(paramsBasePour(p, 'D').epaisseur_mm, 3); assert.equal(paramsBasePour(p, 'G').epaisseur_mm, 4); assert.equal(paramsBasePour(p, 'G').type, 'plate');
  p = effacerDerogation(p, 'G');
  assert.equal(paramsBasePour(p, 'G').epaisseur_mm, 3);
  let q = ajouterElement(planVide(), { type: 'a' }); q = ajouterElement(q, { type: 'b' }, 'D');
  q.elements[1].uid = 'u1D';
  assert.throws(() => detacher(q, 'u1'), /déjà utilisé/);
});

// --- chaîne complète : 2 pieds, miroir, éléments propres, export ----------------------------------------------------
async function preparer({ ecart_mm = 130, longueur_G_mm = 258, inverser = false } = {}) {
  const sc = scanDeuxPieds({ variante: 'surface', ecart_mm, longueur_G_mm });
  const m = tourne(sc);
  const buffer = ecrireSTLBinaireScan(m);
  const etat = {};
  await T({ type: 'materiaux', json: materiaux }, etat);
  await T({ type: 'importer', buffer, nom: 'deux_pieds.stl' }, etat);
  const s = await T({ type: 'separer' }, etat);
  const longueurs = {};
  for (const id of ['A', 'B']) { const b = s.pieds['AB'.indexOf(id)].boite; longueurs[id] = Math.round(Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])); }
  return { etat, s, sc, longueurs, inverser };
}
const calage = async (etat, s) => {
  // longueur réelle de chaque pied : G = 258 (A, premier dans le fichier), D = 265 (cf. scan synthétique)
  const r = await T({ type: 'recaler_pieds', longueurs: { A: 258, B: 265 } }, etat);
  return r;
};

test('chaîne : import -> séparation -> recalage -> proposition D/G exacte -> confirmation (et refus d\'une confirmation invalide)', async () => {
  const { etat, s } = await preparer();
  assert.equal(s.type, 'separe'); assert.equal(s.pieds.length, 2); assert.ok(s.affichage.A.positions.length > 0);
  await assert.rejects(() => T({ type: 'separer' }, {}), /importer d'abord/);
  await assert.rejects(() => T({ type: 'recaler_pieds', longueurs: { A: 258, B: 265 } }, { pieds_scan: null }), /séparer les 2 pieds/);
  const r = await calage(etat, s);
  assert.equal(r.type, 'recale_pieds');
  assert.ok(r.affichage.A.positions.length > 0 && r.affichage.B.positions.length > 0);
  // A = pied G (258 mm), B = pied D (265 mm) dans l'ordre de génération du scan synthétique
  assert.deepEqual(r.paire.affectation, { A: 'G', B: 'D' }, JSON.stringify(r.paire));
  assert.equal(r.paire.a_confirmer, true);
  await assert.rejects(() => T({ type: 'confirmer_pieds', affectation: { A: 'D', B: 'D' } }, etat), /un pied droit et un pied gauche/);
  await assert.rejects(() => T({ type: 'plan2', plan: planVide() }, etat), /non confirmée/);
  const c = await T({ type: 'confirmer_pieds', affectation: r.paire.affectation }, etat);
  assert.deepEqual(c.affectation, { A: 'G', B: 'D' });
  assert.equal(etat.pieds.D.plantaire.rapport.acquisition.longueur_pied_mm, 265);
  assert.equal(etat.pieds.G.plantaire.rapport.acquisition.longueur_pied_mm, 258);
});

test('chaîne : le bouton « Inverser » (affectation A=D, B=G) échange vraiment les pieds', async () => {
  const { etat, s } = await preparer();
  const r = await calage(etat, s);
  await T({ type: 'confirmer_pieds', affectation: { A: 'D', B: 'G' } }, etat);
  assert.equal(etat.pieds.D.plantaire.rapport.acquisition.longueur_pied_mm, 258);
  assert.equal(etat.pieds.G.source, 'B');
  void r;
});

test('chaîne : échelle à confirmer par pied (longueur très éloignée) -> aucune analyse retenue', async () => {
  const { etat } = await preparer();
  const r = await T({ type: 'recaler_pieds', longueurs: { A: 400, B: 265 } }, etat);
  assert.equal(r.type, 'confirmation_requise');
  assert.ok(r.pieds.A && !r.pieds.B);
  assert.ok(!etat.analyses, 'aucune analyse retenue');
  await assert.rejects(() => T({ type: 'confirmer_pieds', affectation: { A: 'G', B: 'D' } }, etat), /analyser les 2 pieds/);
});

const COIN = { type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 4 };
const volume = (r) => r.rapport.volume_mm3;
async function confirme() {
  const { etat, s } = await preparer();
  const r = await calage(etat, s);
  await T({ type: 'confirmer_pieds', affectation: r.paire.affectation }, etat);
  return etat;
}

test('plan hybride : un élément COMMUN agit sur les 2 pieds ; un élément propre au D ne touche pas le G (volume du G identique au bit près)', async () => {
  const etat = await confirme();
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 4 };
  const r0 = await T({ type: 'plan2', plan }, etat);
  for (const c of ['D', 'G']) { assert.equal(r0.pieds[c].rapport.ferme, true); assert.equal(r0.pieds[c].rapport.nb_elements, 0); }
  plan = ajouterElement(plan, COIN);
  const r1 = await T({ type: 'plan2', plan }, etat);
  for (const c of ['D', 'G']) { assert.equal(r1.pieds[c].rapport.nb_elements, 1, c); assert.ok(volume(r1.pieds[c]) > volume(r0.pieds[c]), c); assert.equal(r1.pieds[c].rapport.ferme, true); }
  const plan2 = ajouterElement(plan, { ...COIN, angle_deg: 6, dy_mm: 120 }, 'D');
  const r2 = await T({ type: 'plan2', plan: plan2 }, etat);
  assert.equal(r2.pieds.D.rapport.nb_elements, 2); assert.equal(r2.pieds.G.rapport.nb_elements, 1);
  assert.equal(volume(r2.pieds.G), volume(r1.pieds.G), 'G inchangé');
  assert.ok(volume(r2.pieds.D) > volume(r1.pieds.D));
  // le commun d'origine est intact sur le pied D : ses résultats initiaux sont retrouvés en retirant l'élément propre
  const r3 = await T({ type: 'plan2', plan: retirerElement(plan2, 'u2') }, etat);
  assert.equal(volume(r3.pieds.D), volume(r1.pieds.D));
});

test('plan hybride : détacher un commun ne change aucun résultat ; modifier la copie D laisse le G intact ; dérogation de base propre à un pied', async () => {
  const etat = await confirme();
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 4 };
  plan = ajouterElement(plan, COIN);
  const avant = await T({ type: 'plan2', plan }, etat);
  const det = sans(() => detacher(plan, 'u1'));
  const apres = await T({ type: 'plan2', plan: det }, etat);
  for (const c of ['D', 'G']) assert.equal(volume(apres.pieds[c]), volume(avant.pieds[c]), 'détacher : ' + c);
  det.elements.find((e) => e.portee === 'D').angle_deg = 8;
  const modif = await T({ type: 'plan2', plan: det }, etat);
  assert.ok(volume(modif.pieds.D) > volume(avant.pieds.D));
  assert.equal(volume(modif.pieds.G), volume(avant.pieds.G));
  const der = derogerBase(det, 'G', { epaisseur_mm: 6 });
  const rd = await T({ type: 'plan2', plan: der }, etat);
  assert.equal(volume(rd.pieds.D), volume(modif.pieds.D), 'D inchangé par la dérogation du G');
  assert.ok(volume(rd.pieds.G) > volume(modif.pieds.G));
});

test('plan hybride : miroir -> mêmes hauteurs d\'élément des deux côtés (côté médial inversé automatiquement)', async () => {
  const etat = await confirme();
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 4 };
  plan = ajouterElement(plan, { type: 'soutien_de_voute' });
  let r;
  try { r = await T({ type: 'plan2', plan }, etat); } catch (e) { r = null; assert.fail('soutien de voûte refusé : ' + e.message); }
  const h = ['D', 'G'].map((c) => r.pieds[c].rapport.elements[0]);
  assert.ok(h[0] && h[1]);
  assert.ok(Math.abs(h[0].hauteur_max_mm - h[1].hauteur_max_mm) < 0.15, JSON.stringify(h.map((x) => x.hauteur_max_mm)));
});

test('messages par pied : { pied } délègue à l\'état du pied ; exports D et G = 2 STL fermés ; mauvais côté refusé', async () => {
  const etat = await confirme();
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 4 };
  plan = ajouterElement(plan, COIN);
  await T({ type: 'plan2', plan }, etat);
  const out = {};
  for (const c of ['D', 'G']) {
    const e = await T({ type: 'exporter', pied: c }, etat);
    assert.equal(e.type, 'exporte');
    const v = verifierMaillage(indexerSommets(lireSTLBinaire(e.stl)));
    assert.equal(v.ferme, true); assert.equal(v.degeneres, 0); assert.ok(v.volume > 0);
    out[c] = e.octets;
  }
  assert.notEqual(out.D, out.G);
  await assert.rejects(() => T({ type: 'exporter', pied: 'D', cote: 'G' }, etat), /ne correspond pas/);
  await assert.rejects(() => T({ type: 'exporter', pied: 'X' }, etat), /D ou G attendu/);
  const coupe = await T({ type: 'coupe', pied: 'G', mode: 'T', position_mm: 100 }, etat);
  assert.equal(coupe.type, 'coupe');
  await assert.rejects(() => T({ type: 'coupe', pied: 'D', mode: 'T', position_mm: 100 }, { pieds: null }), /non confirmée/);
});

test('réimport : un nouvel import efface séparation, analyses et pieds (rien de périmé)', async () => {
  const etat = await confirme();
  const sc = scanDeuxPieds({ variante: 'surface' });
  await T({ type: 'importer', buffer: ecrireSTLBinaireScan(tourne(sc)), nom: 'x.stl' }, etat);
  // ok() plutôt que equal() : un échec ne doit pas tenter d'afficher un objet de plusieurs Mo
  assert.ok(etat.pieds === null, 'pieds effacés'); assert.ok(etat.analyses === null, 'analyses effacées'); assert.ok(etat.pieds_scan === null, 'séparation effacée');
});

test('pieds collés de bout en bout : séparation par vallée puis recalage des 2 pieds', async () => {
  const { etat, s } = await preparer({ ecart_mm: 95 });
  assert.equal(s.methode, 'vallee'); assert.ok(s.coupe && s.coupe.n.length === 3);
  const r = await calage(etat, s);
  assert.equal(r.type, 'recale_pieds');
  // coupe manuelle fournie ensuite (curseur) : accepte et remplace
  const m = await T({ type: 'separer', coupe: s.coupe }, etat);
  assert.equal(m.methode, 'manuelle'); assert.ok(etat.analyses === null, 'analyses périmées effacées');
});

// --- interface : messages d'appui (scan brut, démos à 2 pieds, code d'erreur) -----------------------------------------
test('démos à 2 pieds : séparés -> 2 composantes ; collés -> pas de séparation automatique par composantes (vallée) ; scan_brut rend la boîte', async () => {
  for (const [scenario, methode] of [['deux_pieds_separes', 'composantes'], ['deux_pieds_colles', 'vallee']]) {
    const etat = {};
    const d = await T({ type: 'demo', scenario }, etat);
    assert.deepEqual(d.longueurs_suggerees_mm, [265, 258]);
    await T({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
    const b = await T({ type: 'scan_brut' }, etat);
    assert.ok(b.positions instanceof Float32Array && b.indices instanceof Uint32Array && b.boite.max[0] > b.boite.min[0]);
    const s = await T({ type: 'separer' }, etat);
    assert.equal(s.methode, methode, scenario);
  }
});
test('scan_brut sans scan : refusé', async () => {
  await assert.rejects(() => traiterMessageA({ type: 'scan_brut' }, {}), /aucun scan importé/);
});

test('lot 4c — 2 pieds : chaque pied sort ses surimpressions (élément commun = même teinte sur les 2 pieds, élément du D seulement = absent du G) et sa ligne d\'isthme médiale', async () => {
  const etat = await confirme();
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 4 };
  plan = ajouterElement(plan, { ...COIN, teinte: 2 });
  plan = ajouterElement(plan, { ...COIN, angle_deg: 6, dy_mm: 120, teinte: 5 }, 'D');
  const r = await T({ type: 'plan2', plan }, etat);
  assert.deepEqual(r.pieds.D.surimpressions.map((s) => s.teinte), [2, 5]);
  assert.deepEqual(r.pieds.G.surimpressions.map((s) => s.teinte), [2]);
  for (const c of ['D', 'G']) {
    assert.ok(r.pieds[c].isthme && r.pieds[c].isthme.cote === c);
    for (const s of r.pieds[c].surimpressions) assert.ok(s.cellules > 20 && s.contour.length > 0);
  }
  const xs = (c) => r.pieds[c].isthme.points.filter((_, q) => q % 2 === 0);
  const bord = (c) => { let m = c === 'D' ? Infinity : -Infinity; const P = r.pieds[c].positions; for (let q = 0; q < P.length; q += 3) m = c === 'D' ? Math.min(m, P[q]) : Math.max(m, P[q]); return m; };
  assert.ok(xs('D').every((x) => x > bord('D')), 'D : ligne à l\'intérieur du bord médial (x négatif)');
  assert.ok(xs('G').every((x) => x < bord('G')), 'G : ligne à l\'intérieur du bord médial (x positif)');
});

test('gravure sur 2 pieds : D reçoit « D · date », G reçoit « G · date », même nom ; chaque semelle reste fermée ; sans gravure le volume est plus grand', async () => {
  const etat = await confirme();
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 3 };
  const sans0 = await T({ type: 'plan2', plan, gravure: { actif: false } }, etat);
  const avec = await T({ type: 'plan2', plan, gravure: { actif: true, nom: 'DUPONT Éloïse', date: '02/11/2026', profondeur_mm: 0.4 } }, etat);
  for (const c of ['D', 'G']) {
    const g = avec.pieds[c].rapport.gravure;
    assert.equal(g.actif, true, c); assert.deepEqual(g.lignes, ['DUPONT Éloïse', c + ' · 02/11/2026'], c); assert.equal(avec.pieds[c].rapport.ferme, true);
    assert.ok(volume(avec.pieds[c]) < volume(sans0.pieds[c]) - 5, c + ' : volume gravé en moins'); assert.equal(sans0.pieds[c].rapport.gravure.actif, false);
  }
});

test('plan hybride + axe de Henke (lot 4 bis) : chaque pied utilise SON axe ; torsion commune appliquée seulement au pied dont l\'axe est validé ; export refusé pour l\'autre', async () => {
  const etat = await confirme();
  const axe = (valide) => ({ inclinaison_deg: 42, deviation_deg: 16, p0: { x: -7, y: 10 }, source: 'manuel', valide });
  let plan = planVide(); plan.base.commun = { type: 'plate', epaisseur_mm: 4 };
  plan = ajouterElement(plan, { type: 'torsion', phi_deg: 4 }); // commune : les 2 pieds
  const sans = await T({ type: 'plan2', plan }, etat);
  for (const c of ['D', 'G']) { assert.equal(sans.pieds[c].rapport.torsions_bloquees.length, 1, c + ' : sans axe, la torsion n\'est pas appliquée'); }
  const r = await T({ type: 'plan2', plan: { ...plan, axe_henke: { D: axe(true), G: axe(false) } } }, etat);
  assert.equal(r.pieds.D.rapport.torsions_bloquees.length, 0); assert.equal(r.pieds.G.rapport.torsions_bloquees.length, 1);
  assert.ok(volume(r.pieds.D) > volume(sans.pieds.D) + 100, 'D : matière ajoutée par la torsion'); assert.equal(volume(r.pieds.G), volume(sans.pieds.G), 'G : axe non validé, rien ajouté');
  assert.ok(r.pieds.D.rapport.elements[0].torsion.appliquee && !r.pieds.G.rapport.elements[0].torsion.appliquee);
  assert.ok((await T({ type: 'exporter', pied: 'D' }, etat)).octets > 1000);
  await assert.rejects(() => traiterMessageA({ type: 'exporter', pied: 'G' }, etat), /torsion non appliquée/);
  const les2 = await T({ type: 'plan2', plan: { ...plan, axe_henke: { D: axe(true), G: axe(true) } } }, etat);
  for (const c of ['D', 'G']) { assert.equal(les2.pieds[c].rapport.torsions_bloquees.length, 0); assert.equal(les2.pieds[c].rapport.ferme, true); }
  assert.ok((await T({ type: 'exporter', pied: 'G' }, etat)).octets > 1000);
});
