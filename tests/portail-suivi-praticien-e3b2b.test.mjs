// Lot e3b-2b, côté praticien : suivi des séances validées et notification de fin de programme. Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const corps = [
    'let pwaUser = { id: "u" }; let patients = []; let hors = false; let reseau = null;',
    'const SUPA_URL = "https://x"; const appels = []; const notifs = []; const rpcs = [];',
    'let rpcReponses = {}; let notifEchec = false;',
    'const authFetch = async (u) => { appels.push(u); if (reseau === "ko") throw new Error("hors"); return reseau || { ok: true, json: async () => lecture }; };',
    'let lecture = [];',
    'const _horsConnexion = () => hors;',
    'const _portailRpc = async (n, c) => { rpcs.push([n, c]); const r = rpcReponses[c.p_patient]; if (r === "erreur") throw new Error("rpc"); return r; };',
    'const notifierEvenement = (t, o) => { notifs.push([t, o]); return {}; };',
    'let _finsDerniere = 0; let _finsEnCours = false;',
    fonction('_progJour'),
    fonction('_progISO'),
    fonction('_suiviSeances'),
    fonction('_portailVerifierFins'),
    `return {
      _suiviSeances, verifier: _portailVerifierFins, appels, notifs, rpcs,
      cfg: (o) => { if ('patients' in o) patients = o.patients; if ('lecture' in o) lecture = o.lecture; if ('hors' in o) hors = o.hors;
        if ('pwaUser' in o) pwaUser = o.pwaUser; if ('reseau' in o) reseau = o.reseau; if ('rpc' in o) rpcReponses = o.rpc; _finsDerniere = 0; },
    };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}

describe('suivi de la semaine (fiche patient)', () => {
  const m = monter();
  const jours = [
    { date: '2026-10-20', seances: [{ id: 'pied' }] }, // hors semaine
    { date: '2026-10-24', seances: [{ id: 'express1' }, { id: 'pied' }] },
    { date: '2026-10-26', seances: [{ id: 'pied' }] },
    { date: '2026-10-30', seances: [{ id: 'pied' }] }, // futur
  ];
  it('semaine glissante de 7 jours finissant aujourd’hui : validées / prévues', () => {
    const v = [
      { jour: '2026-10-24', seance_id: 'express1' },
      { jour: '2026-10-20', seance_id: 'pied' },
      { jour: '2026-10-30', seance_id: 'pied' },
    ];
    expect(m._suiviSeances(jours, v, '2026-10-26')).toEqual({
      prevues: 4,
      validees: 2,
      debut: '2026-10-20',
    });
    expect(m._suiviSeances(jours, v, '2026-10-27')).toMatchObject({ prevues: 3, validees: 1 }); // le 20/10 sort de la fenêtre
    expect(m._suiviSeances(jours, v, '2026-10-28')).toMatchObject({ prevues: 3, validees: 1 });
  });
  it('sans validation, sans programme, date invalide', () => {
    expect(m._suiviSeances(jours, [], '2026-10-26').validees).toBe(0);
    expect(m._suiviSeances(null, null, '2026-10-26')).toEqual({
      prevues: 0,
      validees: 0,
      debut: '2026-10-20',
    });
    expect(m._suiviSeances(jours, [], '').prevues).toBe(0);
  });
});

describe('notification de fin de programme (patient_protocole_termine)', () => {
  const lp = (...ids) => ids.map((patient_id) => ({ patient_id }));
  it('une fin non notifiée : le serveur répond true → UNE notification avec l’identifiant de la fiche seulement', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 42, _cloudId: 'c1' }], lecture: lp('c1'), rpc: { c1: true } });
    await m.verifier(true);
    expect(m.rpcs).toEqual([['programme_fin_notifiee', { p_patient: 'c1' }]]);
    expect(m.notifs).toEqual([['patient_protocole_termine', { patientId: 42 }]]);
    expect(m.appels[0]).toContain('programme_fins?select=patient_id&notifie_at=is.null');
  });
  it('déjà notifiée ailleurs (réponse false) : aucune notification', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 42, _cloudId: 'c1' }], lecture: lp('c1'), rpc: { c1: false } });
    await m.verifier(true);
    expect(m.notifs).toEqual([]);
  });
  it('fiche inconnue sur cet appareil : rien n’est marqué ni notifié', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 1, _cloudId: 'autre' }], lecture: lp('c1'), rpc: {} });
    await m.verifier(true);
    expect(m.rpcs).toEqual([]);
    expect(m.notifs).toEqual([]);
  });
  it('plusieurs fiches : une notification par fiche', async () => {
    const m = monter();
    m.cfg({
      patients: [
        { id: 1, _cloudId: 'a' },
        { id: 2, _cloudId: 'b' },
      ],
      lecture: lp('a', 'b'),
      rpc: { a: true, b: true },
    });
    await m.verifier(true);
    expect(m.notifs.map((n) => n[1].patientId)).toEqual([1, 2]);
  });
  it('échec du serveur, réseau coupé, hors connexion, non connecté, consultation : jamais d’exception ni de notification', async () => {
    const m = monter();
    m.cfg({ patients: [{ id: 1, _cloudId: 'a' }], lecture: lp('a'), rpc: { a: 'erreur' } });
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
  it('vérification limitée à une par minute (hors demande forcée)', async () => {
    const m = monter();
    m.cfg({ patients: [], lecture: [], rpc: {} });
    await m.verifier();
    await m.verifier();
    expect(m.appels.length).toBe(1);
    await m.verifier(true);
    expect(m.appels.length).toBe(2);
  });
});

describe('câblage dans l’application', () => {
  it('nav() déclenche la vérification, le type de notification existe, la fiche affiche le suivi', () => {
    expect(SRC_BIOMECA).toMatch(
      /if \(typeof _portailVerifierFins === 'function'\) _portailVerifierFins\(\);/
    );
    expect(SRC_BIOMECA).toMatch(/patient_protocole_termine: \{ icone:/);
    expect(SRC_BIOMECA).toMatch(/_portailChargerSuivi\(idx\); _portailChargerDocs\(idx\)/);
    expect(SRC_BIOMECA).toContain('portail-suivi');
  });
  it('le commentaire du patient s’affiche en texte seulement (jamais en HTML)', () => {
    const d = SRC_BIOMECA.indexOf('async function _portailChargerSuivi');
    const f = SRC_BIOMECA.indexOf('async function _portailVerifierFins');
    const corps = SRC_BIOMECA.slice(d, f);
    expect(corps).not.toMatch(/innerHTML/);
    expect(corps).toContain('l.textContent');
  });
});
