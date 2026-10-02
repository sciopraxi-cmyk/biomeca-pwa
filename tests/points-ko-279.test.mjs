import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { charger } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3d — « points non disponibles »
// ═══════════════════════════════════════════════════════════════════
//
// Décision du praticien : une capture imageBrute:true dont les coordonnées
// sont absentes ou illisibles ne s'affiche JAMAIS comme une photo normale sans
// points. Elle porte la mention rouge « points non disponibles », dans le style
// des photos non rechargées, à chaque endroit où elle s'affiche.
//
// Côté mesuré : celui du créneau s'il a des points de ce côté ; D ET G pour le
// créneau bipodal du KFPPA et de la mobilité ; sinon les côtés présents (le
// MLA a des points sans côté). Il en faut au moins trois placés par côté.
// Données synthétiques : coordonnées inventées, dataURL factices.

const MENTION = '⚠️ points non disponibles';
const P = (x, y, side) => ({ x, y, side, name: 'p' });
const TROIS = (side, dx = 0) => [
  P(100 + dx, 100, side),
  P(110 + dx, 400, side),
  P(120 + dx, 700, side),
];
const capture = (o) => ({
  label: 'Capture',
  side: 'D',
  dataUrl: 'data:image/jpeg;base64,BRUTE',
  angle: 4,
  path: null,
  imageBrute: true,
  dessin: { taille: 1, opacite: 0.5, testId: 'verrou' },
  markers: TROIS('D'),
  dims: { w: 1920, h: 1080 },
  markersConnus: true,
  ...o,
});
// Captures NON redessinables, une par cause.
const ILLISIBLES = {
  'sans dims': capture({ dims: undefined }),
  'dims non numériques': capture({ dims: { w: '1920', h: 1080 } }),
  'dims nulles': capture({ dims: { w: 0, h: 1080 } }),
  'deux points': capture({ markers: TROIS('D').slice(0, 2) }),
  'aucun point': capture({ markers: [] }),
  'points absents': capture({ markers: undefined }),
  'points non placés': capture({
    markers: [P(null, null, 'D'), P(null, null, 'D'), P(null, null, 'D')],
  }),
};
const ANTERIEURE = {
  label: 'Antérieure',
  side: 'D',
  dataUrl: 'data:image/jpeg;base64,AVECPOINTS',
  angle: 3,
  path: null,
};

describe('#279 étape 3d — règle de lisibilité', () => {
  it('I1. Points redessinables seulement avec dims numériques et trois points par côté mesuré', () => {
    const env = charger();
    expect(env._pointsCaptureLisibles(capture({})), 'unipodal valide').toBe(true);
    for (const [cas, ph] of Object.entries(ILLISIBLES)) {
      expect(env._pointsCaptureLisibles(ph), cas).toBe(false);
    }
    // Bipodal KFPPA : D ET G exigés.
    const bip = { side: '', dessin: { testId: 'kfppa-marche' } };
    expect(
      env._pointsCaptureLisibles(capture({ ...bip, markers: [...TROIS('D'), ...TROIS('G', 300)] })),
      'bipodal complet'
    ).toBe(true);
    expect(
      env._pointsCaptureLisibles(
        capture({ ...bip, markers: [...TROIS('D'), ...TROIS('G', 300).slice(0, 2)] })
      ),
      'bipodal, G incomplet'
    ).toBe(false);
    expect(
      env._pointsCaptureLisibles(capture({ ...bip, markers: TROIS('D') })),
      'bipodal, G absent'
    ).toBe(false);
    // MLA : créneau côté D, points SANS côté.
    expect(
      env._pointsCaptureLisibles(capture({ dessin: { testId: 'mla-marche' }, markers: TROIS('') })),
      'MLA'
    ).toBe(true);
    // Créneau D avec des points G SEULEMENT : jamais les points du mauvais genou.
    expect(
      env._pointsCaptureLisibles(capture({ side: 'D', markers: TROIS('G', 300) })),
      'créneau D, points G'
    ).toBe(false);
    expect(
      env._pointsCaptureLisibles(capture({ side: 'G', markers: TROIS('D') })),
      'créneau G, points D'
    ).toBe(false);
    // Une capture antérieure n'est pas concernée.
    expect(env._pointsCaptureLisibles(ANTERIEURE)).toBe(false);
  });
});

describe('#279 étape 3d — la mention, partout', () => {
  const nb = (h) => h.split(MENTION).length - 1;

  it('I2. Vignette', () => {
    const env = charger();
    env.poser({ test: 'verrou' });
    for (const [cas, ph] of Object.entries(ILLISIBLES)) {
      expect(nb(env.vidPhotoSlotHTML(ph, 0)), cas).toBe(1);
    }
    expect(nb(env.vidPhotoSlotHTML(capture({}), 0)), 'valide').toBe(0);
    expect(nb(env.vidPhotoSlotHTML(ANTERIEURE, 0)), 'antérieure').toBe(0);
  });

  it('I3. Agrandissement, élément calque PRÉSENT mais points illisibles', () => {
    const env = charger();
    const lbl = { innerHTML: '' };
    const elements = {
      'modal-vignette': { classList: { add() {}, remove() {} } },
      'vig-modal-img': {},
      'vig-modal-lbl': lbl,
      'vig-modal-ang': { textContent: '', style: {} },
      'vig-modal-calque': { removeAttribute() {} },
    };
    env.poser({ test: 'verrou', slots: [ILLISIBLES['deux points'], capture({})], elements });
    env.ouvrirVignette(0);
    expect(nb(lbl.innerHTML)).toBe(1);
    env.ouvrirVignette(1);
    expect(nb(lbl.innerHTML)).toBe(0);
  });

  it('I4. Mode photo', () => {
    const env = charger();
    for (const [cas, ph] of Object.entries(ILLISIBLES)) {
      expect(nb(env.photoSlotHTML(ph, 0)), cas).toBe(1);
    }
    expect(nb(env.photoSlotHTML(capture({}), 0))).toBe(0);
    expect(nb(env.photoSlotHTML(ANTERIEURE, 0))).toBe(0);
  });

  it('I5. Rapport : photos de côté, photo bipodale, test à photo unique', () => {
    const env = charger();
    const ko = ILLISIBLES['deux points'];
    const hv = env.buildPrintSection(
      env.TESTS.verrou,
      { photos: [ko, { ...ANTERIEURE, side: 'G' }] },
      []
    );
    expect(nb(hv)).toBe(1);
    const bip = {
      ...ko,
      side: '',
      label: 'Station bipodale',
      angleD: 1,
      angleG: -1,
      kfppaSigne: true,
    };
    expect(nb(env._kfppaPhotoBipodaleHTML({ photos: [bip] }, env.TESTS['kfppa-marche']))).toBe(1);
    const hs = env.buildPrintSingleSide(env.TESTS.mobilite, {
      photos: [
        { ...ko, side: '' },
        { ...ANTERIEURE, side: '' },
      ],
    });
    expect(nb(hs)).toBe(1);
    // Témoin : capture valide, aucune mention.
    expect(nb(env.buildPrintSection(env.TESTS.verrou, { photos: [capture({})] }, []))).toBe(0);
  });

  it('I6. Vignette et mode photo : la mention est posée AU-DESSUS de l’image positionnée', () => {
    const css = readFileSync(join(RACINE, 'css/biomeca.css'), 'utf8');
    const regle = css.match(/\.vig \.rp-points-ko,\s*\.photo-slot \.rp-points-ko\s*\{([^}]*)\}/);
    expect(regle, 'règle CSS de placement').not.toBeNull();
    expect(regle[1]).toMatch(/position:\s*absolute/);
    expect(regle[1]).toMatch(/z-index:\s*[1-9]/);
    const env = charger();
    env.poser({ test: 'verrou' });
    // Dans la vignette, la mention est un enfant direct de .vig (la règle s'applique).
    expect(env.vidPhotoSlotHTML(ILLISIBLES['deux points'], 0)).toMatch(
      /<div class="vig"[^>]*>[\s\S]*<div class="rp-points-ko"/
    );
  });
});
