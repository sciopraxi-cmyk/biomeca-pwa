// Lot e3b-2b : notification « ressenti d'un patient » (mot écrit après une séance). Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const corps = [
    'let pwaUser = { id: "u" }; let patients = []; let hors = false; let reseau = null; let lecture = [];',
    'const SUPA_URL = "https://x"; const appels = []; const notifs = []; const rpcs = []; let rpcRep = {};',
    'const authFetch = async (u) => { appels.push(u); if (reseau === "ko") throw new Error("hors"); return reseau || { ok: true, json: async () => lecture }; };',
    'const _horsConnexion = () => hors;',
    'const _docRequete = async (c) => { if (reseau === "ko") throw new Error("hors"); appels.push(c); if (reseau && !reseau.ok) throw new Error("HTTP"); return { json: async () => lecture }; };',
    'const _portailRpc = async (n, c) => { rpcs.push([n, c]); const r = rpcRep[c.p_seance]; if (r === "erreur") throw new Error("rpc"); return r; };',
    'const notifierEvenement = (t, o) => { notifs.push([t, o]); return {}; };',
    'let _motsDerniere = 0; let _motsEnCours = false; let _notifDetailId = null;',
    'const zone = { style: {}, textContent: "" }; let zonePresente = true;',
    'const document = { getElementById: (id) => (id === "notif-mot-corps" && zonePresente ? zone : null) };',
    fonction('_portailVerifierMots'),
    fonction('_notifChargerMot'),
    `return {
      verifier: _portailVerifierMots, charger: _notifChargerMot, appels, notifs, rpcs, zone,
      cfg: (o) => { if ('patients' in o) patients = o.patients; if ('lecture' in o) lecture = o.lecture; if ('hors' in o) hors = o.hors;
        if ('pwaUser' in o) pwaUser = o.pwaUser; if ('reseau' in o) reseau = o.reseau; if ('rpc' in o) rpcRep = o.rpc;
        if ('detail' in o) _notifDetailId = o.detail; if ('zone' in o) zonePresente = o.zone; _motsDerniere = 0; },
    };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}
const mot = (patient_id, seance_id, jour = '2026-10-26') => ({ patient_id, jour, seance_id });

describe('notification du ressenti du patient', () => {
  it('un mot non notifié, le serveur répond true → UNE notification (fiche + jour + séance seulement)', async () => {
    const m = monter();
    m.cfg({
      patients: [{ id: 42, _cloudId: 'c1' }],
      lecture: [mot('c1', 'pied')],
      rpc: { pied: true },
    });
    await m.verifier(true);
    expect(m.rpcs).toEqual([
      ['programme_mot_notifie', { p_patient: 'c1', p_jour: '2026-10-26', p_seance: 'pied' }],
    ]);
    expect(m.notifs).toEqual([
      ['patient_ressenti', { patientId: 42, seance: { jour: '2026-10-26', id: 'pied' } }],
    ]);
    expect(m.appels[0]).toContain(
      'programme_validations?select=patient_id,jour,seance_id&mot_at=not.is.null&mot_notifie_at=is.null'
    );
    expect(JSON.stringify(m.notifs)).not.toMatch(/commentaire|mot de/);
  });
  it('déjà notifié ailleurs (false) : rien', async () => {
    const m = monter();
    m.cfg({
      patients: [{ id: 42, _cloudId: 'c1' }],
      lecture: [mot('c1', 'pied')],
      rpc: { pied: false },
    });
    await m.verifier(true);
    expect(m.notifs).toEqual([]);
  });
  it('fiche inconnue sur cet appareil : ni marquée ni notifiée', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 1, _cloudId: 'autre' }], lecture: [mot('c1', 'pied')], rpc: {} });
    await m.verifier(true);
    expect(m.rpcs).toEqual([]);
    expect(m.notifs).toEqual([]);
  });
  it('plusieurs mots : une notification par séance', async () => {
    const m = monter();
    m.cfg({
      patients: [
        { id: 1, _cloudId: 'a' },
        { id: 2, _cloudId: 'b' },
      ],
      lecture: [mot('a', 'pied'), mot('a', 'express1'), mot('b', 'pied')],
      rpc: { pied: true, express1: true },
    });
    await m.verifier(true);
    expect(m.notifs.map((n) => [n[1].patientId, n[1].seance.id])).toEqual([
      [1, 'pied'],
      [1, 'express1'],
      [2, 'pied'],
    ]);
  });
  it('erreurs (serveur, réseau, hors connexion, non connecté) : jamais d’exception ni de notification', async () => {
    const m = monter();
    m.cfg({
      patients: [{ id: 1, _cloudId: 'a' }],
      lecture: [mot('a', 'pied')],
      rpc: { pied: 'erreur' },
    });
    await expect(m.verifier(true)).resolves.toBeUndefined();
    m.cfg({ reseau: { ok: false, json: async () => [] } });
    await m.verifier(true);
    m.cfg({ reseau: 'ko' });
    await expect(m.verifier(true)).resolves.toBeUndefined();
    m.cfg({ reseau: null, hors: true });
    await m.verifier(true);
    m.cfg({ hors: false, pwaUser: null });
    await m.verifier(true);
    expect(m.notifs).toEqual([]);
  });
  it('au plus une vérification par minute (hors demande forcée)', async () => {
    const m = monter();
    m.cfg({ patients: [], lecture: [], rpc: {} });
    await m.verifier();
    await m.verifier();
    expect(m.appels.length).toBe(1);
    await m.verifier(true);
    expect(m.appels.length).toBe(2);
  });
});

describe('détail de la notification : le mot est relu en base, affiché en texte', () => {
  const e = { cible: { patientId: 42 }, seance: { jour: '2026-10-26', id: 'pied' } };
  it('affiche le mot (texte seulement), requête limitée à la fiche, au jour et à la séance', async () => {
    const m = monter();
    m.cfg({
      patients: [{ id: 42, _cloudId: 'c1' }],
      lecture: [{ commentaire: '<img src=x onerror=alert(1)> trop dur' }],
      detail: 7,
    });
    await m.charger(7, e);
    expect(m.zone.textContent).toBe('<img src=x onerror=alert(1)> trop dur');
    expect(m.appels[0]).toContain('patient_id=eq.c1&jour=eq.2026-10-26&seance_id=eq.pied');
  });
  it('mot retiré, hors connexion, fiche absente : message clair', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 42, _cloudId: 'c1' }], lecture: [{ commentaire: null }], detail: 7 });
    await m.charger(7, e);
    expect(m.zone.textContent).toMatch(/retiré/);
    m.cfg({ reseau: 'ko', detail: 7 });
    await m.charger(7, e);
    expect(m.zone.textContent).toMatch(/indisponible/);
    m.cfg({ reseau: null, patients: [], detail: 7 });
    await m.charger(7, e);
    expect(m.zone.textContent).toMatch(/indisponible/);
  });
  it('réponse tardive après avoir quitté le détail : rien n’est écrit', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 42, _cloudId: 'c1' }], lecture: [{ commentaire: 'x' }], detail: 99 });
    await m.charger(7, e);
    expect(m.zone.textContent).toBe('');
    m.cfg({ zone: false, detail: 7 });
    await expect(m.charger(7, e)).resolves.toBeUndefined();
  });
});

describe('câblage', () => {
  it('nav() déclenche la vérification, le type existe, le mot n’est jamais copié dans la notification', () => {
    expect(SRC_BIOMECA).toMatch(
      /if \(typeof _portailVerifierMots === 'function'\) _portailVerifierMots\(\);/
    );
    expect(SRC_BIOMECA).toMatch(/patient_ressenti: \{ icone:/);
    const d = SRC_BIOMECA.indexOf('async function _notifChargerMot');
    const f = SRC_BIOMECA.indexOf('function _notifHtmlDetail');
    expect(SRC_BIOMECA.slice(d, f)).not.toMatch(/innerHTML/);
    expect(SRC_BIOMECA.slice(d, f)).toContain('cible.textContent');
  });
});
