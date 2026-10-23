// ═══════════════════════════════════════════════════════════════════
// #277 — Générer un rapport ne déclenche JAMAIS de sauvegarde (lot A1)
// ═══════════════════════════════════════════════════════════════════
//
// CLAUDE.md, interdit absolu (incident du 25/07/2026) : « Générer un rapport
// ne doit JAMAIS déclencher une sauvegarde ». L'audit du lot A a mesuré le
// contraire pour Sport et Posturo : onglet Rapport, impression, synthèses, et
// le passage par nav vers la page du rapport écrivaient (stockage local,
// cloud, Storage), et pouvaient ouvrir les dialogues de savePatients.
//
// Arbitrages du praticien :
//   - un rapport lit l'état COURANT par une capture EN MÉMOIRE (balayage du
//     DOM → bilanData / bilanDataPosturo), sans migration Storage, sans
//     savePatients, sans remettre _userDirty à faux ;
//   - nav vers pg-rapport et pg-rapport-posturo : capture en mémoire
//     seulement ; toute autre destination garde capture + sauvegarde (#116) ;
//   - la course d80c6c8 : un rapport ne lit jamais un bilan amputé des
//     dataURLs qu'une sauvegarde en cours a retirées ;
//   - _lockSession sauvegarde les QUATRE bilans (la Podopédiatrie manquait) ;
//   - savePosturoBilan(true) n'ouvre plus « Sélectionnez un patient ».
//
// Deux preuves complémentaires :
//   - EXÉCUTION (harnais-sauvegardes) : fonctions réelles, écritures espionnées,
//     et un TÉMOIN de fin de chemin par scénario (un « 0 écriture » sur un
//     chemin interrompu ne prouverait rien) ;
//   - LECTURE STATIQUE (fermeture-appels) : tout ce qu'un point d'entrée peut
//     atteindre, bouchons compris.
// Données FICTIVES uniquement.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { monter, element, laisserFiler, NOUVELLES } from './helpers/harnais-sauvegardes.mjs';
import { fermeture } from './helpers/fermeture-appels.mjs';

const IMG_A = 'data:image/png;base64,QUFBQQ==';
const IMG_B = 'data:image/png;base64,QkJCQg==';
const RECENT = 'saisie à t−0,5 s';
const ANCIEN = 'valeur de la dernière sauvegarde';
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const clone = (x) => JSON.parse(JSON.stringify(x));

const patient = (o = {}) => ({
  id: 'patient-fictif',
  prenom: 'Prénom',
  nom: 'Fictif',
  date: '01/10/2026',
  email: 'patient@exemple.invalid',
  mesures: { _bilanId: 'bilan-fictif' },
  bilanData: {},
  bilanDataPosturo: { id: 'bilan-posturo-fictif' },
  bilanDataPedicurie: {},
  bilanDataPodopediatrie: {},
  ...o,
});
const avecPatient = (o = {}) => {
  const p = o.patient || patient();
  return monter({
    ...o,
    reelles: [...(o.reelles || []), ...NOUVELLES, 'getPoVal', 'getPosturoRadio'],
    globales: { currentPatient: p, patients: [p], ...(o.globales || {}) },
  });
};
const sections = (n) => Array.from({ length: n }, () => element());
const VISUELS_NUS = {
  bodyCanvas: { status: 'nu' },
  empreinte: { status: 'nu' },
  feetComposite: { status: 'nu' },
  annotatedViews: [],
  plantGallery: [],
};

// ─── R. Les 12 scénarios et les 2 passages par nav ────────────────────────
const impressions = [];
// Chacun : 0 écriture, 0 dialogue, et le témoin de fin de chemin atteint.
const SCENARIOS = [
  {
    n: 'R1',
    titre: 'Sport — onglet Rapport (buildRapport)',
    page: 'pg-rapport',
    reelles: ['buildRapport'],
    jouer: (f) => f.buildRapport(),
    temoin: '_resolveSportRapportImages',
  },
  {
    n: 'R2',
    titre: 'Sport — « Imprimer / PDF » (printReport)',
    page: 'pg-rapport',
    reelles: ['printReport'],
    jouer: (f) => f.printReport(),
    temoin: '_resolveSportRapportImages',
  },
  {
    n: 'R3',
    titre: 'Sport — « Imprimer » (printBilan, puis printReport à 200 ms)',
    page: 'pg-rapport',
    reelles: ['printBilan', 'printReport'],
    jouer: async (f) => {
      f.printBilan();
      await attendre(260);
    },
    temoin: '_resolveSportRapportImages',
  },
  {
    n: 'R4',
    titre: 'Sport — « Générer la synthèse » (genererSyntheseSport)',
    page: 'pg-bilan',
    reelles: ['genererSyntheseSport'],
    jouer: (f) => f.genererSyntheseSport(),
    temoin: '_renderSportSyntheseHTML',
  },
  {
    n: 'R5',
    titre: 'Posturo — « 📄 Rapport » (buildRapportPosturo)',
    page: 'pg-bilan-posturo',
    reelles: ['buildRapportPosturo'],
    jouer: (f) => f.buildRapportPosturo(),
    temoin: '_buildRapportBody',
  },
  {
    n: 'R6',
    titre: 'Posturo — « Imprimer » (printRapportPosturo)',
    page: 'pg-rapport-posturo',
    reelles: ['printRapportPosturo'],
    dom: () => {
      const iframe = element({ contentWindow: { focus() {}, print: () => impressions.push(1) } });
      return { 'rapport-posturo-body': element({ querySelector: () => iframe }) };
    },
    jouer: (f) => f.printRapportPosturo(),
    // L'impression de l'iframe déjà construit est le témoin.
    verifier: () => expect(impressions, 'iframe imprimé').toEqual([1]),
  },
  {
    n: 'R7',
    titre: 'Posturo — « Générer la synthèse » (genererSynthese)',
    page: 'pg-bilan-posturo',
    reelles: ['genererSynthese'],
    jouer: (f) => f.genererSynthese(),
    temoin: 'renderNeuroBlocks',
  },
  {
    n: 'R8',
    titre: 'Pédicurie — onglet Rapport (showPedicurieSection(9))',
    page: 'pg-pedicurie',
    reelles: ['showPedicurieSection'],
    selecteurs: { '#pg-pedicurie .pedicurie-section': sections(10) },
    jouer: (f) => f.showPedicurieSection(9),
    temoin: '_renderRapportPreviewIframe',
  },
  {
    n: 'R9',
    titre: 'Pédicurie — « Imprimer / PDF » (printRapportPedicurie)',
    page: 'pg-pedicurie',
    reelles: ['printRapportPedicurie'],
    jouer: async (f) => {
      f.printRapportPedicurie();
      await attendre(350);
    },
    temoin: 'iframe.print',
  },
  {
    n: 'R10',
    titre: 'Podopédiatrie — onglet Rapport (showPodopediatrieSection(11))',
    page: 'pg-podopediatrie',
    reelles: ['showPodopediatrieSection'],
    selecteurs: { '#pg-podopediatrie .podopediatrie-section': sections(12) },
    globales: { buildPodopediatrieRapportHTML: async () => '<p>rapport fictif</p>' },
    jouer: (f) => f.showPodopediatrieSection(11),
    temoin: '_renderRapportPreviewIframe',
  },
  {
    n: 'R11',
    titre: 'Podopédiatrie — « Imprimer / PDF » (printRapportPodopediatrie)',
    page: 'pg-podopediatrie',
    reelles: ['printRapportPodopediatrie'],
    globales: { buildPodopediatrieRapportHTML: async () => '<p>rapport fictif</p>' },
    jouer: async (f) => {
      await f.printRapportPodopediatrie();
      await attendre(350);
    },
    temoin: 'iframe.print',
  },
  {
    n: 'R12',
    titre: 'Tous — « Envoyer par mail » (envoyerRapportMail)',
    page: 'pg-rapport',
    reelles: ['envoyerRapportMail'],
    jouer: (f) => f.envoyerRapportMail(),
    temoin: 'a.click',
  },
  {
    n: 'N1',
    titre: 'nav : pg-bilan → pg-rapport (onglet Rapport depuis le bilan Sport)',
    page: 'pg-bilan',
    reelles: ['nav', 'buildRapport'],
    jouer: (f) => f.nav('pg-rapport'),
    temoin: '_resolveSportRapportImages',
  },
  {
    n: 'N2',
    titre: 'nav : pg-bilan-posturo → pg-rapport-posturo (fin de buildRapportPosturo)',
    page: 'pg-bilan-posturo',
    reelles: ['nav'],
    jouer: (f) => f.nav('pg-rapport-posturo'),
    temoin: '_appliquerTheme',
  },
];

describe('#277 R — générer un rapport : 0 écriture, 0 dialogue (exécution)', () => {
  for (const s of SCENARIOS)
    it(`${s.n}. ${s.titre}`, async () => {
      const h = avecPatient({
        page: s.page,
        reelles: s.reelles,
        dom: s.dom ? s.dom() : {},
        selecteurs: s.selecteurs,
        globales: s.globales,
      });
      await s.jouer(h.f);
      await laisserFiler();
      expect(h.ecritures(), 'écritures').toEqual([]);
      expect(h.dialogues(), 'dialogues').toEqual([]);
      // Témoin : le chemin est allé jusqu'au bout (sinon « 0 » ne prouve rien).
      if (s.temoin) expect(h.appels(), 'témoin de fin de chemin').toContain(s.temoin);
      if (s.verifier) s.verifier();
    });
});

// ─── F. Lecture statique : rien d'atteignable, bouchons compris ───────────
const ENTREES = [
  'buildRapport',
  'printReport',
  'printBilan',
  'genererSyntheseSport',
  'buildRapportPosturo',
  'printRapportPosturo',
  'genererSynthese',
  'showPedicurieSection',
  'printRapportPedicurie',
  'showPodopediatrieSection',
  'printRapportPodopediatrie',
  'envoyerRapportMail',
];

describe('#277 F — générer un rapport : aucune écriture atteignable (lecture statique)', () => {
  for (const e of ENTREES)
    it(`F. ${e}`, () => {
      const r = fermeture(e);
      expect(r.ecritures, 'écritures atteignables').toEqual([]);
      // Seul passage par nav : la fin du rapport Posturo, vers SA page (N2).
      expect(r.navs.map((x) => x.split(' > ').pop())).toEqual(
        e === 'buildRapportPosturo' ? ['nav:pg-rapport-posturo'] : []
      );
    });

  it('Ft. Témoin : la lecture trouve les écritures de la sauvegarde et de nav', () => {
    expect(fermeture('saveBilanSilent').ecritures.join('\n')).toMatch(/> savePatients /);
    const nav = fermeture('nav').ecritures.join('\n');
    for (const s of [
      'saveBilanSilent',
      'savePosturoBilan',
      'savePedicurieBilan',
      'savePodopediatrieBilan',
    ])
      expect(nav).toMatch(new RegExp(`nav > ${s} `));
  });
});

// ─── T. Hors rapport, nav sauvegarde toujours (#116) ──────────────────────
const SAUVEGARDE_DE = {
  'pg-bilan': 'saveBilanSilent',
  'pg-bilan-posturo': 'savePosturoBilan',
  'pg-pedicurie': 'savePedicurieBilan',
  'pg-podopediatrie': 'savePodopediatrieBilan',
};

describe('#277 T — quitter un bilan vers une autre page : capture + sauvegarde inchangées', () => {
  for (const [page, save] of Object.entries(SAUVEGARDE_DE))
    for (const vers of ['pg-patients', 'pg-agenda'])
      it(`T. ${page} → ${vers} : ${save}`, () => {
        const h = avecPatient({ page, reelles: ['nav'] });
        h.f.nav(vers);
        expect(h.ecritures()).toEqual([save]);
      });
});

// ─── V. Verrouillage d'inactivité : les quatre bilans ─────────────────────
describe('#277 V — _lockSession sauvegarde les quatre bilans avant la déconnexion', () => {
  for (const [page, save] of Object.entries(SAUVEGARDE_DE))
    it(`V. ${page} : ${save} puis pwaLogout`, async () => {
      const h = avecPatient({ page, reelles: ['_lockSession'] });
      await h.f._lockSession();
      const ordre = h.journal.map((e) => e.nom);
      expect(h.ecritures()).toContain(save);
      expect(ordre.indexOf(save)).toBeLessThan(ordre.indexOf('pwaLogout'));
    });
});

// ─── A. Alerte « Sélectionnez un patient » ────────────────────────────────
describe('#277 A — savePosturoBilan sans patient', () => {
  it('A1. Silencieux (autosave, nav, verrouillage) : aucune alerte, aucune écriture', async () => {
    const h = monter({ reelles: ['savePosturoBilan', ...NOUVELLES] });
    await h.f.savePosturoBilan(true);
    expect(h.dialogues()).toEqual([]);
    expect(h.ecritures()).toEqual([]);
  });

  it('A2. Témoin : le bouton (non silencieux) prévient toujours', async () => {
    const h = monter({ reelles: ['savePosturoBilan', ...NOUVELLES] });
    await h.f.savePosturoBilan();
    expect(h.dialogues()).toEqual(['alert: Sélectionnez un patient']);
  });
});

// ─── S. Le rapport reflète l'état COURANT ─────────────────────────────────
// Contenu seulement : l'absence d'écriture est l'objet de R. La chaîne de
// sauvegarde Sport est RÉELLE (sur main, c'est elle qui balayait le DOM) :
// la comparaison avec main porte sur le comportement, pas sur un espion.
const SAUVEGARDE_SPORT_REELLE = [
  'saveBilanSilent',
  'migrateSportBilanDataPhotos',
  'migratePhotoEntry',
  'restoreSportBilanDataPhotosStash',
  '_podoscopePhotoKeys',
];
describe('#277 S — un rapport reflète la saisie et le dessin non encore sauvegardés', () => {
  it('S1. Sport : un champ tapé 0,5 s avant (autosave pas encore parti) figure au rapport', async () => {
    const lu = [];
    const p = patient({ bilanData: { motif: ANCIEN } });
    const h = avecPatient({
      patient: p,
      page: 'pg-bilan',
      reelles: ['nav', 'buildRapport', ...SAUVEGARDE_SPORT_REELLE],
      tableaux: ['SPORT_BILAN_PHOTO_KEYS'],
      champs: [element({ dataset: { field: 'motif' }, value: RECENT })],
      globales: {
        bilanData: { motif: ANCIEN },
        _resolveSportRapportImages: (bd) => lu.push(clone(bd)),
      },
    });
    h.f.nav('pg-rapport');
    await laisserFiler();
    expect(lu.length, 'rapport construit').toBe(1);
    expect(lu[0].motif).toBe(RECENT);
  });

  it('S2. Posturo : un champ tapé 0,5 s avant figure au rapport', async () => {
    const lu = [];
    const p = patient({ bilanDataPosturo: { id: 'bilan-posturo-fictif', medecin: ANCIEN } });
    const h = avecPatient({
      patient: p,
      page: 'pg-bilan-posturo',
      reelles: ['buildRapportPosturo'],
      dom: { 'po-medecin': element({ value: RECENT }) },
      globales: {
        _resolvePosturoRapportImages: async () => VISUELS_NUS,
        _extractPosturoSections: (d) => (lu.push(clone(d)), []),
      },
    });
    await h.f.buildRapportPosturo();
    await laisserFiler();
    expect(lu.length, 'rapport construit').toBe(1);
    expect(lu[0].medecin).toBe(RECENT);
  });

  it('S3. Sport : un dessin pas encore sauvegardé figure au rapport, et reste « à sauvegarder »', async () => {
    const lu = [];
    const canevas = element({ id: 'morpho-face', _userDirty: true });
    const h = avecPatient({
      page: 'pg-bilan',
      reelles: ['nav', 'buildRapport', ...SAUVEGARDE_SPORT_REELLE],
      tableaux: ['SPORT_BILAN_PHOTO_KEYS'],
      dom: { 'morpho-face': canevas },
      globales: {
        _serializeDrawCanvas: () => IMG_A,
        _resolveSportRapportImages: (bd) => lu.push(clone(bd)),
      },
    });
    h.f.nav('pg-rapport');
    await laisserFiler();
    expect(lu[0]._morpho_face).toBe(IMG_A);
    // L'autosave programmé par le tracé doit encore le sérialiser.
    expect(canevas._userDirty, '_userDirty remis à faux').toBe(true);
  });

  it('S4. Posturo : un dessin pas encore sauvegardé figure au rapport, et reste « à sauvegarder »', async () => {
    const lu = [];
    const canevas = element({
      id: 'posturo-body-canvas',
      _userDirty: true,
      width: 300,
      toDataURL: () => IMG_A,
    });
    const h = avecPatient({
      page: 'pg-bilan-posturo',
      reelles: ['buildRapportPosturo'],
      dom: { 'posturo-body-canvas': canevas },
      globales: {
        _resolvePosturoRapportImages: async (bd) => (lu.push(clone(bd)), VISUELS_NUS),
        _extractPosturoSections: () => [],
      },
    });
    await h.f.buildRapportPosturo();
    await laisserFiler();
    expect(lu[0]._bodyCanvas).toBe(IMG_A);
    expect(canevas._userDirty, '_userDirty remis à faux').toBe(true);
  });

  it('S5. Posturo régénéré depuis la page du rapport : AUCUN balayage du DOM', async () => {
    // Le DOM de pg-bilan-posturo peut appartenir à un autre patient ou être
    // absent : hors du bilan affiché, la capture ne lit que la mémoire.
    const lu = [];
    const p = patient({ bilanDataPosturo: { id: 'bilan-posturo-fictif', medecin: ANCIEN } });
    const h = avecPatient({
      patient: p,
      page: 'pg-rapport-posturo',
      reelles: ['buildRapportPosturo'],
      dom: { 'po-medecin': element({ value: 'valeur d’un autre DOM' }) },
      globales: {
        _resolvePosturoRapportImages: async () => VISUELS_NUS,
        _extractPosturoSections: (d) => (lu.push(clone(d)), []),
      },
    });
    await h.f.buildRapportPosturo();
    await laisserFiler();
    expect(lu[0].medecin).toBe(ANCIEN);
    expect(p.bilanDataPosturo.medecin).toBe(ANCIEN);
  });
});

// ─── C. Course d80c6c8 : un autosave en cours pendant la génération ───────
// Pendant une sauvegarde, migratePhotoEntry retire de l'objet en mémoire
// chaque dataURL déjà envoyée (Path posé) jusqu'à la restauration qui suit
// savePatients. Le rapport ne doit jamais lire ce bilan amputé.
describe('#277 C — un rapport généré pendant un autosave ne lit jamais un bilan amputé', () => {
  it('C1. Sport : 1re photo envoyée, 2e en cours → le rapport a les DEUX images', async () => {
    const lu = [];
    const bd = { _postureFace: IMG_A, _postureDos: IMG_B };
    const p = patient({ bilanData: clone(bd) });
    const h = avecPatient({
      patient: p,
      page: 'pg-rapport',
      envois: ['ok', 'attente'],
      tableaux: ['SPORT_BILAN_PHOTO_KEYS'],
      reelles: [
        'saveBilanSilent',
        'migrateSportBilanDataPhotos',
        'migratePhotoEntry',
        'restoreSportBilanDataPhotosStash',
        '_podoscopePhotoKeys',
        'buildRapport',
      ],
      globales: { bilanData: clone(bd), _resolveSportRapportImages: (b) => lu.push(clone(b)) },
    });
    const autosave = h.f.saveBilanSilent();
    await laisserFiler();
    // Témoin de la fenêtre : la 1re dataURL est retirée de la mémoire.
    expect(h.env.bilanData._postureFacePath, 'fenêtre ouverte').toBeTruthy();
    expect(h.env.bilanData._postureFace, 'fenêtre ouverte').toBeUndefined();
    const rapport = h.f.buildRapport();
    await laisserFiler();
    h.liberer();
    await autosave;
    await rapport;
    await laisserFiler();
    expect(lu.length, 'rapport construit').toBe(1);
    expect(lu[0]._postureFace).toBe(IMG_A);
    expect(lu[0]._postureDos).toBe(IMG_B);
    // Une seule sauvegarde : celle de l'autosave, aucune pour le rapport.
    expect(h.ecritures().filter((e) => e === 'savePatients')).toEqual(['savePatients']);
  });

  it('C2. Posturo : 1re image envoyée, 2e en cours → le rapport a les DEUX images', async () => {
    const lu = [];
    const p = patient({
      bilanDataPosturo: { id: 'bilan-posturo-fictif', _bodyCanvas: IMG_A, _feetComposite: IMG_B },
    });
    const h = avecPatient({
      patient: p,
      page: 'pg-rapport-posturo',
      envois: ['ok', 'attente'],
      tableaux: ['POSTURO_PHOTO_KEYS'],
      reelles: [
        'savePosturoBilan',
        'migratePosturoPhotos',
        'migratePhotoEntry',
        '_galleryDynKeys',
        'buildRapportPosturo',
      ],
      globales: {
        _resolvePosturoRapportImages: async (bd) => (lu.push(clone(bd)), VISUELS_NUS),
        _extractPosturoSections: () => [],
      },
    });
    const autosave = h.f.savePosturoBilan(true);
    await laisserFiler();
    expect(p.bilanDataPosturo._bodyCanvasPath, 'fenêtre ouverte').toBeTruthy();
    expect(p.bilanDataPosturo._bodyCanvas, 'fenêtre ouverte').toBeUndefined();
    const rapport = h.f.buildRapportPosturo();
    await laisserFiler();
    h.liberer();
    await autosave;
    await rapport;
    await laisserFiler();
    expect(lu.length, 'rapport construit').toBe(1);
    expect(lu[0]._bodyCanvas).toBe(IMG_A);
    expect(lu[0]._feetComposite).toBe(IMG_B);
    expect(h.ecritures().filter((e) => e === 'savePatients')).toEqual(['savePatients']);
  });

  it('C3. Une sauvegarde en ÉCHEC referme sa fenêtre : le rapport n’attend pas', async () => {
    vi.useFakeTimers();
    try {
      const lu = [];
      const p = patient({ bilanData: { _postureFace: IMG_A } });
      const h = avecPatient({
        patient: p,
        page: 'pg-rapport',
        reelles: ['saveBilanSilent', 'buildRapport'],
        globales: {
          bilanData: { _postureFace: IMG_A },
          migrateSportBilanDataPhotos: async () => {
            throw new Error('panne simulée');
          },
          _resolveSportRapportImages: (b) => lu.push(clone(b)),
        },
      });
      await h.f.saveBilanSilent().catch(() => {});
      h.f.buildRapport();
      // Aucune attente : la fenêtre de la sauvegarde en échec est refermée.
      await vi.advanceTimersByTimeAsync(0);
      expect(lu.length, 'rapport construit sans attendre').toBe(1);
      expect(lu[0]._postureFace).toBe(IMG_A);
    } finally {
      vi.useRealTimers();
    }
  });

  it('C4. Sport, bouton « Sauvegarder » (saveBilan) en cours → le rapport a les DEUX images', async () => {
    const lu = [];
    const bd = { _postureFace: IMG_A, _postureDos: IMG_B };
    const p = patient({ bilanData: clone(bd) });
    const h = avecPatient({
      patient: p,
      page: 'pg-rapport',
      envois: ['ok', 'attente'],
      tableaux: ['SPORT_BILAN_PHOTO_KEYS'],
      reelles: [...SAUVEGARDE_SPORT_REELLE, 'saveBilan', 'buildRapport'],
      globales: { bilanData: clone(bd), _resolveSportRapportImages: (b) => lu.push(clone(b)) },
    });
    const bouton = h.f.saveBilan();
    await laisserFiler();
    expect(h.env.bilanData._postureFace, 'fenêtre ouverte').toBeUndefined();
    const rapport = h.f.buildRapport();
    await laisserFiler();
    h.liberer();
    await bouton;
    await rapport;
    await laisserFiler();
    expect(lu.length, 'rapport construit').toBe(1);
    expect(lu[0]._postureFace).toBe(IMG_A);
    expect(lu[0]._postureDos).toBe(IMG_B);
  });
});

// ─── D. Attente BORNÉE : un envoi qui ne se termine jamais ────────────────
// Ni uploadPhotoBase64 ni authFetch n'ont de délai d'expiration. Au-delà de
// 15 s, le rapport est construit avec ce qui est disponible, sous une mention
// ROUGE : un rapport amputé ne doit jamais avoir l'air normal (CLAUDE.md).
// Horloge SIMULÉE : aucune attente réelle de 15 s.
const MENTION = "Images en cours d'envoi";

describe('#277 D — envoi bloqué : rapport construit à 15 s, mention rouge visible', () => {
  afterEach(() => vi.useRealTimers());

  // Les TROIS rendus : rapport Sport à l'écran, impression Sport, rapport Posturo.
  const montageSport = (entree, cible) => () => {
    const el = element({ id: cible });
    const p = patient({ bilanData: { _postureFace: IMG_A } });
    const h = avecPatient({
      patient: p,
      page: 'pg-rapport',
      envois: ['attente'],
      tableaux: ['SPORT_BILAN_PHOTO_KEYS'],
      dom: { [cible]: el },
      reelles: [...SAUVEGARDE_SPORT_REELLE, entree, '_buildSportRapportContentHTML'],
      globales: {
        bilanData: { _postureFace: IMG_A },
        _prefetchAllSportMesuresPhotos: async () => {},
        _collectAnnotatedPostureViews: async () => [],
        _resolveSportRapportImages: (_bd, cb) => cb({}, {}),
      },
    });
    return {
      h,
      sauvegarder: () => h.f.saveBilanSilent(),
      generer: () => h.f[entree](),
      // Dernier rendu (chaîne vide tant que rien n'est construit).
      rendu: () => el.innerHTML,
    };
  };
  const montagePosturo = () => {
    const ref = {};
    const p = patient({ bilanDataPosturo: { id: 'bilan-posturo-fictif', _bodyCanvas: IMG_A } });
    const h = avecPatient({
      patient: p,
      page: 'pg-rapport-posturo',
      envois: ['attente'],
      tableaux: ['POSTURO_PHOTO_KEYS'],
      reelles: [
        'savePosturoBilan',
        'migratePosturoPhotos',
        'migratePhotoEntry',
        '_galleryDynKeys',
        'buildRapportPosturo',
        '_doBuildRapport',
      ],
      globales: {
        _resolvePosturoRapportImages: async () => VISUELS_NUS,
        _extractPosturoSections: () => [],
        _buildRapportBody: (...a) => ref.f._doBuildRapport(...a),
      },
    });
    ref.f = h.f;
    return {
      h,
      sauvegarder: () => h.f.savePosturoBilan(true),
      generer: () => h.f.buildRapportPosturo(),
      rendu: () => h.documents().at(-1) || '',
    };
  };
  const RENDUS = [
    {
      nom: 'Sport à l’écran (buildRapport)',
      monter: montageSport('buildRapport', 'rpt-body'),
      titre: 'BILAN',
    },
    {
      nom: 'Sport à l’impression (printReport)',
      monter: montageSport('printReport', 'rp-sections'),
    },
    { nom: 'Posturo (iframe)', monter: montagePosturo, titre: 'Bilan Étude de la Posture' },
  ];

  for (const r of RENDUS) {
    it(`D1. ${r.nom} : envoi jamais terminé → rien avant 15 s, rapport + mention à 15 s`, async () => {
      vi.useFakeTimers();
      const m = r.monter();
      m.sauvegarder();
      await vi.advanceTimersByTimeAsync(0);
      const g = m.generer();
      await vi.advanceTimersByTimeAsync(14999);
      expect(m.rendu(), 'rapport construit avant 15 s').toBe('');
      await vi.advanceTimersByTimeAsync(1);
      // Vérifié AVANT d'attendre la fin : un délai plus long échoue par assertion.
      expect(m.rendu(), 'rapport construit à 15 s').not.toBe('');
      await g;
      if (r.titre) expect(m.rendu()).toContain(r.titre);
      expect(m.rendu()).toContain(MENTION);
      expect(m.rendu()).toContain('#c0392b');
    });

    it(`D2. ${r.nom} : envoi terminé avant 15 s → rapport SANS mention`, async () => {
      vi.useFakeTimers();
      const m = r.monter();
      m.sauvegarder();
      await vi.advanceTimersByTimeAsync(0);
      const g = m.generer();
      await vi.advanceTimersByTimeAsync(1000);
      expect(m.rendu(), 'le rapport attend la fin de l’envoi').toBe('');
      m.h.liberer();
      await vi.advanceTimersByTimeAsync(0);
      await g;
      expect(m.rendu(), 'rapport construit').not.toBe('');
      expect(m.rendu()).not.toContain(MENTION);
    });

    it(`D3. ${r.nom} : remise à zéro — 1re génération expirée (mention), 2e après l’envoi (sans)`, async () => {
      vi.useFakeTimers();
      const m = r.monter();
      m.sauvegarder();
      await vi.advanceTimersByTimeAsync(0);
      const g1 = m.generer();
      await vi.advanceTimersByTimeAsync(15000);
      expect(m.rendu(), '1re génération').toContain(MENTION);
      await g1;
      m.h.liberer();
      await vi.advanceTimersByTimeAsync(0);
      const g2 = m.generer();
      await vi.advanceTimersByTimeAsync(0);
      await g2;
      expect(m.rendu(), '2e génération').not.toBe('');
      expect(m.rendu(), '2e génération').not.toContain(MENTION);
    });
  }
});
