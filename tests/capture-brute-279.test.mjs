import { describe, it, expect } from 'vitest';
import { charger, envCapture, slotsVierges, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3b — capture de l'image SANS points
// ═══════════════════════════════════════════════════════════════════
//
// Décision du praticien : chaque nouvelle capture enregistre l'image SANS
// les points dessinés, plus leurs coordonnées, avec le repère imageBrute:true
// et les réglages de dessin DE LA CAPTURE (taille, opacité, test). Les points
// seront redessinés à l'affichage (étape 3c) — ce qui rendra possible la
// correction sur photo capturée (#280).
//
// Le faux canevas du harnais note si drawOverlay y a dessiné : sa dataURL
// vaut « …BRUTE » sans points, « …AVECPOINTS » sinon.
//
// Harnais : markerSizeFactor = 0.7, markerOpacity = 0.4.

const DESSIN = (testId) => ({ taille: 0.7, opacite: 0.4, testId });

describe('#279 étape 3b — capture sans points', () => {
  it('G1. Capture vidéo : image BRUTE, imageBrute et réglages de la capture', () => {
    const env = charger();
    const t = env.TESTS['kfppa-marche'];
    envCapture(env, 'kfppa-marche', slotsVierges(t));
    env.captureVidPhotoSlot(2); // unipodal D
    const s = env.slots()[2];
    expect(s.dataUrl, 'aucun point dans l’image enregistrée').toBe('data:image/jpeg;base64,BRUTE');
    expect(s.imageBrute).toBe(true);
    expect(s.dessin).toEqual(DESSIN('kfppa-marche'));
    // Les coordonnées, elles, sont bien là (#250) — c'est d'elles que les
    // points seront redessinés.
    expect(s.markersConnus).toBe(true);
    expect(s.markers.filter((m) => m.x != null)).toHaveLength(3);
    expect(s.dims).toEqual({ w: 1368, h: 770 });
  });

  it('G2. Capture photo (caméra) : même règle', () => {
    const env = charger();
    const t = env.TESTS['verrou'];
    env.poser({
      test: 'verrou',
      slots: slotsVierges(t),
      live: MARQUEURS_DEMO.map((m) => ({ ...m })),
      camera: {},
      elements: { 'ph-canvas': { width: 1920, height: 1080 } },
    });
    env.capturePhotoSlot(0);
    const s = env.slots()[0];
    expect(s.dataUrl).toBe('data:image/jpeg;base64,BRUTE');
    expect(s.imageBrute).toBe(true);
    expect(s.dessin).toEqual(DESSIN('verrou'));
  });

  it('G3. Enregistrement : imageBrute et dessin écrits SEULEMENT s’ils existent', () => {
    const env = charger();
    const base = { label: 'L', side: 'D', dataUrl: 'data:x', angle: 5, path: null };
    const avec = env._serialiserPhoto({ ...base, imageBrute: true, dessin: DESSIN('verrou') });
    expect(avec.imageBrute).toBe(true);
    expect(avec.dessin).toEqual(DESSIN('verrou'));
    const sans = env._serialiserPhoto(base);
    expect('imageBrute' in sans).toBe(false);
    expect('dessin' in sans).toBe(false);
  });

  it('G4. Relecture : champs repris pour une capture sans points, rien pour une antérieure', () => {
    const env = charger();
    expect(env._relireImageBrute({ imageBrute: true, dessin: DESSIN('verrou') })).toEqual({
      imageBrute: true,
      dessin: DESSIN('verrou'),
    });
    expect(env._relireImageBrute({ dataUrl: 'data:x', angle: 5 })).toEqual({});
    expect(env._relireImageBrute(undefined)).toEqual({});
  });

  it('G5. Supprimer un créneau efface imageBrute et dessin', () => {
    const env = charger();
    const t = env.TESTS['verrou'];
    const slots = slotsVierges(t);
    slots[0] = {
      ...slots[0],
      dataUrl: 'data:x',
      angle: 5,
      imageBrute: true,
      dessin: DESSIN('verrou'),
    };
    env.poser({ test: 'verrou', slots });
    env.deletePhotoSlot(0);
    const s = env.slots()[0];
    expect('imageBrute' in s).toBe(false);
    expect('dessin' in s).toBe(false);
  });

  it('G6. Réouverture par launchTest : la capture sans points garde imageBrute et son dessin', async () => {
    const env = charger();
    // Enregistrement tel qu'il passe dans le stockage : sérialisé, puis JSON.
    const brute = env._serialiserPhoto({
      label: 'Statique D',
      side: 'D',
      dataUrl: 'data:image/jpeg;base64,BRUTE',
      angle: -4.5,
      path: 'u/g6-0.jpg',
      markers: [{ x: 1, y: 2, side: 'D', name: 'a' }],
      dims: { w: 1920, h: 1080 },
      markersConnus: true,
      imageBrute: true,
      dessin: DESSIN('verrou'),
    });
    const anterieure = env._serialiserPhoto({
      label: 'Statique G',
      side: 'G',
      dataUrl: 'data:image/jpeg;base64,AVECPOINTS',
      angle: 3.5,
      path: 'u/g6-1.jpg',
    });
    const patient = JSON.parse(
      JSON.stringify({
        id: 'patient-synthetique',
        civilite: 'M.',
        mesures: {
          _bilanId: 'bilan-synthetique',
          verrou: { photos: [brute, anterieure], frames: [] },
        },
      })
    );
    // Éléments du DOM factices, créés à la demande.
    const cache = {};
    const elements = new Proxy(
      {},
      {
        get: (_o, id) =>
          (cache[id] ||= {
            style: {},
            textContent: '',
            innerHTML: '',
            classList: { add() {}, remove() {} },
          }),
      }
    );
    env.poser({ patient, elements });
    await env.launchTest('verrou');
    const [s0, s1] = env.slots();
    expect(s0.imageBrute, 'capture sans points relue').toBe(true);
    expect(s0.dessin).toEqual(DESSIN('verrou'));
    expect('imageBrute' in s1, 'capture antérieure').toBe(false);
    expect('dessin' in s1).toBe(false);
    // Témoin : la réouverture a bien relu ces créneaux (et pas des vierges).
    expect(s0.angle).toBe(-4.5);
    expect(s1.dataUrl).toBe('data:image/jpeg;base64,AVECPOINTS');
  });
});
