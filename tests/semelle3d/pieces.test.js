// Exports par pièces (demande du praticien, 15/11/2026) : la semelle est décomposée en pièces (base, devant, éléments, recouvrement), une par matière posée ;
// export en ZIP (un STL fermé par pièce + liste des matières) et en 3MF multi-volumes. Le STL unique ne change pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { piecesDeLaSemelle, couverture, nomPiece, nettoyerNom, controlerSTLPiece, controlerTroisMF } from '../../js/semelle3d/calcul/pieces.js';
import { ecrire3MF } from '../../js/semelle3d/calcul/ecrivain_3mf.js';
import { ecrireZip } from '../../js/semelle3d/calcul/zip.js';
import { lireMaillage, listerZip, extraireZip } from '../../js/semelle3d/calcul/lecteurs.js';
import { lireSTLBinaire, indexerSommets, ecrireSTLBinaire } from '../../js/semelle3d/calcul/stl.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { appliquerElements } from '../../js/semelle3d/calcul/elements.js';

// Le sabotage ne reconnaît que les AssertionError : toute autre erreur est convertie.
const garde = async (f) => { try { return await f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } };

const materiaux = JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8'));
async function prepare() {
  const etat = {};
  const d = await traiterMessageA({ type: 'demo', scenario: 'droit_stl_mm' }, etat);
  await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
  await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
  await traiterMessageA({ type: 'materiaux', json: materiaux }, etat);
  const m = etat.materiaux.liste;
  return { etat, cote: d.cote_reel, m1: m[0], m2: m.find((x) => /50S/.test(x.libelle)), m3: m.find((x) => /36S/.test(x.libelle)) };
}
const construire = (etat, cote, params, elements) => traiterMessageA({ type: 'base', cote, params: { cote, ...params }, elements }, etat);
const coin = (extra = {}) => ({ type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, angle_deg: 4, ...extra });
const ymm = (mesh) => { let a = Infinity, b = -Infinity; for (let k = 1; k < mesh.positions.length; k += 3) { a = Math.min(a, mesh.positions[k]); b = Math.max(b, mesh.positions[k]); } return [a, b]; };

test('base seule : une pièce, fermée, de même volume que la semelle entière (l\'export par pièces ne change pas la forme)', async () => garde(async () => {
  const { etat, cote, m1 } = await prepare();
  const r = await construire(etat, cote, { type: 'pleine_dessous', materiau_id: m1.id });
  const pieces = piecesDeLaSemelle(etat.finale, { zones: r.rapport.zones });
  assert.equal(pieces.length, 1);
  assert.equal(pieces[0].role, 'base');
  assert.equal(pieces[0].materiau_libelle, m1.libelle);
  assert.ok(pieces[0].ferme && pieces[0].degeneres === 0, 'volume fermé');
  assert.ok(Math.abs(pieces[0].volume_mm3 - r.rapport.volume_mm3) / r.rapport.volume_mm3 < 0.002, 'volume ' + pieces[0].volume_mm3 + ' vs ' + r.rapport.volume_mm3);
}));

test('demi-semelle à 2 matériaux + élément : base, devant, élément = 3 pièces fermées ; la base et le devant se touchent exactement ; somme des volumes = volume entier (< 1 %)', async () => garde(async () => {
  const { etat, cote, m1, m2, m3 } = await prepare();
  const r = await construire(etat, cote, { type: 'pleine_dessous', materiau_id: m1.id, etendue: 'demi', devant: 'materiau2', materiau_devant_id: m2.id }, [coin({ materiau_id: m3.id })]);
  const pieces = piecesDeLaSemelle(etat.finale, { zones: r.rapport.zones });
  assert.deepEqual(pieces.map((p) => p.role), ['base', 'devant', 'element']);
  assert.deepEqual(pieces.map((p) => p.materiau_id), [m1.id, m2.id, m3.id]);
  for (const p of pieces) assert.ok(p.ferme && p.degeneres === 0 && p.volume_mm3 > 100, p.libelle + ' : fermée et non vide');
  const cv = couverture(pieces, r.rapport.volume_mm3);
  assert.ok(Math.abs(cv.ecart_pct) < 1, 'écart de volume ' + cv.ecart_pct.toFixed(3) + ' %');
  // interface base / devant : la base finit là où le devant commence (même plan, à une cellule près : 0,5 mm)
  const [, yFinBase] = ymm(pieces[0].mesh), [yDebutDevant] = ymm(pieces[1].mesh);
  assert.ok(Math.abs(yFinBase - yDebutDevant) < 0.6, 'la base finit à y = ' + yFinBase.toFixed(2) + ', le devant commence à y = ' + yDebutDevant.toFixed(2));
  // le devant est bien DEVANT : sa moyenne en y est plus grande que celle de la base
  assert.ok(ymm(pieces[1].mesh)[1] > ymm(pieces[0].mesh)[1] + 20);
}));

test('recouvrement : pièce à part, la dernière, même saisi en premier', async () => garde(async () => {
  const { etat, cote, m1, m3 } = await prepare();
  const r = await construire(etat, cote, { type: 'pleine_dessous', materiau_id: m1.id }, [{ type: 'recouvrement', hauteur_mm: 1, materiau_id: m3.id }, coin({ materiau_id: m3.id })]);
  const pieces = piecesDeLaSemelle(etat.finale, { zones: r.rapport.zones });
  assert.deepEqual(pieces.map((p) => p.role), ['base', 'element', 'recouvrement'], 'le recouvrement passe en dernier, même saisi en premier');
  const cv = couverture(pieces, r.rapport.volume_mm3);
  assert.ok(Math.abs(cv.ecart_pct) < 1.5, 'écart ' + cv.ecart_pct.toFixed(3) + ' %');
}));

test('point curseur en CREUX : aucune pièce en plus, mais la base est creusée (volume de la base plus petit, somme des volumes toujours = volume entier)', async () => garde(async () => {
  const { etat, cote, m1 } = await prepare();
  const sans = await construire(etat, cote, { type: 'pleine_dessous', materiau_id: m1.id }, []);
  const vSans = piecesDeLaSemelle(etat.finale, { zones: sans.rapport.zones })[0].volume_mm3;
  const r = await construire(etat, cote, { type: 'pleine_dessous', materiau_id: m1.id }, [{ type: 'point_curseur', dx_mm: 0, dy_mm: 100, hauteur_mm: -1.2, rayon_mm: 10 }]);
  const pieces = piecesDeLaSemelle(etat.finale, { zones: r.rapport.zones });
  assert.equal(pieces.length, 1, 'un creux ne fabrique aucune pièce');
  const base = pieces.find((p) => p.role === 'base');
  assert.ok(base.volume_mm3 < vSans - 50, 'base creusée : ' + base.volume_mm3.toFixed(0) + ' mm3 contre ' + vSans.toFixed(0) + ' sans creux');
  const cv = couverture(pieces, r.rapport.volume_mm3);
  assert.ok(Math.abs(cv.ecart_pct) < 1, 'écart ' + cv.ecart_pct.toFixed(3) + ' %');
}));

test('export par pièces (pipeline) : STL relus et fermés, zip lisible, 3MF relu par notre lecteur, refus sans latéralité', async () => garde(async () => {
  const { etat, cote, m1, m2, m3 } = await prepare();
  await construire(etat, cote, { type: 'pleine_dessous', materiau_id: m1.id, etendue: 'demi', devant: 'materiau2', materiau_devant_id: m2.id }, [coin({ materiau_id: m3.id })]);
  await assert.rejects(() => traiterMessageA({ type: 'exporter_pieces' }, etat), /latéralité/);
  const e = await traiterMessageA({ type: 'exporter_pieces', cote, dateISO: '2026-11-15T10:00:00.000Z' }, etat);
  assert.equal(e.pieces.length, 3);
  assert.ok(Math.abs(e.couverture.ecart_pct) < 1);
  // zip : 3 STL + liste, chaque STL relu = fermé, mêmes triangles que annoncé
  const buf = e.zip;
  const entrees = listerZip(buf);
  const noms = entrees.map((x) => x.nom);
  assert.ok(noms.includes('Liste-des-pieces.txt'));
  assert.equal(noms.filter((n) => n.endsWith('.stl')).length, 3);
  for (const x of entrees.filter((q) => q.nom.endsWith('.stl'))) {
    const donnees = await extraireZip(buf, x);
    const relu = lireSTLBinaire(donnees.buffer.slice(donnees.byteOffset, donnees.byteOffset + donnees.byteLength));
    const v = verifierMaillage(indexerSommets(relu));
    assert.ok(v.ferme && v.volume > 100, x.nom + ' fermé');
    assert.equal(relu.nbTriangles, e.pieces.find((p) => p.nom === x.nom).nbTriangles);
  }
  const liste = new TextDecoder().decode(await extraireZip(buf, entrees.find((q) => q.nom === 'Liste-des-pieces.txt')));
  assert.ok(liste.includes(m1.libelle) && liste.includes(m2.libelle) && liste.includes(m3.libelle), 'la liste donne les 3 matériaux');
  assert.ok(/Shore A 50/.test(liste) && /Shore A 36/.test(liste), 'et leur dureté');
  // 3MF : relu par le lecteur du logiciel, tous les triangles
  const lu = await lireMaillage(e.troisMF);
  assert.equal(lu.indices.length / 3, e.nbTriangles);
  const modele = new TextDecoder().decode(await extraireZip(e.troisMF, listerZip(e.troisMF).find((q) => q.nom === '3D/3dmodel.model')));
  assert.equal((modele.match(/<object /g) || []).length, 3);
  assert.equal((modele.match(/<item /g) || []).length, 3);
  assert.equal((modele.match(/<base /g) || []).length, 3);
  assert.ok(modele.includes('unit="millimeter"'));
  assert.ok(modele.includes(m2.libelle) && /Shore A 50/.test(modele), 'le nom et la dureté du matériau suivent le volume');
}));

test('3MF : nom et matériau échappés en XML, couleur invalide -> gris, aucune pièce -> refus ; ZIP : chemins de dossiers acceptés seulement en mode « chemins », jamais « .. », absolus ni cachés', async () => {
  const mesh = { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };
  const t = ecrire3MF([{ nom: 'A<&>"', mesh, materiau_libelle: 'M<1>&', shore: 40, couleur_hex: 'rouge' }], { titre: 'T&T' });
  const modele = new TextDecoder().decode(await extraireZip(t, listerZip(t).find((q) => q.nom === '3D/3dmodel.model')));
  assert.ok(modele.includes('name="A&lt;&amp;&gt;&quot;"'), 'nom de la pièce échappé');
  assert.ok(modele.includes('M&lt;1&gt;&amp; (Shore A 40)'), 'matériau échappé');
  assert.ok(modele.includes('T&amp;T'), 'titre échappé');
  assert.ok(!modele.includes('M<1>') && !modele.includes('A<&>'), 'aucun texte brut dangereux');
  assert.ok(modele.includes('displaycolor="#C9C9C9"'), 'couleur invalide -> gris');
  assert.ok(modele.includes('<vertex x="0" y="0" z="0"/>') && modele.includes('<triangle v1="0" v2="2" v3="1"/>'), 'sommets et triangles écrits tels quels (orientation conservée)');
  assert.throws(() => ecrire3MF([]), /au moins une pièce/);
  assert.throws(() => ecrireZip([{ nom: 'a/b.txt', donnees: new Uint8Array(1) }]), /invalide/);
  assert.doesNotThrow(() => ecrireZip([{ nom: 'a/b.txt', donnees: new Uint8Array(1) }], new Date(), { chemins: true }));
  assert.doesNotThrow(() => ecrireZip([{ nom: '_rels/.rels', donnees: new Uint8Array(1) }], new Date(), { chemins: true }), '.rels (3MF) accepté');
  for (const mauvais of ['../x', '/x', 'a//b', 'a/../b', 'a\\b', './x', '.cache/x', 'a/.cache']) assert.throws(() => ecrireZip([{ nom: mauvais, donnees: new Uint8Array(1) }], new Date(), { chemins: true }), /invalide/, mauvais);
});

test('couverture : écart de volume calculé (10 % de matière manquante -> 10 %)', () => {
  const c = couverture([{ volume_mm3: 60 }, { volume_mm3: 30 }], 100);
  assert.equal(c.somme_mm3, 90);
  assert.ok(Math.abs(c.ecart_pct - 10) < 1e-9);
  assert.equal(couverture([], 0).ecart_pct, 0);
});

test('contrôle du fichier produit : un STL tronqué, non fermé ou de mauvaise taille est refusé ; un 3MF auquel il manque des triangles est refusé', async () => garde(async () => {
  const mesh = { positions: Float32Array.from([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]), indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 0, 3, 2]) };
  const v = verifierMaillage(mesh), piece = { nbTriangles: 4, volume_mm3: v.volume };
  const outils = { lireSTL: lireSTLBinaire, indexer: indexerSommets };
  const stl = ecrireSTLBinaire(mesh);
  assert.equal(controlerSTLPiece(stl, piece, outils), null, 'un tétraèdre fermé passe');
  assert.match(controlerSTLPiece(stl, { ...piece, nbTriangles: 5 }, outils), /triangles relus/, 'nombre de triangles différent');
  assert.match(controlerSTLPiece(stl, { ...piece, volume_mm3: piece.volume_mm3 * 1.5 }, outils), /volume relu/, 'volume différent');
  assert.match(controlerSTLPiece(stl.slice(0, 84 + 50 * 3), { ...piece, nbTriangles: 3 }, outils) || 'illisible', /illisible|non fermé/, 'STL tronqué');
  const ouvert = ecrireSTLBinaire({ positions: mesh.positions, indices: mesh.indices.slice(0, 9) });
  assert.match(controlerSTLPiece(ouvert, { nbTriangles: 3, volume_mm3: 1 }, outils), /non fermé/, 'maillage ouvert');
  const t = ecrire3MF([{ nom: 'P', mesh, materiau_libelle: null }]);
  assert.equal(await controlerTroisMF(t, 4, lireMaillage), null);
  assert.match(await controlerTroisMF(t, 5, lireMaillage), /triangles relus/);
  assert.match(await controlerTroisMF(new ArrayBuffer(10), 4, lireMaillage), /illisible/);
}));

test('noms de fichiers : sans accent ni caractère interdit, numérotés ; matériau non choisi nommé', () => {
  assert.equal(nettoyerNom('Poly-éthylène 1.0mm 50S'), 'Poly-ethylene-1-0mm-50S');
  assert.equal(nomPiece(2, { libelle: 'Devant (2e matériau)', materiau_libelle: 'Résine Flex 1.3mm', role: 'devant' }), '02-Devant-2e-materiau_Resine-Flex-1-3mm');
  assert.equal(nomPiece(1, { libelle: 'Base', materiau_libelle: null, role: 'base' }), '01-Base_materiau-non-choisi');
});

test('appliquerElements : sans élément la décomposition ne produit que la base (garde de non-régression de l\'API des couches)', async () => garde(async () => {
  const { etat, cote, m1 } = await prepare();
  const r = await construire(etat, cote, { type: 'thermoformee', materiau_id: m1.id }, []);
  const f = appliquerElements(etat.base, [], { cote, cat: etat.materiaux });
  assert.equal(f.couches.length, 0);
  assert.equal(piecesDeLaSemelle(etat.finale, { zones: r.rapport.zones }).length, 1);
}));
