// ═══════════════════════════════════════════════════════════════════
// A2 / PR 1 — fermeture d'onglet : trous 8.1 et 8.3
// ═══════════════════════════════════════════════════════════════════
//
// 8.1 : une saisie faite < 1 s avant la fermeture de l'onglet est écrite
//       (la partie synchrone de la sauvegarde s'exécute avant tout await).
// 8.3 : fermer l'onglet pendant l'envoi d'une photo ne perd ni le texte ni la
//       photo : écriture locale AVANT l'envoi + marqueur « non synchronisé ».
// Reprise : au démarrage (cloud joignable), la saisie locale n'est reprise que
//       si le cloud est resté à la base du marqueur ; sinon copie à part,
//       rien d'écrasé, rien de supprimé.
//
// Les fonctions sont EXTRAITES de js/biomeca.js et exécutées ; le stockage
// local, le réseau et les dialogues sont simulés en mémoire.
// Données FICTIVES uniquement.

import { describe, it, expect } from 'vitest';
import { fonction, tableau, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const IMG = 'data:image/jpeg;base64,QUJD';
const FONCTIONS = [
  '_scopedKey',
  '_lireMarqueurNonSync',
  '_marquerNonSynchronise',
  '_confirmerSyncCloud',
  '_ecrireLocalAvantEnvoi',
  '_recupererSaisieNonSynchronisee',
  '_stripDataURLsForPersist',
  '_restoreDataURLsAfterPersist',
  '_countDataUnits',
  '_galleryDynKeys',
  '_pedicurieDynKeys',
  '_lancerSauvegardeAutomatique',
  '_scheduleBilanAutosave',
  '_viderAutosaveAvantFermeture',
  'savePedicurieBilan',
];

function monter(o = {}) {
  const mem = new Map(Object.entries(o.stockage || {}));
  const journal = { setItem: [], removeItem: [], dialogues: [], envois: [], avertissements: [] };
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => (journal.setItem.push(k), mem.set(k, String(v))),
    removeItem: (k) => (journal.removeItem.push(k), mem.delete(k)),
  };
  let liberer = () => {};
  const attente = new Promise((ok) => (liberer = ok));
  const champs = o.champs || [];
  const documentSimule = {
    visibilityState: 'visible',
    addEventListener() {},
    querySelectorAll: (sel) => (sel === '#pg-pedicurie .pedicurie-field' ? champs : []),
    getElementById: () => null,
  };
  const globales = {
    localStorage,
    document: documentSimule,
    window: { addEventListener() {} },
    pwaUser: { id: 'u-fictif' },
    _dataLoaded: true,
    currentPatient: null,
    patients: [],
    crypto: { randomUUID: () => 'uuid-fictif' },
    console: { log() {}, warn: (...a) => journal.avertissements.push(a.join(' ')), error() {} },
    JSON,
    Date,
    Math,
    Number,
    Array,
    Object,
    Promise,
    setTimeout: (...a) => globalThis.setTimeout(...a),
    clearTimeout: (...a) => globalThis.clearTimeout(...a),
    alert: (m) => journal.dialogues.push(String(m).split('\n')[0]),
    confirm: () => false,
    // envoi des photos : en attente tant que le test ne le libère pas
    migratePedicuriePhotos: async () => {
      journal.envois.push('migration démarrée');
      await attente;
      return {};
    },
    syncOpenedBilanPedicurieToHistory() {},
    savePatients: () => (journal.setItem.push('savePatients'), true),
    restorePedicuriePhotosStash() {},
    ...(o.globales || {}),
  };
  const corps = [
    ...[
      'PODOPEDIATRIE_PHOTO_KEYS',
      'POSTURO_PHOTO_KEYS',
      'SPORT_BILAN_PHOTO_KEYS',
      'PEDICURIE_GALLERY_DEFS',
    ].map(tableau),
    'let _nonSyncSeq = 0, _dernierSyncCloudAt = ' +
      JSON.stringify(o.baseCloud ?? null) +
      ', _urgenceFermeture = false;',
    'let _bilanAutosaveTimer = null, _bilanAutosaveFlavor = null;',
    // Fonction absente de la version lue (main, avant A2) : remplacée par un
    // no-op, pour que le test échoue par ASSERTION et non par erreur de harnais.
    ...FONCTIONS.map((n) =>
      SRC_BIOMECA.includes('\nfunction ' + n + '(') ||
      SRC_BIOMECA.includes('\nasync function ' + n + '(')
        ? fonction(n)
        : `function ${n}() {}`
    ),
    `return { ${FONCTIONS.join(', ')}, etat: () => ({ _nonSyncSeq, _dernierSyncCloudAt, _bilanAutosaveFlavor }) };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function('env', `with (env) { ${corps} }`)(
    new Proxy(globales, {
      has: () => true,
      get: (t, k) => (k in t ? t[k] : undefined),
      set: (t, k, v) => ((t[k] = v), true),
    })
  );
  return {
    f,
    mem,
    journal,
    globales,
    liberer,
    lire: (k) => JSON.parse(mem.has(k) ? mem.get(k) : 'null'),
  };
}

const patient = (o = {}) => ({
  id: 'p-fictif',
  nom: 'Fictif',
  bilanDataPedicurie: { id: 'b-fictif' },
  ...o,
});
const champTexte = (champ, valeur) => ({ dataset: { field: champ }, type: 'text', value: valeur });
const K = 'bm4-patients:u-fictif';
const M = 'bm4-nonsync:u-fictif';
const attendre = (ms = 0) => new Promise((ok) => setTimeout(ok, ms));

describe('8.1 — saisie < 1 s avant la fermeture', () => {
  it('le vidage écrit tout de suite, sans attendre le débounce ni un await', () => {
    const p = patient();
    const env = monter({
      globales: { currentPatient: p, patients: [p] },
      champs: [champTexte('motif', 'saisie à t−0,5 s')],
    });
    env.f._scheduleBilanAutosave('pedicurie');
    expect(env.f.etat()._bilanAutosaveFlavor).toBe('pedicurie');
    expect(env.mem.has(K)).toBe(false); // débounce non écoulé : rien d'écrit
    env.f._viderAutosaveAvantFermeture(); // pagehide — SYNCHRONE : aucun await avant la lecture ci-dessous
    expect(env.journal.avertissements).toEqual([]);
    expect(env.lire(K)?.[0]?.bilanDataPedicurie.motif).toBe('saisie à t−0,5 s');
    expect(env.lire(M)?.seq).toBeGreaterThan(0);
    expect(env.f.etat()._bilanAutosaveFlavor).toBe(null);
    env.liberer();
  });

  it("sans saisie en attente, la fermeture n'écrit rien (témoin : le vidage a bien été appelé)", () => {
    const p = patient();
    const env = monter({ globales: { currentPatient: p, patients: [p] } });
    env.f._viderAutosaveAvantFermeture();
    expect(env.journal.setItem).toEqual([]);
    expect(env.f.etat()._bilanAutosaveFlavor).toBe(null);
    env.liberer();
  });

  it('le minuteur annulé ne sauvegarde pas une seconde fois', async () => {
    const p = patient();
    const env = monter({
      globales: { currentPatient: p, patients: [p] },
      champs: [champTexte('motif', 'x')],
    });
    env.f._scheduleBilanAutosave('pedicurie');
    env.f._viderAutosaveAvantFermeture();
    const n = env.journal.envois.length;
    await attendre(1200);
    expect(env.journal.envois.length).toBe(n);
    env.liberer();
  });
});

describe("8.3 — fermeture pendant l'envoi d'une photo", () => {
  it("texte ET photo non envoyée sont écrits localement avant l'envoi réseau", async () => {
    const p = patient({ bilanDataPedicurie: { id: 'b-fictif', _ped_photo: IMG } });
    const env = monter({
      globales: { currentPatient: p, patients: [p] },
      champs: [champTexte('motif', 'texte avant photo')],
    });
    const fin = env.f.savePedicurieBilan(true); // envoi en attente : l'onglet se ferme ici
    await attendre(5);
    expect(env.journal.envois).toEqual(['migration démarrée']); // témoin : on est bien pendant l'envoi
    expect(env.journal.setItem).not.toContain('savePatients'); // savePatients n'a pas eu lieu
    expect(env.journal.avertissements).toEqual([]);
    const local = env.lire(K)?.[0]?.bilanDataPedicurie;
    expect(local?.motif).toBe('texte avant photo');
    expect(local?._ped_photo).toBe(IMG);
    expect(env.lire(M)?.seq).toBeGreaterThan(0);
    env.liberer();
    await fin;
  });

  it("une sauvegarde de texte seul n'ajoute aucune écriture locale anticipée", async () => {
    const p = patient();
    const env = monter({
      globales: { currentPatient: p, patients: [p] },
      champs: [champTexte('motif', 'texte seul')],
    });
    env.liberer();
    await env.f.savePedicurieBilan(true);
    expect(env.journal.setItem).toEqual(['savePatients']); // témoin : la sauvegarde est allée au bout
  });
});

describe("marqueur : posé à l'écriture, effacé à la confirmation du cloud", () => {
  it('confirmation après la dernière écriture : marqueur effacé, base à jour', () => {
    const env = monter({ baseCloud: 'T0' });
    env.f._marquerNonSynchronise();
    const seq = env.lire(M)?.seq;
    expect(env.lire(M)?.base).toBe('T0');
    env.f._confirmerSyncCloud(seq, 'T1');
    expect(env.mem.has(M)).toBe(false);
    expect(env.f.etat()._dernierSyncCloudAt).toBe('T1');
  });

  it("écriture plus récente que l'envoi confirmé : marqueur conservé, base avancée", () => {
    const env = monter({ baseCloud: 'T0' });
    env.f._marquerNonSynchronise();
    const seqEnvoye = env.lire(M)?.seq;
    env.f._marquerNonSynchronise(); // saisie pendant l'envoi
    env.f._confirmerSyncCloud(seqEnvoye, 'T1');
    expect(env.lire(M)?.base).toBe('T1');
    expect(env.lire(M)?.seq).toBeGreaterThan(seqEnvoye);
  });

  it("la base d'un marqueur existant n'avance pas aux écritures suivantes", () => {
    const env = monter({ baseCloud: 'T0' });
    env.f._marquerNonSynchronise();
    env.globales.pwaUser = { id: 'u-fictif' };
    env.f._marquerNonSynchronise();
    expect(env.lire(M)?.base).toBe('T0');
  });
});

describe('reprise au démarrage', () => {
  const locaux = [
    patient({ bilanDataPedicurie: { id: 'b', motif: 'saisie locale' } }),
    patient({ id: 'p2' }),
  ];
  const cloud = [
    patient({ bilanDataPedicurie: { id: 'b', motif: 'ancien' } }),
    patient({ id: 'p2' }),
  ];
  const base = (b) => ({ seq: 5, t: '2026-10-20T10:00:00.000Z', base: b });

  it("cloud resté à la base du marqueur : la saisie locale est reprise (formats d'horodatage différents)", () => {
    const env = monter({
      stockage: {
        [K]: JSON.stringify(locaux),
        [M]: JSON.stringify(base('2026-10-19T23:55:50.759Z')),
      },
      globales: { patients: cloud },
    });
    const repris = env.f._recupererSaisieNonSynchronisee('2026-10-19T23:55:50.759+00:00');
    expect(repris).toBe(true);
    expect(env.globales.patients[0].bilanDataPedicurie.motif).toBe('saisie locale');
  });

  it("cloud modifié depuis : rien n'est écrasé, copie conservée à part, dialogue, marqueur retiré", () => {
    const env = monter({
      stockage: {
        [K]: JSON.stringify(locaux),
        [M]: JSON.stringify(base('2026-10-19T23:55:50.759Z')),
      },
      globales: { patients: cloud },
    });
    const repris = env.f._recupererSaisieNonSynchronisee('2026-10-20T09:00:00.000+00:00');
    expect(repris).toBe(false);
    expect(env.globales.patients[0].bilanDataPedicurie.motif).toBe('ancien');
    const copie = [...env.mem.keys()].find((k) => k.startsWith('bm4-recuperation:u-fictif:'));
    expect(JSON.parse(env.mem.get(copie) ?? 'null')?.[0]?.bilanDataPedicurie?.motif).toBe(
      'saisie locale'
    );
    expect(env.mem.has(M)).toBe(false);
    expect(env.journal.dialogues.length).toBe(1);
  });

  it('version locale plus pauvre que le cloud : jamais appliquée (copie à part)', () => {
    const pauvre = [patient({ bilanDataPedicurie: {} })];
    const riche = [
      patient({ bilanDataPedicurie: { id: 'b', a: '1', b: '2', c: '3' } }),
      patient({ id: 'p2' }),
    ];
    const env = monter({
      stockage: {
        [K]: JSON.stringify(pauvre),
        [M]: JSON.stringify(base('2026-10-19T23:55:50.759Z')),
      },
      globales: { patients: riche },
    });
    // même base que le marqueur : seule la richesse empêche la reprise
    expect(env.f._recupererSaisieNonSynchronisee('2026-10-19T23:55:50.759+00:00')).toBe(false);
    expect(env.globales.patients).toBe(riche);
    expect([...env.mem.keys()].some((k) => k.startsWith('bm4-recuperation:'))).toBe(true);
  });

  it('sans marqueur, ou stockage local illisible : aucune action, marqueur conservé si illisible', () => {
    const a = monter({ globales: { patients: cloud } });
    expect(a.f._recupererSaisieNonSynchronisee('B')).toBe(false);
    const b = monter({
      stockage: { [K]: '{pas du json', [M]: JSON.stringify(base('B')) },
      globales: { patients: cloud },
    });
    expect(b.f._recupererSaisieNonSynchronisee('B')).toBe(false);
    expect(b.mem.has(M)).toBe(true);
    expect(b.journal.dialogues).toEqual([]);
  });
});

describe('branchement (lecture statique du code de démarrage)', () => {
  it('pagehide et visibilitychange (page masquée) vident la saisie en attente', () => {
    expect(SRC_BIOMECA).toMatch(
      /window\.addEventListener\('pagehide', _viderAutosaveAvantFermeture\)/
    );
    expect(SRC_BIOMECA).toMatch(
      /document\.addEventListener\('visibilitychange', function\(\) \{\s*if \(document\.visibilityState === 'hidden'\) _viderAutosaveAvantFermeture\(\);/
    );
  });
  it("les 5 sauvegardes écrivent en local avant l'envoi des photos", () => {
    expect(SRC_BIOMECA.split('_ecrireLocalAvantEnvoi(').length - 1).toBe(1 + 5); // définition + 5 appels
  });
  it('saveToSupabase confirme au cloud ; le démarrage reprend la saisie locale', () => {
    expect(SRC_BIOMECA).toContain('_confirmerSyncCloud(_seqEnvoi, _horodatage)');
    expect(SRC_BIOMECA).toContain(
      '_saisieRecuperee = _recupererSaisieNonSynchronisee(myRow.updated_at)'
    );
  });
});
