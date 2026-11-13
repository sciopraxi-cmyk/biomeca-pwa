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
import { construireBase } from '../../js/semelle3d/calcul/base.js';
import { maillageAffichage, distanceAuPied, COQUE_EMPREINTE_MM } from '../../js/semelle3d/calcul/modeA.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { rasteriser } from '../../js/semelle3d/calcul/rasterisation.js';
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
      assert.ok(c.difference < 0.025 * c.n, 'cellules couvertes d\'un seul côté : ' + c.difference); // le contour est lissé (coins arrondis, creux entre orteils comblés) : ~1 % de cellules en plus ou en moins
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

test('cas du premier vrai scan : mousse affaissée de 6 mm en bande sur toute la largeur du scan (le creux « touche » les bords), boîte en MÈTRES : reconnue, détourée sur le pied seul, côté juste, même relief', () => garde(() => {
  const modele = modelePiedRealiste({ cote: 'G', longueur_mm: L, voute_mm: 15 });
  const bombe = transformerMaillage(scanPiedSurface({ modele, pas_mm: 1 }), { R: POSES[0], t: [120, -40, 300] });
  const b = boiteEmpreinteFictive({ cote: 'G', longueur_mm: L, voute_mm: 15, affaissement_mm: 6, marge_y_mm: 200, pas_mm: 2 });
  const boite = transformerMaillage(b, { R: POSES[1], t: [10, 20, 30], facteur: 0.001 });
  const a = analyserBoite(boite);
  assert.equal(a.creusee, true, 'reconnue (marge ' + a.marge.toFixed(2) + ')');
  const conv = convertirCreusee(boite);
  // détourée : le creux gardé est le pied, pas toute la bande d'affaissement (la bande fait toute la largeur du scan, ~ 2 x la largeur du pied)
  const gardeSurTotal = conv.mesures.triangles_gardes / conv.mesures.triangles_total;
  assert.ok(gardeSurTotal < 0.3, 'part gardée ' + gardeSurTotal.toFixed(2));
  const ref = analyserScan(bombe, { longueur_mm: L });
  const avant = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' });
  assert.equal(avant.confirmation_requise, true);
  assert.equal(avant.echelle.unite_probable, 'm');
  const r = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee', confirmeEcart: true });
  assert.equal(r.rapport.propositions.cote.valeur, 'G');
  const c = comparer(ref.grille, r.grille);
  assert.ok(c.moyen <= 0.6 && c.max <= 1.5, 'moyen ' + c.moyen.toFixed(2) + ' max ' + c.max.toFixed(2));
  // sans le critère « plus profond que la moitié du creux », la bande d'affaissement serait gardée avec le pied : la boîte serait mal détourée
  assert.ok(r.rapport.boite.x_max - r.rapport.boite.x_min < 140, 'largeur du détourage ' + (r.rapport.boite.x_max - r.rapport.boite.x_min).toFixed(0));
}));

test('scan coupé dans le creux (bord large, le pied dépasse du scan, scan posé de travers) : marge nulle, donc pas pris pour une boîte -> erreur claire plutôt qu\'un demi-pied converti', () => garde(() => {
  // bord très large pour que ce soit bien la MARGE (et non la part du bord) qui décide
  const b = boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, marge_mm: 220, marge_y_mm: 300, pas_mm: 3 });
  const garde2 = [];
  for (let t = 0; t < b.indices.length; t += 3) {
    const k = [0, 1, 2].map((q) => 3 * b.indices[t + q]);
    const y = (b.positions[k[0] + 1] + b.positions[k[1] + 1] + b.positions[k[2] + 1]) / 3;
    if (y < 0.3 * L) garde2.push(b.indices[t], b.indices[t + 1], b.indices[t + 2]); // coupe droite dans le creux, scan posé de travers (POSES[1])
  }
  const coupe = transformerMaillage({ positions: b.positions, indices: Uint32Array.from(garde2) }, { R: POSES[1], t: [10, 20, 30] });
  const a = analyserBoite(coupe);
  assert.ok(a.plateau_pct >= 0.3 && a.cavite_pct >= 0.05 && a.cote_unique >= 0.75, 'les autres critères sont satisfaits : bord ' + a.plateau_pct.toFixed(2) + ' cavité ' + a.cavite_pct.toFixed(2));
  assert.ok(a.cav.remplissage >= 0.75, 'scan rectangulaire : ' + a.cav.remplissage.toFixed(2));
  assert.ok(a.marge < 0.02, 'marge ' + a.marge.toFixed(3));
  assert.equal(a.creusee, false);
  assert.throws(() => convertirCreusee(coupe), (e) => e.code === 'creusee_introuvable');
}));

test('une 2e cavité isolée dans le bord (vis, trou : 30 mm de profondeur) n\'est pas gardée avec le pied : même relief que le pied bombé', () => garde(() => {
  const b = boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15 });
  const cx = b.modele.x0 + b.modele.largeur_grille_mm + 14, cy = 120;
  for (let v = 0; v < b.positions.length; v += 3) if (Math.hypot(b.positions[v] - cx, b.positions[v + 1] - cy) < 8) b.positions[v + 2] = -30;
  const boite = transformerMaillage(b, { R: POSES[1], t: [10, 20, 30] });
  const a = analyserScan(paire('D', POSES[0]).bombe, { longueur_mm: L });
  const r = analyserScan(boite, { longueur_mm: L, type_empreinte: 'creusee' });
  const c = comparer(a.grille, r.grille);
  assert.ok(c.moyen <= 0.5 && c.max <= 1.2, 'moyen ' + c.moyen.toFixed(2) + ' max ' + c.max.toFixed(2));
  assert.ok(c.difference < 0.025 * c.n, 'cellules d\'un seul côté : ' + c.difference);
}));

test('scan NON rectangulaire (plaque triangulaire plane avec une bosse centrale, marge confortable) : pas une boîte — seul le critère « scan rectangulaire » le dit', () => garde(() => {
  const pas = 2, N = 150, pos = [], idx = [], num = new Int32Array((N + 1) * (N + 1)).fill(-1);
  const dedans = (i, j) => i + j <= N - 2 && i >= 1 && j >= 1;
  const sommet = (i, j) => { const k = j * (N + 1) + i; if (num[k] < 0) { num[k] = pos.length / 3; const d = Math.hypot(i * pas - 80, j * pas - 80); pos.push(i * pas, j * pas, d < 30 ? 25 * Math.cos((d / 30) * Math.PI / 2) : 0); } return num[k]; };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (dedans(i, j) && dedans(i + 1, j) && dedans(i, j + 1) && dedans(i + 1, j + 1)) {
    const a = sommet(i, j), b = sommet(i + 1, j), c = sommet(i + 1, j + 1), d = sommet(i, j + 1); idx.push(a, b, c, a, c, d);
  }
  const m = transformerMaillage({ positions: Float64Array.from(pos), indices: Uint32Array.from(idx) }, { R: POSES[1], t: [10, 20, 30] });
  const a = analyserBoite(m);
  assert.ok(a.plateau_pct >= 0.3 && a.cavite_pct >= 0.05 && a.cote_unique >= 0.75 && a.marge >= 0.02, 'autres critères satisfaits : bord ' + a.plateau_pct.toFixed(2) + ' cavité ' + a.cavite_pct.toFixed(2) + ' unique ' + a.cote_unique.toFixed(2) + ' marge ' + a.marge.toFixed(3));
  assert.ok(a.cav.remplissage < 0.75, 'remplissage ' + a.cav.remplissage.toFixed(2));
  assert.equal(a.creusee, false);
}));

test('îlot peu profond DANS le creux (voûte plus haute que la moitié de la profondeur) : le trou est rempli, l\'îlot reste dans l\'empreinte (pas de trou dans le pied)', () => garde(() => {
  const nb = (avecIlot) => {
    const b = boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15 });
    if (avecIlot) for (let v = 0; v < b.positions.length; v += 3) if (Math.hypot(b.positions[v] - (-2), b.positions[v + 1] - 150) < 14 && b.modele.dedans(b.positions[v], b.positions[v + 1])) b.positions[v + 2] = -8; // 8 mm sous le bord : bien moins que la moitié de 45 mm
    return convertirCreusee(transformerMaillage(b, { R: POSES[1], t: [10, 20, 30] })).mesures.triangles_gardes;
  };
  const sans = nb(false), avec = nb(true);
  assert.ok(Math.abs(avec - sans) < 0.03 * sans, 'triangles gardés : sans îlot ' + sans + ', avec îlot ' + avec);
}));

// ---- Bords qui remontent (comme GESPODO) : la paroi du creux est gardée jusqu'à « point le plus haut du pied + bords_mm » ----
const boitePente = (cote = 'D') => transformerMaillage(boiteEmpreinteFictive({ cote, longueur_mm: L, voute_mm: 15, pente_mm: 25 }), { R: POSES[1], t: [10, 20, 30] });
const nbMurs = (g) => { let n = 0, zmax = -Infinity; if (g.murs) for (const v of g.murs) if (Number.isFinite(v)) { n++; if (v > zmax) zmax = v; } return { n, zmax }; };

test('bords : 0 mm = fond du creux seul (aucun bord) ; le relief du pied est IDENTIQUE avec ou sans bords', () => garde(() => {
  const m = boitePente();
  const a0 = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 0 });
  const a10 = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 10 });
  assert.equal(nbMurs(a0.grille).n, 0);
  assert.equal(a0.rapport.conversion.bords, null);
  assert.ok(nbMurs(a10.grille).n > 5000, 'cellules de bords : ' + nbMurs(a10.grille).n);
  const c = comparer(a0.grille, a10.grille);
  assert.equal(c.max, 0, 'le pied ne bouge pas : écart max ' + c.max);
  assert.equal(c.difference, 0);
}));

test('bords : la hauteur gardée est « point le plus haut du pied + bords_mm » (réglage 10 puis 30 mm), jamais au-delà ; les bords sont HORS du pied', () => garde(() => {
  const m = boitePente();
  const r10 = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 10 });
  const r30 = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 30 });
  const hpied = r10.rapport.boite.z_max; // point le plus haut du pied (boîte du recalage)
  const z10 = nbMurs(r10.grille).zmax, z30 = nbMurs(r30.grille).zmax;
  assert.ok(z10 <= hpied + 10 + 0.01, 'z max des bords ' + z10.toFixed(1) + ' pour un pied de ' + hpied.toFixed(1));
  assert.ok(z10 >= hpied + 10 - 3, 'la limite est atteinte (paroi assez haute) : ' + z10.toFixed(1));
  assert.ok(z30 > z10 + 3, 'plus de bords avec 30 mm : ' + z30.toFixed(1) + ' > ' + z10.toFixed(1));
  const g = r10.grille;
  for (let k = 0; k < g.z.length; k++) if (Number.isFinite(g.z[k]) && Number.isFinite(g.murs[k])) assert.fail('cellule à la fois pied et bord : ' + k);
}));

test('bords : l\'affichage de l\'empreinte montre les bords (cuvette) ; le fantôme et les consommateurs de la grille ne les voient pas', () => garde(() => {
  const g = analyserScan(boitePente(), { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 10 }).grille;
  const seul = maillageAffichage(g), avec = maillageAffichage(g, 1, { avecMurs: true });
  assert.ok(avec.indices.length > 1.2 * seul.indices.length, 'triangles : ' + seul.indices.length + ' -> ' + avec.indices.length);
}));

test('bords : le contour de la base est celui du pied (identique avec ou sans bords) ; le bord de la base épouse la paroi (un peu plus haut)', () => garde(() => {
  const m = boitePente();
  const g0 = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 0 }).grille;
  const g10 = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 10 }).grille;
  const b0 = construireBase(g0, { cote: 'D', type: 'thermoformee' }, null), b10 = construireBase(g10, { cote: 'D', type: 'thermoformee' }, null);
  const cellules = (b) => { const S = new Set(); for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) if (Number.isFinite(b.haut[j * b.nx + i])) S.add(Math.round((b.ox + i * b.pas) * 2) + ',' + Math.round((b.oy + j * b.pas) * 2)); return S; };
  const c0 = cellules(b0), c10 = cellules(b10);
  assert.equal(c0.size, c10.size);
  assert.ok([...c0].every((x) => c10.has(x)), 'contour différent');
  const bord = (b) => { let som = 0, n = 0; for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) { const z = b.haut[j * b.nx + i]; if (!Number.isFinite(z)) continue; let est = false; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= b.nx || jj >= b.ny || !Number.isFinite(b.haut[jj * b.nx + ii])) est = true; } if (est) { som += z; n++; } } return som / n; };
  assert.ok(bord(b10) > bord(b0) + 0.1, 'hauteur moyenne du bord : sans ' + bord(b0).toFixed(2) + ', avec ' + bord(b10).toFixed(2));
}));

test('chemin du worker : bords_mm est transmis au calcul (0 = aucun bord, 10 = bords) ; absent = 5 mm', async () => {
  const buf = ecrireSTLBinaireScan(boitePente());
  const etat = {};
  const msg = async (extra) => { await traiterMessageA({ type: 'importer', buffer: buf.slice(0), nom: 'b.stl' }, etat); return traiterMessageA({ type: 'recaler', longueur_mm: L, type_empreinte: 'creusee', ...extra }, etat); };
  const r0 = await msg({ bords_mm: 0 });
  assert.equal(r0.rapport.conversion.bords, null);
  const r10 = await msg({});
  assert.equal(r10.rapport.conversion.bords.bords_mm, 5);
  assert.ok(r10.positions.length > r0.positions.length, 'le maillage affiché contient les bords');
  assert.ok(nbMurs(etat.plantaire.grille).n > 5000);
});

test('bords : une 2e cavité isolée (vis, trou de 30 mm) à distance de la paroi n\'ajoute AUCUN bord : seuls les bords reliés au creux du pied sont gardés', () => garde(() => {
  const b = boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, pente_mm: 25 });
  const cx = 88, cy = 120; // à ~8 mm de la fin de la pente, dans la bande de 50 mm
  const nb = () => nbMurs(analyserScan(transformerMaillage(b, { R: POSES[1], t: [10, 20, 30] }), { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 50 }).grille).n;
  const avant = nb();
  for (let v = 0; v < b.positions.length; v += 3) if (Math.hypot(b.positions[v] - cx, b.positions[v + 1] - cy) < 9) b.positions[v + 2] = -30;
  const apres = nb();
  assert.ok(Math.abs(apres - avant) < 0.003 * avant, 'cellules de bords : sans trou ' + avant + ', avec trou ' + apres);
}));


// ---- Contour lisse (demande de Joël : « un contour lisse, sans dents, en gardant les bords qui remontent ») ----
const dentsDe = (g, f) => { let dent = 0; for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) { const k = j * g.nx + i; if (!f(k)) continue; let v = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) if ((a || b) && f(k + b * g.nx + a)) v++; if (v <= 3) dent++; } return dent; };

test('contour lisse : un bord dentelé (déchirures de ±3 mm) donne un pied SANS dents ni îlots, de même taille et même hauteur à 3 mm / 1,5 mm près, avec ou sans bords', () => garde(() => {
  const net = transformerMaillage(boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, pente_mm: 25, marge_mm: 80, marge_y_mm: 80, pas_mm: 2 }), { R: POSES[1], t: [10, 20, 30] });
  const dente = transformerMaillage(boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, pente_mm: 25, bord_irregulier_mm: 3, marge_mm: 80, marge_y_mm: 80, pas_mm: 2 }), { R: POSES[1], t: [10, 20, 30] });
  for (const bm of [0, 10]) {
    const a = analyserScan(net, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: bm });
    const b = analyserScan(dente, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: bm });
    const g = b.grille;
    const dentsPied = dentsDe(g, (k) => Number.isFinite(g.z[k]));
    assert.ok(dentsPied <= 3, 'bords ' + bm + ' : dents du pied ' + dentsPied);
    if (bm) { const dentsUnion = dentsDe(g, (k) => Number.isFinite(g.z[k]) || Number.isFinite(g.murs[k])); assert.ok(dentsUnion <= 12, 'dents de l\'ensemble pied + bords : ' + dentsUnion); }
    assert.ok(Math.abs((a.rapport.boite.x_max - a.rapport.boite.x_min) - (b.rapport.boite.x_max - b.rapport.boite.x_min)) < 3, 'largeur');
    assert.ok(Math.abs(a.rapport.grille.hauteur_max_mm - b.rapport.grille.hauteur_max_mm) < 1.5, 'hauteur');
  }
}));

test('contour lisse : le bord du bruit sans lissage a bien des dents (le test précédent mesure quelque chose)', () => garde(() => {
  const dente = transformerMaillage(boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, pente_mm: 25, bord_irregulier_mm: 3, marge_mm: 80, marge_y_mm: 80, pas_mm: 2 }), { R: POSES[1], t: [10, 20, 30] });
  const conv = convertirCreusee(dente);
  const r = recaler(conv.mesh, L, { versPied: conv.versPied });
  const brut = rasteriser(r, {});
  assert.ok(dentsDe(brut, (k) => Number.isFinite(brut.z[k])) > 30, 'dents avant lissage : ' + dentsDe(brut, (k) => Number.isFinite(brut.z[k])));
}));

test('contour lisse : le pied n\'est jamais agrandi par les bords (cellules du pied identiques avec 0 et 10 mm de bords) et les bords restent hors du pied', () => garde(() => {
  const dente = transformerMaillage(boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, pente_mm: 25, bord_irregulier_mm: 3, marge_mm: 80, marge_y_mm: 80, pas_mm: 2 }), { R: POSES[1], t: [10, 20, 30] });
  const g0 = analyserScan(dente, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 0 }).grille;
  const g10 = analyserScan(dente, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: 10 }).grille;
  const c = comparer(g0, g10);
  assert.equal(c.max, 0); assert.equal(c.difference, 0);
  for (let k = 0; k < g10.z.length; k++) if (Number.isFinite(g10.z[k]) && Number.isFinite(g10.murs[k])) assert.fail('cellule à la fois pied et bord');
}));

// ---- Affichage en coque mince (référence : l'empreinte d'un logiciel de semelles est une feuille qui suit le relief, sans fond plat) ----
test('coque : l\'empreinte affichée est une coque de 1,5 mm qui suit le relief ; le dessous N\'EST PAS plat ; sans coque (fantôme) le fond reste à z = 0', () => garde(() => {
  const g = analyserScan(paire('D', POSES[0]).bombe, { longueur_mm: L }).grille;
  const zs = (m) => { const haut = [], bas = []; for (let v = 2; v < m.positions.length; v += 3) (Math.abs(m.positions[v]) < 1e-6 ? bas : haut).push(m.positions[v]); return { haut, bas }; };
  const bloc = maillageAffichage(g);
  const coque = maillageAffichage(g, 1, { coque: true });
  const nbBasPlats = (m) => { let n = 0; for (let v = 2; v < m.positions.length; v += 3) if (Math.abs(m.positions[v]) < 1e-6) n++; return n; };
  assert.ok(nbBasPlats(bloc) > 0.4 * bloc.positions.length / 3, 'sans coque la moitié des sommets est à z = 0 : ' + nbBasPlats(bloc));
  assert.ok(nbBasPlats(coque) < 0.02 * coque.positions.length / 3, 'avec coque presque aucun sommet à z = 0 : ' + nbBasPlats(coque));
  void zs;
  // épaisseur : chaque sommet bas est à 1,5 mm sous son sommet haut (positions rangées haut, bas, haut, bas…)
  for (let v = 0; v + 5 < coque.positions.length; v += 6) assert.ok(Math.abs(coque.positions[v + 2] - coque.positions[v + 5] - 1.5) < 1e-4, 'épaisseur de la coque');
  assert.equal(verifierMaillage(coque).ferme, true, 'la coque reste un volume fermé');
}));

test('coque : le chemin du worker affiche une coque (message « recaler », mode scan et boîte creusée)', async () => {
  const etat = {};
  await traiterMessageA({ type: 'importer', buffer: ecrireSTLBinaireScan(boitePente()), nom: 'b.stl' }, etat);
  const r = await traiterMessageA({ type: 'recaler', longueur_mm: L, type_empreinte: 'creusee' }, etat);
  let plats = 0; for (let v = 2; v < r.positions.length; v += 3) if (Math.abs(r.positions[v]) < 1e-6) plats++;
  assert.ok(plats < 0.02 * r.positions.length / 3, 'sommets à z = 0 : ' + plats);
});

test('bords : la bande gardée est LIMITÉE en largeur autour du pied (distance horizontale <= bords_mm) : l\'ensemble pied + bords reste proche du pied, pas toute la mousse', () => garde(() => {
  const m = transformerMaillage(boiteEmpreinteFictive({ cote: 'D', longueur_mm: L, voute_mm: 15, pente_mm: 25, marge_mm: 80, marge_y_mm: 80, pas_mm: 2 }), { R: POSES[1], t: [10, 20, 30] });
  const etendue = (g, avecBords) => { let x0 = 1e9, x1 = -1e9; for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; if (Number.isFinite(g.z[k]) || (avecBords && Number.isFinite(g.murs[k]))) { x0 = Math.min(x0, i); x1 = Math.max(x1, i); } } return (x1 - x0 + 1) * g.pas; };
  for (const bm of [5, 12]) {
    const g = analyserScan(m, { longueur_mm: L, type_empreinte: 'creusee', bords_mm: bm }).grille;
    const pied = etendue(g, false), tout = etendue(g, true);
    assert.ok(tout <= pied + 2 * bm + 8,  'bords ' + bm + ' : largeur ' + tout.toFixed(0) + ' > pied ' + pied.toFixed(0) + ' + 2 x ' + bm);
    assert.ok(tout >= pied + 2 * bm * 0.6, 'bords ' + bm + ' : la bande est bien présente (' + tout.toFixed(0) + ' pour un pied de ' + pied.toFixed(0) + ')');
  }
}));

test('distanceAuPied : distance horizontale en mm (grille 3 x 3 mm avec un pied d\'une cellule au centre : 6 mm sur l\'axe, 8,5 mm en diagonale à 8 % près)', () => garde(() => {
  const g = { nx: 5, ny: 5, pas: 3, z: new Float32Array(25).fill(NaN) }; g.z[12] = 1;
  const d = distanceAuPied(g);
  assert.equal(d[12], 0); assert.ok(Math.abs(d[14] - 6) < 0.01, 'axe ' + d[14]); assert.ok(Math.abs(d[24] - 8.49) < 0.7, 'diagonale ' + d[24]);
}));

// ---- Pied fantôme POSÉ sur la semelle moulée (retour de Joël : « là les 2 sont confondues ») ----
async function fantomeEtSemelle(extraBase = {}) {
  const etat = {};
  await traiterMessageA({ type: 'importer', buffer: ecrireSTLBinaireScan(paire('D', POSES[0]).bombe), nom: 'p.stl' }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: L }, etat);
  const avant = await traiterMessageA({ type: 'fantome' }, etat); // semelle non construite
  await traiterMessageA({ type: 'base', params: { cote: 'D', type: 'thermoformee', ...extraBase } }, etat);
  const apres = await traiterMessageA({ type: 'fantome' }, etat);
  return { etat, avant, apres };
}
const minZ = (pos) => { let m = Infinity; for (let v = 2; v < pos.length; v += 3) if (pos[v] < m) m = pos[v]; return m; };

test('fantôme : sans semelle construite le pied reste à son niveau d\'origine ; avec la semelle moulée il est POSÉ dessus (relevé > 0) et non confondu', async () => {
  const { avant, apres } = await fantomeEtSemelle();
  assert.equal(avant.appui, null);
  assert.ok(apres.appui && apres.appui.a_mm > 0.5, 'relevé ' + (apres.appui && apres.appui.a_mm));
  assert.ok(minZ(apres.positions) > minZ(avant.positions) + 0.5, 'le fantôme est plus haut avec la semelle : ' + minZ(avant.positions).toFixed(2) + ' -> ' + minZ(apres.positions).toFixed(2));
});

test('fantôme : la plante du pied ne traverse JAMAIS la semelle (écart >= 0 partout) et la touche (écart minimal < 0,2 mm) ; coque de 1,5 mm', async () => {
  const { etat, apres } = await fantomeEtSemelle();
  const f = etat.finale, P = apres.positions;
  let ecartMin = Infinity;
  // sommets de la face inférieure de la coque (rangés haut, bas, haut, bas… ; ici le « haut » du maillage est la plante décalée de la coque)
  for (let v = 0; v + 5 < P.length; v += 6) {
    const x = P[v], y = P[v + 1], i = Math.round((x - f.ox) / f.pas), j = Math.round((y - f.oy) / f.pas);
    if (i < 0 || j < 0 || i >= f.nx || j >= f.ny) continue;
    const h = f.haut[j * f.nx + i]; if (!Number.isFinite(h)) continue;
    const plante = P[v + 5]; // face inférieure de la coque = la plante, posée
    const e = plante - h; if (e < ecartMin) ecartMin = e;
    assert.ok(Math.abs(P[v + 2] - P[v + 5] - COQUE_EMPREINTE_MM) < 1e-3, 'épaisseur de la coque');
  }
  assert.ok(ecartMin > -0.15, 'la plante traverse la semelle de ' + (-ecartMin).toFixed(2) + ' mm');
  assert.ok(ecartMin < 0.35, 'la plante ne touche nulle part la semelle (écart minimal ' + ecartMin.toFixed(2) + ' mm) : elle flotte');
});

test('fantôme : suit la semelle quand elle change (une base plus épaisse relève encore le pied)', async () => {
  const mince = await fantomeEtSemelle({ epaisseur_mm: 1.5 }), epaisse = await fantomeEtSemelle({ epaisseur_mm: 4 });
  assert.ok(epaisse.apres.appui.a_mm > mince.apres.appui.a_mm + 1.5, 'relevé 1,5 mm : ' + mince.apres.appui.a_mm.toFixed(2) + ' ; 4 mm : ' + epaisse.apres.appui.a_mm.toFixed(2));
});

test('fantôme : avec une correction qui INCLINE la semelle (coin pronateur postérieur de 6°) le pied est incliné avec elle et ne la traverse toujours pas', async () => {
  const etat = {};
  await traiterMessageA({ type: 'importer', buffer: ecrireSTLBinaireScan(paire('D', POSES[0]).bombe), nom: 'p.stl' }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: L }, etat);
  await traiterMessageA({ type: 'base', params: { cote: 'D', type: 'thermoformee' } }, etat);
  await traiterMessageA({ type: 'elements', cote: 'D', elements: [{ type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 6 }] }, etat);
  const r = await traiterMessageA({ type: 'fantome' }, etat);
  assert.ok(r.appui && r.appui.inclinaison_deg > 0.3, 'inclinaison ' + (r.appui && r.appui.inclinaison_deg));
  const f = etat.finale, P = r.positions;
  let ecartMin = Infinity;
  for (let v = 0; v + 5 < P.length; v += 6) {
    const i = Math.round((P[v] - f.ox) / f.pas), j = Math.round((P[v + 1] - f.oy) / f.pas);
    if (i < 0 || j < 0 || i >= f.nx || j >= f.ny) continue;
    const h = f.haut[j * f.nx + i]; if (!Number.isFinite(h)) continue;
    ecartMin = Math.min(ecartMin, P[v + 5] - h);
  }
  assert.ok(ecartMin > -0.15, 'la plante traverse la semelle corrigée de ' + (-ecartMin).toFixed(2) + ' mm');
});
