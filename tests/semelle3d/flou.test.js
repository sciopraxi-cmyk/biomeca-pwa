import test from 'node:test';
import assert from 'node:assert/strict';
import { flouGauss, noyauGauss } from '../../js/semelle3d/calcul/flou.js';

const NX = 80, NY = 60, PAS = 0.5;
const plein = (v) => new Float64Array(NX * NY).fill(v);

test('flou : une valeur constante reste constante (aussi au bord et près d\'un trou)', () => {
  const s = plein(7.25);
  for (let j = 20; j < 30; j++) for (let i = 30; i < 40; i++) s[j * NX + i] = NaN; // trou
  const o = flouGauss(s, NX, NY, PAS, 3, 'masque');
  for (let k = 0; k < o.length; k++) { if (Number.isNaN(s[k])) continue; assert.ok(Math.abs(o[k] - 7.25) < 1e-9, 'k=' + k + ' -> ' + o[k]); }
});

test('flou : les NaN restent NaN et aucun NaN n\'apparaît ailleurs', () => {
  const s = plein(1);
  for (let j = 0; j < NY; j++) s[j * NX + 10] = NaN;
  const o = flouGauss(s, NX, NY, PAS, 2, 'masque');
  for (let k = 0; k < o.length; k++) assert.equal(Number.isNaN(o[k]), Number.isNaN(s[k]));
});

test('flou : rien ne traverse un trou (deux îlots de valeurs 1 et 9 gardent leur valeur)', () => {
  const s = plein(1);
  for (let j = 0; j < NY; j++) { s[j * NX + 40] = NaN; for (let i = 41; i < NX; i++) s[j * NX + i] = 9; }
  const o = flouGauss(s, NX, NY, PAS, 4, 'masque');
  assert.ok(Math.abs(o[30 * NX + 39] - 1) < 1e-9, 'côté gauche contaminé : ' + o[30 * NX + 39]);
  assert.ok(Math.abs(o[30 * NX + 41] - 9) < 1e-9, 'côté droit contaminé : ' + o[30 * NX + 41]);
});

for (const sigma of [2, 4, 6]) {
  test('flou : l\'écart-type de la réponse à une impulsion vaut sigma = ' + sigma + ' mm (±3 %)', () => {
    const nx = 301, ny = 301, s = new Float64Array(nx * ny);
    s[150 * nx + 150] = 1;
    const o = flouGauss(s, nx, ny, PAS, sigma, 'masque');
    // en mode masque la valeur est renormalisée ; on mesure la forme sur l'axe x
    let m0 = 0, m2 = 0;
    for (let i = 0; i < nx; i++) { const v = o[150 * nx + i]; m0 += v; m2 += v * ((i - 150) * PAS) ** 2; }
    const ecartType = Math.sqrt(m2 / m0);
    assert.ok(Math.abs(ecartType / sigma - 1) < 0.03, 'écart-type mesuré ' + ecartType);
  });
}

test('flou : mode zéro, intérieur = 1 et bord de grille = 0,55 (moitié du noyau + le centre)', () => {
  const o = flouGauss(plein(1), NX, NY, PAS, 2, 'zero');
  assert.ok(Math.abs(o[30 * NX + 40] - 1) < 1e-9);
  assert.ok(Math.abs(o[30 * NX] - 0.55) < 0.01, 'bord ' + o[30 * NX]);
});

test('flou : noyau symétrique de somme positive, sigma <= 0 refusé', () => {
  const { r, w } = noyauGauss(2, 0.5);
  for (let k = 1; k <= r; k++) assert.equal(w[r + k], w[r - k]);
  assert.throws(() => noyauGauss(0, 0.5), RangeError);
});
