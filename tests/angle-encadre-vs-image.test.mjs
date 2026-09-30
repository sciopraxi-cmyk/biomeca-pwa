// #271-D — L'ENCADRÉ EN DIRECT ET LE TEXTE DE L'IMAGE DOIVENT DONNER LE MÊME
// NOMBRE, pour chaque test de la table.
//
// Le praticien a relevé un MLA affichant 113,5 dans l'arc et 66,5 dans
// l'encadré. Cause : trois formules différentes pour choisir le type de test
// passé à computeCorrectedAngle. L'encadré ne recevait ni « mla » ni « kfppa »,
// et ne recevait pas non plus les points — donc pas de signe latéral.
//
// NI LA TABLE NI LES APPELS NE SONT RECOPIÉS : TESTS est évaluée depuis le
// source, et les deux valeurs comparées viennent des LIGNES RÉELLES des deux
// sites d'appel, extraites par leur texte.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'biomeca.js'),
  'utf8'
);

function fn(nom) {
  const t = 'function ' + nom + '(';
  const i = SRC.indexOf(t);
  if (i === -1) throw new Error('introuvable : ' + nom);
  if (SRC.indexOf(t, i + 1) !== -1) throw new Error('ambiguë : ' + nom);
  return SRC.slice(i, SRC.indexOf('\n}\n', i) + 2);
}
function ligne(motif) {
  const i = SRC.indexOf(motif);
  if (i === -1) throw new Error('ligne introuvable : ' + motif);
  if (SRC.indexOf(motif, i + 1) !== -1) throw new Error('ligne ambiguë : ' + motif);
  return SRC.slice(i, SRC.indexOf('\n', i)).trim();
}

// La table, évaluée telle quelle.
const iT = SRC.indexOf('const TESTS = {');
const TESTS = new Function(SRC.slice(iT, SRC.indexOf('\n};', iT) + 3) + '\nreturn TESTS;')();

const BASE = [
  fn('_coord'),
  fn('_isPlacedPt'),
  fn('_normPt'), // dependance de calcAngle3 et calcAngleSign
  fn('calcAngle3'),
  fn('calcAngleSign'),
  fn('_mkrTypeTest'),
  fn('computeCorrectedAngle'),
  fn('updateAngleOverlay'),
].join('\n');

// LES DEUX LIGNES D'APPEL, EXTRAITES DU SOURCE.
// #279 étape 3a — drawOverlay lit le test via `_testId`, qui vaut
// currentTestId sans option (dessin en direct) : le harnais le déclare ainsi.
const L_IMG_TYPE = ligne('const _mlaT = _mkrTypeTest(TESTS[_testId]);');
const L_IMG_VAL = ligne(
  '_textesAngle.set(side, computeCorrectedAngle(ang, side, view, _mlaT, grp)'
);

// Harnais : TESTS et currentTestId en variables du contexte, un document
// factice pour updateAngleOverlay.
function harnais(id) {
  return new Function(
    'TESTS',
    'currentTestId',
    'document',
    BASE +
      '\nfunction _valeurImage(markers, view, side) {' +
      '\n  const grp = markers.filter((m) => m.side === side && _isPlacedPt(m));' +
      '\n  if (grp.length < 3) return null;' +
      '\n  const ang = calcAngle3(grp);' +
      '\n  if (ang === null) return null;' +
      '\n  const _textesAngle = new Map();' +
      '\n  const _testId = currentTestId;' +
      '\n  ' +
      L_IMG_TYPE +
      '\n  ' +
      L_IMG_VAL +
      '\n  return _textesAngle.get(side);' +
      '\n}' +
      '\nreturn { updateAngleOverlay, _valeurImage };'
  )(TESTS, id, docFactice());
}

let dernierHTML = '';
function docFactice() {
  return {
    getElementById: () => ({
      set innerHTML(v) {
        dernierHTML = v;
      },
    }),
  };
}

// Trois points formant un angle net, décalés pour que le côté soit lisible.
function jambe(side, dx) {
  return [
    { name: 'A', side, x: 900 + dx, y: 100 },
    { name: 'B', side, x: 900 + dx + 40, y: 400 },
    { name: 'C', side, x: 900 + dx, y: 700 },
  ];
}
const MARQUEURS = [...jambe('D', -200), ...jambe('G', 200)];
const SANS_COTE = jambe('', 0);

function valeursEncadre(id, markers, view) {
  const h = harnais(id);
  dernierHTML = '';
  h.updateAngleOverlay('x', markers, view);
  return [...dernierHTML.matchAll(/(-?\d+\.\d)°/g)].map((m) => m[1]);
}

describe('#271-D — encadré et image donnent le même nombre', () => {
  it('la table TESTS est bien lue depuis le code', () => {
    const ids = Object.keys(TESTS);
    expect(ids.length).toBeGreaterThan(0);
    // Les trois familles doivent être représentées, sinon le balayage est vide.
    const m = ids.map((k) => TESTS[k].markers);
    expect(m).toContain('mla');
    expect(m).toContain('genou-bi');
    expect(m).toContain('ap-bi');
  });

  for (const vue of ['face', 'dos']) {
    it(`chaque test de la table concorde — vue ${vue}`, () => {
      for (const id of Object.keys(TESTS)) {
        const h = harnais(id);
        const enc = valeursEncadre(id, MARQUEURS, vue);
        const img = ['D', 'G'].map((s) => h._valeurImage(MARQUEURS, vue, s).replace('°', ''));
        expect(enc, id + ' / ' + vue + ' : nombre de valeurs').toHaveLength(2);
        expect(enc, id + ' / ' + vue).toEqual(img);
      }
    });
  }

  it('le groupe SANS CÔTÉ concorde aussi (cas MLA)', () => {
    for (const id of Object.keys(TESTS)) {
      const h = harnais(id);
      const enc = valeursEncadre(id, SANS_COTE, 'profil');
      const img = h._valeurImage(SANS_COTE, 'profil', '').replace('°', '');
      expect(enc, id).toEqual([img]);
    }
  });

  it('le MLA rend bien l’angle BRUT des deux côtés, pas 180 moins l’angle', () => {
    const id = Object.keys(TESTS).find((k) => TESTS[k].markers === 'mla');
    const h = harnais(id);
    const brut = Number(h._valeurImage(SANS_COTE, 'profil', '').replace('°', ''));
    const enc = Number(valeursEncadre(id, SANS_COTE, 'profil')[0]);
    expect(enc).toBe(brut);
    expect(brut).toBeGreaterThan(90); // un angle d’arche, pas son complément
  });
});
