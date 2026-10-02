import { describe, it, expect } from 'vitest';
import { charger, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';
import { patientFictif } from './helpers/resultats-279-donnees.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3f — garde capture
// ═══════════════════════════════════════════════════════════════════
//
// Relevé sur localhost (séquence H1) : après validation « sans la photo » puis
// réouverture du test (caméra « Inactive », marqueurs remis à zéro), un clic
// sur la vignette d'une photo non envoyée CAPTURAIT : image noire, points non
// placés, angles null. La capture écrasait la précédente ; le rapport disait
// alors « non recalculable (bilan antérieur) » et « valeur unipodale — ».
//
// Correctif, limité à :
//   - une garde (_fluxVideoPret) en tête de captureVidPhotoSlot et de
//     captureFrame : sans image vidéo, message, créneau STRICTEMENT inchangé ;
//   - un clic sur la vignette d'une photo non envoyée ou non rechargée ne
//     capture plus ; recapture par le bouton « Recapturer » ;
//   - une capture efface nonEnvoyee et envoiEchoue (H2).
// Données synthétiques : marqueurs de démonstration, patient fictif.

const ID = 'kfppa-marche';
const n1 = (v) => (v == null ? v : Math.round(v * 10) / 10);

// Environnement d'un test vidéo ; `flux` règle l'état de l'élément vidéo.
function ouvrir(opts) {
  const res = { innerHTML: '' };
  const cache = {
    'vid-el': { readyState: 4, videoWidth: 1368 },
    'vid-canvas': { width: 1368, height: 770 },
    'cap-results': res,
  };
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
  const env = charger({ persistance: true, envoiReel: true, ...opts });
  env.poser({ patient: { ...patientFictif('M.'), bilanData: {}, mesures: {} }, elements });
  return {
    env,
    res,
    flux: (o) => Object.assign(cache['vid-el'], o),
    points: () => env.poser({ marqueurs: JSON.parse(JSON.stringify(MARQUEURS_DEMO)) }),
  };
}

// Le clic sur la vignette : exécute le onclick du CONTENEUR, s'il en a un.
async function cliquerVignette(env, idx) {
  const h = env.vidPhotoSlotHTML(env.slots()[idx], idx);
  const m = h.match(/^<div class="vig[^"]*"(?: onclick="([A-Za-z_]+)\((\d+)\)")?>/);
  expect(m, 'vignette reconnue').not.toBeNull();
  if (m[1] === 'captureVidPhotoSlot') await env.captureVidPhotoSlot(Number(m[2]));
  return m[1] || null;
}

// Captures caméra active ; bipodale et unipodale D non envoyées ; validation
// « enregistrer sans la photo ».
async function premiereValidation(o) {
  o.points();
  for (const i of [0, 1, 2]) await o.env.captureVidPhotoSlot(i);
  await o.env.validateAndSave();
}

describe('#279 étape 3f — séquence H1 : la vignette ne peut plus écraser les angles', () => {
  it('N1. Réouverture caméra inactive, clic sur les vignettes non envoyées : angles conservés', async () => {
    const o = ouvrir({
      envois: Array(12)
        .fill('echec')
        .map((e, i) => (i === 1 ? 'ok' : e)),
      reponses: [false, true, false, true],
    });
    await o.env.launchTest(ID);
    await premiereValidation(o);
    const avant = o.env.patient().mesures[ID].photos;
    expect(avant[0].nonEnvoyee && avant[2].nonEnvoyee, 'non envoyées').toBe(true);
    // Réouverture : marqueurs remis à zéro, caméra « Inactive ».
    await o.env.launchTest(ID);
    o.flux({ readyState: 0, videoWidth: 0 });
    const notes = o.env.enregistrements().length;
    for (const i of [0, 2]) await cliquerVignette(o.env, i);
    // Le clic ne fait RIEN : pas même le message de la garde (protection
    // indépendante, qui refuserait aussi la capture caméra inactive).
    expect(o.env.enregistrements().length, 'aucun effet du clic').toBe(notes);
    const s = o.env.slots();
    expect([n1(s[0].angleD), n1(s[0].angleG), n1(s[2].angle)], 'créneaux après le clic').toEqual([
      14.8, -7.9, 14.8,
    ]);
    await o.env.validateAndSave();
    const r = o.env.patient().mesures[ID];
    expect([n1(r.photos[0].angleD), n1(r.photos[0].angleG), n1(r.photos[2].angle)]).toEqual([
      14.8, -7.9, 14.8,
    ]);
    // Une seule série de questions : la première validation.
    expect(o.env.questions()).toHaveLength(2);
    const h = o.env.buildPrintSection(o.env.TESTS[ID], JSON.parse(JSON.stringify(r)), []);
    expect(h).not.toContain('bilan antérieur');
    expect(h).toContain(
      '<strong>Genou droit :</strong> statique +14.8° — valeur exclue des calculs'
    );
    expect(h).toContain('valeur unipodale +14.8° — valeur exclue des calculs');
    // Panneau du test rouvert.
    await o.env.launchTest(ID);
    o.env.updateResults();
    expect(o.res.innerHTML).not.toContain('bilan antérieur');
    expect(o.res.innerHTML).toContain('+14.8°');
  });

  it('N1b. Témoin « suppression en ligne » : ✕ ×3, recaptures, validation sans photo → angles conservés', async () => {
    const o = ouvrir({
      envois: ['echec', 'ok', 'echec', 'echec', 'echec'],
      reponses: [false, true],
    });
    o.env.patient().mesures = {
      _bilanId: 'bilan-synthetique',
      [ID]: {
        date: 'x',
        photos: [
          {
            label: 'Station bipodale',
            side: '',
            path: 'u/b.jpg',
            angle: null,
            angleD: 3.1,
            angleG: 4.2,
            kfppaSigne: true,
          },
          {
            label: 'Valgum dynamique unipodal G',
            side: 'G',
            path: 'u/g.jpg',
            angle: 5.5,
            kfppaSigne: true,
          },
          {
            label: 'Valgum dynamique unipodal D',
            side: 'D',
            path: 'u/d.jpg',
            angle: 6.6,
            kfppaSigne: true,
          },
        ],
        frames: [],
      },
    };
    await o.env.launchTest(ID);
    o.env.slots().forEach((sl, i) => (sl.dataUrl = 'data:image/jpeg;base64,ANCIEN' + i)); // rechargées
    for (const i of [0, 1, 2]) o.env.deletePhotoSlot(i);
    await premiereValidation(o);
    const r = o.env.patient().mesures[ID];
    expect([n1(r.photos[0].angleD), n1(r.photos[0].angleG), n1(r.photos[2].angle)]).toEqual([
      14.8, -7.9, 14.8,
    ]);
    const h = o.env.buildPrintSection(o.env.TESTS[ID], JSON.parse(JSON.stringify(r)), []);
    expect(h).not.toContain('bilan antérieur');
  });
});

describe('#279 étape 3f — vignettes : le clic ne capture plus', () => {
  it('N2. Non envoyée ou non rechargée : aucun onclick de capture, mention, bouton « Recapturer »', () => {
    const { env } = ouvrir({});
    env.poser({ test: ID });
    const base = { label: 'Valgum dynamique unipodal D', side: 'D', dataUrl: null, angle: 7 };
    for (const [cas, slot, mention] of [
      [
        'non envoyée',
        { ...base, path: null, nonEnvoyee: true },
        '⚠️ photo non envoyée — à recapturer',
      ],
      ['non rechargée', { ...base, path: 'u/d.jpg' }, '⚠️ photo non rechargée — connexion requise'],
    ]) {
      const h = env.vidPhotoSlotHTML(slot, 2);
      expect(h, cas).toMatch(/^<div class="vig">/);
      expect(h, `${cas} : mention`).toContain(mention);
      expect(h, `${cas} : angle`).toContain('7.0°');
      expect(h, `${cas} : bouton`).toContain(
        '<button class="vig-recap" onclick="event.stopPropagation();captureVidPhotoSlot(2);">Recapturer</button>'
      );
    }
    // Avec image : agrandissement ; jamais prise : capture.
    const img = env.vidPhotoSlotHTML(
      { ...base, dataUrl: 'data:image/jpeg;base64,QQ==', path: 'u/d.jpg' },
      2
    );
    expect(img).toMatch(/^<div class="vig" onclick="ouvrirVignette\(2\)">/);
    const vide = env.vidPhotoSlotHTML({ ...base, angle: null, path: null }, 2);
    expect(vide).toMatch(/^<div class="vig-vide" onclick="captureVidPhotoSlot\(2\)">/);
  });
});

describe('#279 étape 3f — capture refusée sans flux vidéo', () => {
  const ETATS = {
    'caméra inactive': (c) => Object.assign(c['vid-el'], { readyState: 0, videoWidth: 0 }),
    'image pas encore disponible': (c) => Object.assign(c['vid-el'], { readyState: 1 }),
    'largeur vidéo nulle': (c) => Object.assign(c['vid-el'], { videoWidth: 0 }),
    'canevas vide': (c) => Object.assign(c['vid-canvas'], { width: 0 }),
    'élément vidéo absent': (c) => delete c['vid-el'],
  };
  for (const [cas, regler] of Object.entries(ETATS)) {
    it(`N3. ${cas} : message, créneau et images STRICTEMENT inchangés`, () => {
      const env = charger(); // une alerte LÈVE : son texte est vérifié
      const cache = {
        'vid-el': { readyState: 4, videoWidth: 1368 },
        'vid-canvas': { width: 1368, height: 770 },
        'cap-results': { innerHTML: '' },
      };
      regler(cache);
      const slot = {
        label: 'Valgum dynamique unipodal D',
        side: 'D',
        dataUrl: null,
        path: null,
        angle: 14.8,
        nonEnvoyee: true,
        markers: [{ name: 'p', side: 'D', x: 1, y: 2 }],
        dims: { w: 1368, h: 770 },
        markersConnus: true,
      };
      env.poser({
        test: ID,
        slots: [{ label: 'b', side: '' }, { label: 'g', side: 'G' }, slot],
        frames: [],
        marqueurs: JSON.parse(JSON.stringify(MARQUEURS_DEMO)),
        elements: cache,
      });
      const avant = JSON.stringify(env.slots());
      expect(() => env.captureVidPhotoSlot(2)).toThrow(
        'alert inattendue : Activez la caméra ou importez une vidéo.'
      );
      expect(JSON.stringify(env.slots()), 'créneaux').toBe(avant);
      expect(env.envois(), 'aucun envoi').toEqual([]);
      expect(() => env.captureFrame()).toThrow(
        'alert inattendue : Activez la caméra ou importez une vidéo.'
      );
      expect(env.frames(), 'aucune image ajoutée').toEqual([]);
    });
  }
});

describe('#279 étape 3f — H2 : une recapture efface le statut de l’ancienne', () => {
  it('N4. Recapture envoyée d’une photo non envoyée : plus de nonEnvoyee, valeur dans les calculs', async () => {
    const o = ouvrir({
      envois: ['echec', 'ok', 'echec', 'echec', 'echec', 'ok', 'echec'],
      reponses: [false, true, false, true],
    });
    await o.env.launchTest(ID);
    await premiereValidation(o);
    await o.env.launchTest(ID);
    o.points(); // caméra active, points placés
    // Le bouton « Recapturer » de la vignette D appelle captureVidPhotoSlot(2).
    await o.env.captureVidPhotoSlot(2);
    const s = o.env.slots()[2];
    expect('nonEnvoyee' in s, 'nonEnvoyee résiduel').toBe(false);
    expect('envoiEchoue' in s, 'envoiEchoue résiduel').toBe(false);
    expect(s.path).toBeTruthy();
    await o.env.validateAndSave();
    const r = o.env.patient().mesures[ID];
    expect(r.photos[2].path).toBeTruthy();
    expect('nonEnvoyee' in r.photos[2]).toBe(false);
    const h = o.env.buildPrintSection(o.env.TESTS[ID], JSON.parse(JSON.stringify(r)), []);
    expect(h).toContain('valeur unipodale +14.8° : ');
    expect(h).not.toContain('photo unipodale non envoyée');
  });

  it('N4b. Recapture dont l’envoi échoue : envoiEchoue reposé par l’envoi, jamais un nonEnvoyee hérité', async () => {
    const o = ouvrir({ envois: ['echec'] });
    await o.env.launchTest(ID);
    o.points();
    o.env.slots()[2].nonEnvoyee = true;
    o.env.slots()[2].envoiEchoue = true;
    await o.env.captureVidPhotoSlot(2);
    const s = o.env.slots()[2];
    expect('nonEnvoyee' in s).toBe(false);
    expect(s.envoiEchoue).toBe(true);
  });
});
