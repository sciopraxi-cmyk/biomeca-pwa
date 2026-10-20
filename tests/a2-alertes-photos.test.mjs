// ═══════════════════════════════════════════════════════════════════
// A2 / PR 2 — alertes de stockage uniques (8.4), échec d'envoi de photo
// visible (8.5), galeries : échec de rechargement visible, avec « Réessayer »
// ═══════════════════════════════════════════════════════════════════
// Fonctions EXTRAITES de js/biomeca.js et js/storage.js, exécutées avec un
// stockage, un réseau et des dialogues simulés. Données FICTIVES uniquement.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, ligneConst, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const SRC_STORAGE = readFileSync(join(RACINE, 'js/storage.js'), 'utf8');
function fonctionStorage(nom) {
  for (const tete of [`\nasync function ${nom}(`, `\nfunction ${nom}(`]) {
    if (SRC_STORAGE.includes(tete)) {
      const i = SRC_STORAGE.indexOf(tete) + 1;
      return SRC_STORAGE.slice(i, SRC_STORAGE.indexOf('\n}\n', i) + 2);
    }
  }
  return `function ${nom}() {}`; // absente (main avant A2) : no-op, le test échoue par assertion
}
const presente = (n) =>
  SRC_BIOMECA.includes('\nfunction ' + n + '(') ||
  SRC_BIOMECA.includes('\nasync function ' + n + '(');
const biomeca = (n) => (presente(n) ? fonction(n) : `function ${n}() {}`);
const MO = 1024 * 1024;

function exec(corps, globales) {
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function('env', `with (env) { ${corps} }`)(
    new Proxy(globales, {
      has: () => true,
      get: (t, k) => (k in t ? t[k] : undefined),
      set: (t, k, v) => ((t[k] = v), true),
    })
  );
}

// ─── 8.4 : savePatients et ses alertes de stockage ───────────────────
function monterStockage(o = {}) {
  const mem = new Map();
  const dialogues = [];
  const bandeaux = {}; // id → { affiche, texte }
  const etat = { quota: false };
  const el = (id) =>
    (bandeaux[id] ??= {
      style: {},
      get textContent() {
        return this._t;
      },
      set textContent(v) {
        this._t = v;
      },
    });
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      if (etat.quota) {
        const e = new Error('The quota has been exceeded');
        e.name = 'QuotaExceededError';
        throw e;
      }
      mem.set(k, String(v));
    },
    removeItem: (k) => mem.delete(k),
    get length() {
      return mem.size;
    },
    key: (i) => [...mem.keys()][i] ?? null,
  };
  const noms = [
    '_afficherBandeau',
    '_masquerBandeau',
    '_signalerStockagePlein',
    '_stockageRetabli',
    '_scopedKey',
    '_lireMarqueurNonSync',
    '_marquerNonSynchronise',
    '_countDataUnits',
    'savePatients',
  ];
  const f = exec(
    [
      ...['STORAGE_QUOTA_BYTES', 'STORAGE_WARNING_THRESHOLD', 'STORAGE_CRITICAL_THRESHOLD'].map(
        ligneConst
      ),
      'let _stockageIncident = false, _quotaWarningShown = false, _intentionalReduction = false;',
      'let _nonSyncSeq = 0, _dernierSyncCloudAt = null;',
      ...noms.map(biomeca),
      `return { ${noms.join(', ')} };`,
    ].join('\n'),
    {
      localStorage,
      document: { getElementById: el },
      pwaUser: { id: 'u-fictif' },
      patients: [{ id: 'p', nom: 'Fictif' }],
      currentPatient: null,
      JSON,
      Date,
      Math,
      Number,
      Array,
      Object,
      Promise,
      console: { log() {}, warn() {}, error() {} },
      alert: (m) => dialogues.push(String(m).split('\n')[0]),
      confirm: () => true,
      getBioMecaStorageBytes: () => {
        let n = 0;
        for (const [k, v] of mem) if (k.startsWith('bm4-')) n += (k.length + v.length) * 2;
        return n;
      },
      _stripDataURLsForPersist: () => [],
      _restoreDataURLsAfterPersist() {},
      saveToSupabase() {},
      _syncPatientToNormalizedTables() {},
    }
  );
  // remplissage : octets déjà occupés par d'autres clés de l'application
  if (o.remplissageCaracteres) mem.set('bm4-autre', 'x'.repeat(o.remplissageCaracteres));
  return { f, etat, dialogues, bandeaux, mem };
}

describe('8.4 — alerte de stockage unique', () => {
  it('stockage critique : une seule boîte de dialogue sur 3 sauvegardes, le bandeau reste affiché', () => {
    const e = monterStockage({ remplissageCaracteres: 5_000_000 });
    const r = [e.f.savePatients(), e.f.savePatients(), e.f.savePatients()];
    expect(r).toEqual([false, false, false]); // témoin : chaque sauvegarde est bien refusée
    expect(e.dialogues).toEqual(['⚠️ ESPACE DE STOCKAGE CRITIQUE']);
    expect(e.bandeaux['stockage-banner']?.style.display).toBe('block');
    expect(e.bandeaux['stockage-banner-text']?.textContent).toContain('PAS enregistrées');
  });

  it("erreur de quota à l'écriture : une seule boîte de dialogue sur 3 sauvegardes", () => {
    const e = monterStockage();
    e.etat.quota = true;
    const r = [e.f.savePatients(), e.f.savePatients(), e.f.savePatients()];
    expect(r).toEqual([false, false, false]);
    expect(e.dialogues).toEqual(['⚠️ ESPACE DE STOCKAGE PLEIN']);
    expect(e.bandeaux['stockage-banner']?.style.display).toBe('block');
  });

  it("un enregistrement réussi lève l'incident : bandeau masqué, un nouvel incident alerte à nouveau", () => {
    const e = monterStockage();
    e.etat.quota = true;
    e.f.savePatients();
    e.etat.quota = false;
    expect(e.f.savePatients()).toBe(true); // témoin : la sauvegarde réussit
    expect(e.bandeaux['stockage-banner']?.style.display).toBe('none');
    e.etat.quota = true;
    e.f.savePatients();
    expect(e.dialogues).toEqual(['⚠️ ESPACE DE STOCKAGE PLEIN', '⚠️ ESPACE DE STOCKAGE PLEIN']);
  });

  it('sans incident : aucune boîte de dialogue, aucun bandeau', () => {
    const e = monterStockage();
    expect(e.f.savePatients()).toBe(true);
    expect(e.dialogues).toEqual([]);
    expect(e.bandeaux['stockage-banner']?.style.display).not.toBe('block');
  });
});

// ─── 8.5 : échec d'envoi de photo ────────────────────────────────────
describe("8.5 — échec d'envoi de photo visible", () => {
  const IMG = 'data:image/jpeg;base64,QUJD';
  function monterEnvoi(reponse) {
    const bandeaux = {};
    const win = {};
    const el = (id) => (bandeaux[id] ??= { style: {}, textContent: '' });
    const f = exec(
      [
        ...['_afficherBandeau', '_signalerEchecEnvoiPhoto'].map(biomeca),
        fonctionStorage('uploadPhotoBase64'),
        'return { uploadPhotoBase64, _signalerEchecEnvoiPhoto };',
      ].join('\n'),
      {
        document: { getElementById: el },
        window: win,
        SUPA_URL: 'https://exemple.invalid',
        STORAGE_BUCKET: 'b',
        encodeStoragePath: (p) => p,
        dataUrlToBlob: () => ({ type: 'image/jpeg' }),
        authFetch: async () => {
          if (reponse === 'exception') throw new Error('réseau');
          return { ok: reponse === 'ok', status: 500, text: async () => 'erreur' };
        },
      }
    );
    Object.assign(win, f); // window._signalerEchecEnvoiPhoto, comme dans le navigateur
    return { f, bandeaux };
  }
  for (const reponse of ['non-ok', 'exception']) {
    it(`envoi en échec (${reponse}) : bandeau affiché`, async () => {
      const e = monterEnvoi(reponse);
      const r = await e.f.uploadPhotoBase64(IMG, 'u/p/b/photo.jpg');
      expect(r.ok).toBe(false); // témoin : l'échec est bien retourné
      expect(e.bandeaux['photo-envoi-banner']?.style.display).toBe('block');
      expect(e.bandeaux['photo-envoi-banner-text']?.textContent).toContain('photo');
    });
  }
  it('envoi réussi : aucun bandeau', async () => {
    const e = monterEnvoi('ok');
    const r = await e.f.uploadPhotoBase64(IMG, 'u/p/b/photo.jpg');
    expect(r.ok).toBe(true);
    expect(e.bandeaux['photo-envoi-banner']?.style.display).not.toBe('block');
  });
});

// ─── galeries : « chargement… » infini ───────────────────────────────
describe('galeries — échec de rechargement visible', () => {
  const IMG = 'data:image/jpeg;base64,QUJD';
  function monterGalerie(o = {}) {
    const zone = { innerHTML: '' };
    const win = {};
    const cible = { ids: ['a'], ...(o.cible || {}) };
    const reseau = { reponse: o.reponse || { ok: false, error: 'hors ligne' }, appels: 0 };
    const f = exec(
      [
        ...['_galleryEntryData', 'renderGallery', 'retryGalleryPhoto'].map(biomeca),
        ...[
          '_photoRechargeEchouee',
          '_oublierEchecPhoto',
          'prefetchPhotoToDataUrl',
          '_prefetchPhotoBrut',
        ].map(fonctionStorage),
        'return { renderGallery, retryGalleryPhoto, prefetchPhotoToDataUrl, _photoRechargeEchouee, _oublierEchecPhoto };',
      ].join('\n'),
      {
        document: { getElementById: (id) => (id === 'g-gallery' ? zone : null) },
        window: win,
        Set,
        Boolean,
        Array,
        Object,
        String,
        JSON,
        Promise,
        PHOTO_GALLERIES: { g: { prefix: 'ph_', arrKey: 'ids', getTargets: () => [cible] } },
        _photosRechargeEchec: new Set(),
        ensureSession: async () => {},
        getPhotoSignedUrl: async () => {
          reseau.appels++;
          if (reseau.porte) await reseau.porte;
          return reseau.reponse.ok
            ? { ok: true, signedUrl: 'x' }
            : { ok: false, error: reseau.reponse.error };
        },
        fetch: async () => ({ ok: true, blob: async () => ({}) }),
        FileReader: class {
          readAsDataURL() {
            this.result = IMG;
            this.onload();
          }
        },
      }
    );
    Object.assign(win, f); // window.prefetchPhotoToDataUrl, etc., comme dans le navigateur
    return { f, zone, cible, reseau };
  }

  it('chemin sans image, aucun échec connu : « chargement… » (rechargement peut-être en cours)', () => {
    const g = monterGalerie({ cible: { ph_aPath: 'u/a.jpg' } });
    g.f.renderGallery('g');
    expect(g.zone.innerHTML).toContain('chargement…');
    expect(g.zone.innerHTML).not.toContain('Réessayer');
  });

  it('rechargement échoué : « photo non rechargée » + Réessayer, plus de « chargement… »', async () => {
    const g = monterGalerie({ cible: { ph_aPath: 'u/a.jpg' } });
    const r = await g.f.prefetchPhotoToDataUrl('u/a.jpg');
    expect(r.ok).toBe(false); // témoin : l'échec a bien eu lieu
    g.f.renderGallery('g');
    expect(g.zone.innerHTML).toContain('photo non rechargée');
    expect(g.zone.innerHTML).toContain('Réessayer');
    expect(g.zone.innerHTML).not.toContain('chargement…');
  });

  it("Réessayer avec le réseau revenu : l'image s'affiche, plus de mention d'échec", async () => {
    const g = monterGalerie({ cible: { ph_aPath: 'u/a.jpg' } });
    await g.f.prefetchPhotoToDataUrl('u/a.jpg');
    g.reseau.reponse = { ok: true };
    await g.f.retryGalleryPhoto('g', 'a');
    expect(g.reseau.appels).toBe(2); // témoin : un second essai réseau a eu lieu
    expect(g.cible.ph_a).toBe(IMG);
    expect(g.zone.innerHTML).toContain('<img');
    expect(g.zone.innerHTML).not.toContain('photo non rechargée');
  });

  it("pendant le nouvel essai : « chargement… » (retour visuel), puis l'image", async () => {
    const g = monterGalerie({ cible: { ph_aPath: 'u/a.jpg' } });
    await g.f.prefetchPhotoToDataUrl('u/a.jpg');
    let ouvrir;
    g.reseau.porte = new Promise((ok) => (ouvrir = ok));
    g.reseau.reponse = { ok: true };
    const fin = g.f.retryGalleryPhoto('g', 'a');
    await new Promise((ok) => setTimeout(ok, 0));
    expect(g.reseau.appels).toBe(2); // témoin : le second essai est bien en cours
    expect(g.zone.innerHTML).toContain('chargement…');
    expect(g.zone.innerHTML).not.toContain('Réessayer');
    ouvrir();
    await fin;
    expect(g.zone.innerHTML).toContain('<img');
  });

  it("Réessayer qui échoue encore : l'échec reste visible", async () => {
    const g = monterGalerie({ cible: { ph_aPath: 'u/a.jpg' } });
    await g.f.prefetchPhotoToDataUrl('u/a.jpg');
    await g.f.retryGalleryPhoto('g', 'a');
    expect(g.reseau.appels).toBe(2);
    expect(g.zone.innerHTML).toContain('photo non rechargée');
  });

  it('photo sans chemin : « photo indisponible » inchangé', () => {
    const g = monterGalerie();
    g.f.renderGallery('g');
    expect(g.zone.innerHTML).toContain('photo indisponible');
  });
});

describe('branchement (lecture statique)', () => {
  it('les trois alertes bloquantes de stockage passent par la fonction à incident unique', () => {
    expect(SRC_BIOMECA.split('_signalerStockagePlein(').length - 1).toBe(1 + 2); // définition + 2 appels
    expect(SRC_BIOMECA).not.toMatch(/alert\(\s*'⚠️ ESPACE DE STOCKAGE (CRITIQUE|PLEIN)/);
  });
  it('les deux bandeaux existent dans index.html', () => {
    const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
    for (const id of ['stockage-banner', 'photo-envoi-banner']) {
      expect(html).toContain(`id="${id}"`);
      expect(html).toContain(`id="${id}-text"`);
    }
  });
});
