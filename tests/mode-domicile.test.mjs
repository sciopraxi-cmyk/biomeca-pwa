// Mode domicile : réglage par compte, pas de verrouillage par inactivité, hors connexion sans
// message d'erreur (données et photos gardées sur l'appareil). Données FICTIVES uniquement.
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
function elt() {
  return { style: {}, textContent: '', checked: false };
}
function monter({ enLigne = true, uid = 'u-fictif' } = {}) {
  const mem = new Map();
  const ls = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const els = {};
  const doc = { getElementById: (id) => (els[id] ||= elt()) };
  const nav = { onLine: enLigne };
  const noms = [
    '_scopedKey',
    '_modeDomicileActif',
    '_reglerModeDomicile',
    'basculerModeDomicile',
    '_showSyncErrorBanner',
    '_hideSyncErrorBanner',
    '_afficherBandeau',
    '_masquerBandeau',
    '_signalerEchecEnvoiPhoto',
  ];
  const f = exec(
    [
      "const MSG_HORS_CONNEXION = 'Hors connexion';",
      'let _syncErrorShown = false, _photoEchecDansSauvegarde = false, _etatSauv = null, _lastActivity = 0;',
      'function _etatSauvegarde(p) { _etatSauv = p; }',
      ...noms.map(fonction),
      'return { ' + noms.join(', ') + ', etat: () => _etatSauv, act: () => _lastActivity };',
    ].join('\n'),
    { localStorage: ls, document: doc, navigator: nav, pwaUser: { id: uid }, Date, console }
  );
  return { f, els, nav, mem };
}

describe('réglage', () => {
  it('désactivé par défaut, activable avec du réseau, propre au compte', () => {
    const m = monter();
    expect(m.f._modeDomicileActif()).toBe(false);
    expect(m.f._reglerModeDomicile(true)).toBe(true);
    expect(m.f._modeDomicileActif()).toBe(true);
    expect(m.mem.has('bm4-mode-domicile:u-fictif')).toBe(true);
    expect(m.f._reglerModeDomicile(false)).toBe(true);
    expect(m.f._modeDomicileActif()).toBe(false);
  });
  it('refusé sans réseau, case décochée avec message', () => {
    const m = monter({ enLigne: false });
    const case_ = elt();
    case_.checked = true;
    m.f.basculerModeDomicile(case_);
    expect(case_.checked).toBe(false);
    expect(m.f._modeDomicileActif()).toBe(false);
    expect(m.els['mc-domicile-msg'].textContent).toMatch(/réseau/);
  });
});

describe('hors connexion', () => {
  it('sans mode domicile : bandeau rouge d’erreur (inchangé)', () => {
    const m = monter({ enLigne: false });
    m.f._showSyncErrorBanner('Échec');
    expect(m.els['sync-error-banner'].style.background).toBe('#c0392b');
    expect(m.els['sync-error-banner-text'].textContent).toBe('Échec');
  });
  it('mode domicile + hors connexion : message calme, pas rouge', () => {
    const m = monter();
    m.f._reglerModeDomicile(true);
    m.nav.onLine = false;
    m.f._showSyncErrorBanner('Échec');
    expect(m.els['sync-error-banner'].style.background).not.toBe('#c0392b');
    expect(m.els['sync-error-banner-text'].textContent).toBe('Hors connexion');
  });
  it('mode domicile mais réseau présent et échec : erreur rouge conservée', () => {
    const m = monter();
    m.f._reglerModeDomicile(true);
    m.f._showSyncErrorBanner('Échec');
    expect(m.els['sync-error-banner'].style.background).toBe('#c0392b');
  });
  it('photo hors connexion en mode domicile : message calme', () => {
    const m = monter();
    m.f._reglerModeDomicile(true);
    m.nav.onLine = false;
    m.f._signalerEchecEnvoiPhoto();
    const b = m.els['photo-envoi-banner'];
    expect(b.style.background).not.toBe('#c0392b');
    expect(m.els['photo-envoi-banner-text'].textContent).toMatch(/gardée sur cet appareil/);
    expect(m.els['photo-envoi-banner-text'].textContent).not.toMatch(/⚠️/);
  });
  it('photo hors mode domicile : erreur rouge conservée', () => {
    const m = monter({ enLigne: false });
    m.f._signalerEchecEnvoiPhoto();
    expect(m.els['photo-envoi-banner'].style.background).toBe('#c0392b');
    expect(m.els['photo-envoi-banner-text'].textContent).toMatch(/⚠️/);
    expect(m.els['photo-envoi-banner-text'].textContent).toMatch(/gardée sur cet appareil/);
  });
});

describe('verrouillage et branchements (code source)', () => {
  it('le verrouillage par inactivité est suspendu en mode domicile', () => {
    const t = fonction('_idleLockTick');
    expect(t.indexOf('_modeDomicileActif()')).toBeGreaterThan(-1);
    expect(t.indexOf('_modeDomicileActif()')).toBeLessThan(t.indexOf('_lockSession()'));
  });
  it('retour du réseau : renvoi des saisies et photos', () => {
    expect(SRC_BIOMECA).toMatch(/addEventListener\('online'[\s\S]{0,300}_renvoyerApresReconnexion/);
    // tous modes : le renvoi ne dépend pas du mode domicile
    expect(SRC_BIOMECA).toMatch(
      /addEventListener\('online', function \(\) \{\s*(\/\/[^\n]*\n\s*)*if \(!pwaUser\) return;/
    );
    const r = fonction('_renvoyerApresReconnexion');
    expect(r).toMatch(/saveBilanSilent/);
    expect(r).toMatch(/saveToSupabase/);
  });
});
