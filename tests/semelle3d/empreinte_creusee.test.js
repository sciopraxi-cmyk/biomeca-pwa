// Étape A « empreinte unique » : une boîte d'empreinte CREUSÉE (fictive) est convertie en la même empreinte qu'un pied
// en décharge bombé (même relief, même repère, même côté). Aucune donnée réelle : tout est généré par le code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scanPiedSurface, transformerMaillage, rotX, rotY, rotZ, produit, deg } from '../../js/semelle3d/calcul/synthetique.js';
import { modelePiedRealiste } from '../../js/semelle3d/calcul/pied_realiste.js';
import { boiteEmpreinteFictive } from '../../js/semelle3d/calcul/boite_fictive.js';
import { analyserScan, importerScan, fabriquerDemo, fabriquerDemoDeuxPieds, SCENARIOS_DEMO, SCENARIOS_DEMO_2P } from '../../js/semelle3d/calcul/modeA.js';
import { recaler } from '../../js/semelle3d/calcul/recalage.js';
import { analyserBoite, convertirCreusee } from '../../js/semelle3d/calcul/empreinte_creusee.js';
import { ecrireSTLBinaireScan } from '../../js/semelle3d/calcul/ecrivains_scans.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { pose } from './aides.js';

// Le sabotage ne reconnaît que les AssertionError : toute autre erreur est convertie.
const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } };

const POSES = [
  produit(rotZ(deg(30)), produit(rotX(deg(-90)), rotY(deg(4)))),
  produit(rotZ(deg(200)), rotX(deg(60))),
];
const L = 265;

function paire(cote, R, { facteur = 1 } = {}) {
  const modele = modelePiedRealiste({ cote, longueur_mm: L, voute_mm: 15 });
  const bombe = transformerMaillage(scanPiedSurface({ modele, pas_mm: 1 }), { R: POSES[0], t: [120, -40, 300], facteur });
  const boite = transformerMaillage(boiteEmpreinteFictive({ cote, longueur_mm: L, voute_mm: 15 }), { R, t: [10, 20, 30], facteur });
  return { bombe, boite };
}

// Compare deux grilles H_plantaire dans le même repère (cellule par cellule).
function comparer(g1, g2) {
  let n = 0, somme = 0, max = 0, difference = 0;
  for (let j = 0; j < g1.ny; j++) for (let i = 0; i < g1.nx; i++) {
    const z1 = g1.z[j * g1.nx + i];
    const ic = Math.round((g1.ox + i * g1.pas - g2.ox) / g2.pas), jc = Math.round((g1.oy + j * g1.pas - g2.oy) / g2.pas);
    const z2 = ic >= 0 && jc >= 0 && ic < g2.nx && jc < g2.ny ? g2.z[jc * g2.nx + ic] : NaN;
    if (Number.isFinite(z1) && Number.isFinite(z2)) { n++; const d = Math.abs(z1 - z2); somme += d; if (d > max) max = d; } else if (Number.isFinite(z1) !== Number.isFinite(z2)) difference++;
  }
  return { n, moyen: n ? somme / n : Infinity, max, difference };
}

for (const cote of ['D', 'G']) {
  POSES.forEach((R, k) => {
    test('empreinte unique : boîte creusée ' + cote + ' (pose ' + (k + 1) + ') = même relief que le pied en décharge bombé (écart moyen ≤ 0,5 mm, max ≤ 1,2 mm)', () => garde(() => {
      const { bombe, boite } = paire(cote, R);
      const a = analyserScan(bombe, { longueur_mm: L });
      const b = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' });
      assert.equal(b.confirmation_requise, false);
      const c = comparer(a.grille, b.grille);
      assert.ok(c.n > 50000, 'cellules communes : ' + c.n);
      assert.ok(c.moyen <= 0.5, 'écart moyen ' + c.moyen.toFixed(2));
      assert.ok(c.max <= 1.2, 'écart max ' + c.max.toFixed(2));
      assert.ok(c.difference < 0.01 * c.n, 'cellules couvertes d\'un seul côté : ' + c.difference);
      assert.ok(Math.abs(a.rapport.grille.hauteur_max_mm - b.rapport.grille.hauteur_max_mm) < 1, 'hauteur max');
      // même repère : boîtes englobantes à 1 mm près
      for (const k2 of ['x_min', 'x_max', 'y_min', 'y_max']) assert.ok(Math.abs(a.rapport.boite[k2] - b.rapport.boite[k2]) < 2, 'boîte ' + k2);
    }));

    test('côté : la boîte creusée ' + cote + ' (pose ' + (k + 1) + ') est lue comme le pied ' + cote + ', toujours « à confirmer » avec avertissement de miroir', () => garde(() => {
      const { boite } = paire(cote, R);
      const b = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' });
      const c = b.rapport.propositions.cote;
      assert.equal(c.valeur, cote);
      assert.equal(c.ambigu, true);
      assert.equal(c.a_confirmer, true);
      assert.match(c.avertissement, /miroir/);
      assert.match(b.rapport.avertissements[0], /miroir/);
      assert.equal(b.rapport.acquisition.type_empreinte, 'creusee');
    }));

    test('sans la conversion (boîte lue comme un pied en décharge) le relief est retourné : le test précédent prouve donc quelque chose (' + cote + ', pose ' + (k + 1) + ')', () => garde(() => {
      const { bombe, boite } = paire(cote, R);
      const a = analyserScan(bombe, { longueur_mm: L });
      const d = analyserScan(boite, { longueur_mm: L, type_empreinte: 'decharge', confirmeEcart: true });
      assert.ok(d.rapport.grille.hauteur_max_mm > 2 * a.rapport.grille.hauteur_max_mm, 'hauteur sans conversion ' + d.rapport.grille.hauteur_max_mm.toFixed(1));
      assert.match(d.rapport.avertissements[0], /boîte d'empreinte creusée/);
    }));
  });
}

test('profondeur de la cavité annoncée = profondeur de la boîte fictive (45 mm) à 2 mm près ; mesures du bord et de la cavité', () => garde(() => {
  const { boite } = paire('D', POSES[1]);
  const r = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' }).rapport;
  assert.ok(Math.abs(r.conversion.profondeur_mm - 45) < 2, 'profondeur ' + r.conversion.profondeur_mm);
  assert.ok(r.conversion.plateau_pct > 40 && r.conversion.plateau_pct < 60, 'bord ' + r.conversion.plateau_pct);
  assert.ok(r.conversion.triangles_gardes < r.conversion.triangles_total / 2);
}));

test('unités non supposées : boîte exportée en pouces -> même empreinte après confirmation d\'échelle', () => garde(() => {
  const { bombe, boite } = paire('D', POSES[1], { facteur: 1 / 25.4 });
  const r = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' });
  assert.equal(r.confirmation_requise, true);
  const b = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee', confirmeEcart: true });
  const a = analyserScan(paire('D', POSES[0]).bombe, { longueur_mm: L });
  void bombe;
  const c = comparer(a.grille, b.grille);
  assert.ok(c.moyen <= 0.6 && c.max <= 1.5, 'moyen ' + c.moyen.toFixed(2) + ' max ' + c.max.toFixed(2));
}));

test('détection : la boîte fictive est reconnue (bord ≈ 50 % de la surface, cavité du même côté)', () => garde(() => {
  const a = analyserBoite(paire('D', POSES[0]).boite);
  assert.equal(a.creusee, true);
  assert.ok(a.plateau_pct > 0.4 && a.cavite_pct > 0.4 && a.cote_unique > 0.95);
}));

test('détection sur les fichiers : démos (7 + 2 pieds) et pied solide -> « décharge » ; boîte STL -> « creusee » + avertissement à l\'import', async () => {
  for (const cle of Object.keys(SCENARIOS_DEMO)) {
    const d = fabriquerDemo(cle);
    const { info } = await importerScan(d.buffer, d.nom);
    assert.equal(info.type_probable, 'decharge', cle);
  }
  for (const cle of Object.keys(SCENARIOS_DEMO_2P)) {
    const d = fabriquerDemoDeuxPieds(cle);
    const { info } = await importerScan(d.buffer, d.nom);
    assert.equal(info.type_probable, 'decharge', cle);
  }
  const solide = pose({ variante: 'solide' }).mesh;
  assert.equal((await importerScan(ecrireSTLBinaireScan(solide), 's.stl')).info.type_probable, 'decharge');
  const { boite } = paire('G', POSES[1]);
  const { info } = await importerScan(ecrireSTLBinaireScan(boite), 'boite_fictive.stl');
  assert.equal(info.type_probable, 'creusee');
  assert.match(info.avertissements.join(' '), /boîte d'empreinte creusée/);
});

test('scan sans bord plan ni cavité choisi comme « boîte creusée » : erreur claire (code creusee_introuvable), jamais un relief inventé', () => garde(() => {
  const { mesh } = pose({});
  assert.throws(() => convertirCreusee(mesh), (e) => e.code === 'creusee_introuvable' && /Pied en décharge/.test(e.message));
  assert.throws(() => analyserScan(mesh, { longueur_mm: 262, type_empreinte: 'creusee' }), (e) => e.code === 'creusee_introuvable');
}));

test('type d\'empreinte inconnu refusé ; absent = « décharge » (comportement d\'avant inchangé)', () => garde(() => {
  const { mesh, L: Lp } = pose({ decalage: 0, lacet: 30, roulis: 5 });
  assert.throws(() => analyserScan(mesh, { longueur_mm: Lp, type_empreinte: 'moule' }), /type d'empreinte inconnu/);
  const r = analyserScan(mesh, { longueur_mm: Lp });
  assert.equal(r.rapport.acquisition.type_empreinte, 'decharge');
  assert.equal(r.rapport.conversion, null);
  assert.equal(r.rapport.avertissements.filter((t) => /boîte/.test(t)).length, 0);
}));

test('chemin du worker : importer -> recaler avec type_empreinte « creusee » -> même résultat qu\'en appel direct', async () => {
  const { boite, bombe } = paire('D', POSES[1]);
  const etat = {};
  await traiterMessageA({ type: 'importer', buffer: ecrireSTLBinaireScan(boite), nom: 'boite_fictive.stl' }, etat);
  const r = await traiterMessageA({ type: 'recaler', longueur_mm: L, type_empreinte: 'creusee' }, etat);
  assert.equal(r.type, 'recale');
  assert.equal(r.rapport.acquisition.type_empreinte, 'creusee');
  assert.equal(r.rapport.propositions.cote.valeur, 'D');
  const a = analyserScan(bombe, { longueur_mm: L });
  assert.ok(Math.abs(r.rapport.grille.hauteur_max_mm - a.rapport.grille.hauteur_max_mm) < 1);
  // le type choisi sur le message « importer » suivant ne persiste pas : sans type, retour au comportement « décharge »
  await traiterMessageA({ type: 'importer', buffer: ecrireSTLBinaireScan(boite), nom: 'boite_fictive.stl' }, etat);
  const r2 = await traiterMessageA({ type: 'recaler', longueur_mm: L, confirmeEcart: true }, etat);
  assert.equal(r2.rapport.acquisition.type_empreinte, 'decharge');
});

test('démos du banc : les 2 boîtes fictives passent par le message « demo » du worker, sont reconnues à l\'import, converties, et lues D / G', async () => {
  for (const [scenario, cote] of [['boite_creusee_droit', 'D'], ['boite_creusee_gauche', 'G']]) {
    const etat = {};
    const d = await traiterMessageA({ type: 'demo', scenario }, etat);
    assert.equal(d.cote_reel, cote);
    const i = await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
    assert.equal(i.info.type_probable, 'creusee');
    const r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm, type_empreinte: 'creusee' }, etat);
    assert.equal(r.type, 'recale');
    assert.equal(r.rapport.propositions.cote.valeur, cote);
    assert.ok(r.rapport.grille.hauteur_max_mm > 10 && r.rapport.grille.hauteur_max_mm < 25, 'hauteur max ' + r.rapport.grille.hauteur_max_mm);
  }
});

test('8 poses quelconques de la boîte (la normale du bord pointe d\'un côté ou de l\'autre) : toujours le même relief que le pied bombé, et les deux sens ont été rencontrés', () => garde(() => {
  const a = analyserScan(paire('D', POSES[0]).bombe, { longueur_mm: L });
  const vus = new Set();
  for (const [x, y, z] of [[0, 0, 0], [180, 0, 0], [0, 180, 0], [90, 0, 0], [-90, 45, 10], [30, 200, 100], [120, -30, 250], [0, 0, 90]]) {
    const R = produit(rotZ(deg(z)), produit(rotY(deg(y)), rotX(deg(x))));
    const { boite } = paire('D', R);
    vus.add(analyserBoite(boite).sgn);
    const b = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' });
    const c = comparer(a.grille, b.grille);
    assert.ok(c.moyen <= 0.5 && c.max <= 1.2, 'pose ' + [x, y, z] + ' : moyen ' + c.moyen.toFixed(2) + ' max ' + c.max.toFixed(2));
    assert.equal(b.rapport.propositions.cote.valeur, 'D', 'côté, pose ' + [x, y, z]);
  }
  assert.equal(vus.size, 2, 'les deux sens de la normale doivent être testés');
}));

test('recalage avec « versPied » : le sens du pied est imposé (relief juste) ; le sens contraire retourne le relief ; sans versPied rien n\'est imposé', () => garde(() => {
  const { boite } = paire('D', POSES[1]);
  const conv = convertirCreusee(boite);
  const bon = recaler(conv.mesh, L, { versPied: conv.versPied });
  const inverse = recaler(conv.mesh, L, { versPied: conv.versPied.map((v) => -v) });
  assert.equal(bon.propositions.sens_vertical.imposee, true);
  assert.equal(bon.propositions.sens_vertical.ambigu, false);
  const Zb = bon.transformation.axes.Z, Zi = inverse.transformation.axes.Z;
  assert.ok(Zb[0] * Zi[0] + Zb[1] * Zi[1] + Zb[2] * Zi[2] < -0.9, 'les axes verticaux doivent être opposés');
  // le bon sens met le pied du côté du bord de la boîte : la cavité est au-dessus du plan d'appui (z >= 0 pour tous les points gardés)
  assert.ok(bon.boite.z_min > -2 && bon.boite.z_max > 5, 'bon sens : z de ' + bon.boite.z_min.toFixed(1) + ' à ' + bon.boite.z_max.toFixed(1));
  assert.ok(inverse.boite.z_min < bon.boite.z_min || inverse.boite.z_max !== bon.boite.z_max);
  assert.notEqual(inverse.propositions.sens_vertical.valeur, bon.propositions.sens_vertical.valeur);
  assert.equal(recaler(conv.mesh, L, {}).propositions.sens_vertical.imposee, undefined);
}));
