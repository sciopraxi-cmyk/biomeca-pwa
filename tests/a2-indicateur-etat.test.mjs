// ═══════════════════════════════════════════════════════════════════
// A2 / PR 3 — indicateur d'état de la sauvegarde
// ═══════════════════════════════════════════════════════════════════
// États : dirty / saving / saved / pending / failed, alimentés par les vrais
// résultats (savePatients, saveToSupabase, envoi de photo). Fonctions
// EXTRAITES de js/biomeca.js. Données FICTIVES uniquement.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, tableau, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const presente = (n) =>
  SRC_BIOMECA.includes('\nfunction ' + n + '(') ||
  SRC_BIOMECA.includes('\nasync function ' + n + '(');
const biomeca = (n) => (presente(n) ? fonction(n) : `function ${n}() {}`);

const TEXTES = {
  dirty: 'Modifications non enregistrées…',
  saving: 'Enregistrement…',
  saved: 'Enregistré ✓',
  pending: 'Enregistré ici — serveur en attente',
  failed: 'Échec de sauvegarde',
};

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

// Environnement : indicateurs DOM, stockage local, réseau (supa) pilotables.
function monter(o = {}) {
  const mem = new Map();
  const indic = [
    { textContent: '', style: {}, dataset: {} },
    { textContent: '', style: {}, dataset: {} },
  ];
  const etat = { quota: false, cloud: 'ok', annuleReduction: false };
  const localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => {
      if (etat.quota) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      mem.set(k, String(v));
    },
    removeItem: (k) => mem.delete(k),
    get length() {
      return mem.size;
    },
    key: (i) => [...mem.keys()][i] ?? null,
  };
  const noms = [
    '_installerIndicateursEtat',
    '_rendreEtatSauvegarde',
    '_etatSauvegarde',
    '_etatApresLocal',
    '_etatApresCloud',
    '_afficherBandeau',
    '_masquerBandeau',
    '_signalerStockagePlein',
    '_stockageRetabli',
    '_signalerEchecEnvoiPhoto',
    '_scopedKey',
    '_lireMarqueurNonSync',
    '_marquerNonSynchronise',
    '_confirmerSyncCloud',
    '_countDataUnits',
    'savePatients',
    'saveToSupabase',
    '_scheduleBilanAutosave',
  ];
  const f = exec(
    [
      'const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024, STORAGE_WARNING_THRESHOLD = 0.8, STORAGE_CRITICAL_THRESHOLD = 0.95;',
      'let _stockageIncident = false, _quotaWarningShown = false, _intentionalReduction = false;',
      'let _nonSyncSeq = 0, _dernierSyncCloudAt = null, _dataLoaded = true, _loadedFromFallback = false, _syncErrorShown = false;',
      'let _bilanAutosaveTimer = null, _bilanAutosaveFlavor = null;',
      'let _etatSauv = null, _photoEchecDansSauvegarde = false;',
      'const ETAT_SAUV_ANCRES = ' +
        SRC_BIOMECA.match(/const ETAT_SAUV_ANCRES = (\[[\s\S]*?\n\]);/)?.[1],
      'const ETAT_SAUV_TEXTES = ' +
        SRC_BIOMECA.match(/const ETAT_SAUV_TEXTES = (\{[\s\S]*?\n\});/)?.[1],
      ...noms.map(biomeca),
      `return { ${noms.join(', ')}, etat: () => _etatSauv };`,
    ].join('\n'),
    {
      localStorage,
      document: o.document || {
        querySelectorAll: (s) => (s === '.etat-sauv' ? indic : []),
        getElementById: () => null,
      },
      pwaUser: { id: 'u-fictif', token: 'jeton-fictif' },
      patients: [{ id: 'p', nom: 'Fictif' }],
      praticiens: [],
      currentPatient: null,
      JSON,
      Date,
      Math,
      Number,
      Array,
      Object,
      Promise,
      Boolean,
      Error,
      String,
      console: { log() {}, warn() {}, error() {} },
      alert() {},
      confirm: () => !etat.annuleReduction,
      getBioMecaStorageBytes: () => 1000,
      _stripDataURLsForPersist: () => [],
      _restoreDataURLsAfterPersist() {},
      _syncPatientToNormalizedTables() {},
      _showSyncErrorBanner() {},
      _hideSyncErrorBanner() {},
      setTimeout: () => 0,
      clearTimeout() {},
      _lancerSauvegardeAutomatique() {},
      supa: {
        saveData: async () => {
          if (etat.cloud === 'exception') throw new Error('réseau');
          return etat.cloud === 'ok';
        },
      },
      ...(o.globales || {}),
    }
  );
  return { f, etat, indic, mem };
}
const attendre = () => new Promise((ok) => setTimeout(ok, 0));
const texte = (e, i = 0) => e.indic[i].textContent;

describe('rendu', () => {
  for (const [phase, t] of Object.entries(TEXTES)) {
    it(`${phase} : « ${t} » sur tous les indicateurs`, () => {
      const e = monter();
      e.f._etatSauvegarde(phase);
      expect(e.indic.map((i) => i.textContent)).toEqual([t, t]);
      expect(e.indic[0].dataset.etat).toBe(phase);
    });
  }
  it('couleurs : gris, vert, orange, rouge (jamais la couleur seule : le texte porte le sens)', () => {
    const e = monter();
    const c = {};
    for (const p of Object.keys(TEXTES)) {
      e.f._etatSauvegarde(p);
      c[p] = e.indic[0].style.color;
    }
    expect(c.dirty).toBe(c.saving);
    expect(new Set([c.saving, c.saved, c.pending, c.failed]).size).toBe(4);
    expect(c.saved).toBe('#15803d');
    expect(c.failed).toBe('#b91c1c');
  });
  it('aucun état : indicateur vide', () => {
    const e = monter();
    e.f._rendreEtatSauvegarde();
    expect(texte(e)).toBe('');
  });
});

describe('transitions réelles', () => {
  it("saisie : « non enregistrées » dès l'autosave programmé", () => {
    const e = monter();
    e.f._scheduleBilanAutosave('pedicurie');
    expect(texte(e)).toBe(TEXTES.dirty);
  });

  it('enregistrement local réussi puis serveur confirmé : saving → saved', async () => {
    const e = monter();
    e.f._etatSauvegarde('saving');
    expect(e.f.savePatients()).toBe(true);
    expect(texte(e)).toBe(TEXTES.saving); // le serveur n'a pas encore confirmé
    await attendre();
    expect(texte(e)).toBe(TEXTES.saved);
  });

  for (const cloud of ['non-ok', 'exception']) {
    it(`serveur en échec (${cloud}) : saving → pending, puis saved au prochain envoi réussi`, async () => {
      const e = monter();
      e.etat.cloud = cloud;
      e.f._etatSauvegarde('saving');
      e.f.savePatients();
      await attendre();
      expect(texte(e)).toBe(TEXTES.pending);
      e.etat.cloud = 'ok';
      e.f._etatSauvegarde('saving');
      e.f.savePatients();
      await attendre();
      expect(texte(e)).toBe(TEXTES.saved);
    });
  }

  it("stockage plein : failed ; l'enregistrement suivant réussi lève l'échec", async () => {
    const e = monter();
    e.f._etatSauvegarde('saving');
    e.etat.quota = true;
    expect(e.f.savePatients()).toBe(false);
    expect(texte(e)).toBe(TEXTES.failed);
    e.etat.quota = false;
    expect(e.f.savePatients()).toBe(true);
    expect(texte(e)).toBe(TEXTES.saving);
    await attendre();
    expect(texte(e)).toBe(TEXTES.saved);
  });

  it('sauvegarde refusée par le praticien (garde « réduit vos données ») : failed', () => {
    const e = monter({ globales: { patients: [] } });
    e.mem.set('bm4-patients:u-fictif', JSON.stringify([{ id: 'a' }, { id: 'b' }]));
    e.etat.annuleReduction = true;
    e.f._etatSauvegarde('saving');
    expect(e.f.savePatients()).toBe(false);
    expect(texte(e)).toBe(TEXTES.failed);
  });

  it("saisie pendant l'envoi : la confirmation du serveur n'écrase pas « non enregistrées »", async () => {
    const e = monter();
    e.f._etatSauvegarde('saving');
    e.f.savePatients();
    e.f._scheduleBilanAutosave('pedicurie'); // frappe avant la réponse du serveur
    await attendre();
    expect(texte(e)).toBe(TEXTES.dirty);
  });

  it("écriture plus récente que l'envoi : pas « Enregistré » tant qu'elle n'est pas confirmée", async () => {
    const e = monter();
    e.f._etatSauvegarde('saving');
    e.f.savePatients(); // envoi n° 1 part
    e.f.savePatients(); // envoi n° 2 : écriture plus récente
    await attendre();
    expect(texte(e)).toBe(TEXTES.saved); // les deux sont confirmés à la fin
    // confirmation de n° 1 seule, alors qu'un n° plus récent existe :
    const e2 = monter();
    e2.f._etatSauvegarde('saving');
    e2.f._marquerNonSynchronise();
    const seq1 = JSON.parse(e2.mem.get('bm4-nonsync:u-fictif')).seq;
    e2.f._marquerNonSynchronise();
    e2.f._etatApresCloud(true, seq1);
    expect(texte(e2)).toBe(TEXTES.saving);
  });

  it('photo non envoyée pendant la sauvegarde : pending, même si le serveur confirme le reste', async () => {
    const e = monter();
    e.f._etatSauvegarde('saving');
    e.f._signalerEchecEnvoiPhoto();
    e.f.savePatients();
    await attendre();
    expect(texte(e)).toBe(TEXTES.pending);
  });

  it("une nouvelle sauvegarde repart de zéro côté photo (« saving » remet l'échec à faux)", async () => {
    const e = monter();
    e.f._etatSauvegarde('saving');
    e.f._signalerEchecEnvoiPhoto();
    e.f._etatSauvegarde('saving');
    e.f.savePatients();
    await attendre();
    expect(texte(e)).toBe(TEXTES.saved);
  });

  it("confirmation du serveur sans sauvegarde de bilan en cours (état vide) : rien d'affiché", async () => {
    const e = monter();
    e.f.savePatients(); // ex. création d'un patient
    await attendre();
    expect(texte(e)).toBe('');
  });
});

describe('branchement (lecture statique)', () => {
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
  it('le HTML statique et le gabarit Posturo ne contiennent aucun indicateur (structure #268 figée)', () => {
    expect(html).not.toContain('etat-sauv');
    expect(fonction('getBilanPosturoHTML')).not.toContain('etat-sauv');
  });
  it("l'insertion est appelée au chargement et après la génération de la page Posturo", () => {
    expect(SRC_BIOMECA).toContain(
      "document.addEventListener('DOMContentLoaded', _installerIndicateursEtat)"
    );
    expect(fonction('injectBilanPosturoPage')).toContain('_installerIndicateursEtat()');
  });
  it('les 5 sauvegardes passent à « saving » dès le départ', () => {
    for (const n of [
      'savePedicurieBilan',
      'savePodopediatrieBilan',
      'savePosturoBilan',
      'saveBilan',
      'saveBilanSilent',
    ]) {
      expect(fonction(n), n).toContain("_etatSauvegarde('saving')");
    }
  });
  it("savePatients, saveToSupabase et l'autosave alimentent l'indicateur", () => {
    expect(fonction('savePatients')).toContain('_etatApresLocal(true)');
    expect(fonction('saveToSupabase')).toContain('_etatApresCloud(true, _seqEnvoi)');
    expect(fonction('saveToSupabase').split('_etatApresCloud(false)').length - 1).toBe(4);
    expect(fonction('_scheduleBilanAutosave')).toContain("_etatSauvegarde('dirty')");
  });
});

// Mini-DOM : barres d'éléments (titres, boutons Imprimer / Rapport), insertion réelle.
// Chaque élément déclare les sélecteurs qu'il satisfait.
function miniDom(barres) {
  const parents = barres.map((elems) => {
    const parent = { enfants: [] };
    elems.forEach((sels) => {
      const el = { tag: 'x', sels, parentNode: parent };
      const rang = (d) => parent.enfants[parent.enfants.indexOf(el) + d] ?? null;
      Object.defineProperty(el, 'previousElementSibling', { get: () => rang(-1) });
      Object.defineProperty(el, 'nextElementSibling', { get: () => rang(1) });
      Object.defineProperty(el, 'nextSibling', { get: () => rang(1) });
      parent.enfants.push(el);
    });
    parent.insertBefore = (n, ref) => {
      const i = ref ? parent.enfants.indexOf(ref) : parent.enfants.length;
      parent.enfants.splice(i, 0, n);
      n.parentNode = parent;
    };
    return parent;
  });
  const tous = () => parents.flatMap((p) => p.enfants);
  return {
    parents,
    document: {
      querySelectorAll: (sel) =>
        sel === '.etat-sauv'
          ? tous().filter((n) => n.className === 'etat-sauv')
          : tous().filter((n) => n.sels?.includes(sel)),
      createElement: (tag) => {
        const el = { tag, style: {}, dataset: {}, setAttribute() {}, textContent: '' };
        el.classList = { contains: (c) => el.className === c };
        return el;
      },
      getElementById: () => null,
    },
  };
}

describe("insertion de l'indicateur par le script (plus de bouton « Sauvegarder »)", () => {
  const H2_PED = '#pg-pedicurie h2';
  const H2_PODO = '#pg-podopediatrie h2';
  const IMPR = 'button[onclick="printBilan()"]';
  const RAPPORT = 'button[onclick="buildRapportPosturo()"]';
  const BARRES = [[[], [H2_PED], []], [[], [H2_PODO], []], [[IMPR], []], [[RAPPORT]]];
  it("un indicateur à l'ancien emplacement du bouton : après le titre (Pédicurie, Podopédiatrie), avant Imprimer (Sport) et avant Rapport (Posturo)", () => {
    const d = miniDom(BARRES);
    const e = monter({ document: d.document });
    e.f._etatSauvegarde('saved');
    expect(d.document.querySelectorAll('.etat-sauv')).toHaveLength(4);
    const [ped, podo, sport, po] = d.parents.map((p) =>
      p.enfants.map((n) => n.className ?? n.sels[0] ?? '·')
    );
    expect(ped).toEqual(['·', H2_PED, 'etat-sauv', '·']);
    expect(podo).toEqual(['·', H2_PODO, 'etat-sauv', '·']);
    expect(sport).toEqual(['etat-sauv', IMPR, '·']);
    expect(po).toEqual(['etat-sauv', RAPPORT]);
    for (const p of d.parents)
      for (const n of p.enfants.filter((x) => x.className === 'etat-sauv'))
        expect(n.textContent).toBe(TEXTES.saved);
  });
  it('rappelé plusieurs fois : jamais de doublon ; une page créée plus tard reçoit le sien', () => {
    const d = miniDom(BARRES.slice(0, 2));
    const e = monter({ document: d.document });
    e.f._etatSauvegarde('saving');
    e.f._etatSauvegarde('saved');
    expect(d.document.querySelectorAll('.etat-sauv')).toHaveLength(2);
    // la page Posturo est générée après coup
    const plus = miniDom([[RAPPORT]]);
    const tous = d.document.querySelectorAll;
    d.document.querySelectorAll = (sel) => [...tous(sel), ...plus.document.querySelectorAll(sel)];
    e.f._etatSauvegarde('saved');
    expect(d.document.querySelectorAll('.etat-sauv')).toHaveLength(3);
  });
});

describe('A3 — plus de bouton « Sauvegarder » dans les 4 bilans, mais rien ne se perd', () => {
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
  it("aucun bouton n'appelle les 4 sauvegardes manuelles (HTML statique et gabarit Posturo)", () => {
    for (const n of [
      'savePedicurieBilan',
      'savePodopediatrieBilan',
      'saveBilan',
      'savePosturoBilan',
    ]) {
      expect(html, n).not.toContain('onclick="' + n + '()"');
      expect(fonction('getBilanPosturoHTML'), n).not.toContain('onclick="' + n + '()"');
    }
    expect(SRC_BIOMECA).not.toMatch(/onclick="save(Pedicurie|Podopediatrie|Posturo)?Bilan\(\)"/);
  });
  it("les repères de l'indicateur existent dans les pages (sinon il disparaîtrait)", () => {
    expect(html).toContain('onclick="printBilan()"');
    expect(html).toMatch(/id="pg-pedicurie"[\s\S]*?<h2/);
    expect(html).toMatch(/id="pg-podopediatrie"[\s\S]*?<h2/);
    expect(fonction('getBilanPosturoHTML')).toContain('onclick="buildRapportPosturo()"');
  });
  it("chaque annulation de trait programme l'autosave (le bouton ne le faisait plus pour elle)", () => {
    const attendu = {
      undoMorpho: 'sport',
      undoPieds: 'sport',
      undoPodoMorpho: 'podopediatrie',
      undoPodoPieds: 'podopediatrie',
      undoPosturoBody: 'posturo',
    };
    for (const [n, flavor] of Object.entries(attendu))
      expect(fonction(n), n).toContain("_scheduleBilanAutosave('" + flavor + "')");
  });
});
