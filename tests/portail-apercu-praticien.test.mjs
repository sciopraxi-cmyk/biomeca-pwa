// Portail patient — aperçu praticien (« voir comme le patient, sans code ») et fiche neuve.
// Fonctions extraites de js/biomeca.js (bac à sable) ; le parcours navigateur est joué à part.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as L from '../patient/patient-logique.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const src = lire('js/biomeca.js');

function extraire(nom) {
  const debut = src.indexOf('async function ' + nom + '(');
  expect(debut).toBeGreaterThan(-1);
  const fin = src.indexOf('\n}\n', debut) + 3;
  return src.slice(debut, fin);
}

function bac(over) {
  const ctx = Object.assign(
    {
      SUPA_URL: 'https://x.invalid',
      globalThis: {},
      appels: [],
      savePatients() {
        ctx.appels.push('save');
      },
      async _syncPatientToNormalizedTables(p) {
        ctx.appels.push('sync');
        p._cloudId = 'id-cloud';
      },
      async authFetch() {
        ctx.appels.push('verif');
        return { ok: true, json: async () => [{ id: 'id-cloud' }] };
      },
      encodeURIComponent,
    },
    over
  );
  vm.createContext(ctx);
  vm.runInContext(extraire('_portailAssurerFiche'), ctx);
  return ctx;
}

describe('_portailAssurerFiche — fiche toute neuve', () => {
  it('fiche neuve : enregistre, synchronise, vérifie en base, puis continue', async () => {
    const c = bac({});
    const p = { nom: 'Fictif' };
    const r = await vm.runInContext('_portailAssurerFiche', c)(p);
    expect(r.ok).toBe(true);
    expect(c.appels).toEqual(['save', 'sync', 'verif']);
  });
  it('fiche déjà synchronisée : aucun appel', async () => {
    const c = bac({});
    const r = await vm.runInContext('_portailAssurerFiche', c)({ _cloudId: 'deja' });
    expect(r.ok).toBe(true);
    expect(c.appels).toEqual([]);
  });
  it('synchro refusée par la base : échec clair, identifiant retiré (jamais un faux identifiant)', async () => {
    const c = bac({
      async authFetch() {
        return { ok: true, json: async () => [] };
      },
    });
    const p = { nom: 'Fictif' };
    const r = await vm.runInContext('_portailAssurerFiche', c)(p);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/pas pu être enregistrée/);
    expect(p._cloudId).toBeUndefined();
  });
  it('erreur réseau pendant la vérification : échec, pas d’exception', async () => {
    const c = bac({
      async authFetch() {
        throw new Error('réseau');
      },
    });
    const p = { nom: 'Fictif' };
    const r = await vm.runInContext('_portailAssurerFiche', c)(p);
    expect(r.ok).toBe(false);
    expect(p._cloudId).toBeUndefined();
  });
  it('hors connexion et mode consultation : rien n’est écrit', async () => {
    const c1 = bac({ _horsConnexion: () => true });
    const r1 = await vm.runInContext('_portailAssurerFiche', c1)({ nom: 'F' });
    expect(r1.ok).toBe(false);
    expect(c1.appels).toEqual([]);
    const c2 = bac({ globalThis: { _modeConsultation: true } });
    const r2 = await vm.runInContext('_portailAssurerFiche', c2)({ nom: 'F' });
    expect(r2.ok).toBe(false);
    expect(c2.appels).toEqual([]);
  });
});

describe('aperçu praticien — branchements', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';
  it('apercuDemande n’accepte qu’un uuid', () => {
    expect(L.apercuDemande('?apercu=' + uuid)).toBe(uuid);
    expect(L.apercuDemande('?apercu=' + uuid.toUpperCase())).toBe(uuid);
    expect(L.apercuDemande('?apercu=1;DROP')).toBeNull();
    expect(L.apercuDemande('?apercu=' + uuid + '&x=1')).toBe(uuid);
    expect(L.apercuDemande('')).toBeNull();
    expect(L.apercuDemande(null)).toBeNull();
  });
  it('la page patient : jeton du praticien demandé seulement à la fenêtre ouvrante, même origine', () => {
    const p = lire('patient/patient.js');
    expect(p).toMatch(/e\.origin !== location\.origin \|\| e\.source !== window\.opener/);
    expect(p).toMatch(/postMessage\(\{ type: 'verticy-apercu-demande' \}, location\.origin\)/);
  });
  it('la page patient : lecture seule, rien n’est marqué lu, documents du seul patient et non retirés', () => {
    const p = lire('patient/patient.js');
    expect(p).toMatch(/if \(!d\.lu_at && !APERCU\)/);
    expect(p).toMatch(/retire=eq\.false&patient_id=eq\./);
    expect(p).not.toMatch(/portail_document_lu[\s\S]{0,40}APERCU/);
  });
  it('Verticy : réponse du jeton réservée à la fenêtre ouverte, même origine', () => {
    expect(src).toMatch(/e\.origin !== location\.origin \|\| e\.source !== win/);
    expect(src).toMatch(/win\.postMessage\(\{ type: 'verticy-apercu-jeton'/);
    expect(src).toMatch(/, location\.origin\);\n  \};\n  window\.addEventListener\('message', h\)/);
  });
  it('boutons : 👁 dans la liste et la fenêtre 🔑, fonction exposée', () => {
    expect(src).toMatch(/onclick="portailApercu\(\$\{i\}\)"/);
    expect(src).toMatch(/portailApercu\(' \+ idx \+ '\)/);
    expect(src).toMatch(/Object\.assign\(window, \{[\s\S]*portailApercu,/);
  });
  it('publication et 🔑 passent par _portailAssurerFiche (plus de blocage « Enregistrez d’abord »)', () => {
    expect(src).not.toMatch(/Enregistrez d\\'abord la fiche du patient/);
    expect((src.match(/_portailAssurerFiche\(p\)/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it('date de naissance manquante : plus de blocage, le serveur génère un code provisoire', () => {
    expect(src).not.toMatch(/Renseignez la date de naissance du patient pour créer l\\'accès/);
    expect(src).toMatch(/_portailHtmlPremiereConnexion/);
  });
  it('service workers incrémentés', () => {
    expect(lire('patient/sw.js')).toMatch(/verticy-patient-v21/);
    expect(lire('service-worker.js')).toMatch(/biomeca-v293/);
  });
});
