import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { validerElement, appliquerElements, mesurerAngle, mesurerCoupe, reperTalon, TYPES_ELEMENTS, smoothstep } from '../../js/semelle3d/calcul/elements.js';
import { lireSTLBinaire, indexerSommets } from '../../js/semelle3d/calcul/stl.js';
import { chargerMateriaux } from '../../js/semelle3d/calcul/materiaux.js';

const cat = chargerMateriaux(JSON.parse(readFileSync(new URL('../../js/semelle3d/donnees/materiaux.json', import.meta.url), 'utf8')));
const tand = (d) => Math.tan((d * Math.PI) / 180);
// Plaque rectangulaire de test : x de -60 à 60, y de 0 à 200, épaisseur constante (base plate), pas de 0,5 mm.
function plaque({ x0 = -60, x1 = 60, y1 = 200, h = 2, y0 = 0 } = {}) {
  const nx = Math.round((x1 - x0) / 0.5) + 1, ny = Math.round(y1 / 0.5) + 1;
  return { nx, ny, pas: 0.5, ox: x0, oy: y0, haut: new Float32Array(nx * ny).fill(h), bas: new Float32Array(nx * ny), dx: null, dy: null };
}
const val = (b, c, x, y) => c[Math.round((y - b.oy) / b.pas) * b.nx + Math.round((x - b.ox) / b.pas)];
const coin = (extra = {}) => ({ type: 'coin_pronateur_posterieur', ancrage: 'libre', dy_mm: 35, ...extra }); // ancienne position libre (centre) : les tests du lot 3 la gardent ; l'ancrage au bord a ses propres tests (bibliotheque.test.js)

test('coin : hauteur au bord = largeur × tan(angle) (4° sur 56 mm = 3,916 mm) et l\'angle se déduit d\'une hauteur saisie', () => {
  const a = validerElement(coin({ angle_deg: 4 }), cat);
  assert.ok(Math.abs(a.hauteur_mm - 3.916) < 1e-3, String(a.hauteur_mm)); // 56 × 0,069927
  const b = validerElement(coin({ hauteur_mm: 2.8 }), cat);
  assert.ok(Math.abs(b.angle_deg - 2.862) < 1e-3, String(b.angle_deg)); // atan(2,8 / 56)
  const c = validerElement(coin({ angle_deg: 4, largeur_mm: 40 }), cat);
  assert.ok(Math.abs(c.hauteur_mm - 2.797) < 1e-3, 'script §5.7 : 4° sur 40 mm ≈ 2,8 mm');
  assert.throws(() => validerElement(coin({ angle_deg: 4, hauteur_mm: 3 }), cat), /OU la hauteur/);
});

test('élément : valeurs hors plage, type inconnu, signe invalide et raccord nul refusés ; raccord < 5 mm avertit', () => {
  assert.throws(() => validerElement(coin({ angle_deg: 0 }), cat), /hors de/);
  assert.throws(() => validerElement(coin({ angle_deg: 30 }), cat), /hors de/);
  assert.throws(() => validerElement(coin({ largeur_mm: 5 }), cat), /largeur/);
  assert.throws(() => validerElement(coin({ longueur_mm: 500 }), cat), /longueur/);
  assert.throws(() => validerElement(coin({ angle_deg: 'x' }), cat), TypeError);
  assert.throws(() => validerElement({ type: 'bidon' }, cat), /type inconnu/);
  assert.throws(() => validerElement(coin({ signe: 2 }), cat), /signe/);
  assert.throws(() => validerElement(coin({ raccord_mm: 0 }), cat), /raccord ne peut pas être nul/);
  assert.throws(() => validerElement(coin({ materiau_id: 'XXX' }), cat), /inconnu/);
  assert.equal(validerElement(coin({ raccord_mm: 5 }), cat).avertissements.length, 0);
  assert.match(validerElement(coin({ raccord_mm: 3 }), cat).avertissements[0], /raccord de 3 mm/);
  assert.throws(() => validerElement({ type: 'soutien_de_voute', hauteur_mm: 40 }, cat), /hauteur/);
});

test('coin sur plaque (pied D) : rampe de pente tan(θ) exacte, haute côté LATÉRAL (+X pour un pied droit), nulle côté médial', () => {
  const b = plaque();
  const f = appliquerElements(b, [coin({ angle_deg: 4 })], { cote: 'D', cat });
  const c = f.couches[0].z;
  // centre : x = 0 (repère talon), y = 35 ; largeur 56 -> t = -(x - 0) pour D ; hauteur = (28 - t) tan 4°
  assert.ok(Math.abs(val(b, c, 15, 35) - 43 * tand(4)) < 1e-3, 'latéral x = +15 : ' + val(b, c, 15, 35)); // 3,007 mm
  assert.ok(Math.abs(val(b, c, -15, 35) - 13 * tand(4)) < 1e-3, 'médial x = -15 : ' + val(b, c, -15, 35)); // 0,909 mm
  assert.ok(val(b, c, 15, 35) > 3 * val(b, c, -15, 35));
  const xs = [], zs = []; for (let x = -15; x <= 15; x += 0.5) { xs.push(x); zs.push(val(b, c, x, 35)); }
  const m = mesurerAngle(xs, zs, -15, 15);
  assert.ok(Math.abs(m.angle_deg - 4) < 1e-3 && m.ecart_plan_mm < 1e-3, JSON.stringify(m));
  assert.ok(m.pente > 0, 'monte vers +X (latéral du pied D)');
  // H_finale = base + couche
  assert.ok(Math.abs(f.haut[Math.round(35 / 0.5) * b.nx + Math.round(15 / 0.5 + 60 / 0.5)] - (2 + 43 * tand(4))) < 1e-3);
});

test('coin : le même plan sur un pied gauche est l\'image miroir en X exacte (le côté haut reste le latéral)', () => {
  const b = plaque();
  const D = appliquerElements(b, [coin({ angle_deg: 5, dx_mm: 3 })], { cote: 'D', cat }).couches[0].z;
  const G = appliquerElements(b, [coin({ angle_deg: 5, dx_mm: 3 })], { cote: 'G', cat }).couches[0].z;
  let maxEcart = 0, n = 0;
  for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) { const dd = Math.abs(D[j * b.nx + i] - G[j * b.nx + (b.nx - 1 - i)]); maxEcart = Math.max(maxEcart, dd); if (D[j * b.nx + i] > 0) n++; }
  assert.ok(n > 5000 && maxEcart < 1e-5, `cellules ${n}, écart ${maxEcart}`);
  assert.ok(val(b, G, -15, 35) > 2 * val(b, G, 15, 35), 'pied G : haut côté -X (latéral)');
});

test('coin : la rampe diminue vers l\'avant (formule PODAXIA) et le dy déplace l\'élément vers l\'avant', () => {
  const b = plaque();
  const f = appliquerElements(b, [coin({ angle_deg: 4 })], { cote: 'D', cat }).couches[0].z;
  const h = (y) => val(b, f, 15, y);
  assert.ok(Math.abs(h(20) - h(36)) < 0.01, 'plateau constant jusqu\'à 55 % de la longueur (y = 38,5) : ' + h(20) + ' ' + h(36));
  assert.ok(h(50) < 0.8 * h(36) && h(60) < h(50) && h(66) < 0.1, `décroissance ${h(36)} ${h(50)} ${h(60)} ${h(66)}`);
  const g = appliquerElements(b, [coin({ angle_deg: 4, dy_mm: 85 })], { cote: 'D', cat }).couches[0].z;
  assert.ok(val(b, g, 15, 85) > 2.5 && val(b, g, 15, 10) === 0);
});

test('aucun bord vif : couche nulle au bord, saut entre cellules voisines borné par la pente du smoothstep (1,5 × h / raccord)', () => {
  const b = plaque();
  for (const raccord of [8, 5]) {
    const el = coin({ angle_deg: 4, raccord_mm: raccord });
    const v = validerElement(el, cat);
    const c = appliquerElements(b, [el], { cote: 'D', cat }).couches[0].z;
    let saut = 0, bord = 0, hmax = 0;
    for (let j = 1; j < b.ny - 1; j++) for (let i = 1; i < b.nx - 1; i++) {
      const k = j * b.nx + i; hmax = Math.max(hmax, c[k]);
      for (const kk of [k + 1, k + b.nx]) saut = Math.max(saut, Math.abs(c[k] - c[kk]));
      if (c[k] > 0 && (c[k - 1] === 0 || c[k + 1] === 0 || c[k - b.nx] === 0 || c[k + b.nx] === 0)) bord = Math.max(bord, c[k]);
    }
    const borne = (1.5 * v.hauteur_mm / raccord + tand(4)) * b.pas * 1.1;
    assert.ok(saut <= borne, `raccord ${raccord} : saut ${saut.toFixed(3)} > ${borne.toFixed(3)}`);
    assert.ok(bord < 0.12, `raccord ${raccord} : première cellule du bord ${bord.toFixed(3)} mm (doit partir de 0)`);
    assert.ok(hmax > 3, 'le coin existe bien');
  }
});

test('conformité au fichier PODAXIA : nos formules redonnent la hauteur du STL fourni (coin 01 et soutien de voûte 10), à 0,02 mm', { skip: !existsSync('/root/projets/VERTICY/documents/elements-podaxia/extrait/stl/01_coin_pronateur_posterieur.stl') }, () => {
  const dir = '/root/projets/VERTICY/documents/elements-podaxia/extrait/stl/';
  for (const [fichier, type, decalU] of [['01_coin_pronateur_posterieur.stl', 'coin_pronateur_posterieur', 0], ['10_soutien_de_voute.stl', 'soutien_de_voute', 1]]) {
    const raw = readFileSync(dir + fichier);
    const m = indexerSommets(lireSTLBinaire(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)));
    const T = TYPES_ELEMENTS[type];
    const p = validerElement({ type }, cat);
    let n = 0, pire = 0;
    for (let k = 0; k < m.positions.length; k += 3) {
      const [xf, yf, zf] = [m.positions[k], m.positions[k + 1], m.positions[k + 2]];
      if (zf < 0.5) continue; // dessous (z = 0) et plancher de 0,4 mm du fournisseur
      const t = xf, u = yf - decalU; // fichier : médial en X+ ; soutien : centre de l'ellipse à 40 (le nôtre à 39)
      const mien = T.profil(p, t, u) * smoothstep(0, p.raccord_mm, T.distance(p, t, u));
      pire = Math.max(pire, Math.abs(mien - zf)); n++;
    }
    assert.ok(n > 500, fichier + ' : sommets comparés ' + n);
    assert.ok(pire < 0.02, fichier + ' : écart max ' + pire.toFixed(4) + ' mm');
  }
});

test('soutien de voûte : la hauteur réglée est la hauteur au sommet (4, 7, 10 mm) et la couche est proportionnelle à la hauteur', () => {
  const b = plaque();
  const maxi = {};
  for (const h of [4, 7, 10]) {
    const c = appliquerElements(b, [{ type: 'soutien_de_voute', hauteur_mm: h }], { cote: 'D', cat }).couches[0].z;
    maxi[h] = Math.max(...c);
    assert.ok(Math.abs(maxi[h] - h) < 0.1, `hauteur ${h} : sommet ${maxi[h].toFixed(3)}`);
  }
  const a4 = appliquerElements(b, [{ type: 'soutien_de_voute', hauteur_mm: 4 }], { cote: 'D', cat }).couches[0].z;
  const a10 = appliquerElements(b, [{ type: 'soutien_de_voute', hauteur_mm: 10 }], { cote: 'D', cat }).couches[0].z;
  for (let k = 0; k < a4.length; k += 37) if (a4[k] > 0) assert.ok(Math.abs(a10[k] / a4[k] - 2.5) < 1e-4);
});

test('décharge (signe -1) = couche exactement opposée ; ajout + décharge identiques s\'annulent', () => {
  const b = plaque({ h: 6 }); // base de 6 mm : un creux de 3 mm ne la traverse pas (lot 4a : un creux qui traverse est refusé)
  const perce = appliquerElements(plaque(), [{ type: 'soutien_de_voute', hauteur_mm: 3, signe: -1 }], { cote: 'D', cat }); // base de 2 mm : creux traversant = semelle percée (décision de Joël 31/10)
  assert.ok(perce.infos[0].perce && perce.infos[0].perce.cellules > 0);
  const p = appliquerElements(b, [{ type: 'soutien_de_voute', hauteur_mm: 3 }], { cote: 'D', cat });
  const n = appliquerElements(b, [{ type: 'soutien_de_voute', hauteur_mm: 3, signe: -1 }], { cote: 'D', cat });
  const pn = appliquerElements(b, [{ type: 'soutien_de_voute', hauteur_mm: 3 }, { type: 'soutien_de_voute', hauteur_mm: 3, signe: -1 }], { cote: 'D', cat });
  for (let k = 0; k < p.haut.length; k += 11) {
    assert.ok(Math.abs(p.couches[0].z[k] + n.couches[0].z[k]) < 1e-6);
    assert.ok(Math.abs(pn.haut[k] - b.haut[k]) < 1e-5);
  }
  assert.ok(n.rapport_elements.epaisseur_min_mm < 6 - 2.5, 'épaisseur min après décharge ' + n.rapport_elements.epaisseur_min_mm);
});

test('élément invisible = aucun effet ; liste vide = base inchangée', () => {
  const b = plaque();
  const f = appliquerElements(b, [coin({ visible: false })], { cote: 'D', cat });
  const egal = (x, y) => x.length === y.length && x.every((v, k) => v === y[k]); // pas deepEqual : un échec afficherait des centaines de milliers de valeurs
  assert.ok(egal(f.haut, b.haut), 'élément invisible : aucun effet sur H_finale');
  assert.equal(f.rapport_elements.elements[0].visible, false);
  assert.ok(egal(appliquerElements(b, [], { cote: 'D', cat }).haut, b.haut));
  const v = appliquerElements(b, [coin({ visible: true })], { cote: 'D', cat });
  assert.ok(!egal(v.haut, b.haut), 'le même élément visible, lui, change H_finale');
});

test('hors contour : partie coupée avec avertissement chiffré ; élément entièrement dehors refusé ; latéralité exigée', () => {
  const etroite = plaque({ x0: -20, x1: 20 }); // 40 mm de large : le coin de 56 mm déborde
  const f = appliquerElements(etroite, [coin({ angle_deg: 4 })], { cote: 'D', cat });
  assert.ok(f.rapport_elements.elements[0].depassement_pct > 10);
  assert.ok(f.rapport_elements.avertissements.some((a) => /sort du contour du pied/.test(a)), JSON.stringify(f.rapport_elements.avertissements));
  assert.ok(val(etroite, f.couches[0].z, 19, 35) > 2, 'la partie dans le contour est conservée');
  const ok = appliquerElements(plaque(), [coin({ angle_deg: 4 })], { cote: 'D', cat });
  assert.ok(!ok.rapport_elements.avertissements.some((a) => /contour/.test(a)), 'aucun avertissement quand tout est dedans');
  assert.throws(() => appliquerElements(plaque(), [coin({ dy_mm: 900 })], { cote: 'D', cat }), /entièrement hors du contour/);
  assert.throws(() => appliquerElements(plaque(), [coin()], { cote: undefined, cat }), /latéralité/);
  assert.throws(() => appliquerElements(plaque(), [coin()], { cote: 'X', cat }), /latéralité/);
});

test('repère talon : milieu du contour à 30 mm du point le plus postérieur', () => {
  const b = plaque({ x0: -10, x1: 50 }); // plaque décentrée : milieu à x = 20
  const r = reperTalon(b);
  assert.ok(Math.abs(r.x_mm - 20) < 1e-9 && r.y_mm === 0, JSON.stringify(r));
});

test('outil de coupe : régression exacte sur un plan, ignore NaN et points hors fenêtre, refuse moins de 8 points', () => {
  const xs = [], zs = [];
  for (let x = -20; x <= 20; x += 0.5) { xs.push(x); zs.push(3 + 0.1 * x); }
  const m = mesurerAngle(xs, zs, -20, 20);
  assert.ok(Math.abs(m.angle_deg - (Math.atan(0.1) * 180) / Math.PI) < 1e-9);
  zs[36] = NaN; zs[2] = 99; // NaN dans la fenêtre (ignoré), valeur aberrante HORS fenêtre (ignorée)
  const m2 = mesurerAngle(xs, zs, -8, 8);
  assert.ok(Math.abs(m2.angle_deg - 5.7106) < 1e-3 && m2.n > 30);
  assert.equal(mesurerAngle(xs, zs, 0, 2), null);
  const bruit = zs.map((z, k) => (Number.isFinite(z) && k !== 2 ? z + (k % 2 ? 0.02 : -0.02) : z));
  assert.ok(mesurerAngle(xs, bruit, -8, 8).ecart_plan_mm > 0.015, 'l\'écart au plan est rapporté');
});

test('coupe en long : épaisseur minimale seulement (pas d\'angle) ; coupe en travers hors de la zone plane : pas de mesure inventée', () => {
  const b = plaque();
  const f = appliquerElements(b, [coin({ angle_deg: 4 })], { cote: 'D', cat });
  const L = mesurerCoupe(f, 'L', 0, 'D');
  assert.deepEqual(L.elements, []); assert.ok(Math.abs(L.epaisseur_min_mm - 2) < 1e-5);
  const T = mesurerCoupe(f, 'T', 150, 'D');
  assert.equal(T.elements[0].applicable, false); assert.match(T.elements[0].raison, /hors de la zone plane/);
  const dec = mesurerCoupe(f, 'T', 60, 'D');
  assert.equal(dec.elements[0].zone, 'decroissance');
  assert.equal(dec.elements[0].cote_haut, 'latéral');
  assert.equal(mesurerCoupe(appliquerElements(b, [coin({ angle_deg: 4 })], { cote: 'G', cat }), 'T', 30, 'G').elements[0].cote_haut, 'latéral', 'pied gauche : le côté haut reste le latéral');
  assert.ok(dec.elements[0].angle_mesure_deg < 3.2 && dec.elements[0].angle_mesure_deg > 0.5);
});

test('repère talon en y : la position dy se compte depuis le point le plus postérieur du contour, pas depuis y = 0', () => {
  const b = plaque({ y0: 20, y1: 220 });
  const f = appliquerElements(b, [coin({ angle_deg: 4 })], { cote: 'D', cat });
  assert.ok(val(b, f.couches[0].z, 15, 55) > 2.5, 'centre à 20 + 35 = 55 mm');
  assert.ok(val(b, f.couches[0].z, 15, 40) > 1, 'dans l\'emprise (y de 20 à 90 mm)');
  assert.ok(val(b, f.couches[0].z, 15, 100) === 0, 'au-delà de l\'emprise (20 + 70 = 90 mm)');
  assert.ok(Math.abs(f.infos[0].centre.y_mm - 55) < 1e-9, String(f.infos[0].centre.y_mm));
});

test('hors contour : cellules masquées (NaN) de la base comptées comme hors contour, élément coupé là', () => {
  const b = plaque();
  for (let j = 0; j < b.ny; j++) for (let i = 0; i < b.nx; i++) if (b.ox + i * b.pas > 10) b.haut[j * b.nx + i] = NaN; // le pied s'arrête à x = 10
  const f = appliquerElements(b, [coin({ angle_deg: 4, dx_mm: 0 })], { cote: 'G', cat });
  // pied G : repère au milieu du contour (x = -25) ; le coin (56 mm) y est centré : déborde de -53 à +3 -> dans le masque
  const g = appliquerElements(b, [coin({ angle_deg: 4, dx_mm: 40 })], { cote: 'G', cat }); // centre à x = +15 : déborde au-delà de x = 10
  assert.ok(g.rapport_elements.elements[0].depassement_pct > 10, String(g.rapport_elements.elements[0].depassement_pct));
  assert.ok(g.rapport_elements.avertissements.some((a) => /sort du contour/.test(a)));
  assert.ok(val(b, g.couches[0].z, 5, 35) > 0 && val(b, g.couches[0].z, 14, 35) === 0, 'rien au-delà du masque');
  assert.ok(f.rapport_elements.elements[0].depassement_pct < 0.5, 'dedans : pas d\'avertissement ' + f.rapport_elements.elements[0].depassement_pct);
});
