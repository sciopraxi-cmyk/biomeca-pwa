import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { charger, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';

// Référence des 35 captures (9 tests), produite par le code de main 7a9d1c5
// AVANT l'extraction de _mesurerCapture : toute modification d'un calcul la
// fait échouer. Points synthétiques (COORDS ci-dessous).
const REF_CAPTURES = JSON.parse(
  readFileSync(new URL('./golden/captures-280.json', import.meta.url), 'utf8')
);

// ═══════════════════════════════════════════════════════════════════
// #280 — modifier les points d'une photo DÉJÀ capturée, avec recalcul
// ═══════════════════════════════════════════════════════════════════
//
// Plan validé par le praticien :
//   - « Modifier les points » depuis l'agrandissement : copie des points,
//     déplacement (souris ET doigt), « Confirmer ce point » point par point,
//     « Valider la modification » ou « Annuler » (Échap, fond, fermeture) ;
//   - le recalcul est CELUI DE LA CAPTURE (_mesurerCapture, extrait de
//     captureVidPhotoSlot) : aucun second calcul ;
//   - un point déplacé ou confirmé passe à origine 'main' ; une simple
//     sélection ne change rien (S2c) ; règles 1a, 1b, 1c inchangées ;
//   - jamais à l'aveugle : photo non envoyée, non rechargée, capture
//     antérieure (points dessinés dans l'image), points illisibles, taille
//     d'image différente de dims → refus avec un message ;
//   - test déjà validé : brouillon de l'étape 4, mesures touché seulement à
//     la validation ; le rapport n'écrit jamais ;
//   - zoom de l'éditeur = mécanisme de capture (#236/#237) ; il ne fausse
//     jamais les coordonnées enregistrées (repère dims).
// Données synthétiques : marqueurs de démonstration, patients fictifs.

const T = 'kfppa-marche';
const DELAI = 2000;
const IMG = 'data:image/jpeg;base64,QUJD';
const DIMS = { w: 1368, h: 770 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// Points synthétiques par gabarit, dans l'ordre du gabarit.
const COORDS = {
  'genou-bi': MARQUEURS_DEMO.map((m) => [m.x, m.y]),
  mla: [
    [500, 600],
    [600, 520],
    [700, 610],
  ],
  'ap-bi': [
    // Jonction D à GAUCHE de l'axe : signe négatif côté D, pour que la
    // référence distingue les branches signées de computeCorrectedAngle.
    [700, 200],
    [695, 350],
    [712, 520],
    [700, 600],
    [900, 200],
    [897, 350],
    [890, 520],
    [902, 600],
  ],
};
const patient = (id, o = {}) => ({
  id,
  prenom: 'Prénom',
  nom: 'Fictif',
  date: '01/10/2026',
  civilite: 'M.',
  mesures: { _bilanId: 'bilan-' + id },
  bilanData: {},
  ...o,
});
const copie = (o) => JSON.parse(JSON.stringify(o));
const nbEcritures = (env) => env.enregistrements().filter((x) => x === 'savePatients').length;

// Environnement : patient, test ouvert, caméra active, éditeur à l'échelle s
// (taille affichée = dims × s) décalé de (gauche, haut) — le zoom.
async function ouvrir(o = {}) {
  const env = charger({
    persistance: true,
    envoiReel: true,
    envois: o.envois || [],
    reponses: o.reponses || [],
    zoomReel: !!o.zoomReel,
  });
  const vue = { s: 1, gauche: 0, haut: 0 };
  const defaut = () => ({
    style: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    removeAttribute() {},
    getContext: () => ({ drawImage() {}, clearRect() {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 450 }),
    scrollLeft: 0,
    scrollTop: 0,
  });
  const cache = {
    'vid-el': { style: {}, readyState: 4, videoWidth: DIMS.w },
    'vid-canvas': {
      style: {},
      width: DIMS.w,
      height: DIMS.h,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: DIMS.w, height: DIMS.h }),
      getContext: () => ({ drawImage() {} }),
    },
    'pe-canvas': {
      ...defaut(),
      width: 0,
      height: 0,
      getBoundingClientRect() {
        return {
          left: vue.gauche,
          top: vue.haut,
          width: this.width * vue.s,
          height: this.height * vue.s,
        };
      },
    },
  };
  const elements = new Proxy({}, { get: (_o, id) => (cache[id] ||= defaut()) });
  const ps = o.patients || [patient('A')];
  env.poser({
    patients: ps,
    patient: ps[0],
    elements,
    pageActive: 'pg-capture',
    tailleImage: o.tailleImage === undefined ? DIMS : o.tailleImage,
  });
  await env.launchTest(o.test || T);
  const t = env.TESTS[o.test || T];
  const gabarit = COORDS[t.markers];
  const mk = env
    .cloneMarkers(t.markers)
    .map((m, i) => ({ ...m, x: gabarit[i][0], y: gabarit[i][1], origine: o.origine || 'main' }));
  env.poser({ marqueurs: mk });
  const c = cache['pe-canvas'];
  // Coordonnées ÉCRAN d'un point du repère dims, à l'échelle et au décalage courants.
  const ecran = (x, y) => ({ clientX: vue.gauche + x * vue.s, clientY: vue.haut + y * vue.s });
  const glisser = (de, vers, tactile = false) => {
    if (tactile) {
      const ev = (p) => ({ preventDefault() {}, touches: [ecran(p[0], p[1])] });
      c.ontouchstart(ev(de));
      c.ontouchmove(ev(vers));
      c.ontouchend({ preventDefault() {}, touches: [] });
    } else {
      c.onmousedown(ecran(de[0], de[1]));
      c.onmousemove(ecran(vers[0], vers[1]));
      c.onmouseup({});
    }
  };
  const selectionner = (p, tactile = false) => {
    if (tactile) {
      c.ontouchstart({ preventDefault() {}, touches: [ecran(p[0], p[1])] });
      c.ontouchend({ preventDefault() {}, touches: [] });
    } else {
      c.onmousedown(ecran(p[0], p[1]));
      c.onmouseup({});
    }
  };
  return { env, ps, cache, vue, t, glisser, selectionner };
}
// Capture du créneau idx avec les points synthétiques (photo envoyée).
async function capturer(o, idx = 0) {
  await o.env.captureVidPhotoSlot(idx);
  return o.env.slots()[idx];
}
const valeurs = (s) => ({
  angle: s.angle ?? null,
  angleD: s.angleD ?? null,
  angleG: s.angleG ?? null,
  kfppaSigne: !!s.kfppaSigne,
});
const estFonction = (env, n) => expect(typeof env[n], n + ' existe').toBe('function');

describe('#280 — témoins de mesure (verts sur main)', () => {
  it('T1. Capture de référence : KFPPA bipodal D +14,8°, G −7,9° (la mesure lit bien les valeurs)', async () => {
    const o = await ouvrir({ envois: ['ok'] });
    const s = await capturer(o, 0);
    expect([Math.round(s.angleD * 10) / 10, Math.round(s.angleG * 10) / 10]).toEqual([14.8, -7.9]);
  });
  it('T2. canvasXY : même point du repère quel que soit le zoom ou le défilement', async () => {
    const o = await ouvrir();
    const c = { width: DIMS.w, height: DIMS.h };
    const a = o.env.canvasXY(
      { clientX: 383, clientY: 191 },
      { ...c, getBoundingClientRect: () => ({ left: 0, top: 0, width: 684, height: 385 }) }
    );
    const b = o.env.canvasXY(
      { clientX: 766 - 300, clientY: 382 - 40 },
      { ...c, getBoundingClientRect: () => ({ left: -300, top: -40, width: 1368, height: 770 }) }
    );
    expect(a).toEqual({ x: 766, y: 382 });
    expect(b).toEqual({ x: 766, y: 382 });
  });
  it('T3. Règle 1c : un point « defaut » du côté mesuré écarte la valeur', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    const s = await capturer(o, 0);
    expect(o.env._valeurPhoto(s, 'angleD').calc, 'valeur écartée').toBeNull();
  });
  it('T4. Le tactile simulé atteint bien les gestionnaires (capture en direct, setupVidCanvas)', async () => {
    const o = await ouvrir();
    const vc = o.cache['vid-canvas'];
    o.env.setupVidCanvas({}, vc);
    const [x, y] = COORDS['genou-bi'][1];
    vc.ontouchstart({ preventDefault() {}, touches: [{ clientX: x, clientY: y }] });
    vc.ontouchmove({ preventDefault() {}, touches: [{ clientX: x + 9, clientY: y + 4 }] });
    vc.ontouchend();
    expect([o.env.vid()[1].x, o.env.vid()[1].y]).toEqual([x + 9, y + 4]);
  });
});

describe('#280 — un seul calcul : celui de la capture', () => {
  it('E0. 9 tests, 35 captures : valeurs identiques à la référence produite par main avant l’extraction', async () => {
    let n = 0;
    for (const [test, attendues] of Object.entries(REF_CAPTURES)) {
      const o = await ouvrir({ test });
      for (let i = 0; i < attendues.length; i++) {
        expect(valeurs(await capturer(o, i)), `${test} créneau ${i}`).toEqual(attendues[i]);
        n++;
      }
    }
    expect(n).toBe(35);
  });
  it('E1. 9 tests, tous les créneaux : _mesurerCapture sur les points ENREGISTRÉS rend les valeurs de la capture', async () => {
    const tests = [
      'kfppa-marche',
      'kfppa-course',
      'kfppa-sldj',
      'verrou',
      'mobilite',
      'mla-marche',
      'mla-course',
      'amorti-marche',
      'amorti-course',
    ];
    let n = 0;
    for (const test of tests) {
      const o = await ouvrir({ test });
      estFonction(o.env, '_mesurerCapture');
      for (let i = 0; i < o.t.photoLabels.length; i++) {
        const s = await capturer(o, i);
        // Aller-retour enregistrement → relecture : seuls les points placés restent.
        const relu = {
          ...o.env._serialiserPhoto(s),
          ...o.env._relireMarqueurs(o.env._serialiserPhoto(s)),
        };
        const r = o.env._mesurerCapture(o.t, relu);
        expect(
          {
            angle: r.angle ?? null,
            angleD: r.angleD ?? null,
            angleG: r.angleG ?? null,
            kfppaSigne: !!r.kfppaSigne,
          },
          `${test} créneau ${i}`
        ).toEqual(valeurs(s));
        n++;
      }
    }
    expect(n, 'créneaux vérifiés').toBe(35);
  });
});

describe('#280 — recalcul de l’éditeur = valeurs de la capture', () => {
  it('E1b. 9 tests, 35 créneaux : _mesurerCapture(t, slot, slot.markers), sans rien déplacer, rend les valeurs stockées', async () => {
    const tests = [
      'kfppa-marche',
      'kfppa-course',
      'kfppa-sldj',
      'verrou',
      'mobilite',
      'mla-marche',
      'mla-course',
      'amorti-marche',
      'amorti-course',
    ];
    let n = 0;
    for (const test of tests) {
      const o = await ouvrir({ test });
      estFonction(o.env, '_mesurerCapture');
      for (let i = 0; i < o.t.photoLabels.length; i++) {
        const s = await capturer(o, i);
        const r = o.env._mesurerCapture(o.t, s, s.markers); // l'appel de validerEditionPoints
        expect(
          {
            angle: r.angle ?? null,
            angleD: r.angleD ?? null,
            angleG: r.angleG ?? null,
            kfppaSigne: !!r.kfppaSigne,
          },
          `${test} créneau ${i}`
        ).toEqual(valeurs(s));
        n++;
      }
    }
    expect(n).toBe(35);
  });

  // E1b ne peut rien prouver sur `tous` : à la capture, les 5 créneaux qui le
  // lisent (bipodal KFPPA ×3, mobilité ×2) ont markersForPhoto === vidMarkers.
  // C'est une CONDITION des données (créneaux sans côté), pas du calcul : la
  // branche mobilité ne teste pas le côté. Cette garde la rend explicite.
  it('E1c. Garde : tout créneau dont _mesurerCapture lit `tous` est SANS côté (donc non filtré à la capture)', async () => {
    const o = await ouvrir();
    const lus = [];
    for (const [id, t] of Object.entries(o.env.TESTS)) {
      if (!t.photoLabels) continue;
      t.photoLabels.forEach((_l, i) => {
        const side = t.photoSides?.[i] || '';
        if (t.mobiliteAP || (t.kfppaPhotos && !side)) lus.push([id, i, side]);
      });
    }
    expect(lus.length, 'témoin : des créneaux lisent `tous`').toBe(5);
    expect(
      lus.filter(([, , side]) => side !== ''),
      'aucun n’a de côté'
    ).toEqual([]);
  });
});

describe('#280 — déplacer, confirmer, valider, annuler', () => {
  it('E2. Rotule D déplacée sur le bipodal, validée : point « main », angleD recalculé, angleG inchangé', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    const s = await capturer(o, 0);
    const avant = valeurs(s);
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok, 'éditeur ouvert').toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.glisser([x, y], [x + 20, y]);
    o.env.validerEditionPoints();
    const ap = o.env.slots()[0];
    expect([ap.markers[1].x, ap.markers[1].y, ap.markers[1].origine]).toEqual([x + 20, y, 'main']);
    // Référence : le calcul de l'APPLICATION, appliqué aux nouveaux points D.
    const ptsD = ap.markers.filter((m) => m.side === 'D');
    const attendu = o.env.computeCorrectedAngle(o.env.calcAngle3(ptsD), 'D', 'face', 'kfppa', ptsD);
    expect(ap.angleD).toBe(attendu);
    expect(ap.angleD, 'angleD a changé').not.toBe(avant.angleD);
    expect(ap.angleG, 'angleG inchangé').toBe(avant.angleG);
    expect(ap.path, 'image inchangée, rien à renvoyer').toBe(s.path);
  });

  it('E3. Annuler, Échap, fermeture par le fond : créneau identique au JSON près, rien de planifié', async () => {
    for (const geste of ['annuler', 'echap', 'fond']) {
      const o = await ouvrir({ envois: ['ok'] });
      await capturer(o, 0);
      vi.advanceTimersByTime(10 * DELAI);
      const ecr = nbEcritures(o.env);
      const avant = JSON.stringify(o.env.slots()[0]);
      estFonction(o.env, 'ouvrirEditionPoints');
      o.env.ouvrirVignette(0);
      expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
      const [x, y] = COORDS['genou-bi'][1];
      o.glisser([x, y], [x + 20, y]);
      if (geste === 'annuler') o.env.annulerEditionPoints();
      if (geste === 'echap') o.env.declencher('keydown', { key: 'Escape' });
      if (geste === 'fond') {
        const fond = {};
        o.env._vigFondClic({ target: fond, currentTarget: fond });
      }
      o.env.validerEditionPoints(); // éditeur fermé : sans effet
      expect(JSON.stringify(o.env.slots()[0]), geste).toBe(avant);
      vi.advanceTimersByTime(10 * DELAI);
      expect(nbEcritures(o.env), geste + ' : aucune écriture').toBe(ecr);
    }
  });

  it('E4. Sélection sans déplacement (S2c) : origine inchangée, valeurs inchangées', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    const s = await capturer(o, 0);
    const avant = JSON.stringify(s);
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    o.selectionner(COORDS['genou-bi'][1]);
    o.env.validerEditionPoints();
    expect(JSON.stringify(o.env.slots()[0])).toBe(avant);
  });

  it('E4b. « Confirmer ce point » : le point SÉLECTIONNÉ seul passe à « main », sans bouger', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    await capturer(o, 0);
    estFonction(o.env, 'confirmerPointEdition');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.selectionner([x, y]);
    o.env.confirmerPointEdition();
    o.env.validerEditionPoints();
    const m = o.env.slots()[0].markers;
    expect([m[1].x, m[1].y, m[1].origine]).toEqual([x, y, 'main']);
    expect(
      m.filter((p, i) => i !== 1).map((p) => p.origine),
      'les autres restent « defaut »'
    ).toEqual(Array(5).fill('defaut'));
  });

  it('E4c. « Confirmer ce point » sans point sélectionné : rien ne change', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    const s = await capturer(o, 0);
    const avant = JSON.stringify(s);
    estFonction(o.env, 'confirmerPointEdition');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    o.env.confirmerPointEdition();
    o.env.validerEditionPoints();
    expect(JSON.stringify(o.env.slots()[0])).toBe(avant);
  });

  it('E5. Côté D : ses trois points confirmés ou déplacés → valeur incluse ; côté G resté « defaut » → toujours écarté', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    await capturer(o, 0);
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [p0, p1, p2] = COORDS['genou-bi'];
    o.selectionner(p0);
    o.env.confirmerPointEdition();
    o.glisser(p1, [p1[0] + 10, p1[1]]);
    o.selectionner(p2);
    o.env.confirmerPointEdition();
    o.env.validerEditionPoints();
    const s = o.env.slots()[0];
    expect(o.env._valeurPhoto(s, 'angleD').calc, 'D inclus').toBe(s.angleD);
    expect(o.env._valeurPhoto(s, 'angleG').calc, 'G toujours écarté').toBeNull();
  });
});

describe('#280 — jamais à l’aveugle', () => {
  const cas = [
    [
      'photo non envoyée',
      (s) => {
        delete s.dataUrl;
        s.path = null;
        s.nonEnvoyee = true;
      },
      'non envoyée',
    ],
    [
      'photo non rechargée',
      (s) => {
        delete s.dataUrl;
      },
      'non rechargée',
    ],
    [
      'capture antérieure (points dessinés dans l’image)',
      (s) => {
        delete s.imageBrute;
        delete s.dessin;
      },
      'capture antérieure',
    ],
    [
      'points illisibles',
      (s) => {
        s.dims = null;
      },
      'points non disponibles',
    ],
  ];
  for (const [nom, alterer, mot] of cas) {
    it(`E6. ${nom} : refus, message « ${mot} », créneau inchangé`, async () => {
      const o = await ouvrir({ envois: ['ok'] });
      const s = await capturer(o, 0);
      alterer(s);
      const avant = JSON.stringify(s);
      estFonction(o.env, 'ouvrirEditionPoints');
      const r = await o.env.ouvrirEditionPoints(0);
      expect(r.ok, 'refusé').toBe(false);
      expect(r.motif || '').toContain(mot);
      expect(o.cache['pe-message'].textContent, 'message affiché').toContain(mot);
      o.env.validerEditionPoints();
      expect(JSON.stringify(o.env.slots()[0])).toBe(avant);
    });
  }
  it('E6. Taille réelle de l’image différente de dims : refus, message « taille de l’image »', async () => {
    const o = await ouvrir({ envois: ['ok'], tailleImage: { w: 1280, h: 720 } });
    const s = await capturer(o, 0);
    const avant = JSON.stringify(s);
    estFonction(o.env, 'ouvrirEditionPoints');
    const r = await o.env.ouvrirEditionPoints(0);
    expect(r.ok).toBe(false);
    expect(r.motif || '').toContain('taille de l’image');
    o.env.validerEditionPoints();
    expect(JSON.stringify(o.env.slots()[0])).toBe(avant);
  });
});

describe('#280 — test déjà validé : brouillon, mesures intact, rapport', () => {
  const valide = () => ({
    date: 'v',
    photos: [
      {
        label: 'Station bipodale',
        side: '',
        angle: null,
        angleD: 14.8,
        angleG: -7.9,
        kfppaSigne: true,
        dataUrl: IMG,
        path: 'u/v.jpg',
        imageBrute: true,
        dessin: { taille: 0.7, opacite: 0.4, testId: T },
        markers: MARQUEURS_DEMO.map((m) => ({ ...m, origine: 'main' })),
        dims: DIMS,
      },
      { label: 'Valgum dynamique unipodal G', side: 'G', angle: null, path: null },
      { label: 'Valgum dynamique unipodal D', side: 'D', angle: null, path: null },
    ],
    frames: [],
  });

  it('E7. Modification validée dans l’éditeur : mesures intact, brouillon à 2 s, badge ; validateAndSave écrit ensuite', async () => {
    const A = patient('A', { mesures: { _bilanId: 'bilan-A', [T]: valide() } });
    const avant = JSON.stringify(A.mesures[T]);
    const o = await ouvrir({ patients: [A], envois: ['ok', 'ok', 'ok'] });
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.glisser([x, y], [x + 20, y]);
    const n0 = nbEcritures(o.env);
    o.env.validerEditionPoints();
    expect(nbEcritures(o.env), 'aucune écriture immédiate : seulement le brouillon, à 2 s').toBe(
      n0
    );
    const nouveau = o.env.slots()[0].angleD;
    expect(JSON.stringify(A.mesures[T]), 'mesures intact').toBe(avant);
    vi.advanceTimersByTime(DELAI);
    const b = A.brouillonsTests?.[T];
    expect(b, 'brouillon écrit').toBeTruthy();
    expect([b.photos[0].markers[1].x, b.photos[0].angleD]).toEqual([x + 20, nouveau]);
    expect(o.env._badgeBrouillonTest(A, T)).toContain('modification en cours, non validée');
    await o.env.validateAndSave();
    expect(A.mesures[T].photos[0].angleD, 'valeur validée').toBe(nouveau);
  });

  it('E8. Rapport : version validée et mention, aucune écriture par le rapport', async () => {
    const A = patient('A', { mesures: { _bilanId: 'bilan-A', [T]: valide() } });
    const o = await ouvrir({ patients: [A] });
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.glisser([x, y], [x + 20, y]);
    o.env.validerEditionPoints();
    vi.advanceTimersByTime(DELAI);
    const n = nbEcritures(o.env);
    const r = o.env._buildSportRapportContentHTML(A, {}, {}, [], [], {}, []).bodyHTML;
    expect(nbEcritures(o.env), 'le rapport n’écrit pas').toBe(n);
    expect(r).toContain('Statique (S) : +14.8°');
    expect(r).toContain('KFPPA Marche : nouvelle capture en cours, non validée');
  });
});

describe('#280 — calque, 9 tests', () => {
  it('E9. Après modification, le calque est DESSINÉ pour les nouveaux points (jamais l’ancien servi depuis le cache)', async () => {
    const o = await ouvrir({ envois: ['ok'] });
    const s = await capturer(o, 0);
    const premier = o.env._calqueCapture(s);
    const n0 = o.env.nbDessins();
    // Témoin : même capture → servi depuis le cache, aucun nouveau dessin.
    expect(o.env._calqueCapture(s), 'témoin : même calque').toBe(premier);
    expect(o.env.nbDessins(), 'témoin : le cache sert bien').toBe(n0);
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.glisser([x, y], [x + 20, y]);
    const nAvant = o.env.nbDessins(); // dessins de l'éditeur déjà comptés
    o.env.validerEditionPoints();
    o.env._calqueCapture(o.env.slots()[0]);
    expect(o.env.nbDessins(), 'calque des nouveaux points dessiné').toBeGreaterThan(nAvant);
  });

  // E10 prouve le CÂBLAGE de l'éditeur (point appliqué à sa place, mêmes
  // points et même `tous` qu'une capture, sur les 9 gabarits) ; il ne protège
  // PAS la formule — l'éditeur et la capture passent tous deux par
  // _mesurerCapture. La formule est protégée par E0 (référence figée de main).
  it('E10. 9 tests : l’éditeur applique le point déplacé et recalcule avec les mêmes points qu’une capture (câblage, pas la formule — voir E0)', async () => {
    const tests = [
      'kfppa-marche',
      'kfppa-course',
      'kfppa-sldj',
      'verrou',
      'mobilite',
      'mla-marche',
      'mla-course',
      'amorti-marche',
      'amorti-course',
    ];
    for (const test of tests) {
      const o = await ouvrir({ test, envois: ['ok', 'ok'] });
      const s = await capturer(o, 0);
      estFonction(o.env, 'ouvrirEditionPoints');
      expect((await o.env.ouvrirEditionPoints(0)).ok, test).toBe(true);
      const m = s.markers[1];
      o.glisser([m.x, m.y], [m.x + 15, m.y + 10]);
      o.env.validerEditionPoints();
      const modifie = valeurs(o.env.slots()[0]);
      // Capture de contrôle : mêmes points, le point déplacé à sa nouvelle place.
      const vid = o.env.vid();
      const k = vid.findIndex((p) => p.name === m.name);
      vid[k].x = m.x + 15;
      vid[k].y = m.y + 10;
      await capturer(o, 0);
      expect(modifie, test).toEqual(valeurs(o.env.slots()[0]));
      expect(modifie.angle ?? modifie.angleD, test + ' : une valeur existe').not.toBeNull();
    }
  });
});

describe('#280 — au doigt (iPad) et zoom', () => {
  it('TA1. Déplacement au doigt : même résultat qu’à la souris', async () => {
    const res = [];
    for (const tactile of [false, true]) {
      const o = await ouvrir({ envois: ['ok'] });
      await capturer(o, 0);
      estFonction(o.env, 'ouvrirEditionPoints');
      expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
      expect(typeof o.cache['pe-canvas'].ontouchstart, 'gestionnaire tactile').toBe('function');
      expect(typeof o.cache['pe-canvas'].ontouchmove, 'gestionnaire tactile').toBe('function');
      const [x, y] = COORDS['genou-bi'][1];
      o.glisser([x, y], [x + 20, y + 6], tactile);
      o.env.validerEditionPoints();
      const p = o.env.slots()[0].markers[1];
      res.push([p.x, p.y, p.origine, o.env.slots()[0].angleD]);
    }
    expect(res[1], 'doigt = souris').toEqual(res[0]);
    expect(res[1].slice(0, 3)).toEqual([
      COORDS['genou-bi'][1][0] + 20,
      COORDS['genou-bi'][1][1] + 6,
      'main',
    ]);
  });

  it('TA3. Doigt : aucun écouteur mouseup laissé sur document ; relâché, le fond referme (appui retombé)', async () => {
    const o = await ouvrir({ envois: ['ok'] });
    const s = await capturer(o, 0);
    const avant = JSON.stringify(s);
    estFonction(o.env, 'ouvrirEditionPoints');
    o.env.ouvrirVignette(0);
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.glisser([x, y], [x + 20, y], true);
    expect(
      o.env.ecouteurs().filter((e) => e === 'document:mouseup'),
      'aucun écouteur résiduel'
    ).toEqual([]);
    const fond = {};
    o.env._vigFondClic({ target: fond, currentTarget: fond });
    o.env.validerEditionPoints(); // éditeur refermé par le fond : sans effet
    expect(JSON.stringify(o.env.slots()[0]), 'fond = annuler').toBe(avant);
  });

  it('TA3-témoin. Souris appuyée sur un point : l’écouteur mouseup de document EST posé (relâché hors image)', async () => {
    const o = await ouvrir({ envois: ['ok'] });
    await capturer(o, 0);
    estFonction(o.env, 'ouvrirEditionPoints');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    const [x, y] = COORDS['genou-bi'][1];
    o.cache['pe-canvas'].onmousedown({ clientX: x, clientY: y });
    expect(o.env.ecouteurs().filter((e) => e === 'document:mouseup')).toHaveLength(1);
    // Relâché hors de l'image : le clic sur le fond qui suit ne referme pas.
    const fond = {};
    o.env._vigFondClic({ target: fond, currentTarget: fond });
    o.cache['pe-canvas'].onmousemove({ clientX: x + 20, clientY: y });
    o.env.validerEditionPoints();
    expect(o.env.slots()[0].markers[1].x, 'modification gardée').toBe(x + 20);
  });

  it('TA2. Sélection au doigt puis « Confirmer ce point »', async () => {
    const o = await ouvrir({ envois: ['ok'], origine: 'defaut' });
    await capturer(o, 0);
    estFonction(o.env, 'confirmerPointEdition');
    expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
    o.selectionner(COORDS['genou-bi'][4], true);
    o.env.confirmerPointEdition();
    o.env.validerEditionPoints();
    expect(o.env.slots()[0].markers[4].origine).toBe('main');
  });

  it('Z1. Même geste avec et sans zoom (échelle, défilement) : mêmes coordonnées dans le repère dims', async () => {
    const res = [];
    for (const [s, gauche, haut] of [
      [0.5, 0, 0],
      [2, -900, -300],
    ]) {
      const o = await ouvrir({ envois: ['ok'] });
      await capturer(o, 0);
      Object.assign(o.vue, { s, gauche, haut });
      estFonction(o.env, 'ouvrirEditionPoints');
      expect((await o.env.ouvrirEditionPoints(0)).ok).toBe(true);
      const [x, y] = COORDS['genou-bi'][1];
      o.glisser([x, y], [x + 20, y + 6]);
      o.env.validerEditionPoints();
      const p = o.env.slots()[0].markers[1];
      res.push([p.x, p.y]);
    }
    expect(res[0]).toEqual([COORDS['genou-bi'][1][0] + 20, COORDS['genou-bi'][1][1] + 6]);
    expect(res[1], 'zoom 2 = zoom 0,5').toEqual(res[0]);
  });

  it('Z2. Zoom de l’éditeur = mécanisme de capture : setCapZoom agrandit aussi le cadre de l’éditeur', async () => {
    const o = await ouvrir({ zoomReel: true });
    o.env.setCapZoom(2);
    // Lecture tolérante : un élément jamais touché n'existe pas dans le cache.
    expect(o.cache['vid-zoom']?.style?.width, 'témoin : cadre de capture').toBe('200.00%');
    expect(o.cache['pe-zoom']?.style?.width, 'cadre de l’éditeur').toBe('200.00%');
  });
});
