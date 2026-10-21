// ═══════════════════════════════════════════════════════════════════
// Mode consultation des rapports (abonnement terminé) : verrou d'écriture TOTAL
// ═══════════════════════════════════════════════════════════════════
// Fonctions EXTRAITES de js/biomeca.js, DOM / réseau / stockage simulés. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, ligneConst, tableau } from './helpers/extraire-biomeca.mjs';

const piege = (nom) => () => {
  throw new Error('ÉCRITURE INTERDITE : ' + nom);
};
// eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
const construire = (corps, args, vals) => new Function(...args, corps)(...vals);

describe("gardes d'écriture en tête des sauvegardes", () => {
  const GARDES = [
    '_marquerNonSynchronise',
    '_ecrireLocalAvantEnvoi',
    'savePatients',
    'savePraticiens',
    'saveToSupabase',
    '_syncPatientToNormalizedTables',
    '_scheduleBilanAutosave',
    '_lancerSauvegardeAutomatique',
  ];
  it.each(GARDES)('%s : première instruction = retour précoce en mode consultation', (nom) => {
    const src = fonction(nom);
    const corps = src.slice(src.indexOf('{') + 1).trimStart();
    expect(corps.split('\n')[0]).toMatch(/^if \(globalThis\?\._modeConsultation\) return/);
  });

  it("savePatients / _ecrireLocalAvantEnvoi / savePraticiens : rien n'est touché (stockage et réseau piégés)", async () => {
    const localStorage = {
      setItem: piege('setItem'),
      removeItem: piege('removeItem'),
      getItem: piege('getItem'),
    };
    const f = construire(
      ['savePatients', '_ecrireLocalAvantEnvoi', 'savePraticiens', '_marquerNonSynchronise']
        .map(fonction)
        .join('\n') +
        '\nreturn { savePatients, _ecrireLocalAvantEnvoi, savePraticiens, _marquerNonSynchronise };',
      [
        'globalThis',
        'localStorage',
        'pwaUser',
        '_dataLoaded',
        'currentPatient',
        '_scopedKey',
        'saveToSupabase',
        '_stripDataURLsForPersist',
      ],
      [
        { _modeConsultation: true },
        localStorage,
        { id: 'u', token: 't' },
        true,
        {},
        piege('_scopedKey'),
        piege('saveToSupabase'),
        piege('strip'),
      ]
    );
    expect(f.savePatients()).toBe(false);
    expect(f._ecrireLocalAvantEnvoi()).toBe(false);
    expect(f.savePraticiens()).toBeUndefined();
    expect(f._marquerNonSynchronise()).toBeUndefined();
  });

  it('saveToSupabase : aucune requête', async () => {
    const f = construire(
      fonction('saveToSupabase') + '\nreturn saveToSupabase;',
      ['globalThis', 'pwaUser', 'fetch', 'authFetch'],
      [{ _modeConsultation: true }, { token: 't', id: 'u' }, piege('fetch'), piege('authFetch')]
    );
    await expect(f()).resolves.toBeUndefined();
  });

  it('ROUGE sans le drapeau : savePatients touche bien le stockage (la garde est la seule protection)', () => {
    const f = construire(
      fonction('savePatients') + '\nreturn savePatients;',
      ['globalThis', 'pwaUser', 'patients', '_stripDataURLsForPersist'],
      [{ _modeConsultation: false }, { id: 'u' }, [], piege('strip')]
    );
    expect(() => f()).toThrow(/ÉCRITURE INTERDITE/);
  });

  it('_scheduleBilanAutosave / _lancerSauvegardeAutomatique : aucune sauvegarde programmée', () => {
    let lances = 0;
    const f = construire(
      fonction('_scheduleBilanAutosave') +
        fonction('_lancerSauvegardeAutomatique') +
        '\nreturn { _scheduleBilanAutosave, _lancerSauvegardeAutomatique };',
      [
        'globalThis',
        'saveBilanSilent',
        'savePosturoBilan',
        'savePedicurieBilan',
        'savePodopediatrieBilan',
        'setTimeout',
        'clearTimeout',
        '_etatSauvegarde',
        '_bilanAutosaveTimer',
        '_bilanAutosaveFlavor',
      ],
      [
        { _modeConsultation: true },
        () => lances++,
        () => lances++,
        () => lances++,
        () => lances++,
        () => lances++,
        () => {},
        () => lances++,
        null,
        null,
      ]
    );
    ['sport', 'posturo', 'pedicurie', 'podopediatrie'].forEach((x) => {
      f._scheduleBilanAutosave(x);
      f._lancerSauvegardeAutomatique(x);
    });
    expect(lances).toBe(0);
  });
});

describe('ouvrir une archive en consultation', () => {
  const ouvrirs = ['ouvrirBilanSport', 'ouvrirBilanPosturo'];
  it.each(ouvrirs)(
    '%s : pas de confirmation « perdre vos données » ; aucune écriture',
    async (nom) => {
      const sport = nom === 'ouvrirBilanSport';
      const p = sport
        ? {
            currentBilanSportSousType: 'initial',
            mesures: { a: 1 },
            bilanData: { x: 1 },
            bilansSport: [{ mesures: {}, bilanData: {} }],
          }
        : {
            currentBilanPosturoSousType: 'initial',
            bilanDataPosturo: { x: 1 },
            bilansPosturo: [{ bilanDataPosturo: {} }],
          };
      const cree = (mode) => {
        const j = { saves: 0, confirms: 0 };
        const f = construire(
          fonction(nom) + `\nreturn ${nom};`,
          [
            'globalThis',
            'patients',
            'confirm',
            'selectPatient',
            'nav',
            'savePatients',
            'hasBilanDataContent',
            '_nbTestsMesures',
            'prefetchPosturoPhotos',
            'document',
            'currentPatient',
            'bilanData',
            'currentOpenedBilanIdx',
            'currentOpenedBilanPosturoIdx',
            '_intentionalReduction',
            'setTimeout',
          ],
          [
            { _modeConsultation: mode },
            [JSON.parse(JSON.stringify(p))],
            () => {
              j.confirms++;
              return false;
            },
            function () {},
            () => {},
            () => {
              j.saves++;
              return true;
            },
            () => true,
            () => 1,
            async () => {},
            { getElementById: () => null, querySelectorAll: () => [] },
            {},
            {},
            null,
            null,
            false,
            () => 0,
          ]
        );
        return { f, j };
      };
      const a = cree(true);
      await a.f(0, 0);
      expect(a.j.confirms).toBe(0);
      // ROUGE sans le drapeau : la confirmation est posée
      const b = cree(false);
      await b.f(0, 0);
      expect(b.j.confirms).toBe(1);
    }
  );
});

describe('filet universel (localStorage « bm4-* », fetch non GET)', () => {
  function monter(mode) {
    const ecrits = [];
    const appels = [];
    class Storage {
      setItem(k, v) {
        ecrits.push(['set', k, v]);
      }
      removeItem(k) {
        ecrits.push(['rem', k]);
      }
    }
    const win = {
      _modeConsultation: mode,
      Storage,
      fetch: (u, o) => {
        appels.push([u, (o && o.method) || 'GET']);
        return Promise.resolve({ status: 200 });
      },
    };
    const f = construire(
      ['_consultationFetchAutorise', '_installerFiletConsultation'].map(fonction).join('\n') +
        '\nreturn { _installerFiletConsultation };',
      ['window', 'SUPA_URL', 'Response'],
      [
        win,
        'https://x.supabase.co',
        class {
          constructor(b, i) {
            this.status = i.status;
          }
        },
      ]
    );
    f._installerFiletConsultation();
    return { win, ecrits, appels, ls: new Storage() };
  }
  it('clés bm4-* ignorées, autres clés conservées', () => {
    const m = monter(true);
    m.ls.setItem('bm4-patients:u', '[]');
    m.ls.removeItem('bm4-nonsync:u');
    m.ls.setItem('theme', 'clair');
    expect(m.ecrits).toEqual([['set', 'theme', 'clair']]);
  });
  it("hors consultation : tout passe (le filet ne gêne pas l'usage normal)", async () => {
    const m = monter(false);
    m.ls.setItem('bm4-patients:u', '[]');
    await m.win.fetch('https://x.supabase.co/rest/v1/user_data', { method: 'POST' });
    expect(m.ecrits.length).toBe(1);
    expect(m.appels.length).toBe(1);
  });
  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    '%s vers Supabase refusé (403), aucune requête partie',
    async (meth) => {
      const m = monter(true);
      const r = await m.win.fetch('https://x.supabase.co/rest/v1/user_data', { method: meth });
      expect(r.status).toBe(403);
      expect(m.appels).toEqual([]);
    }
  );
  it('GET, rafraîchissement de session et URL signée de photo : autorisés', async () => {
    const m = monter(true);
    await m.win.fetch('https://x.supabase.co/rest/v1/user_data');
    await m.win.fetch('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
    });
    await m.win.fetch('https://x.supabase.co/storage/v1/object/sign/photos/a.jpg', {
      method: 'POST',
    });
    expect(m.appels.length).toBe(3);
  });
  it('upload Storage et POST /auth/v1/signup : refusés', async () => {
    const m = monter(true);
    expect(
      (
        await m.win.fetch('https://x.supabase.co/storage/v1/object/photos/a.jpg', {
          method: 'POST',
        })
      ).status
    ).toBe(403);
    expect(
      (await m.win.fetch('https://x.supabase.co/rest/v1/bilans?id=eq.1', { method: 'DELETE' }))
        .status
    ).toBe(403);
    expect(m.appels).toEqual([]);
  });
});

describe('liste, navigation, impression', () => {
  const lib = () =>
    construire(
      [
        ligneConst('_CONSULT_PAGES'),
        tableau('_CONSULT_TYPES'),
        '_consultationNavAutorisee',
        '_consultationListe',
        '_consultationHtmlListe',
        '_accessPermetImpression',
      ]
        .map((x) => (x.startsWith('\n') || x.startsWith('const') ? x : fonction(x)))
        .join('\n') +
        '\nreturn { _consultationNavAutorisee, _consultationListe, _consultationHtmlListe, _accessPermetImpression };',
      ['window', 'globalThis', '_escHtml'],
      [
        { _accessLevel: 'blocked' },
        { _modeConsultation: true },
        (s) => String(s).replace(/</g, '&lt;'),
      ]
    );

  it('liste = archives (bilans validés) seulement, bilan en cours exclu', () => {
    const pats = [
      {
        nom: 'Martin',
        prenom: 'A',
        bilansSport: [{ label: 'Initial', date: '01/01/2026' }],
        bilanData: { en: 'cours' },
        currentBilanSportSousType: 'controle',
      },
      { nom: 'Durand', prenom: 'B', bilanDataPosturo: { en: 'cours' } }, // aucun bilan validé
      {
        nom: 'Bernard',
        prenom: 'C',
        bilansPosturo: [{ label: 'Posturo Initial' }],
        bilansPedicurie: [{ label: 'P1' }],
        bilansPodopediatrie: [{ label: 'Podo 1' }],
      },
    ];
    const l = lib()._consultationListe(pats);
    expect(l.map((x) => x.nom)).toEqual(['Bernard C', 'Martin A']);
    expect(l[0].bilans.map((b) => b.type)).toEqual(['posturo', 'pedicurie', 'podopediatrie']);
    expect(l[1].bilans).toHaveLength(1);
    expect(lib()._consultationListe([])).toEqual([]);
  });
  it('HTML de la liste : seulement des boutons « Rapport » (aucune création / modification)', () => {
    const h = lib()._consultationHtmlListe(
      lib()._consultationListe([{ nom: 'M<b>', bilansSport: [{ label: 'Initial' }] }])
    );
    expect(h).toContain('consulterRapportBilan(');
    expect(h).not.toMatch(/creerBilan|ouvrirBilan|supprimer|savePatients|openNewPatient/);
    expect(h).not.toContain('<b>');
  });
  it('navigation limitée aux pages des rapports', () => {
    const l = lib();
    ['pg-patients', 'pg-params', 'pg-actes', 'pg-documents', 'pg-agenda', 'pg-praticiens'].forEach(
      (id) => expect(l._consultationNavAutorisee(id)).toBe(false)
    );
    ['pg-rapport', 'pg-rapport-posturo'].forEach((id) =>
      expect(l._consultationNavAutorisee(id)).toBe(true)
    );
  });
  it('impression permise en consultation même niveau « bloqué »', () => {
    expect(lib()._accessPermetImpression()).toBe(true);
  });
});

describe('câblage', () => {
  const index = readFileSync(join(RACINE, 'index.html'), 'utf8');
  it("le bouton « Mes rapports de bilans » est dans la fenêtre d'abonnement terminé", () => {
    const i = index.indexOf('id="overlay-recuperation"');
    const fin = index.indexOf('pwaLogout()', i);
    expect(index.slice(i, fin)).toContain('ouvrirModeConsultation()');
  });
  it('nav() refuse les pages hors rapports en consultation', () => {
    expect(fonction('nav')).toMatch(
      /_modeConsultation && !_consultationNavAutorisee\(id\)\) return/
    );
  });
});
