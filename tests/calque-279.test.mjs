import { describe, it, expect } from 'vitest';
import { charger, envCapture, slotsVierges } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3c — points redessinés à l'affichage, sur un calque
// ═══════════════════════════════════════════════════════════════════
//
// Une capture imageBrute:true (étape 3b) n'a plus ses points dans l'image :
// chaque affichage — vignette, agrandissement, mode photo, rapport — les
// redessine sur un CALQUE transparent posé au-dessus, avec les réglages DE
// LA CAPTURE (taille, opacité, test). Une capture antérieure, qui a ses points
// dans l'image, s'affiche telle quelle, sans calque.
//
// Le faux drawOverlay du harnais note ce qu'il reçoit ; le PNG du calque
// l'encode (« data:image/png;base64,CALQUE<json> »), relu par `trace`.
// Données synthétiques : coordonnées inventées, dataURL factices.

const DESSIN = { taille: 1.1, opacite: 0.8, testId: 'verrou' };
const P = (x, y) => ({ x, y, side: 'D', name: 'p' });
const brute = (side = 'D', label = 'Statique D') => ({
  label,
  side,
  dataUrl: 'data:image/jpeg;base64,BRUTE',
  angle: -4.5,
  path: null,
  imageBrute: true,
  dessin: { ...DESSIN },
  markers: [P(100, 100), P(110, 400), P(120, 700), P(140, 850)],
  dims: { w: 1920, h: 1080 },
  markersConnus: true,
});
const anterieure = (side = 'G', label = 'Statique G') => ({
  label,
  side,
  dataUrl: 'data:image/jpeg;base64,AVECPOINTS',
  angle: 3.5,
  path: null,
});
const calques = (html) =>
  [...html.matchAll(/src="data:image\/png;base64,CALQUE([^"]*)"/g)].map((m) =>
    JSON.parse(decodeURIComponent(m[1]))
  );
const trace = (src) =>
  JSON.parse(decodeURIComponent(src.replace('data:image/png;base64,CALQUE', '')));
const ATTENDU = { view: 'dos', n: 4, w: 1920, h: 1080, opts: DESSIN };

describe('#279 étape 3c — calque des points', () => {
  it('H1. Vignette : calque avec les réglages de la capture ; rien pour une capture antérieure', () => {
    const env = charger();
    env.poser({ test: 'verrou' });
    const h = env.vidPhotoSlotHTML(brute(), 0);
    expect(calques(h)).toEqual([ATTENDU]);
    expect(h).toContain('class="vig-img vig-calque"');
    const a = env.vidPhotoSlotHTML(anterieure(), 1);
    expect(calques(a)).toEqual([]);
    expect(a).toContain('src="data:image/jpeg;base64,AVECPOINTS"');
  });

  it('H2. Agrandissement : calque posé pour une capture sans points, retiré sinon', () => {
    const env = charger();
    const calque = {
      src: 'ancien',
      hidden: false,
      removeAttribute(n) {
        delete this[n];
      },
    };
    const elements = {
      'modal-vignette': { classList: { add() {}, remove() {} } },
      'vig-modal-img': { removeAttribute() {} },
      'vig-modal-lbl': { textContent: '' },
      'vig-modal-ang': { textContent: '', style: {} },
      'vig-modal-calque': calque,
    };
    env.poser({ test: 'verrou', slots: [brute(), anterieure()], elements });
    env.ouvrirVignette(0);
    expect(calque.hidden).toBe(false);
    expect(trace(calque.src)).toEqual(ATTENDU);
    env.ouvrirVignette(1);
    expect(calque.hidden).toBe(true);
    expect('src' in calque).toBe(false);
  });

  it('H3. Mode photo : même règle', () => {
    const env = charger();
    env.poser({ test: 'verrou' });
    expect(calques(env.photoSlotHTML(brute(), 0))).toEqual([ATTENDU]);
    expect(calques(env.photoSlotHTML(anterieure(), 1))).toEqual([]);
  });

  it('H4. Rapport : photos de côté, photo bipodale et test à photo unique', () => {
    const env = charger();
    // Photos de côté (buildPrintPhotos, par buildPrintSection).
    const hv = env.buildPrintSection(
      env.TESTS.verrou,
      { photos: [brute('D'), anterieure('G')] },
      []
    );
    expect(calques(hv)).toEqual([ATTENDU]);
    expect(hv).toContain('src="data:image/jpeg;base64,AVECPOINTS"');
    // Photo bipodale du KFPPA.
    const bip = { ...brute('', 'Station bipodale'), angleD: 1.2, angleG: -0.6, kfppaSigne: true };
    const hk = env._kfppaPhotoBipodaleHTML({ photos: [bip] }, env.TESTS['kfppa-marche']);
    expect(calques(hk)).toEqual([ATTENDU]);
    // Test à photo unique (buildPrintSingleSide).
    const hs = env.buildPrintSingleSide(env.TESTS.mobilite, {
      photos: [brute('', 'Inversion'), anterieure('', 'Éversion')],
    });
    expect(calques(hs)).toEqual([ATTENDU]);
  });

  it('H5. Réglages changés APRÈS la capture : le calque garde ceux de la capture', () => {
    const env = charger();
    const t = env.TESTS['verrou'];
    envCapture(env, 'verrou', slotsVierges(t));
    env.poser({ taille: 0.7, opacite: 0.4 });
    env.captureVidPhotoSlot(0);
    env.poser({ taille: 1.5, opacite: 1.0 }); // le praticien change ses réglages
    const h = env.vidPhotoSlotHTML(env.slots()[0], 0);
    expect(calques(h)[0].opts).toEqual({ taille: 0.7, opacite: 0.4, testId: 'verrou' });
  });

  it('H6. Afficher des calques n’écrit rien', () => {
    const env = charger();
    env.poser({ test: 'verrou' });
    env.vidPhotoSlotHTML(brute(), 0);
    env.photoSlotHTML(brute(), 0);
    env.buildPrintSection(env.TESTS.verrou, { photos: [brute('D'), anterieure('G')] }, []);
    expect(env.espions()).toEqual([]);
  });

  it('H7. Sans élément calque (index.html en cache) : la modale s’ouvre, mention pour une capture sans points', () => {
    const env = charger();
    const classes = new Set();
    const img = { src: '' };
    const lbl = { innerHTML: '', textContent: '' };
    const elements = {
      'modal-vignette': {
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
      },
      'vig-modal-img': img,
      'vig-modal-lbl': lbl,
      'vig-modal-ang': { textContent: '', style: {} },
      // PAS de 'vig-modal-calque'
    };
    env.poser({ test: 'verrou', slots: [brute(), anterieure()], elements });
    expect(() => env.ouvrirVignette(0)).not.toThrow();
    expect(classes.has('ouverte'), 'modale ouverte').toBe(true);
    expect(img.src).toBe('data:image/jpeg;base64,BRUTE');
    expect(lbl.innerHTML).toContain('Statique D');
    expect(lbl.innerHTML).toContain('⚠️ points non disponibles');
    // Capture antérieure (points dans l'image) : aucune mention.
    env.ouvrirVignette(1);
    expect(lbl.innerHTML).toBe('Statique G');
    // Témoin : AVEC l'élément calque, une capture lisible n'a pas de mention.
    const env2 = charger();
    const lbl2 = { innerHTML: '' };
    env2.poser({
      test: 'verrou',
      slots: [brute()],
      elements: {
        ...elements,
        'vig-modal-lbl': lbl2,
        'vig-modal-calque': { removeAttribute() {} },
      },
    });
    env2.ouvrirVignette(0);
    expect(lbl2.innerHTML).toBe('Statique D');
  });

  it('H8. Un calque par capture et par rendu, même si la photo apparaît deux fois (mobilité)', () => {
    const env = charger();
    const photos = [
      brute('', 'Inversion'),
      { ...brute('', 'Éversion'), markers: [P(200, 100), P(210, 400), P(220, 700)] },
    ];
    const h = env.buildPrintSection(env.TESTS.mobilite, { photos }, []);
    expect(calques(h).length, 'chaque photo figure dans les deux blocs de côté').toBe(4);
    expect(env.nbDessins(), 'dessins effectivement calculés').toBe(2);
    // Une capture MODIFIÉE (autres points) n'est pas servie depuis la mémoire.
    const autre = { ...photos[0], markers: [P(300, 100), P(310, 400), P(320, 700)] };
    env.buildPrintSection(env.TESTS.mobilite, { photos: [autre] }, []);
    expect(env.nbDessins()).toBe(3);
  });
});
