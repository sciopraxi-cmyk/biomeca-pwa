// Mode domicile + passage automatique hors connexion : réglage par compte, pas de verrouillage
// sans réseau, messages calmes, session et abonnement gardés 7 jours, photos rangées dans
// IndexedDB. Données FICTIVES uniquement.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

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
const elt = () => ({ style: {}, textContent: '', checked: false });

function monter({ enLigne = true, uid = 'u-fictif', temps } = {}) {
  const mem = new Map();
  const ls = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const els = {};
  const doc = { getElementById: (id) => (els[id] ||= elt()) };
  const nav = { onLine: enLigne };
  const pwaUser = { id: uid, user_data: { licence_payee: true }, user_metadata: { a: 1 } };
  const sess = { token: 'jeton', refreshToken: 'ref', user: { id: uid, email: 'x@y.z' } };
  const horloge = { now: () => temps ?? Date.now() };
  const noms = [
    '_scopedKey',
    '_modeDomicileActif',
    '_reglerModeDomicile',
    'basculerModeDomicile',
    '_horsConnexion',
    '_modeSansVerrou',
    '_lireSessionHorsConnexion',
    '_memoriserSessionHorsConnexion',
    '_memoriserAccesHorsConnexion',
    '_accesDepuisCache',
    '_signalerReseauPerdu',
    '_signalerReseauRetabli',
    '_estErreurReseau',
    '_showSyncErrorBanner',
    '_hideSyncErrorBanner',
    '_afficherBandeau',
    '_masquerBandeau',
    '_signalerEchecEnvoiPhoto',
  ];
  const f = exec(
    [
      "const MSG_HORS_CONNEXION = 'Hors connexion';",
      'const DUREE_SESSION_HC_MS = 7 * 24 * 3600 * 1000;',
      'let _reseauPerdu = false, _syncErrorShown = false, _photoEchecDansSauvegarde = false, _etatSauv = null, _lastActivity = 0;',
      'function _etatSauvegarde(p) { _etatSauv = p; }',
      'function loadPwaSession() { return SESS; }',
      ...noms.map(fonction),
      'return { ' +
        noms.join(', ') +
        ', etat: () => _etatSauv, act: () => _lastActivity, perdu: () => _reseauPerdu };',
    ].join('\n'),
    {
      localStorage: ls,
      document: doc,
      navigator: nav,
      pwaUser,
      SESS: sess,
      Date: Object.assign(function () {}, { now: horloge.now }),
      JSON,
      Number,
      TypeError,
      String,
      Error,
      RegExp,
      console,
    }
  );
  return { f, els, nav, mem, pwaUser };
}

describe('réglage', () => {
  it('désactivé par défaut, activable avec du réseau, propre au compte', () => {
    const m = monter();
    expect(m.f._modeDomicileActif()).toBe(false);
    expect(m.f._reglerModeDomicile(true)).toBe(true);
    expect(m.f._modeDomicileActif()).toBe(true);
    expect(m.mem.has('bm4-mode-domicile:u-fictif')).toBe(true);
    expect(m.mem.has('bm4-session-hc')).toBe(true); // session gardée sur l'appareil
    expect(m.f._reglerModeDomicile(false)).toBe(true);
    expect(m.f._modeDomicileActif()).toBe(false);
    expect(m.mem.has('bm4-session-hc')).toBe(false);
  });
  it('refusé sans réseau, case décochée avec message', () => {
    const m = monter({ enLigne: false });
    const c = elt();
    c.checked = true;
    m.f.basculerModeDomicile(c);
    expect(c.checked).toBe(false);
    expect(m.f._modeDomicileActif()).toBe(false);
    expect(m.els['mc-domicile-msg'].textContent).toMatch(/réseau/);
  });
});

describe('passage automatique hors connexion (case non cochée)', () => {
  it('réseau présent : verrou actif, erreur rouge inchangée', () => {
    const m = monter();
    expect(m.f._modeSansVerrou()).toBe(false);
    m.f._showSyncErrorBanner('Échec');
    expect(m.els['sync-error-banner'].style.background).toBe('#c0392b');
    expect(m.els['sync-error-banner-text'].textContent).toBe('Échec');
  });
  it('navigateur hors ligne : pas de verrouillage, message calme', () => {
    const m = monter({ enLigne: false });
    expect(m.f._modeSansVerrou()).toBe(true);
    m.f._showSyncErrorBanner('Échec');
    expect(m.els['sync-error-banner'].style.background).not.toBe('#c0392b');
    expect(m.els['sync-error-banner-text'].textContent).toBe('Hors connexion');
  });
  it('envoi qui échoue faute de réseau : bascule, copie de session, retour = tout revient', () => {
    const m = monter();
    expect(m.f._estErreurReseau(new TypeError('Failed to fetch'))).toBe(true);
    expect(m.f._estErreurReseau(new Error('RLS refusée'))).toBe(false);
    m.f._signalerReseauPerdu();
    expect(m.f.perdu()).toBe(true);
    expect(m.f._modeSansVerrou()).toBe(true);
    expect(m.mem.has('bm4-session-hc')).toBe(true);
    expect(m.mem.has('bm4-acces-cache:u-fictif')).toBe(true);
    m.f._signalerReseauRetabli();
    expect(m.f.perdu()).toBe(false);
    expect(m.f._modeSansVerrou()).toBe(false);
    expect(m.mem.has('bm4-session-hc')).toBe(false); // copie retirée (case non cochée)
  });
  it('avec la case cochée, la copie de session reste au retour du réseau', () => {
    const m = monter();
    m.f._reglerModeDomicile(true);
    m.f._signalerReseauPerdu();
    m.f._signalerReseauRetabli();
    expect(m.mem.has('bm4-session-hc')).toBe(true);
  });
  it('photo : message calme hors connexion, rouge sinon (photo gardée dans les deux cas)', () => {
    const calme = monter({ enLigne: false });
    calme.f._signalerEchecEnvoiPhoto();
    expect(calme.els['photo-envoi-banner'].style.background).not.toBe('#c0392b');
    expect(calme.els['photo-envoi-banner-text'].textContent).toMatch(/gardée sur cet appareil/);
    const rouge = monter();
    rouge.f._signalerEchecEnvoiPhoto();
    expect(rouge.els['photo-envoi-banner'].style.background).toBe('#c0392b');
    expect(rouge.els['photo-envoi-banner-text'].textContent).toMatch(/gardée sur cet appareil/);
  });
});

describe('session et abonnement gardés 7 jours', () => {
  it('copie lisible avant 7 jours, ignorée après', () => {
    const m = monter();
    m.f._signalerReseauPerdu();
    expect(m.f._lireSessionHorsConnexion()?.uid).toBe('u-fictif');
    const vieux = JSON.parse(m.mem.get('bm4-session-hc'));
    vieux.t = Date.now() - 8 * 24 * 3600 * 1000;
    m.mem.set('bm4-session-hc', JSON.stringify(vieux));
    expect(m.f._lireSessionHorsConnexion()).toBe(null);
  });
  it('statut d’abonnement : repris du cache (≤ 7 jours), refusé sinon', () => {
    const m = monter();
    m.f._memoriserAccesHorsConnexion();
    m.pwaUser.user_data = null;
    expect(m.f._accesDepuisCache()).toBe(true);
    expect(m.pwaUser.user_data).toEqual({ licence_payee: true });
    const c = JSON.parse(m.mem.get('bm4-acces-cache:u-fictif'));
    c.t = Date.now() - 8 * 24 * 3600 * 1000;
    m.mem.set('bm4-acces-cache:u-fictif', JSON.stringify(c));
    m.pwaUser.user_data = null;
    expect(m.f._accesDepuisCache()).toBe(false);
    expect(m.pwaUser.user_data).toBe(null);
  });
  it('cache d’un autre compte jamais appliqué', () => {
    const a = monter({ uid: 'u-a' });
    a.f._memoriserAccesHorsConnexion();
    const b = monter({ uid: 'u-b' });
    b.mem.set('bm4-acces-cache:u-a', a.mem.get('bm4-acces-cache:u-a'));
    b.pwaUser.user_data = null;
    expect(b.f._accesDepuisCache()).toBe(false);
  });
});

describe('coffre à photos (IndexedDB)', () => {
  function coffre({ idb = true } = {}) {
    const noms = ['_refPhotoIdb', '_jsonPatientsLocal'];
    return exec(
      [
        'const SEUIL_PHOTO_IDB = 20000; let _photosAEcrireIdb = null, _idbPhotosKO = false;',
        ...noms.map(fonction),
        'return { ' +
          noms.join(', ') +
          ', pend: () => _photosAEcrireIdb, ko: (v) => (_idbPhotosKO = v) };',
      ].join('\n'),
      {
        pwaUser: { id: 'u-fictif' },
        indexedDB: idb ? {} : undefined,
        JSON,
        Math,
        Map,
      }
    );
  }
  const grosse = 'data:image/jpeg;base64,' + 'A'.repeat(30000);
  const patients = () => [
    { id: 1, photo: grosse, petite: 'data:image/png;base64,AAAA', nom: 'Fictif' },
  ];

  it('grosse image remplacée par une référence, petite et texte intacts', () => {
    const c = coffre();
    const json = c._jsonPatientsLocal(patients());
    expect(json).not.toContain('AAAAAAAAAA');
    const o = JSON.parse(json)[0];
    expect(o.photo).toMatch(/^idb:[0-9a-f]+-\d+$/);
    expect(o.petite).toBe('data:image/png;base64,AAAA');
    expect(c.pend().size).toBe(1);
    expect([...c.pend().values()][0]).toBe(grosse);
  });
  it('même image = même référence, images différentes = références différentes', () => {
    const c = coffre();
    expect(c._refPhotoIdb(grosse)).toBe(c._refPhotoIdb(grosse));
    expect(c._refPhotoIdb(grosse)).not.toBe(c._refPhotoIdb(grosse + 'B'));
  });
  it('sans IndexedDB ou coffre en panne : image gardée dans la copie locale (ancien comportement)', () => {
    expect(JSON.parse(coffre({ idb: false })._jsonPatientsLocal(patients()))[0].photo).toBe(grosse);
    const c = coffre();
    c.ko(true);
    expect(JSON.parse(c._jsonPatientsLocal(patients()))[0].photo).toBe(grosse);
  });
  it('la mémoire n’est jamais modifiée', () => {
    const c = coffre();
    const p = patients();
    c._jsonPatientsLocal(p);
    expect(p[0].photo).toBe(grosse);
  });
});

describe('branchements (code source)', () => {
  it('pas de verrouillage par inactivité sans réseau ni en mode domicile', () => {
    const t = fonction('_idleLockTick');
    expect(t.indexOf('_modeSansVerrou()')).toBeGreaterThan(-1);
    expect(t.indexOf('_modeSansVerrou()')).toBeLessThan(t.indexOf('_lockSession()'));
  });
  it('retour du réseau (tous modes) : renvoi des saisies et photos', () => {
    expect(SRC_BIOMECA).toMatch(
      /addEventListener\('online', function \(\) \{\s*(\/\/[^\n]*\n\s*)*if \(!pwaUser\) return;/
    );
    const r = fonction('_renvoyerApresReconnexion');
    expect(r).toMatch(/saveBilanSilent/);
    expect(r).toMatch(/saveToSupabase/);
    expect(r).toMatch(/fetchUserDataAtLogin/);
  });
  it('démarrage sans réseau : reprise sur la copie de session', () => {
    const i = fonction('initPWA');
    expect(i).toMatch(/_lireSessionHorsConnexion/);
    expect(i).toMatch(/onPwaLoginSuccess/);
  });
  it('les copies locales passent par le coffre, et le rechargement remet les images', () => {
    expect(fonction('savePatients')).toMatch(/_jsonPatientsLocal/);
    expect(fonction('savePatients')).toMatch(/_ecrirePhotosIdb/);
    expect(fonction('loadSupabaseData')).toMatch(/_rehydraterPhotosIdb/);
    expect(fonction('clearPwaSession')).toMatch(/bm4-session-hc/);
  });
});
