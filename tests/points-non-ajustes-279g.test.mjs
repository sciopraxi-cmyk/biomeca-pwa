import { describe, it, expect, afterEach } from 'vitest';
import { charger as chargerBase, envCapture, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';
import { chargerDessin, journalDessin } from './helpers/harnais-dessin.mjs';
import { surveillerNaN } from './helpers/sans-nan.mjs';
import { patientFictif } from './helpers/resultats-279-donnees.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 1c (3g) — provenance des points, « points non ajustés »
// ═══════════════════════════════════════════════════════════════════
//
// Règle validée par le praticien :
//   - chaque marqueur porte son ORIGINE, posée à la source et jamais devinée :
//     'defaut' (placement par défaut de detectMarkersAuto), 'main' (posé ou
//     glissé à la souris / au doigt), 'pastille' (réellement calé sur une
//     pastille) ; elle part avec la capture, est enregistrée et relue ;
//   - UN SEUL point 'defaut' parmi ceux d'un côté mesuré écarte ce côté :
//     valeur affichée, mention « points non ajustés », AUCUN calcul dérivé —
//     même mécanisme que la photo non envoyée (3f, 1b), sur les 9 tests ;
//   - dans l'image en direct, un point 'defaut' est dessiné CREUX et en
//     POINTILLÉ, pour voir avant de capturer ce qui n'a pas été placé ;
//   - mention « ⚠️ points non ajustés » sur la vignette dès la capture, en
//     mode photo et au rapport ;
//   - un ancien bilan (marqueurs SANS origine) est neutre : calculé comme
//     avant, sans comparaison aux positions par défaut, sans purge.
// Données synthétiques : marqueurs de démonstration, coordonnées inventées.

const { charger, noter, verifier, vus } = surveillerNaN(chargerBase);
afterEach(() => {
  expect(verifier(), 'rendu contenant « NaN »').toEqual([]);
});

const R_E = (t) =>
  `<span class="kfppa-exclu" style="color:var(--red);font-weight:700;">${t}</span>`;
const NA = (l) => `points non ajustés sur la photo « ${l} » — à recapturer`;
const NA_BIP = 'points non ajustés sur la photo bipodale — à recapturer';
const MENTION = '⚠️ points non ajustés';
const IMG = 'data:image/jpeg;base64,QQ==';
const avec = (marqueurs, origine) => marqueurs.map((m) => ({ ...m, origine }));
const panneau = (env, id, ph) => {
  const res = envCapture(env, id, ph);
  env.updateResults();
  return noter(res.innerHTML);
};
const CANEVAS = (w = 1920, h = 1080) => ({
  width: w,
  height: h,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
});

describe('#279 1c — provenance posée à la source', () => {
  it('S1. Placement par défaut (genou-bi, ap-bi, mla) : chaque point posé porte origine « defaut »', () => {
    for (const id of ['kfppa-marche', 'verrou', 'mla-marche']) {
      const env = charger();
      const t = env.TESTS[id];
      env.poser({ test: id });
      const m = env.cloneMarkers(t.markers);
      expect(
        m.every((x) => !('origine' in x)),
        `${id} : clone sans origine`
      ).toBe(true);
      env.detectMarkersAuto(CANEVAS().getContext(), CANEVAS(), m, t.view, null);
      expect(m.length, id).toBeGreaterThan(0);
      expect(
        m.map((x) => [x.x != null, x.origine]),
        id
      ).toEqual(m.map(() => [true, 'defaut']));
    }
  });

  it('S1b. Calage sur pastilles : point RÉELLEMENT calé → « pastille » ; côté sans compte exact → refusé, « defaut » (U0)', () => {
    // Intention d'origine (1c) : un point réellement calé devient « pastille »,
    // un point sans pastille trouvée reste « defaut ». La version d'avant U0
    // exigeait aussi que la SEULE pastille du côté G cale la rotule G par
    // proximité : c'est exactement le repli refusé par U0 (substitution
    // d'identité possible, cas C). Côté G désormais refusé, positions
    // inchangées ; la proximité « pastille » est vérifiée sur le MLA, qui la
    // garde.
    // Image synthétique 640×360 : trois pastilles blanches côté D (calage
    // direct), une seule côté G près de la rotule (refus du côté G).
    const W = 640,
      H = 360;
    const data = new Uint8ClampedArray(W * H * 4);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const disque = (cx, cy) => {
      for (let y = cy - 5; y <= cy + 5; y++)
        for (let x = cx - 5; x <= cx + 5; x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= 25)
            data.fill(255, (y * W + x) * 4, (y * W + x) * 4 + 3);
    };
    for (const [x, y] of [
      [165, 80],
      [170, 185],
      [168, 290],
      [482, 182],
    ])
      disque(x, y);
    const env = charger({ persistance: true }); // l'alerte de bilan est notée
    env.poser({ test: 'kfppa-marche' });
    const t = env.TESTS['kfppa-marche'];
    const mk = env.cloneMarkers(t.markers);
    env.detectMarkersAuto(null, CANEVAS(W, H), mk, t.view, null);
    env.poser({
      marqueurs: mk,
      image: { data },
      elements: { 'vid-el': { readyState: 4 }, 'vid-canvas': CANEVAS(W, H) },
    });
    env.snapMarkersToReflectiveBlobs();
    const o = (side) =>
      env
        .vid()
        .filter((m) => m.side === side)
        .map((m) => m.origine);
    expect(o('D'), 'calage direct').toEqual(['pastille', 'pastille', 'pastille']);
    expect(o('G'), 'côté G refusé : « defaut »').toEqual(['defaut', 'defaut', 'defaut']);
    const g = env.vid().filter((m) => m.side === 'G');
    expect(
      g.map((m) => [m.x, m.y]),
      'côté G : positions par défaut inchangées'
    ).toEqual([
      [W * 0.75, H * 0.2],
      [W * 0.75, H * 0.5],
      [W * 0.75, H * 0.8],
    ]);
    expect(env.alertes().join('\n'), 'raison au bilan').toContain(
      'Côté G : 1 tache(s) pour 3 point(s) — calage refusé (identité incertaine)'
    );
    // MLA (sans latéralité) : la proximité cale toujours, et pose « pastille ».
    const env2 = charger({ persistance: true });
    env2.poser({ test: 'mla-marche' });
    const t2 = env2.TESTS['mla-marche'];
    const mk2 = env2.cloneMarkers(t2.markers);
    env2.detectMarkersAuto(null, CANEVAS(W, H), mk2, t2.view, null);
    const data2 = new Uint8ClampedArray(W * H * 4);
    for (let i = 3; i < data2.length; i += 4) data2[i] = 255;
    for (const [cx, cy] of [
      [140, 230],
      [322, 110],
      [500, 236],
    ])
      for (let y = cy - 5; y <= cy + 5; y++)
        for (let x = cx - 5; x <= cx + 5; x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= 25)
            data2.fill(255, (y * W + x) * 4, (y * W + x) * 4 + 3);
    env2.poser({
      marqueurs: mk2,
      image: { data: data2 },
      elements: { 'vid-el': { readyState: 4 }, 'vid-canvas': CANEVAS(W, H) },
    });
    env2.snapMarkersToReflectiveBlobs();
    expect(
      env2.vid().map((m) => m.origine),
      'MLA : calé par proximité → « pastille »'
    ).toEqual(['pastille', 'pastille', 'pastille']);
  });

  it('S2. Posé ou glissé à la main (vidéo et photo) : origine « main » ; une sélection seule ne change rien', () => {
    const env = charger();
    env.poser({ test: 'kfppa-marche' });
    const t = env.TESTS['kfppa-marche'];
    // Vidéo : le premier point non posé reçoit le clic.
    const mk = env.cloneMarkers(t.markers);
    mk[1] = { ...mk[1], x: 900, y: 500, origine: 'defaut' };
    env.poser({ marqueurs: mk });
    const vc = CANEVAS();
    env.setupVidCanvas({}, vc);
    vc.onmousedown({ clientX: 100, clientY: 200 });
    expect([env.vid()[0].x, env.vid()[0].origine]).toEqual([100, 'main']);
    // Clic sur un point 'defaut' : sélectionné, PAS déplacé → origine inchangée.
    vc.onmousedown({ clientX: 900, clientY: 500 });
    expect(env.vid()[1].origine, 'sélection seule').toBe('defaut');
    vc.onmousemove({ clientX: 950, clientY: 520 });
    expect([env.vid()[1].x, env.vid()[1].origine], 'glissé').toEqual([950, 'main']);
    vc.onmouseup();
    // Photo : même règle sur les marqueurs en direct.
    const lv = env.cloneMarkers(t.markers);
    env.poser({ live: lv });
    const pc = CANEVAS();
    env.setupPhotoCanvas({}, pc);
    pc.onmousedown({ clientX: 300, clientY: 400 });
    expect([env.live()[0].x, env.live()[0].origine]).toEqual([300, 'main']);
  });

  it('S2c. Point par défaut SÉLECTIONNÉ sans déplacement (vidéo et direct) : garde « defaut »', () => {
    const env = charger();
    env.poser({ test: 'kfppa-marche' });
    const t = env.TESTS['kfppa-marche'];
    const unDefaut = () => {
      const m = env.cloneMarkers(t.markers);
      m[2] = { ...m[2], x: 900, y: 500, origine: 'defaut' };
      return m;
    };
    // Vidéo : clic sur le point, relâché sans mouvement.
    env.poser({ marqueurs: unDefaut() });
    const vc = CANEVAS();
    env.setupVidCanvas({}, vc);
    vc.onmousedown({ clientX: 900, clientY: 500 });
    vc.onmouseup();
    expect([env.vid()[2].x, env.vid()[2].origine], 'vidéo').toEqual([900, 'defaut']);
    // Direct (mode photo) : même règle.
    env.poser({ live: unDefaut() });
    const pc = CANEVAS();
    env.setupPhotoCanvas({}, pc);
    pc.onmousedown({ clientX: 900, clientY: 500 });
    pc.onmouseup();
    expect([env.live()[2].x, env.live()[2].origine], 'direct').toEqual([900, 'defaut']);
  });

  it('S3. Point retiré ou marqueurs réinitialisés : plus aucune origine', () => {
    const env = charger();
    env.poser({ test: 'kfppa-marche' });
    const mk = avec(MARQUEURS_DEMO, 'main');
    env.poser({ marqueurs: mk });
    env.poserMode('video');
    env.clearMkr(0);
    expect([env.vid()[0].x, 'origine' in env.vid()[0]]).toEqual([null, false]);
    env.resetAllMarkers();
    expect(env.vid().some((x) => 'origine' in x)).toBe(false);
  });

  it('S4. L’origine part avec la capture, est enregistrée et relue', async () => {
    const env = charger();
    envCapture(env, 'kfppa-marche', [
      { label: 'Station bipodale', side: '', dataUrl: null, angle: null, path: null },
      { label: 'Valgum dynamique unipodal G', side: 'G', dataUrl: null, angle: null, path: null },
      { label: 'Valgum dynamique unipodal D', side: 'D', dataUrl: null, angle: null, path: null },
    ]);
    const mk = MARQUEURS_DEMO.map((m, i) => ({ ...m, origine: i < 3 ? 'defaut' : 'pastille' }));
    env.poser({ marqueurs: JSON.parse(JSON.stringify(mk)) });
    env.captureVidPhotoSlot(0);
    const s = env.slots()[0];
    expect(s.markers.map((m) => m.origine)).toEqual(mk.map((m) => m.origine));
    const p = JSON.parse(JSON.stringify(env._serialiserPhoto(s)));
    expect(p.markers.map((m) => m.origine)).toEqual(mk.map((m) => m.origine));
  });
});

describe('#279 1c — l’origine survit à l’enregistrement et à la relecture', () => {
  it('S4b. validateAndSave puis launchTest : chaque point retrouve son origine', async () => {
    const env = charger({ persistance: true, envoiReel: true, envois: ['ok', 'ok', 'ok'] });
    const mk = MARQUEURS_DEMO.map((m, i) => ({
      ...m,
      origine: ['defaut', 'main', 'pastille'][i % 3],
    }));
    const cache = {
      'vid-el': { readyState: 4, videoWidth: 1368 },
      'vid-canvas': { width: 1368, height: 770 },
      'cap-results': { innerHTML: '' },
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
    env.poser({ patient: { ...patientFictif('M.'), bilanData: {}, mesures: {} }, elements });
    await env.launchTest('kfppa-marche');
    env.poser({ marqueurs: JSON.parse(JSON.stringify(mk)) });
    for (const i of [0, 1, 2]) await env.captureVidPhotoSlot(i);
    await env.validateAndSave();
    const enr = env.patient().mesures['kfppa-marche'].photos[0];
    expect(
      enr.markers.map((m) => m.origine),
      'enregistré'
    ).toEqual(mk.map((m) => m.origine));
    await env.launchTest('kfppa-marche');
    expect(
      env.slots()[0].markers.map((m) => m.origine),
      'relu'
    ).toEqual(mk.map((m) => m.origine));
    const d = env.slots()[2]; // unipodal D : les points D seulement
    expect(d.markers.map((m) => m.origine)).toEqual(
      mk.filter((m) => m.side === 'D').map((m) => m.origine)
    );
  });
});

describe('#279 1c — genou-bi (KFPPA) : un point « defaut » écarte le côté', () => {
  // Bipodale : points D par défaut, G posés à la main ; unipodales à la main.
  const D = MARQUEURS_DEMO.filter((m) => m.side === 'D');
  const G = MARQUEURS_DEMO.filter((m) => m.side === 'G');
  const photos = (origineBipD) => [
    {
      label: 'Station bipodale',
      side: '',
      dataUrl: IMG,
      path: null,
      angle: null,
      angleD: 14.8,
      angleG: -7.9,
      kfppaSigne: true,
      markers: [...avec(D, origineBipD), ...avec(G, 'main')],
      markersConnus: true,
      dims: { w: 1368, h: 770 },
    },
    {
      label: 'Valgum dynamique unipodal G',
      side: 'G',
      dataUrl: IMG,
      path: null,
      angle: -2.4,
      kfppaSigne: true,
      markers: avec(G, 'main'),
      markersConnus: true,
      dims: { w: 1368, h: 770 },
    },
    {
      label: 'Valgum dynamique unipodal D',
      side: 'D',
      dataUrl: IMG,
      path: null,
      angle: 9.3,
      kfppaSigne: true,
      markers: avec(D, 'main'),
      markersConnus: true,
      dims: { w: 1368, h: 770 },
    },
  ];

  it('S5. Statique D affiché et exclu, Δ D non calculé ; G calculé ; mention sur la vignette', () => {
    const env = charger();
    const h = panneau(env, 'kfppa-marche', photos('defaut'));
    expect(h).toContain(
      `Statique S : <b>+14.8°${R_E(` — valeur exclue des calculs (${NA_BIP})`)}</b>`
    );
    expect(h).toContain(`Δ = U − S : <b>${R_E(`non calculé (${NA_BIP})`)}</b>`);
    expect(h, 'Δ G calculé').toContain('+5.5° (vers le valgus)');
    expect(noter(env.vidPhotoSlotHTML(photos('defaut')[0], 0))).toContain(MENTION);
    const data = {
      kfppaNorme: { min: 5, max: 12, source: 's', sexe: null },
      photos: photos('defaut'),
    };
    const r = noter(env.buildPrintSection(env.TESTS['kfppa-marche'], data, []));
    expect(r).toContain(
      `<strong>Genou droit :</strong> statique +14.8° — valeur exclue des calculs (${NA_BIP}), composante dynamique non calculée (${NA_BIP})`
    );
    expect(r, 'mention au rapport').toContain(MENTION);
    expect(env._collectTestAlerts(env.TESTS['kfppa-marche'], data, { condensed: true })).toContain(
      `Genou droit · KFPPA Marche (valgus dynamique du genou) — ${NA_BIP} : composante dynamique non calculée`
    );
  });

  it('S5b. Règle (a) stricte : UN point « defaut » parmi trois « main » sur l’unipodale D écarte U D', () => {
    const env = charger();
    const ph = photos('main');
    ph[2].markers = D.map((m, i) => ({ ...m, origine: i === 1 ? 'defaut' : 'main' }));
    const NA_UNI = 'points non ajustés sur la photo unipodale — à recapturer';
    const h = panneau(env, 'kfppa-marche', ph);
    expect(h).toContain(
      `Unipodal U : <b>+9.3°${R_E(` — valeur exclue des calculs (${NA_UNI})`)}</b>`
    );
    expect(h).toContain(R_E(`non calculé (${NA_UNI})`) + '</b>');
    expect(h, 'G intact').toContain('+5.5° (vers le valgus)');
  });

  it('S6. Témoin : mêmes photos, points ajustés (main / pastille) ou SANS origine (ancien bilan) : tout calculé', () => {
    for (const o of ['main', 'pastille', undefined]) {
      const env = charger();
      const ph = photos(o);
      if (o === undefined) for (const p of ph) for (const m of p.markers) delete m.origine;
      const h = panneau(env, 'kfppa-marche', ph);
      expect(h, String(o)).not.toContain('non ajustés');
      expect(h, String(o)).toContain('−5.5° (vers le varus)');
    }
  });
});

describe('#279 1c — ap-bi : verrouillage et mobilité', () => {
  it('S7. Verrou : un point « defaut » sur « Statique bipodal D » → mollet D exclu, RF D conservé', () => {
    const env = charger();
    const t = env.TESTS.verrou;
    const mk = (o) => [
      { name: 'a', side: 'D', x: 1, y: 2, origine: o },
      { name: 'b', side: 'D', x: 3, y: 4, origine: 'main' },
    ];
    const ph = t.photoLabels.map((label, i) => ({
      label,
      side: t.photoSides[i],
      dataUrl: IMG,
      path: null,
      angle: [2, 1, 8, 9][i],
      markers: mk(i === 0 ? 'defaut' : 'main'),
      markersConnus: true,
    }));
    const M = NA('Statique bipodal D');
    const h = panneau(env, 'verrou', ph);
    expect(h).toContain(
      `Statique: <b>Inv (+) 2.0°${R_E(` — valeur exclue des calculs (${M})`)}</b>`
    );
    expect(h).toContain('Verrouillage RF: <b>8.0°</b>');
    expect(h).toContain(`Force mollet: <b>${R_E(`non calculé (${M})`)}</b>`);
    expect(env._collectTestAlerts(t, { photos: ph }, { condensed: true })).toEqual([
      `Pied droit · Force du mollet — ${M} : non calculé`,
    ]);
  });

  it('S7b. Règle (a) stricte : UN point « defaut » sur quatre de « Pointe pieds D » → RF D, badge et mollet D exclus', () => {
    const env = charger();
    const t = env.TESTS.verrou;
    const quatre = (iDefaut) =>
      [0, 1, 2, 3].map((k) => ({
        name: 'p' + k,
        side: 'D',
        x: 10 + k,
        y: 20 + k,
        origine: k === iDefaut ? 'defaut' : 'main',
      }));
    const ph = t.photoLabels.map((label, i) => ({
      label,
      side: t.photoSides[i],
      dataUrl: IMG,
      path: null,
      angle: [2, 1, 8, 9][i],
      markers: quatre(i === 2 ? 2 : -1),
      markersConnus: true,
    }));
    const M = NA('Pointe pieds D');
    const d = noter(env.buildPrintSide('D', t, { photos: ph }));
    expect(d).toContain(
      `RF: <span class="kfppa-exclu" style="color:#b91c1c;font-weight:700;">non calculé (${M})</span>`
    );
    expect(d).toContain(
      `Mollet: <span class="kfppa-exclu" style="color:#b91c1c;font-weight:700;">non calculé (${M})</span>`
    );
    expect(d, 'badge').not.toMatch(/Normal|Limite|Hors norme/);
    expect(noter(env.buildPrintSide('G', t, { photos: ph }))).toContain('90%');
  });

  it('S8. Mobilité : points D par défaut sur la photo bipodale → D seul exclu, G calculé', () => {
    const env = charger();
    const mk = [
      { name: 'a', side: 'D', x: 1, y: 2, origine: 'defaut' },
      { name: 'b', side: 'G', x: 3, y: 4, origine: 'main' },
    ];
    const ph = [
      {
        label: 'Inversion forcée bipodal',
        side: '',
        dataUrl: IMG,
        path: null,
        angle: null,
        angleD: 18,
        angleG: 15,
        markers: mk,
        markersConnus: true,
      },
      {
        label: 'Éversion forcée bipodal',
        side: '',
        dataUrl: IMG,
        path: null,
        angle: null,
        angleD: -9,
        angleG: -12,
        markers: avec(mk, 'main'),
        markersConnus: true,
      },
    ];
    const M = NA('Inversion forcée bipodal');
    expect(env._collectTestAlerts(env.TESTS.mobilite, { photos: ph }, { condensed: true })).toEqual(
      [`Pied droit · Mobilité AP (mobilité arrière-pied) — ${M} : non calculé`]
    );
    const g = noter(env.buildPrintSide('G', env.TESTS.mobilite, { photos: ph }));
    expect(g).toContain('90%');
  });
});

describe('#279 1c — amorti (marche et course)', () => {
  for (const id of ['amorti-marche', 'amorti-course']) {
    it(`S11. ${id} : un point « defaut » sur « Attaque taligrade D » → amorti D exclu et retiré de l’enregistrement`, async () => {
      const env0 = charger();
      const t = env0.TESTS[id];
      const ph = () =>
        t.photoLabels.map((label, i) => ({
          label,
          side: t.photoSides[i],
          dataUrl: IMG,
          path: null,
          angle: [2, 3, -6, -5, 2, 4][i],
          markers: [0, 1, 2, 3].map((k) => ({
            name: 'p' + k,
            side: t.photoSides[i],
            x: k,
            y: k,
            origine: i === 1 && k === 0 ? 'defaut' : 'main',
          })),
          markersConnus: true,
          dims: { w: 1920, h: 1080 },
        }));
      const M = NA('Attaque taligrade D');
      const h = panneau(env0, id, ph());
      expect(h).toContain(`Amorti: <b>${R_E(`non calculé (${M})`)}</b>`);
      const prD = Math.round((9 / t.normAm) * 100) + '%'; // |4 − (−5)| / norme
      expect(h, 'propulsion D').toContain(`>${prD}</div>`);
      expect(env0._collectTestAlerts(t, { photos: ph() }, { condensed: true })).toContain(
        `Pied droit · ${t.measures[0].label} — ${M} : non calculé`
      );
      // Enregistrement : amorti D et phases D retirés, propulsion D et pied G gardés.
      const env = charger({ persistance: true, envoiReel: true, envois: Array(6).fill('ok') });
      env.poser({
        test: id,
        slots: ph(),
        frames: [],
        patient: { ...patientFictif('M.'), bilanData: {} },
      });
      await env.validateAndSave();
      const r = env.patient().mesures[id];
      expect('amD' in r, 'amD retiré').toBe(false);
      expect(r.phases && 'D' in r.phases, 'phases D retirées').toBe(false);
      expect(r.prD).toBeCloseTo(9 / t.normAm, 9);
      expect([r.amG, r.prG]).toEqual([8 / t.normAm, 8 / t.normAm]);
    });
  }
});

describe('#279 1c — mla : positions par défaut, faux angle vraisemblable', () => {
  it('S9. Capture aux positions par défaut du MLA (~113°) : valeur affichée, exclue, motif dit', () => {
    const env = charger();
    const t = env.TESTS['mla-marche'];
    envCapture(
      env,
      'mla-marche',
      t.photoLabels.map((l, i) => ({
        label: l,
        side: t.photoSides[i],
        dataUrl: null,
        angle: null,
        path: null,
      }))
    );
    const mk = env.cloneMarkers(t.markers);
    env.poser({
      elements: {
        'vid-el': { readyState: 4, videoWidth: 1920 },
        'vid-canvas': CANEVAS(),
        'cap-results': { innerHTML: '' },
      },
    });
    env.detectMarkersAuto(null, CANEVAS(), mk, t.view, null);
    env.poser({ marqueurs: mk });
    env.captureVidPhotoSlot(0);
    const s = env.slots()[0];
    expect(s.angle, 'faux angle vraisemblable').toBeGreaterThan(110);
    expect(s.angle).toBeLessThan(117);
    const M = NA('Attaque/Propulsion pied D');
    const h = panneau(env, 'mla-marche', env.slots());
    expect(h).toContain(
      `Att/Prop: <b>${s.angle.toFixed(1)}°${R_E(` — valeur exclue des calculs (${M})`)}</b>`
    );
    expect(noter(env.vidPhotoSlotHTML(s, 0))).toContain(MENTION);
  });
});

describe('#279 1c — image en direct : un point « defaut » se voit avant la capture', () => {
  it('S10. Point par défaut dessiné creux et en pointillé ; point ajusté : plein, trait continu', () => {
    const env = chargerDessin();
    env.reglages({ taille: 0.55, opacite: 0.5, test: 'kfppa-marche' });
    const j = (o) =>
      journalDessin(
        env,
        [{ name: 'p', color: '#f00', side: '', x: 100, y: 100, origine: o }],
        'face'
      );
    const ops = (jr) => jr.map((x) => x[0]);
    const defaut = j('defaut');
    const main = j('main');
    expect(ops(defaut).filter((o) => o === 'setLineDash').length, 'pointillé').toBeGreaterThan(0);
    expect(ops(defaut).filter((o) => o === 'fill').length, 'creux : seul le halo est rempli').toBe(
      1
    );
    expect(ops(main).filter((o) => o === 'fill').length, 'plein : halo et point').toBe(2);
    expect(ops(main), 'trait continu').not.toContain('setLineDash');
    expect(j(undefined), 'sans origine : comme ajusté').toEqual(main);
  });
});

describe('#279 1c — surveillance « jamais de NaN »', () => {
  it('ZZ. Les rendus de ce fichier ont été examinés ; la surveillance sait trouver « NaN »', () => {
    expect(vus(), 'rendus examinés (tous les tests précédents du fichier)').toBe(26);
    noter('<div>Amorti NaN%</div>');
    noter('<div>valeur sans défaut</div>');
    expect(verifier()).toEqual(['<div>Amorti NaN%</div>']);
  });
});
