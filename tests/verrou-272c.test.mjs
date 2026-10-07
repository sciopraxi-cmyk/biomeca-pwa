import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { charger, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';

// ═══════════════════════════════════════════════════════════════════
// #272-C — verrou des points posés à la main
// ═══════════════════════════════════════════════════════════════════
//
// Règle (mémoire du 21/09/2026, décisions du praticien) :
//   - un point d'origine 'main' est VERROUILLÉ : aucune automatisation ne le
//     déplace ni ne le réétiquette — calage par ordre, calage par proximité,
//     detectMarkersAuto ;
//   - le calage ne devine jamais autour d'un point verrouillé : il attribue
//     en respectant l'ordre vertical de part et d'autre, ou il refuse le côté
//     et le dit dans son bilan ; une tache sous un point verrouillé ne sert à
//     aucun autre point ;
//   - « Relâcher » (liste des points, point par point) : position inchangée,
//     origine 'defaut' — la valeur n'est plus une mesure tant qu'une pastille
//     ne l'a pas recalé ou que le praticien ne l'a pas replacé ;
//   - verrouillé = origine 'main' : aucun champ nouveau, anciens points
//     neutres (un ancien 'main' est verrouillé d'office).
// Données synthétiques : image 640×360 à disques blancs, marqueurs inventés.

const W = 640;
const H = 360;
const CANEVAS = (w = W, h = H) => ({
  width: w,
  height: h,
  style: {},
  getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) }),
});
// Image noire avec disques blancs (rayon 5 px).
const image = (disques) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  for (const [cx, cy] of disques) {
    for (let y = cy - 5; y <= cy + 5; y++)
      for (let x = cx - 5; x <= cx + 5; x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= 25)
          data.fill(255, (y * W + x) * 4, (y * W + x) * 4 + 3);
  }
  return { data };
};
// Calage sur une image : marqueurs du test, positions par défaut, puis
// surcharges { index: { x, y, origine } }.
function caler(test, disques, surcharges = {}) {
  const env = charger({ persistance: true });
  env.poser({ test });
  const t = env.TESTS[test];
  const mk = env.cloneMarkers(t.markers);
  env.detectMarkersAuto(null, CANEVAS(), mk, t.view, null);
  for (const [i, o] of Object.entries(surcharges)) Object.assign(mk[i], o);
  const avant = JSON.parse(JSON.stringify(mk));
  env.poser({
    marqueurs: mk,
    image: image(disques),
    elements: { 'vid-el': { readyState: 4 }, 'vid-canvas': CANEVAS() },
  });
  env.snapMarkersToReflectiveBlobs();
  return { env, avant, apres: env.vid(), bilan: env.alertes().join('\n') };
}
const pos = (m) => [Math.round(m.x), Math.round(m.y), m.origine];
// KFPPA, vue de face : D = moitié gauche (indices 0-2), G = moitié droite (3-5).
const D3 = [
  [165, 80],
  [170, 185],
  [168, 290],
];

describe('#272-C — calage par ordre (compte exact) avec un point verrouillé', () => {
  it('V1. Rotule D verrouillée SUR sa pastille : inchangée ; EIAS et tarse D calés dessus et dessous', () => {
    const { apres } = caler('kfppa-marche', D3, { 1: { x: 172, y: 187, origine: 'main' } });
    expect(pos(apres[1]), 'rotule verrouillée intacte').toEqual([172, 187, 'main']);
    expect(pos(apres[0])).toEqual([165, 80, 'pastille']);
    expect(pos(apres[2])).toEqual([168, 290, 'pastille']);
  });

  it('V1b. Rotule D verrouillée HORS tache, deux taches au-dessus d’elle : ambigu → refus du côté D, raison au bilan', () => {
    const { apres, avant, bilan } = caler('kfppa-marche', D3, {
      1: { x: 230, y: 200, origine: 'main' },
    });
    expect(pos(apres[1]), 'rotule verrouillée intacte').toEqual([230, 200, 'main']);
    expect(JSON.stringify([apres[0], apres[2]]), 'EIAS et tarse D inchangés').toBe(
      JSON.stringify([avant[0], avant[2]])
    );
    expect(bilan).toMatch(/Côté D[^\n]*refus/);
    expect(bilan, 'raison : plusieurs taches possibles autour du point verrouillé').toMatch(
      /Côté D[^\n]*plusieurs taches[^\n]*Rotule D/
    );
  });

  it('V1d. Rotule D verrouillée HORS tache, une tache au-dessus et une au-dessous : attribution dans l’ordre, bilan nomme le point verrouillé', () => {
    const { apres, bilan } = caler(
      'kfppa-marche',
      [
        [165, 80],
        [168, 290],
      ],
      { 1: { x: 230, y: 200, origine: 'main' } }
    );
    expect(pos(apres[1]), 'rotule verrouillée intacte').toEqual([230, 200, 'main']);
    expect(pos(apres[0]), 'EIAS au-dessus').toEqual([165, 80, 'pastille']);
    expect(pos(apres[2]), 'tarse au-dessous').toEqual([168, 290, 'pastille']);
    expect(bilan, 'le bilan nomme le point verrouillé laissé tel quel').toMatch(
      /1 point\(s\) verrouillé[^\n]*Rotule D/
    );
  });

  it('V1c. Pastille de l’EIAS absente, tache parasite sous la rotule verrouillée : refus du côté D, points inchangés, raison au bilan', () => {
    const { apres, avant, bilan } = caler(
      'kfppa-marche',
      [
        [170, 185],
        [168, 240],
        [168, 290],
      ],
      { 1: { x: 170, y: 185, origine: 'main' } }
    );
    expect(JSON.stringify([0, 1, 2].map((i) => apres[i])), 'côté D inchangé').toBe(
      JSON.stringify([0, 1, 2].map((i) => avant[i]))
    );
    expect(bilan).toMatch(/Côté D[^\n]*refus/);
    expect(bilan, 'la raison nomme le point verrouillé').toContain('Rotule D');
  });
});

describe('#272-C — calage partiel et refus du côté entier', () => {
  it('V1e. Pastille de l’EIAS absente, rotule D verrouillée sur la sienne : tarse D calé, EIAS D inchangé, mention au bilan', () => {
    const { apres, avant, bilan } = caler(
      'kfppa-marche',
      [
        [170, 185],
        [168, 290],
      ],
      { 1: { x: 170, y: 185, origine: 'main' } }
    );
    expect(pos(apres[1]), 'rotule verrouillée intacte').toEqual([170, 185, 'main']);
    expect(JSON.stringify(apres[0]), 'EIAS D inchangé').toBe(JSON.stringify(avant[0]));
    expect(pos(apres[2]), 'tarse D calé').toEqual([168, 290, 'pastille']);
    expect(bilan).toContain(
      'Côté D : EIAS D non calé — 0 tache(s) pour 1 point(s) au-dessus de Rotule D (verrouillé)'
    );
  });

  it('V1f. Un groupe exact (au-dessus) et un groupe ambigu (au-dessous) : refus du côté ENTIER, aucun point déplacé', () => {
    const { apres, avant, bilan } = caler(
      'kfppa-marche',
      [
        [165, 80],
        [170, 185],
        [168, 240],
        [168, 290],
      ],
      { 1: { x: 170, y: 185, origine: 'main' } }
    );
    expect(JSON.stringify([0, 1, 2].map((i) => apres[i])), 'côté D inchangé, EIAS compris').toBe(
      JSON.stringify([0, 1, 2].map((i) => avant[i]))
    );
    expect(bilan).toMatch(
      /Côté D : calage refusé — plusieurs taches possibles au-dessous de Rotule D/
    );
  });
});

describe('#272-C — calage par proximité (MLA, sans côté) avec un point verrouillé', () => {
  const MLA3 = [
    [140, 230],
    [322, 110],
    [500, 236],
  ];
  it('V2. TN verrouillé sur sa pastille : ni déplacé ni réétiqueté ; FMHp et CAp calés', () => {
    const { env, apres } = caler('mla-marche', MLA3);
    void env;
    const iTN = apres.findIndex((m) => m.name === 'TN');
    const r = caler('mla-marche', MLA3, { [iTN]: { x: 320, y: 108, origine: 'main' } });
    const n = (nom) => r.apres.find((m) => m.name === nom);
    expect(pos(n('TN')), 'TN verrouillé intact').toEqual([320, 108, 'main']);
    expect(pos(n('FMHp'))).toEqual([140, 230, 'pastille']);
    expect(pos(n('CAp'))).toEqual([500, 236, 'pastille']);
  });

  it('V2b. TN verrouillé PRÈS d’une tache mais hors de son rayon : la tache reste candidate, le TN n’y est jamais calé', () => {
    const base = caler('mla-marche', []).apres;
    const iTN = base.findIndex((m) => m.name === 'TN');
    const r = caler('mla-marche', MLA3, { [iTN]: { x: 340, y: 125, origine: 'main' } });
    expect(pos(r.apres[iTN]), 'TN verrouillé intact').toEqual([340, 125, 'main']);
  });

  it('V3. Un point non verrouillé ne se cale jamais sur la pastille d’un point verrouillé', () => {
    const base = caler('mla-marche', []).apres;
    const iTN = base.findIndex((m) => m.name === 'TN');
    const iF = base.findIndex((m) => m.name === 'FMHp');
    // FMHp placé près de la pastille du TN ; sa propre pastille est absente.
    const r = caler(
      'mla-marche',
      [
        [322, 110],
        [500, 236],
      ],
      { [iTN]: { x: 324, y: 112, origine: 'main' }, [iF]: { x: 300, y: 105, origine: 'defaut' } }
    );
    expect(pos(r.apres[iTN]), 'TN intact').toEqual([324, 112, 'main']);
    expect(pos(r.apres[iF]), 'FMHp jamais sur la pastille du TN').toEqual([300, 105, 'defaut']);
  });
});

describe('#272-C — bilan', () => {
  it('V4. Tous les points verrouillés : rien ne bouge, le bilan dit « verrouillé » et le nombre', () => {
    const tous = Object.fromEntries(
      [0, 1, 2, 3, 4, 5].map((i) => [
        i,
        { x: 100 + i * 60, y: 60 + (i % 3) * 110, origine: 'main' },
      ])
    );
    const { apres, avant, bilan } = caler('kfppa-marche', D3, tous);
    expect(JSON.stringify(apres), 'aucun point déplacé').toBe(JSON.stringify(avant));
    expect(bilan).toContain('verrouillé');
    expect(bilan).toMatch(/\b6 point\(s\) verrouillé/);
  });

  it('V5. Calage partiel : le bilan nomme les points verrouillés laissés tels quels', () => {
    const { bilan } = caler('kfppa-marche', D3, { 1: { x: 172, y: 187, origine: 'main' } });
    expect(bilan).toMatch(/1 point\(s\) verrouillé/);
    expect(bilan).toContain('Rotule D');
  });
});

describe('#272-C — témoins (verts sur main)', () => {
  it('V6. detectMarkersAuto (positions types ET ancienne branche par taches) ne déplace jamais un point « main »', () => {
    for (const test of ['kfppa-marche', 'test-inconnu']) {
      const env = charger();
      env.poser({ test });
      const mk = env
        .cloneMarkers('genou-bi')
        .map((m, i) => ({ ...m, x: 50 + i * 40, y: 70 + i * 30, origine: 'main' }));
      const avant = JSON.stringify(mk);
      env.detectMarkersAuto(CANEVAS().getContext(), CANEVAS(), mk, 'face', null);
      expect(JSON.stringify(mk), test).toBe(avant);
    }
  });

  it('V7. Sans point verrouillé : calage identique à 1c S1b (non-régression)', () => {
    const { apres } = caler('kfppa-marche', [...D3, [482, 182]]);
    const o = (s) => apres.filter((m) => m.side === s).map((m) => m.origine);
    expect(o('D')).toEqual(['pastille', 'pastille', 'pastille']);
    expect(o('G')).toEqual(['defaut', 'pastille', 'defaut']);
    const g = apres.filter((m) => m.side === 'G');
    expect([Math.round(g[1].x), Math.round(g[1].y)]).toEqual([482, 182]);
  });

  it('V13. Glissé en direct et « Confirmer ce point » (#280) : les deux aboutissent à origine « main », donc verrouillé', async () => {
    vi.useFakeTimers();
    try {
      const o = await session();
      // En direct : glisser un point.
      const vc = o.cache['vid-canvas'];
      o.env.setupVidCanvas({}, vc);
      const [x, y] = [MARQUEURS_DEMO[1].x, MARQUEURS_DEMO[1].y];
      vc.onmousedown({ clientX: x, clientY: y });
      vc.onmousemove({ clientX: x + 7, clientY: y });
      vc.onmouseup();
      expect(o.env.vid()[1].origine, 'glissé en direct').toBe('main');
      // Éditeur #280 : confirmer un point par défaut d'une capture.
      o.env.poser({ marqueurs: MARQUEURS_DEMO.map((m) => ({ ...m, origine: 'defaut' })) });
      await o.env.captureVidPhotoSlot(0);
      expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
      o.cache['pe-canvas'].onmousedown({ clientX: x, clientY: y });
      o.cache['pe-canvas'].onmouseup();
      o.env.confirmerPointEdition();
      o.env.validerEditionPoints();
      expect(o.env.slots()[0].markers[1].origine, 'confirmé dans l’éditeur').toBe('main');
    } finally {
      vi.useRealTimers();
    }
  });
});

// Session de capture (patient, test ouvert, brouillon possible).
async function session(o = {}) {
  const env = charger({
    persistance: true,
    envoiReel: true,
    envois: ['ok', 'ok', 'ok'],
    listeReelle: !!o.listeReelle,
  });
  const defaut = () => ({
    style: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    classList: { add() {}, remove() {} },
    addEventListener() {},
    removeAttribute() {},
    getContext: () => ({ drawImage() {}, clearRect() {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1368, height: 770 }),
  });
  const cache = {
    'vid-el': { style: {}, readyState: 4, videoWidth: 1368 },
    'vid-canvas': {
      ...defaut(),
      width: 1368,
      height: 770,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1368, height: 770 }),
    },
    'pe-canvas': {
      ...defaut(),
      width: 0,
      height: 0,
      getBoundingClientRect() {
        return { left: 0, top: 0, width: this.width, height: this.height };
      },
    },
  };
  const elements = new Proxy({}, { get: (_o, id) => (cache[id] ||= defaut()) });
  const A = {
    id: 'A',
    prenom: 'Prénom',
    nom: 'Fictif',
    civilite: 'M.',
    mesures: { _bilanId: 'bilan-A' },
    bilanData: {},
  };
  env.poser({
    patients: [A],
    patient: A,
    elements,
    pageActive: 'pg-capture',
    tailleImage: { w: 1368, h: 770 },
  });
  await env.launchTest('kfppa-marche');
  env.poser({ marqueurs: MARQUEURS_DEMO.map((m) => ({ ...m, origine: 'main' })) });
  env.poserMode('video');
  return { env, cache, A };
}

describe('#272-C — liste des points et « Relâcher »', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('V8. Liste : « 🔒 » et « Relâcher » sur les points « main » seulement', async () => {
    const o = await session({ listeReelle: true });
    o.env.poser({
      marqueurs: [
        { ...MARQUEURS_DEMO[0], origine: 'main' },
        { ...MARQUEURS_DEMO[1], origine: 'defaut' },
        { ...MARQUEURS_DEMO[2], origine: 'pastille' },
      ],
    });
    o.env.renderMkrList();
    const h = o.cache['cap-mkr-list'].innerHTML;
    expect((h.match(/🔒/g) || []).length, 'un seul cadenas').toBe(1);
    expect(h, 'Relâcher sur le point main').toContain('relacherPoint(0)');
    expect(h).not.toContain('relacherPoint(1)');
    expect(h).not.toContain('relacherPoint(2)');
  });

  it('V9. « Relâcher » : position inchangée, origine « defaut » ; un calage peut ensuite le passer à « pastille »', async () => {
    const o = await session();
    expect(typeof o.env.relacherPoint, 'relacherPoint existe').toBe('function');
    const [x, y] = [o.env.vid()[1].x, o.env.vid()[1].y];
    o.env.relacherPoint(1);
    expect(pos(o.env.vid()[1])).toEqual([x, y, 'defaut']);
    // Puis calage : le point relâché redevient calable.
    const env = charger({ persistance: true });
    expect(typeof env.relacherPoint, 'relacherPoint existe').toBe('function');
    env.poser({ test: 'kfppa-marche' });
    const mk = env.cloneMarkers('genou-bi');
    env.detectMarkersAuto(null, CANEVAS(), mk, 'face', null);
    Object.assign(mk[1], { x: 172, y: 187, origine: 'main' });
    env.poser({
      marqueurs: mk,
      image: image(D3),
      elements: { 'vid-el': { readyState: 4 }, 'vid-canvas': CANEVAS() },
    });
    env.poserMode('video');
    env.relacherPoint(1);
    env.snapMarkersToReflectiveBlobs();
    expect(pos(env.vid()[1]), 'recalé sur sa pastille').toEqual([170, 185, 'pastille']);
  });

  it('V10. « Relâcher » sur un point non « main » : sans effet', async () => {
    const o = await session();
    expect(typeof o.env.relacherPoint, 'relacherPoint existe').toBe('function');
    o.env.poser({
      marqueurs: [
        { ...MARQUEURS_DEMO[0], origine: 'defaut' },
        { ...MARQUEURS_DEMO[1], origine: 'pastille' },
      ],
    });
    const avant = JSON.stringify(o.env.vid());
    o.env.relacherPoint(0);
    o.env.relacherPoint(1);
    o.env.relacherPoint(7);
    expect(JSON.stringify(o.env.vid())).toBe(avant);
  });

  it('V11. « Relâcher » planifie le brouillon (étape 4) : aucune écriture immédiate, points en direct écrits à 2 s', async () => {
    const o = await session();
    expect(typeof o.env.relacherPoint, 'relacherPoint existe').toBe('function');
    const n = o.env.enregistrements().filter((e) => e === 'savePatients').length;
    o.env.relacherPoint(1);
    expect(
      o.env.enregistrements().filter((e) => e === 'savePatients').length,
      'rien d’immédiat'
    ).toBe(n);
    vi.advanceTimersByTime(2000);
    expect(
      o.A.brouillonsTests?.['kfppa-marche']?.marqueursEnCours?.[1]?.origine,
      'brouillon à 2 s'
    ).toBe('defaut');
  });

  it('V12. Capture après « Relâcher » : le point est « defaut », la valeur de son côté est exclue (règle 1c)', async () => {
    const o = await session();
    expect(typeof o.env.relacherPoint, 'relacherPoint existe').toBe('function');
    o.env.relacherPoint(1); // rotule D
    await o.env.captureVidPhotoSlot(0);
    const s = o.env.slots()[0];
    expect(s.markers[1].origine).toBe('defaut');
    expect(o.env._valeurPhoto(s, 'angleD').calc, 'D exclu').toBeNull();
    expect(o.env._valeurPhoto(s, 'angleG').calc, 'G inclus').toBe(s.angleG);
  });
});
