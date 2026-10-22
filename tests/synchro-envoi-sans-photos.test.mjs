import { describe, it, expect } from 'vitest';
import { fonction, tableau } from './helpers/extraire-biomeca.mjs';

// ═══════════════════════════════════════════════════════
// Envoi au cloud : jamais de photo « data: » déjà envoyée dans Storage
// ═══════════════════════════════════════════════════════
// Constat (22/10/2026) : un dossier de 11 Mo dépassait le délai de 8 s de la base (erreur 57014).
// savePatients filtre les photos (celles qui ont un chemin Storage jumeau) avant d'envoyer ;
// savePraticiens appelait saveToSupabase SANS ce filtre et renvoyait les photos en texte.
// Règle : l'envoi au cloud filtre lui-même, quel que soit l'appelant, et la mémoire reste intacte.
// Données synthétiques ; dataURL factice.

const IMG = 'data:image/jpeg;base64,' + 'QUJD'.repeat(50);
const UID = 'utilisateur-synthetique';

const patientFictif = () => ({
  id: 'patient-synthetique',
  nom: 'Fictif',
  mesures: { verrou: { photos: [{ side: 'D', path: 'u/v.jpg', dataUrl: IMG }] } },
  // _postureFace : déjà envoyée (chemin jumeau) ; _postureDos : PAS encore envoyée (aucun chemin).
  bilanData: { _postureFace: IMG, _postureFacePath: 'u/f.jpg', _postureDos: IMG },
});

function charger(reponse = 'ok') {
  const code = `
    const stockage = new Map();
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
    let _nonSyncSeq = 0, _dernierSyncCloudAt = null;
    const envoyes = [];
    const supa = {
      async saveData(_t, d) {
        envoyes.push(JSON.stringify(d.data));
        await null;
        if (${JSON.stringify(reponse)} === 'exception') throw new Error('réseau indisponible');
        return true;
      },
      async loadData() { await null; throw new Error('réseau indisponible'); },
    };
    const console = { log() {}, warn() {}, error() {}, info() {} };
    function _showSyncErrorBanner() {}
    function _hideSyncErrorBanner() {}
    ${tableau('SPORT_BILAN_PHOTO_KEYS')}
    ${tableau('POSTURO_PHOTO_KEYS')}
    ${tableau('PODOPEDIATRIE_PHOTO_KEYS')}
    ${tableau('PEDICURIE_GALLERY_DEFS')}
    ${['_scopedKey', '_lireMarqueurNonSync', '_marquerNonSynchronise', '_confirmerSyncCloud', '_recupererSaisieNonSynchronisee', '_countDataUnits', '_galleryDynKeys', '_pedicurieDynKeys', '_stripDataURLsForPersist', '_restoreDataURLsAfterPersist', 'saveToSupabase'].map(fonction).join('\n')}
    return { saveToSupabase, poser(p, pr) { patients = p; praticiens = pr; }, patients: () => patients, envoyes };
  `;
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  return new Function(code)();
}

describe('envoi au cloud sans photo déjà envoyée', () => {
  for (const reponse of ['ok', 'exception']) {
    it(`l'envoi (${reponse}) ne contient aucune photo qui a un chemin Storage ; la mémoire reste intacte`, async () => {
      const env = charger(reponse);
      env.poser([patientFictif()], [{ id: 7, nom: 'Dr Fictif' }]);
      await env.saveToSupabase();
      expect(env.envoyes.length).toBeGreaterThan(0);
      const corps = env.envoyes[0];
      // Témoins : les chemins et le praticien sont bien partis.
      expect(corps).toContain('u/v.jpg');
      expect(corps).toContain('u/f.jpg');
      expect(corps).toContain('Dr Fictif');
      // La photo de mesure et la capture déjà envoyées n'y sont plus (une seule occurrence : la capture SANS chemin).
      expect(
        corps.split('data:image').length - 1,
        'photos déjà envoyées renvoyées dans le dossier'
      ).toBe(1);
      // Mémoire intacte : l'affichage garde ses images.
      const p = env.patients()[0];
      expect(p.mesures.verrou.photos[0].dataUrl).toBe(IMG);
      expect(p.bilanData._postureFace).toBe(IMG);
      expect(p.bilanData._postureDos).toBe(IMG);
    });
  }
  it('une photo PAS encore envoyée (aucun chemin) n’est jamais retirée : aucune perte possible', async () => {
    const env = charger('ok');
    env.poser([patientFictif()], [{ id: 7 }]);
    await env.saveToSupabase();
    expect(JSON.parse(env.envoyes[0]).patients[0].bilanData._postureDos).toBe(IMG);
  });
  it('le corps est envoyé en entier, une seule fois (jamais deux sérialisations différentes)', async () => {
    const env = charger('ok');
    env.poser([patientFictif()], [{ id: 7 }]);
    await env.saveToSupabase();
    expect(env.envoyes).toHaveLength(1);
  });
});
