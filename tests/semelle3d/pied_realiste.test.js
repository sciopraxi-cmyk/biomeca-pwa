// Empreinte plantaire SYNTHÉTIQUE « réaliste » (fictive) et rendu lisible de H_plantaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelePiedRealiste, PIED_REALISTE } from '../../js/semelle3d/calcul/pied_realiste.js';
import { scanPiedSurface, scanPiedSolide } from '../../js/semelle3d/calcul/synthetique.js';
import { fabriquerDemo, SCENARIOS_DEMO } from '../../js/semelle3d/calcul/modeA.js';
import { traiterMessageA } from '../../js/semelle3d/calcul/pipeline.js';
import { indexerSommets, lireSTLBinaire } from '../../js/semelle3d/calcul/stl.js';
import { ecrireSTLBinaireScan } from '../../js/semelle3d/calcul/ecrivains_scans.js';
import { verifierMaillage } from '../../js/semelle3d/calcul/verification.js';
import { couleursHauteur, couleurDeHauteur, COULEURS_HAUTEUR } from '../../js/semelle3d/calcul/apercu.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.origine = e; throw a; } };
const M = (o) => garde(() => modelePiedRealiste(o));
const med = (c) => (c === 'D' ? -1 : 1);


test('pied réaliste : réglages contrôlés (longueur 150-360, côté D/G, voûte 0-40)', () => {
  assert.throws(() => modelePiedRealiste({ longueur_mm: 100 }), RangeError); assert.throws(() => modelePiedRealiste({ longueur_mm: 400 }), RangeError);
  assert.throws(() => modelePiedRealiste({ cote: 'X' }), TypeError); assert.throws(() => modelePiedRealiste({ voute_mm: -1 }), RangeError); assert.throws(() => modelePiedRealiste({ voute_mm: 41 }), RangeError);
  const m = M({}); assert.equal(m.longueur_mm, 265); assert.equal(m.cote, 'D'); assert.equal(m.voute_mm, 15); assert.equal(PIED_REALISTE.nb_orteils, 5);
});

test('pied réaliste : contour — longueur, talon arrondi, largeurs (talon / médio-pied / avant-pied)', () => {
  const m = M({ longueur_mm: 265 });
  let ymax = -Infinity, ymin = Infinity; for (let y = -5; y <= 280; y += 0.5) for (let x = -60; x <= 60; x += 1) if (m.dedans(x, y)) { ymax = Math.max(ymax, y); ymin = Math.min(ymin, y); }
  assert.ok(Math.abs(ymax - 265) <= 1.1, 'longueur ' + ymax); assert.ok(ymin >= 0 && ymin <= 1.5, 'talon en y ≈ 0 : ' + ymin);
  const largeur = (y) => { let a = Infinity, b = -Infinity; for (let x = -70; x <= 70; x += 0.25) if (m.dedans(x, y)) { a = Math.min(a, x); b = Math.max(b, x); } return b - a; };
  const wTalon = largeur(30), wMedio = largeur(95), wAvant = largeur(195);
  assert.ok(wTalon > 56 && wTalon < 68, 'talon ' + wTalon); assert.ok(wMedio < wTalon - 5 && wMedio > 42, 'médio-pied plus étroit que le talon : ' + wMedio); assert.ok(wAvant > 85 && wAvant < 100, 'avant-pied large : ' + wAvant);
  assert.ok(largeur(2) < 25 && largeur(4) > 28 - 14, 'talon arrondi (pas carré) : largeur à 2 mm du bout ' + largeur(2));
});

test('pied réaliste : 5 orteils — un sommet par orteil à la bonne longueur, 4 encoches entre eux, gros orteil le plus long et côté médial', () => {
  const m = M({}), D = med('D'), haut = (S) => { let top = null; for (let y = 275; y >= 150; y -= 0.25) if (m.dedans(D * S, y)) { top = y; break; } return top; };
  const C = PIED_REALISTE.centres_orteils, R = PIED_REALISTE.rayons_orteils, bouts = [1, 0.985, 0.955, 0.925, 0.89].map((u) => u * 265);
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(haut(C[i]) - bouts[i]) < 1.5, 'orteil ' + (i + 1) + ' : bout à ' + haut(C[i]) + ' pour ' + bouts[i].toFixed(1));
  for (let i = 0; i < 4; i++) { const xv = C[i] - R[i] + 0.0 - 0.25, v = Math.min(...[xv - 1, xv, xv + 1].map(haut)); assert.ok(v < Math.min(bouts[i], bouts[i + 1]) - 2, 'encoche ' + (i + 1) + '/' + (i + 2) + ' : ' + v + ' contre ' + Math.min(bouts[i], bouts[i + 1])); }
  assert.ok(bouts[0] > bouts[1] && C[0] > 0, 'le gros orteil est le plus long et du côté médial');
  assert.ok(R[0] > R[1]); for (let i = 1; i < 5; i++) assert.ok(R[i] <= R[i - 1], 'orteils de plus en plus petits');
  assert.equal(haut(C[0]) > haut(-40), true);
});

test('pied réaliste : relief >= 0, appui au talon et sous les têtes, voûte médiale haute, colonne latérale basse, orteils relevés', () => {
  const m = M({}), s = (S, y) => m.relief(med('D') * S, y);
  let mn = Infinity; for (let y = 2; y < 264; y += 2) for (let x = -50; x <= 50; x += 2) if (m.dedans(x, y)) mn = Math.min(mn, m.relief(x, y));
  assert.ok(mn >= 0 && mn < 0.3, 'minimum de la plante : ' + mn);
  assert.ok(s(0, 40) < 2, 'centre du talon posé : ' + s(0, 40));
  assert.ok(s(20, 100) > s(-18, 100) + 6, 'à hauteur de la voûte, le médial est bien plus haut que le latéral : ' + s(20, 100).toFixed(1) + ' / ' + s(-18, 100).toFixed(1));
  assert.ok(s(20, 100) > 8 && s(20, 100) < 22, 'voûte de 8 à 22 mm : ' + s(20, 100).toFixed(1));
  const tete = s(29, 0.752 * 265), entre = s(22, 0.752 * 265 - 14); assert.ok(tete < entre - 1.5 || tete < 1.2, 'tête de M1 posée, plus bas que le métatarse voisin : ' + tete.toFixed(1) + ' / ' + entre.toFixed(1));
  assert.ok(s(28, 0.98 * 265) > s(28, 0.83 * 265) + 1.5, 'gros orteil relevé vers son bout');
});

test('pied réaliste : la voûte est réglable (plat < normal < creux) sans changer le contour', () => {
  const h = (v) => M({ voute_mm: v }).relief(-20, 100);
  assert.ok(h(4) < h(15) && h(15) < h(24), [h(4), h(15), h(24)].map((x) => x.toFixed(1)).join(' < '));
  const a = M({ voute_mm: 4 }), b = M({ voute_mm: 24 }); let diff = 0;
  for (let y = 0; y <= 270; y += 3) for (let x = -60; x <= 60; x += 3) if (a.dedans(x, y) !== b.dedans(x, y)) diff++;
  assert.equal(diff, 0, 'même contour');
});

test('pied réaliste : le pied gauche est le miroir exact du droit ; la forme est proportionnelle à la longueur', () => {
  const D = M({ cote: 'D' }), G = M({ cote: 'G' });
  for (let y = 0; y <= 270; y += 6) for (let x = -60; x <= 60; x += 5) { assert.equal(D.dedans(x, y), G.dedans(-x, y), 'contour ' + x + ',' + y); if (D.dedans(x, y)) assert.ok(Math.abs(D.relief(x, y) - G.relief(-x, y)) < 1e-9, 'relief'); }
  const P = M({ longueur_mm: 300 }), k = 300 / 265;
  for (const [x, y] of [[-20, 60], [-30, 150], [-10, 220], [10, 280]]) assert.equal(P.dedans(x * k, y * k), D.dedans(x, y), 'forme homothétique ' + x + ',' + y);
  let ymax = 0; for (let y = 250; y < 320; y += 0.5) for (let x = -60; x <= 60; x += 1) if (P.dedans(x, y)) ymax = Math.max(ymax, y); assert.ok(Math.abs(ymax - 300) <= 1.1, 'longueur 300 : ' + ymax);
});

test('pied réaliste : scan synthétique (surface ouverte) et solide FERMÉ, contour sans escalier à 0,5 mm', () => {
  const m = M({}), s = garde(() => scanPiedSurface({ modele: m, pas_mm: 0.5 }));
  assert.ok(s.indices.length / 3 > 100000 && s.positions.every(Number.isFinite), 'triangles ' + s.indices.length / 3);
  const f = garde(() => scanPiedSolide({ modele: m, pas_mm: 1 })), v = verifierMaillage(indexerSommets(lireSTLBinaire(ecrireSTLBinaireScan(f))));
  assert.ok(v.ferme && v.degeneres === 0 && v.volume > 100000, JSON.stringify(v)); assert.ok(m.epaisseurDessus(-5, 40) > 20);
});

test('démo réaliste : 3 scénarios par défaut en tête ; côté proposé = côté réel (non ambigu) ; échelle ≈ 1 ; hauteur plausible', async () => {
  const noms = Object.keys(SCENARIOS_DEMO); assert.deepEqual(noms.slice(0, 3), ['reel_droit_stl', 'reel_gauche_obj', 'reel_creux_stl']); assert.ok(noms.includes('droit_stl_mm'), 'les anciens scénarios sont conservés');
  for (const nom of noms.slice(0, 3)) {
    const etat = { dernier: null, scan: null, plantaire: null }, d = fabriquerDemo(nom);
    const imp = await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat);
    assert.ok(imp.info.nbTriangles > 100000, nom + ' : maillage fin (pas de 0,5 mm, contour sans escalier visible) : ' + imp.info.nbTriangles + ' triangles');
    const r = await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat), c = r.rapport.propositions.cote;
    assert.equal(c.valeur, d.cote_reel, nom); assert.equal(c.ambigu, false, nom); assert.ok(Math.abs(r.rapport.acquisition.facteur_echelle - 1) < 0.01, nom);
    assert.ok(r.rapport.grille.hauteur_max_mm > 12 && r.rapport.grille.hauteur_max_mm < 32, nom + ' ' + r.rapport.grille.hauteur_max_mm);
  }
});

test('démo réaliste : la base se construit sur chaque scan (3 types, D et G), maillage fermé, éléments et suggestion de voûte', async () => {
  for (const nom of ['reel_droit_stl', 'reel_gauche_obj', 'reel_creux_stl']) {
    const etat = {}, d = fabriquerDemo(nom);
    await traiterMessageA({ type: 'importer', buffer: d.buffer, nom: d.nom }, etat); await traiterMessageA({ type: 'recaler', longueur_mm: d.longueur_suggeree_mm }, etat);
    for (const type of ['plate', 'thermoformee', 'pleine_dessous']) {
      const r = await traiterMessageA({ type: 'base', params: { type, cote: d.cote_reel }, cote: d.cote_reel, elements: [] }, etat);
      assert.equal(r.rapport.ferme, true, nom + ' ' + type); assert.equal(r.rapport.degeneres, 0, nom + ' ' + type); assert.ok(r.rapport.volume_mm3 > 0); assert.ok(r.rapport.epaisseur_min_mm >= 0.9 - 1e-4, nom + ' ' + type + ' ' + r.rapport.epaisseur_min_mm);
    }
    const r = await traiterMessageA({ type: 'elements', cote: d.cote_reel, elements: [{ type: 'voute_bord', dy_mm: 95 }, { type: 'point_curseur', dx_mm: 0, dy_mm: 60, hauteur_mm: 1, rayon_mm: 10 }] }, etat);
    assert.equal(r.rapport.ferme, true, nom); assert.ok(r.rapport.suggestion_voute && r.rapport.suggestion_voute.dy_mm > 60 && r.rapport.suggestion_voute.dy_mm < 140, nom + ' voûte suggérée ' + JSON.stringify(r.rapport.suggestion_voute && r.rapport.suggestion_voute.dy_mm));
  }
});

// ---------------- rendu : couleurs de H_plantaire
test('couleurs de hauteur : bleu en bas, rouge en haut, dans [0,1], marches de 2 mm (sombre en bas de la marche), sommets sans hauteur = bas', () => {
  assert.equal(COULEURS_HAUTEUR.pas_marche_mm, 2); assert.equal(COULEURS_HAUTEUR.socle_mm, 1);
  const bas = couleurDeHauteur(0), haut = couleurDeHauteur(1); assert.ok(bas[2] > bas[0] && bas[2] > bas[1], 'bas = bleu'); assert.ok(haut[0] > haut[1] && haut[0] > haut[2], 'haut = rouge');
  const milieu = couleurDeHauteur(0.5); assert.ok(milieu[1] > milieu[0] && milieu[1] > milieu[2], 'milieu = vert');
  assert.deepEqual(couleurDeHauteur(-3), couleurDeHauteur(0)); assert.deepEqual(couleurDeHauteur(7), couleurDeHauteur(1));
  const pos = Float32Array.from([0, 0, 1, 0, 0, 1.9, 0, 0, 2.0001, 0, 0, 3, 0, 0, 11]); // hauteurs 0, 0,9, 1,0001, 2, 10 (socle 1)
  const c = couleursHauteur(pos); assert.equal(c.length, pos.length); for (const v of c) assert.ok(v >= 0 && v <= 1.0001, 'couleur dans [0,1] : ' + v);
  assert.ok(c[2] > c[0], 'point bas : plus bleu que rouge'); assert.ok(c[12] > c[14], 'point haut : plus rouge que bleu');
  const a = couleursHauteur(Float32Array.from([0, 0, 1 + 1.99, 0, 0, 1 + 2.0, 0, 0, 1 + 2.01])); // fin d'une marche (clair) puis début de la suivante (sombre)
  assert.ok((a[0] + a[1] + a[2]) / 3 > (a[3] + a[4] + a[5]) / 3 * 1.05, 'la couleur s\'assombrit au passage d\'une marche');
  assert.equal(couleursHauteur(new Float32Array(0)).length, 0);
});


test('appui latéral : le bord latéral du pied repose sur le sol (z < 0,1 mm sur 8 mm de large) du talon à la tête du 5e métatarsien ; la voûte médiale reste creuse', () => {
  for (const [cote, voute] of [['D', 15], ['G', 15], ['D', 24], ['D', 4]]) {
    const m = modelePiedRealiste({ longueur_mm: 265, cote, voute_mm: voute }), pas = 0.5, med = cote === 'D' ? -1 : 1;
    for (const u of [0.12, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.76]) {
      const y = u * 265; let xLat = null; for (let x = 70; x >= -70; x -= pas) { const xx = -med * x; if (m.dedans(xx, y)) { xLat = xx; break; } } assert.ok(xLat !== null, 'pied absent à u = ' + u);
      for (let e = 1.5; e <= 8; e += 0.5) { const xx = xLat + med * e; if (m.dedans(xx, y)) assert.ok(m.relief(xx, y) < 0.1, cote + ' voûte ' + voute + ' · u ' + u + ' · ' + e + ' mm du bord latéral : relief ' + m.relief(xx, y).toFixed(2) + ' mm'); }
    }
  }
  const m = modelePiedRealiste({ longueur_mm: 265, cote: 'D', voute_mm: 15 }); let zmed = 0; for (let x = -30; x <= 0; x += 0.5) if (m.dedans(x, 0.38 * 265)) zmed = Math.max(zmed, m.relief(x, 0.38 * 265)); assert.ok(zmed > 10, 'voûte médiale creuse : ' + zmed.toFixed(1) + ' mm');
});
