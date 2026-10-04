import { describe, it, expect } from 'vitest';
import { fonction, tableau } from './helpers/extraire-biomeca.mjs';

// ═══════════════════════════════════════════════════════════════════
// fix/269 — échec de synchronisation : jamais de « data: » dans le stockage local
// ═══════════════════════════════════════════════════════════════════
//
// savePatients filtre les dataURLs (celles qui ont un path Storage jumeau)
// avant d'écrire bm4-patients:<uid>, puis RESTAURE la mémoire. Mais :
//   - saveToSupabase, sur ÉCHEC (exception ou réponse non OK), réécrivait
//     JSON.stringify(patients) APRÈS ses await, donc sur la mémoire restaurée,
//     dataURLs comprises ;
//   - loadSupabaseData, en repli hors ligne, réécrivait la mémoire lue sans
//     filtre après la migration des drapeaux (#39).
// Règle : TOUTE écriture des patients dans le stockage local passe par le
// même filtre, et la mémoire reste intacte après l'écriture.
// Données synthétiques ; dataURL factice.

const IMG = 'data:image/jpeg;base64,QUJD';
const UID = 'utilisateur-synthetique';
const CLE = 'bm4-patients:' + UID;

// Patient en mémoire : une photo de test déjà envoyée (path + dataUrl
// restaurée en mémoire) et une capture posturale envoyée (_postureFace + Path).
const patientFictif = () => ({
  id: 'patient-synthetique',
  nom: 'Fictif',
  mesures: {
    verrou: {
      photos: [{ label: 'Statique bipodal D', side: 'D', path: 'u/v.jpg', dataUrl: IMG, angle: 2 }],
    },
  },
  bilanData: { _postureFace: IMG, _postureFacePath: 'u/f.jpg' },
});

function charger(opts = {}) {
  const code = `
    const stockage = new Map(${JSON.stringify(Object.entries(opts.stockage || {}))});
    const localStorage = {
      getItem: (k) => (stockage.has(k) ? stockage.get(k) : null),
      setItem: (k, v) => { stockage.set(k, String(v)); },
      removeItem: (k) => { stockage.delete(k); },
      get length() { return stockage.size; },
      key: (i) => [...stockage.keys()][i] ?? null,
    };
    let pwaUser = { id: ${JSON.stringify(UID)}, token: 'jeton-synthetique' };
    let patients = [], praticiens = [], currentPatient = null, bilanData = {};
    let _dataLoaded = true, _loadedFromFallback = false, _syncErrorShown = false;
    const reponse = ${JSON.stringify(opts.reponse || 'exception')};
    const supa = {
      async saveData() { await null; if (reponse === 'exception') throw new Error('réseau indisponible'); return false; },
      async loadData() { await null; throw new Error('réseau indisponible'); },
    };
    const console = { log() {}, warn() {}, error() {}, info() {} };
    function _showSyncErrorBanner() {}
    function _hideSyncErrorBanner() {}
    function renderPatientList() {}
    function renderPratList() {}
    function populatePratSelect() {}
    function selectPatient() {}
    ${tableau('SPORT_BILAN_PHOTO_KEYS')}
    ${tableau('POSTURO_PHOTO_KEYS')}
    ${tableau('PODOPEDIATRIE_PHOTO_KEYS')}
    ${tableau('PEDICURIE_GALLERY_DEFS')}
    ${['_scopedKey', '_galleryDynKeys', '_pedicurieDynKeys', '_stripDataURLsForPersist', '_restoreDataURLsAfterPersist', 'migrateBilanFlags', 'saveToSupabase', 'loadSupabaseData'].map(fonction).join('\n')}
    return {
      saveToSupabase, loadSupabaseData,
      poser(p) { patients = p; },
      patients: () => patients,
      ecrit: () => stockage.get(${JSON.stringify(CLE)}),
    };
  `;
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  return new Function(code)();
}

describe('fix/269 — saveToSupabase en échec : écriture locale filtrée', () => {
  for (const reponse of ['exception', 'non-ok']) {
    it(`B0 (${reponse}). Rien de ce qui est écrit dans bm4-patients:<uid> ne contient « data: » ; la mémoire reste intacte`, async () => {
      const env = charger({ reponse });
      env.poser([patientFictif()]);
      await env.saveToSupabase();
      const ecrit = env.ecrit();
      expect(typeof ecrit, 'écriture locale de repli effectuée').toBe('string');
      expect(ecrit.length).toBeGreaterThan(50);
      expect(ecrit, 'dataURL écrite dans le stockage local').not.toContain('data:');
      // Les chemins Storage, eux, sont bien écrits.
      expect(ecrit).toContain('u/v.jpg');
      expect(ecrit).toContain('u/f.jpg');
      // Mémoire INTACTE après l'écriture : l'affichage garde ses images.
      const p = env.patients()[0];
      expect(p.mesures.verrou.photos[0].dataUrl).toBe(IMG);
      expect(p.bilanData._postureFace).toBe(IMG);
    });
  }
});

describe('fix/269 — loadSupabaseData en repli hors ligne : réécriture filtrée', () => {
  it('B1. Migration des drapeaux (#39) au repli : la réécriture ne contient pas « data: » ; la mémoire chargée reste intacte', async () => {
    // Stockage local déjà pollué (cas produit par l'ancien défaut) et drapeaux
    // d'avant #39 à migrer : le repli réécrit la clé.
    const p = { ...patientFictif(), currentBilanType: 'sport', currentBilanSousType: 'initial' };
    const env = charger({ stockage: { [CLE]: JSON.stringify([p]) } });
    expect(env.ecrit(), 'témoin : le stockage de départ contient « data: »').toContain('data:');
    await env.loadSupabaseData();
    const ecrit = env.ecrit();
    expect(ecrit, 'drapeaux migrés et réécrits').toContain('"currentBilanSportSousType":"initial"');
    expect(ecrit, 'dataURL réécrite dans le stockage local').not.toContain('data:');
    expect(ecrit).toContain('u/v.jpg');
    const m = env.patients()[0];
    expect(m.mesures.verrou.photos[0].dataUrl).toBe(IMG);
    expect(m.bilanData._postureFace).toBe(IMG);
  });
});

describe('fix/269 — garde-fou : une dataURL SANS path est la seule copie, elle reste écrite', () => {
  // Photo jamais envoyée : dataUrl seule, aucun path. Le filtre ne retire QUE
  // les dataURLs qui ont un path Storage jumeau ; celle-ci n'existe nulle part
  // ailleurs et doit rester dans bm4-patients:<uid>.
  const SEULE = 'data:image/jpeg;base64,U0VVTEVDT1BJRQ==';
  const avecSeuleCopie = () => {
    const p = patientFictif();
    p.mesures.verrou.photos.push({
      label: 'Pointe pieds D',
      side: 'D',
      path: null,
      dataUrl: SEULE,
      angle: 8,
    });
    return p;
  };
  const verifier = (ecrit, cas) => {
    expect(typeof ecrit, `${cas} : écriture effectuée`).toBe('string');
    expect(ecrit, `${cas} : dataURL SANS path, seule copie, conservée`).toContain(SEULE);
    expect(ecrit, `${cas} : dataURL AVEC path retirée`).not.toContain(IMG);
  };

  it('B2. Exception, non OK, repli de chargement : la seule copie reste écrite, les dataURLs avec path sont retirées', async () => {
    for (const reponse of ['exception', 'non-ok']) {
      const env = charger({ reponse });
      env.poser([avecSeuleCopie()]);
      await env.saveToSupabase();
      verifier(env.ecrit(), reponse);
    }
    const p = { ...avecSeuleCopie(), currentBilanType: 'sport', currentBilanSousType: 'initial' };
    const env = charger({ stockage: { [CLE]: JSON.stringify([p]) } });
    await env.loadSupabaseData();
    verifier(env.ecrit(), 'repli de chargement');
  });
});
