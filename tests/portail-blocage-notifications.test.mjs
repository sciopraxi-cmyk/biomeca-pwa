// Blocage des notifications d'un patient (fenêtre 🔑) et rythme de vérification. Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const corps = [
    'const SUPA_URL = "https://x"; const appels = []; const affichages = []; let confirmer = true; let consultation = false;',
    'let patients = [{ _cloudId: "c1", prenom: "L", nom: "F" }]; let statuts = []; let compte = { notifications_bloquees_at: null };',
    'const _escHtml = (t) => String(t); const showAccessRestrictedModal = () => { appels.push("restreint"); };',
    'const confirm = () => confirmer;',
    'const authFetch = async (u, o) => { appels.push((o && o.method || "GET") + " " + u + (o && o.body ? " " + o.body : "")); const st = statuts.shift(); if (st === "ko") throw new Error("hors"); const status = st || 200; return { status, ok: status < 300, json: async () => [compte] }; };',
    'const _portailAfficher = (idx, c, msg) => { affichages.push([c, msg]); };',
    'const globalThis2 = globalThis;',
    fonction('_portailLireCompte'),
    fonction('_portailHtmlBlocage'),
    fonction('portailBasculerNotifications'),
    `return { lire: _portailLireCompte, html: _portailHtmlBlocage, basculer: portailBasculerNotifications, appels, affichages,
      cfg: (o) => { if ('statuts' in o) statuts = o.statuts; if ('compte' in o) compte = o.compte; if ('confirmer' in o) confirmer = o.confirmer; if ('consultation' in o) globalThis._modeConsultation = o.consultation; if ('patients' in o) patients = o.patients; } };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}
const p = { _cloudId: 'c1' };

describe('fenêtre 🔑 : blocage des notifications', () => {
  it('actives : proposition de bloquer ; bloquées : date, rappel que les mots restent lisibles, proposition de réactiver', () => {
    const m = monter();
    const actif = m.html(3, { notifications_bloquees_at: null });
    expect(actif).toContain('Actives');
    expect(actif).toContain('portailBasculerNotifications(3,true)');
    const bloque = m.html(3, { notifications_bloquees_at: '2026-10-24T10:00:00Z' });
    expect(bloque).toMatch(/Bloquées depuis le 24\/10\/2026/);
    expect(bloque).toContain('Suivi des séances');
    expect(bloque).toContain('portailBasculerNotifications(3,false)');
  });
  it('SQL pas encore posé (colonne absente) : rien n’est affiché', () => {
    expect(monter().html(0, { identifiant: 'X' })).toBe('');
  });
  it('lecture du compte : colonne demandée ; erreur 400 → nouvelle lecture sans la colonne (la fenêtre reste utilisable)', async () => {
    const m = monter();
    await m.lire(p);
    expect(m.appels[0]).toContain('notifications_bloquees_at');
    expect(m.appels[0]).toContain('messagerie_desactivee_at');
    const n = monter();
    n.cfg({ statuts: [400] });
    await n.lire(p);
    expect(n.appels.length).toBe(2);
    expect(n.appels[1]).toContain('notifications_bloquees_at'); // le SQL de la messagerie manque : on garde le blocage
    expect(n.appels[1]).not.toContain('messagerie_desactivee_at');
    const o = monter();
    o.cfg({ statuts: [400, 400] });
    await o.lire(p);
    expect(o.appels.length).toBe(3);
    expect(o.appels[2]).not.toContain('notifications_bloquees_at');
    expect(o.appels[2]).not.toContain('messagerie_desactivee_at');
  });
  it('lecture : une vraie erreur serveur lève une exception', async () => {
    const m = monter();
    m.cfg({ statuts: [500] });
    await expect(m.lire(p)).rejects.toThrow(/lecture 500/);
  });
  it('bloquer : confirmation, PATCH de la fiche concernée avec la date, fenêtre réaffichée', async () => {
    const m = monter();
    await m.basculer(0, true);
    const patch = m.appels.find((a) => a.startsWith('PATCH'));
    expect(patch).toContain('patient_comptes?patient_id=eq.c1');
    expect(JSON.parse(patch.split(' ').slice(2).join(' ')).notifications_bloquees_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
    expect(m.affichages.at(-1)[1]).toBe('');
  });
  it('réactiver : PATCH avec null, sans confirmation', async () => {
    const m = monter();
    m.cfg({ confirmer: false });
    await m.basculer(0, false);
    const patch = m.appels.find((a) => a.startsWith('PATCH'));
    expect(JSON.parse(patch.split(' ').slice(2).join(' '))).toEqual({
      notifications_bloquees_at: null,
    });
  });
  it('confirmation refusée : aucun appel', async () => {
    const m = monter();
    m.cfg({ confirmer: false });
    await m.basculer(0, true);
    expect(m.appels).toEqual([]);
  });
  it('échec d’écriture ou réseau coupé : message clair, jamais d’exception', async () => {
    const m = monter();
    m.cfg({ statuts: [403] });
    await expect(m.basculer(0, true)).resolves.toBeUndefined();
    expect(m.affichages.at(-1)[1]).toMatch(/Modification impossible/);
    const n = monter();
    n.cfg({ statuts: ['ko'] });
    await expect(n.basculer(0, true)).resolves.toBeUndefined();
    expect(n.affichages.at(-1)[1]).toMatch(/Modification impossible/);
  });
  it('mode consultation ou fiche sans identifiant cloud : rien n’est écrit', async () => {
    const m = monter();
    m.cfg({ consultation: true });
    await m.basculer(0, true);
    expect(m.appels).toEqual(['restreint']);
    m.cfg({ consultation: false, patients: [{}] });
    await m.basculer(0, true);
    expect(m.appels).toEqual(['restreint']);
  });
});

describe('rythme de vérification des notifications du portail', () => {
  it('toutes les 30 s, aussi au retour sur l’onglet, et jamais onglet masqué', () => {
    expect(SRC_BIOMECA).toMatch(/setInterval\(_portailVerifierNotifications, 30 \* 1000\)/);
    const f = fonction('_portailVerifierNotifications');
    expect(f).toContain("document.visibilityState === 'hidden'");
    expect(f).toContain('_portailVerifierFins(true)');
    expect(f).toContain('_portailVerifierMots(true)');
    expect(SRC_BIOMECA).toMatch(
      /visibilityState === 'visible'\) _portailVerifierNotifications\(\)/
    );
  });
  it('la fenêtre expose le bouton au clavier (onclick) via window', () => {
    expect(SRC_BIOMECA).toMatch(/Object\.assign\(window, \{[^}]*portailBasculerNotifications/);
  });
});
