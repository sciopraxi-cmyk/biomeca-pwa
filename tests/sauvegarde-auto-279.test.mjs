import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { charger, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 4 — sauvegarde automatique des tests biomécaniques
// ═══════════════════════════════════════════════════════════════════
//
// Plan validé par le praticien :
//   - un test en cours (captures, points en direct) est écrit dans un
//     BROUILLON séparé, patient.brouillonsTests[testId] = { bilanId, date,
//     photos, frames, marqueursEnCours } — JAMAIS dans mesures, que bilan,
//     rapport et synchronisation lisent comme des tests VALIDÉS ;
//   - écriture 2 s après la dernière capture ou correction de point ;
//     écriture IMMÉDIATE en quittant pg-capture (rapport compris), au
//     verrouillage, page masquée, pagehide, et AVANT que launchTest remplace
//     les captures (changement de test) ;
//   - rattaché au patient de la capture, retrouvé PAR SON ID (#251) ;
//   - aucune dataURL écrite : une photo sans path est écrite SANS image,
//     nonEnvoyee:true (règle de 3f à la reprise) ;
//   - reprise par launchTest si le bilanId du brouillon est celui du bilan ;
//     sinon ignoré, jamais purgé ; validateAndSave retire le brouillon de SON
//     test ; « Abandonner la capture en cours » : action explicite, confirmée ;
//   - carte : « en cours — non validé » / « modification en cours, non
//     validée » ; rapport : ligne rouge « Test X : capture en cours, non
//     validée — non incluse », ou la version validée + « nouvelle capture en
//     cours, non validée » ; générer le rapport n'écrit JAMAIS ;
//   - stockage critique : aucune boîte de dialogue répétée, bandeau.
// Données synthétiques : marqueurs de démonstration, patients fictifs.

const T = 'kfppa-marche';
const DELAI = 2000;
const IMG = 'data:image/jpeg;base64,QUJD';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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
const marqueurs = (origine = 'main') =>
  JSON.parse(JSON.stringify(MARQUEURS_DEMO)).map((m) => ({ ...m, origine }));

// Environnement de capture : patient(s), test ouvert, caméra active.
async function ouvrir(o = {}) {
  const env = charger({
    persistance: true,
    envoiReel: true,
    envois: o.envois || [],
    reponses: o.reponses || [],
    navReelle: !!o.navReelle,
  });
  const cache = {
    'vid-el': { readyState: 4, videoWidth: 1368 },
    'vid-canvas': {
      width: 1368,
      height: 770,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1368, height: 770 }),
      getContext: () => ({ drawImage() {} }),
    },
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
  const ps = o.patients || [patient('A')];
  env.poser({ patients: ps, patient: ps[0], elements, pageActive: 'pg-capture' });
  await env.launchTest(o.test || T);
  env.poser({ marqueurs: marqueurs() });
  return { env, ps, el: cache, elements };
}
const nbEcritures = (env) => env.enregistrements().filter((x) => x === 'savePatients').length;
const brouillon = (p, t = T) => p.brouillonsTests && p.brouillonsTests[t];

describe('#279 étape 4 — écriture différée après capture ou correction', () => {
  it('A1. 2 s après une capture : brouillon écrit (valeurs, points et origine, dims, path), jamais avant', async () => {
    const { env, ps } = await ouvrir({ envois: ['ok'] });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(DELAI - 1);
    expect(brouillon(ps[0]), 'rien avant 2 s').toBeUndefined();
    expect(nbEcritures(env)).toBe(0);
    vi.advanceTimersByTime(1);
    const b = brouillon(ps[0]);
    expect(b, 'brouillon écrit').toBeTruthy();
    expect(b.bilanId).toBe('bilan-A');
    const ph = b.photos[0];
    expect([Math.round(ph.angleD * 10) / 10, Math.round(ph.angleG * 10) / 10]).toEqual([
      14.8, -7.9,
    ]);
    expect(ph.markers.map((m) => m.origine)).toEqual(marqueurs().map(() => 'main'));
    expect(ph.dims).toEqual({ w: 1368, h: 770 });
    expect(ph.path).toBe(env.envois()[0].path);
    expect('dataUrl' in ph, 'aucune image dans le brouillon').toBe(false);
    expect(b.marqueursEnCours.length, 'points en direct').toBe(6);
    expect(nbEcritures(env)).toBe(1);
  });

  it('A2. Plusieurs captures en moins de 2 s : UNE seule écriture', async () => {
    const { env, ps } = await ouvrir({ envois: ['ok', 'ok', 'ok'] });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(1000);
    await env.captureVidPhotoSlot(1);
    vi.advanceTimersByTime(1000);
    await env.captureVidPhotoSlot(2);
    vi.advanceTimersByTime(DELAI);
    expect(nbEcritures(env)).toBe(1);
    expect(
      brouillon(ps[0]).photos.filter((p) => p.markersConnus !== false && p.markers).length
    ).toBe(3);
  });

  it('A3. Capture chez A, patient B ouvert avant 2 s : brouillon chez A, B inchangé (#251)', async () => {
    const A = patient('A');
    const B = patient('B');
    const { env } = await ouvrir({ envois: ['ok'], patients: [A, B] });
    await env.captureVidPhotoSlot(0);
    env.poser({ patient: B, slots: [] });
    vi.advanceTimersByTime(DELAI);
    expect(brouillon(A), 'brouillon chez A').toBeTruthy();
    expect(brouillon(A).bilanId).toBe('bilan-A');
    expect(B.brouillonsTests, 'B intact').toBeUndefined();
  });

  it('A4. Correction d’un point (glissement) : brouillon écrit 2 s après, points en direct avec origine « main »', async () => {
    const { env, ps, el } = await ouvrir();
    const mk = marqueurs('defaut');
    // Position FIGÉE avant le glissement : mk est le tableau même que le glissement modifie.
    const x0 = mk[0].x,
      y0 = mk[0].y;
    env.poser({ marqueurs: mk });
    env.setupVidCanvas({}, el['vid-canvas']);
    el['vid-canvas'].onmousedown({ clientX: x0, clientY: y0 });
    el['vid-canvas'].onmousemove({ clientX: x0 + 12, clientY: y0 + 5 });
    vi.advanceTimersByTime(10 * DELAI);
    expect(brouillon(ps[0]), 'rien tant que le point n’est pas relâché').toBeUndefined();
    el['vid-canvas'].onmouseup();
    vi.advanceTimersByTime(DELAI);
    const b = brouillon(ps[0]);
    expect(b, 'brouillon écrit après correction').toBeTruthy();
    expect([
      b.marqueursEnCours[0].x,
      b.marqueursEnCours[0].y,
      b.marqueursEnCours[0].origine,
    ]).toEqual([x0 + 12, y0 + 5, 'main']);
  });
});

describe('#279 étape 4 — écriture IMMÉDIATE', () => {
  it('A5. Quitter pg-capture (vers le rapport), verrouillage, page masquée, pagehide : écriture sans attendre', async () => {
    // (a) navigation vers le rapport : le déclencheur est la NAVIGATION.
    let o = await ouvrir({ envois: ['ok'], navReelle: true });
    await o.env.captureVidPhotoSlot(0);
    o.env.nav('pg-rapport');
    expect(brouillon(o.ps[0]), 'nav : brouillon écrit sans attendre').toBeTruthy();
    const e = o.env.enregistrements();
    expect(e.indexOf('savePatients'), 'écrit AVANT la construction du rapport').toBeLessThan(
      e.indexOf('buildRapport')
    );
    // (b) verrouillage.
    o = await ouvrir({ envois: ['ok'] });
    await o.env.captureVidPhotoSlot(0);
    await o.env._lockSession();
    const e2 = o.env.enregistrements();
    expect(brouillon(o.ps[0]), 'verrouillage').toBeTruthy();
    expect(e2.indexOf('savePatients')).toBeLessThan(e2.indexOf('pwaLogout'));
    // (c) page masquée, (d) pagehide.
    for (const evt of ['visibilitychange', 'pagehide']) {
      o = await ouvrir({ envois: ['ok'] });
      expect(typeof o.env._installerSauvegardeTests, 'installation des écouteurs').toBe('function');
      o.env._installerSauvegardeTests();
      await o.env.captureVidPhotoSlot(0);
      o.env.poser({ visibilite: 'hidden' });
      o.env.declencher(evt);
      expect(brouillon(o.ps[0]), evt).toBeTruthy();
    }
  });

  it('A5b. Changement de test dans pg-capture : brouillon écrit AVANT que launchTest remplace les captures', async () => {
    const { env, ps } = await ouvrir({ envois: ['ok'] });
    await env.captureVidPhotoSlot(0);
    await env.launchTest('verrou');
    const b = brouillon(ps[0], T);
    expect(b, 'brouillon du test quitté').toBeTruthy();
    expect(
      Math.round(b.photos[0].angleD * 10) / 10,
      'captures du test quitté, pas celles du nouveau'
    ).toBe(14.8);
    expect(env.slots().length, 'nouveau test ouvert').toBe(env.TESTS.verrou.photoLabels.length);
  });
});

describe('#279 étape 4 — hors ligne : jamais d’image dans le brouillon', () => {
  it('A6. Photo non envoyée : brouillon sans image, nonEnvoyee ; le créneau en mémoire garde son image', async () => {
    const { env, ps } = await ouvrir({ envois: ['echec'] });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(DELAI);
    const ph = brouillon(ps[0])?.photos?.[0];
    expect(ph, 'brouillon écrit').toBeTruthy();
    expect('dataUrl' in ph).toBe(false);
    expect(ph.nonEnvoyee).toBe(true);
    const s = env.slots()[0];
    expect(s.dataUrl, 'image gardée en mémoire').toMatch(/^data:/);
    expect('nonEnvoyee' in s, 'le créneau n’est pas marqué').toBe(false);
    expect(env.ecrits().join('\n')).not.toContain('data:');
  });
});

describe('#279 étape 4 — reprise, validation, abandon', () => {
  const brouillonFictif = (bilanId) => ({
    bilanId,
    date: 'x',
    photos: [
      {
        label: 'Station bipodale',
        side: '',
        angle: null,
        angleD: 6.6,
        angleG: -2.2,
        kfppaSigne: true,
        path: 'u/b.jpg',
        markers: [],
        dims: { w: 1368, h: 770 },
      },
      { label: 'Valgum dynamique unipodal G', side: 'G', angle: null, path: null },
      { label: 'Valgum dynamique unipodal D', side: 'D', angle: null, path: null },
    ],
    frames: [],
    marqueursEnCours: [],
  });

  it('A7. Rechargement puis launchTest : reprise depuis le brouillon, bandeau « Test en cours, non validé — repris »', async () => {
    const A = patient('A', { brouillonsTests: { [T]: brouillonFictif('bilan-A') } });
    const { env, el } = await ouvrir({ patients: [A] });
    expect(env.slots()[0].angleD, 'valeur reprise').toBe(6.6);
    expect(env.slots()[0].path).toBe('u/b.jpg');
    expect(el['cap-brouillon']?.textContent || '', 'bandeau').toContain(
      'Test en cours, non validé — repris'
    );
    // Témoin : sans brouillon, ouverture comme aujourd'hui (créneaux vides).
    const t = await ouvrir({ patients: [patient('B')] });
    expect(t.env.slots()[0].angleD ?? null).toBeNull();
  });

  it('A8. validateAndSave : mesures[test] écrit comme avant, SEUL le brouillon de ce test est retiré', async () => {
    const A = patient('A', { brouillonsTests: { verrou: brouillonFictif('bilan-A') } });
    const { env } = await ouvrir({ patients: [A], envois: ['ok', 'ok', 'ok'] });
    for (const i of [0, 1, 2]) await env.captureVidPhotoSlot(i);
    vi.advanceTimersByTime(DELAI);
    expect(brouillon(A), 'brouillon du test en cours écrit').toBeTruthy();
    await env.validateAndSave();
    expect(A.mesures[T].photos).toHaveLength(3);
    expect(brouillon(A), 'brouillon du test validé retiré').toBeUndefined();
    expect(brouillon(A, 'verrou'), 'brouillon d’un autre test conservé').toBeTruthy();
  });

  it('A8b. Test validé puis recapturé : mesures intact jusqu’à la validation ; carte et rapport le disent', async () => {
    const valide = {
      date: 'v',
      photos: [
        {
          label: 'Station bipodale',
          side: '',
          angle: null,
          angleD: 3.1,
          angleG: 4.2,
          kfppaSigne: true,
          path: 'u/v.jpg',
        },
      ],
      frames: [],
    };
    const A = patient('A', { mesures: { _bilanId: 'bilan-A', [T]: valide } });
    const avant = JSON.stringify(A.mesures[T]);
    const { env } = await ouvrir({ patients: [A], envois: ['ok'] });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(DELAI);
    expect(brouillon(A), 'nouvelle capture en brouillon').toBeTruthy();
    expect(JSON.stringify(A.mesures[T]), 'mesures[test] strictement intact').toBe(avant);
    expect(typeof env._badgeBrouillonTest, 'badge').toBe('function');
    expect(env._badgeBrouillonTest(A, T)).toContain('modification en cours, non validée');
    const r = env._buildSportRapportContentHTML(A, {}, {}, [], [], {}, []).bodyHTML;
    // Format réel du rapport pour un KFPPA validé : « Statique (S) : +3.1° ».
    expect(r, 'valeur validée D au rapport').toContain('Statique (S) : +3.1°');
    expect(r, 'valeur validée G au rapport').toContain('Statique (S) : +4.2°');
    const iMention = r.indexOf('KFPPA Marche : nouvelle capture en cours, non validée');
    expect(iMention, 'mention présente').toBeGreaterThan(-1);
    expect(iMention, 'mention après la version validée').toBeGreaterThan(
      r.indexOf('Statique (S) : +4.2°')
    );
    expect(r, 'aucune valeur du brouillon').not.toContain('14.8');
  });

  it('A9. Brouillon d’un AUTRE bilan : ignoré à la reprise, conservé (aucune purge)', async () => {
    const ancien = brouillonFictif('bilan-precedent');
    const A = patient('A', { brouillonsTests: { [T]: ancien } });
    const { env, el } = await ouvrir({ patients: [A] });
    expect(env.slots()[0].angleD ?? null, 'non repris').toBeNull();
    expect(el['cap-brouillon']?.textContent || '').not.toContain('repris');
    expect(A.brouillonsTests[T], 'conservé tel quel').toBe(ancien);
    // Mais un brouillon du bilan EN COURS, lui, est repris (témoin de la règle).
    const B = patient('B', { brouillonsTests: { [T]: brouillonFictif('bilan-B') } });
    const t = await ouvrir({ patients: [B] });
    expect(t.env.slots()[0].angleD, 'même bilan : repris').toBe(6.6);
  });

  it('A14. « Abandonner la capture en cours » : confirmé, retire le brouillon seul ; mesures et fichiers intacts', async () => {
    const valide = {
      date: 'v',
      photos: [
        {
          label: 'Station bipodale',
          side: '',
          angle: null,
          angleD: 3.1,
          angleG: 4.2,
          path: 'u/v.jpg',
        },
      ],
      frames: [],
    };
    const A = patient('A', {
      mesures: { _bilanId: 'bilan-A', [T]: valide },
      brouillonsTests: { [T]: brouillonFictif('bilan-A') },
    });
    const avant = JSON.stringify(A.mesures);
    const { env } = await ouvrir({ patients: [A], reponses: [true] });
    expect(typeof env.abandonnerCaptureEnCours, 'bouton').toBe('function');
    await env.abandonnerCaptureEnCours();
    expect(env.questions()[0] || '', 'confirmation demandée').toContain(
      'Abandonner la capture en cours'
    );
    expect(brouillon(A), 'brouillon retiré').toBeUndefined();
    expect(JSON.stringify(A.mesures), 'test validé intact').toBe(avant);
    const supp = [
      'deletePhotos',
      '_deleteFolderRecursive',
      'deletePatientFolder',
      'deleteSportBilanFolder',
    ];
    expect(
      env.enregistrements().filter((x) => supp.includes(x)),
      'aucune suppression de fichier'
    ).toEqual([]);
  });
});

describe('#279 étape 4 — bilan et rapport', () => {
  it('A10. Brouillon seul : mesures inchangé ; carte « en cours — non validé » ; rapport : ligne rouge « non incluse », aucune valeur', async () => {
    const A = patient('A');
    const cles = Object.keys(A.mesures);
    const { env } = await ouvrir({ patients: [A], envois: ['ok'] });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(DELAI);
    expect(brouillon(A), 'brouillon écrit').toBeTruthy();
    expect(Object.keys(A.mesures), 'compteurs de tests inchangés').toEqual(cles);
    expect(typeof env._badgeBrouillonTest).toBe('function');
    expect(env._badgeBrouillonTest(A, T)).toContain('en cours — non validé');
    const r = env._buildSportRapportContentHTML(A, {}, {}, [], [], {}, []).bodyHTML;
    expect(r).toContain('Test KFPPA Marche : capture en cours, non validée — non incluse');
    expect(r).toContain('color:#b91c1c');
    expect(r, 'aucune valeur du brouillon').not.toContain('14.8');
  });

  it('A11. Construire le rapport n’écrit JAMAIS : ni sauvegarde automatique, ni savePatients', async () => {
    const A = patient('A');
    const { env } = await ouvrir({ patients: [A], envois: ['ok'] });
    await env.captureVidPhotoSlot(0); // écriture différée EN ATTENTE
    const n = nbEcritures(env);
    env._buildSportRapportContentHTML(A, {}, {}, [], [], {}, []);
    env.buildPrintSection(env.TESTS[T], { photos: env.slots() }, []);
    expect(nbEcritures(env), 'aucune écriture par le rapport').toBe(n);
    expect(brouillon(A), 'l’attente n’a pas été vidée par le rapport').toBeUndefined();
    vi.advanceTimersByTime(DELAI);
    expect(brouillon(A), 'puis écrit à son heure, par la capture').toBeTruthy();
  });

  it('A12. Stockage critique : aucune boîte de dialogue, aucune écriture, bandeau « suspendue »', async () => {
    const { env, ps, el } = await ouvrir({ envois: ['ok', 'ok'] });
    env.poser({ octetsStockage: 10 * 1024 * 1024 });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(DELAI);
    await env.captureVidPhotoSlot(1);
    vi.advanceTimersByTime(DELAI);
    expect(env.enregistrements(), 'aucune alerte').not.toContain('alert');
    expect(env.questions(), 'aucune question').toEqual([]);
    expect(nbEcritures(env)).toBe(0);
    expect(brouillon(ps[0])).toBeUndefined();
    expect(el['sauvegarde-auto-etat']?.textContent || '', 'bandeau').toContain(
      'Sauvegarde automatique suspendue — stockage plein'
    );
  });
});

describe('#279 étape 4 — témoin de mesure : l’alerte de stockage critique EST détectée', () => {
  it('A12-témoin. Même stockage plein : une validation passe par savePatients, et son alerte est notée', async () => {
    const { env } = await ouvrir({ envois: ['ok', 'ok', 'ok', 'ok'] });
    for (const i of [0, 1, 2]) await env.captureVidPhotoSlot(i);
    env.poser({ octetsStockage: 10 * 1024 * 1024 });
    await env.validateAndSave();
    const e = env.enregistrements();
    expect(e, 'savePatients appelé').toContain('savePatients');
    expect(e.indexOf('alert'), 'alerte de stockage critique notée par le harnais').toBeGreaterThan(
      e.indexOf('savePatients')
    );
  });
});

describe('#279 étape 4 — patient sans _bilanId : le brouillon ne crée ni test ni bilan', () => {
  // Chargeur minimal des VRAIS finalizeBilanSport et abandonnerBilanSport : ce
  // qu'ils disent d'un patient est ce que voit le praticien.
  const chargerBilan = (p, reponses = []) =>
    // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
    new Function(`
      const patients = [arguments[0]]; const _rep = arguments[1];
      const _alertes = [], _questions = [];
      let currentOpenedBilanIdx = null, _intentionalReduction = false;
      const document = { getElementById: () => null };
      function alert(m) { _alertes.push(m); }
      function confirm(m) { _questions.push(m); return _rep.shift() ?? false; }
      function savePatients() {} function _syncPatientToNormalizedTables() {} function renderPatientList() {}
      ${SRC_BIOMECA.includes('\nfunction _nbTestsMesures(') ? fonction('_nbTestsMesures') : '' /* nouvelle : absente du code d'avant */}
      ${['hasBilanDataContent', 'finalizeBilanSport', 'abandonnerBilanSport'].map(fonction).join('\n')}
      return { finalizeBilanSport, abandonnerBilanSport, alertes: () => _alertes, questions: () => _questions };
    `)(p, reponses);

  it('A15. Sans _bilanId, une capture, 2 s : brouillon écrit ; aucun test validé ; « Finaliser » et « Abandonner » voient un bilan VIDE', async () => {
    const Z = patient('Z', { mesures: {}, currentBilanSportSousType: 'initial' });
    const { env } = await ouvrir({ patients: [Z], envois: ['ok'] });
    await env.captureVidPhotoSlot(0);
    vi.advanceTimersByTime(DELAI);
    expect(brouillon(Z), 'brouillon écrit').toBeTruthy();
    expect(brouillon(Z).bilanId, 'rattaché au _bilanId créé').toBe(Z.mesures._bilanId);
    expect(
      Object.keys(Z.mesures).filter((k) => !k.startsWith('_')),
      'aucun test validé'
    ).toEqual([]);
    // Ce que voit le praticien.
    const f = chargerBilan(Z);
    f.finalizeBilanSport(0);
    expect(f.alertes()[0] || '', 'Finaliser : bilan vide').toContain(
      'Aucun test ni saisie clinique'
    );
    expect(Z.bilansSport, 'aucune archive vide créée').toBeUndefined();
    const a = chargerBilan(Z, [false]);
    a.abandonnerBilanSport(0);
    expect(a.questions()[0] || '', 'Abandonner : bilan vide').toContain('actuellement vide');
  });
});

describe('#279 étape 4 — témoin : sans capture ni brouillon, rien ne change', () => {
  it('A13. Ouverture et inactivité sans capture : aucune écriture ; ouverture identique', async () => {
    const valide = {
      date: 'v',
      photos: [
        {
          label: 'Station bipodale',
          side: '',
          angle: null,
          angleD: 3.1,
          angleG: 4.2,
          path: 'u/v.jpg',
        },
      ],
      frames: [],
    };
    const A = patient('A', { mesures: { _bilanId: 'bilan-A', [T]: valide } });
    const { env } = await ouvrir({ patients: [A] });
    vi.advanceTimersByTime(10 * DELAI);
    expect(nbEcritures(env)).toBe(0);
    expect(A.brouillonsTests).toBeUndefined();
    expect(env.slots()[0].angleD).toBe(3.1);
    expect(env.slots()[0].path).toBe('u/v.jpg');
    void IMG;
  });
});
