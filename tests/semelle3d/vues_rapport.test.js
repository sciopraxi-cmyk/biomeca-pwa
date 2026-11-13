// B3 : vues figées de l'image du rapport (orthographiques, même échelle, talon/avant-pied du bon côté selon le pied).
import test from 'node:test';
import assert from 'node:assert/strict';
import { vuesRapport, projeter, directionVue, VUES_RAPPORT } from '../../js/semelle3d/calcul/vues_rapport.js';
import { IMAGE_RAPPORT } from '../../js/semelle3d/constantes.js';

const garde = (f) => { try { return f(); } catch (e) { if (e instanceof assert.AssertionError) throw e; const a = new assert.AssertionError({ message: 'erreur inattendue : ' + e.message }); a.cause = e; throw a; } };
const T = (nom, f) => test(nom, () => garde(f));
const boite = { x_min: -45, x_max: 40, y_min: 0, y_max: 265, z_min: 0, z_max: 14 };
const TALON = [0, 0, 0], AVANT = [0, 265, 0], MEDIAL_D = [-45, 130, 0], LATERAL_D = [40, 130, 0];

T('deux vues, dans l\'ordre dessus puis 3/4 médiale', () => {
  const v = vuesRapport(boite, 'D'); assert.deepEqual(v.map((x) => x.vue), ['dessus', 'trois-quarts-medial']); assert.deepEqual(VUES_RAPPORT, ['dessus', 'trois-quarts-medial']);
});
T('même échelle dans les deux vues (px par mm identique, tailles d\'image = mm × échelle)', () => {
  const v = vuesRapport(boite, 'D');
  assert.equal(v[0].px_par_mm, v[1].px_par_mm); assert.equal(v[0].px_par_mm, IMAGE_RAPPORT.px_par_mm);
  for (const x of v) { assert.ok(Math.abs(x.largeur_px / (2 * x.demi_largeur_mm) - x.px_par_mm) < 0.5); assert.ok(Math.abs(x.hauteur_px / (2 * x.demi_hauteur_mm) - x.px_par_mm) < 0.5); }
});
T('la longueur réelle de la semelle est rendue à la même échelle : 265 mm = 795 px en vue de dessus', () => {
  const [d] = vuesRapport(boite, 'D'), a = projeter('dessus', 'D', AVANT, d.cible), t = projeter('dessus', 'D', TALON, d.cible);
  assert.ok(Math.abs((a.y - t.y) * d.px_par_mm - 265 * 3) < 1e-6);
});
T('vue de dessus pied droit : avant-pied en haut, côté médial (-X) à gauche de l\'écran', () => {
  const [d] = vuesRapport(boite, 'D'), a = projeter('dessus', 'D', AVANT, d.cible), t = projeter('dessus', 'D', TALON, d.cible), m = projeter('dessus', 'D', MEDIAL_D, d.cible), l = projeter('dessus', 'D', LATERAL_D, d.cible);
  assert.ok(a.y > t.y, 'avant-pied plus haut que le talon'); assert.ok(m.x < l.x, 'médial à gauche, latéral à droite');
});
T('vue 3/4 médiale pied droit : talon en BAS À DROITE, avant-pied en haut à gauche (capture de Joël)', () => {
  const v = vuesRapport(boite, 'D')[1], a = projeter(v.vue, 'D', AVANT, v.cible), t = projeter(v.vue, 'D', TALON, v.cible);
  assert.ok(t.x > a.x, 'talon à droite de l\'avant-pied'); assert.ok(t.y < a.y, 'talon plus bas que l\'avant-pied');
});
T('vue 3/4 : la caméra est du côté médial (x < 0 pour un pied droit, x > 0 pour un pied gauche), basse et relevée', () => {
  const D = vuesRapport(boite, 'D')[1], G = vuesRapport(boite, 'G')[1];
  assert.ok(D.position[0] < D.cible[0]); assert.ok(G.position[0] > G.cible[0]);
  assert.ok(D.position[2] > D.cible[2]); assert.ok(D.position[2] - D.cible[2] < Math.abs(D.position[0] - D.cible[0]), 'caméra basse : moins haute que loin');
  assert.ok(D.position[1] < D.cible[1], 'décalée vers l\'arrière (côté talon)');
});
T('pied gauche : image en miroir exact du pied droit (avant-pied à droite, talon en bas à gauche en 3/4)', () => {
  const bG = { ...boite, x_min: -40, x_max: 45 };
  const v = vuesRapport(bG, 'G')[1], a = projeter(v.vue, 'G', AVANT, v.cible), t = projeter(v.vue, 'G', TALON, v.cible);
  assert.ok(t.x < a.x, 'talon à gauche'); assert.ok(t.y < a.y);
  const D = vuesRapport(boite, 'D')[1], G = vuesRapport(bG, 'G')[1];
  assert.equal(D.largeur_px, G.largeur_px); assert.equal(D.hauteur_px, G.hauteur_px);
});
T('toute la boîte tient dans l\'image (marge comprise) pour les 8 coins, dans les deux vues et pour les deux pieds', () => {
  for (const cote of ['D', 'G']) for (const v of vuesRapport(boite, cote)) for (const x of [boite.x_min, boite.x_max]) for (const y of [boite.y_min, boite.y_max]) for (const z of [boite.z_min, boite.z_max]) {
    const p = projeter(v.vue, cote, [x, y, z], v.cible);
    assert.ok(Math.abs(p.x) <= v.demi_largeur_mm - 11.9 && Math.abs(p.y) <= v.demi_hauteur_mm - 11.9, v.vue + ' ' + cote + ' ' + JSON.stringify(p));
  }
});
T('la boîte est centrée dans l\'image (marges égales gauche/droite et haut/bas)', () => {
  for (const v of vuesRapport(boite, 'D')) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const x of [boite.x_min, boite.x_max]) for (const y of [boite.y_min, boite.y_max]) for (const z of [boite.z_min, boite.z_max]) { const p = projeter(v.vue, 'D', [x, y, z], v.cible); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } assert.ok(Math.abs(x0 + x1) < 1e-6 && Math.abs(y0 + y1) < 1e-6, v.vue); }
});
T('le relief change la hauteur de l\'image 3/4 (une boîte plus haute = plus de place), pas la vue de dessus', () => {
  const a = vuesRapport(boite, 'D'), b = vuesRapport({ ...boite, z_max: 60 }, 'D');
  assert.ok(b[1].hauteur_px > a[1].hauteur_px); assert.equal(b[0].largeur_px, a[0].largeur_px); assert.equal(b[0].hauteur_px, a[0].hauteur_px);
});
T('caméra loin et dirigée vers la cible (position = cible + direction × distance)', () => {
  for (const v of vuesRapport(boite, 'D')) { const { dir } = directionVue(v.vue, 'D'); for (let k = 0; k < 3; k++) assert.ok(Math.abs(v.position[k] - v.cible[k] - dir[k] * v.distance) < 1e-9); assert.ok(v.distance > 265); }
});
T('refus : côté inconnu, vue inconnue, boîte non finie, échelle nulle', () => {
  assert.throws(() => vuesRapport(boite, 'X'), /côté invalide/); assert.throws(() => directionVue('dessous', 'D'), /vue inconnue/);
  assert.throws(() => vuesRapport({ ...boite, z_max: NaN }, 'D'), /boîte invalide/); assert.throws(() => vuesRapport(boite, 'D', { pxParMm: 0 }), /échelle invalide/);
});
