// ═══════════════════════════════════════════════════════════════════
// Abonnement terminé (ancien abonné ou essai expiré) : UNE seule fenêtre
// ═══════════════════════════════════════════════════════════════════
// Réabonnement requis pour accéder à la plateforme ; seule la récupération des données reste
// offerte (export CSV des patients, devis et factures émis). Fonctions EXTRAITES de
// js/biomeca.js, DOM simulé. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const NOMS = [
  'computeAccessLevel',
  'checkAccessStatus',
  '_showAccessOverlay',
  '_hideAccessOverlay',
  '_accesVerrouille',
  'closeSubscribeModal',
  'exporterPatientsDepuisAcces',
];

function monter({ user, dataLoaded = true, niveau } = {}) {
  const journal = { exports: [], alertes: [], bandeau: [], appliques: [] };
  const overlay = {
    style: { display: 'none' },
    firstElementChild: { children: [{}, { textContent: '' }, { textContent: '' }] },
  };
  const recup = { style: { display: 'none' } };
  const els = {
    'trial-expired-overlay': overlay,
    'overlay-recuperation': recup,
    'modal-subscribe': { style: { display: 'flex' } },
  };
  const document = { getElementById: (id) => els[id] ?? null };
  const corps = [
    'let _dataLoaded = __charge;',
    'const window = { _accessLevel: __niveau };',
    'const pwaUser = __user;',
    'const _aboMeta = () => pwaUser.user_metadata || {};',
    'const _hideAccessBanner = () => __j.bandeau.push("cache");',
    'const _showAccessBanner = (b) => __j.bandeau.push(b.text);',
    'const applyReadOnlyUI = (l) => __j.appliques.push(l);',
    'const tryStartTrial = async () => ({ ok: true });',
    'const exportPatientsCSV = () => __j.exports.push(1);',
    ...NOMS.map(fonction),
    `return { ${NOMS.join(', ')}, niveau: () => window._accessLevel };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function('document', 'alert', '__charge', '__niveau', '__user', '__j', corps)(
    document,
    (m) => journal.alertes.push(m),
    dataLoaded,
    niveau,
    user ?? { isAdmin: false, user_metadata: {}, user_data: {} },
    journal
  );
  return { f, journal, overlay, recup, els };
}
const ANCIEN = { user_metadata: {}, user_data: { licence_payee: true, formule: null } };
const ACTIF = { user_metadata: {}, user_data: { licence_payee: true, formule: 'formule_1' } };
const ESSAI_EXPIRE = {
  user_metadata: { trial_start: '2020-01-01T00:00:00Z' },
  user_data: { licence_payee: false, formule: null },
};

describe('connexion : une seule fenêtre pour un abonnement terminé', () => {
  it('ancien abonné (lecture seule) : la fenêtre « abonnement terminé » couvre la plateforme, sans bandeau', () => {
    const e = monter({ user: { isAdmin: false, ...ANCIEN } });
    e.f.checkAccessStatus();
    expect(e.f.niveau()).toBe('readonly');
    expect(e.overlay.style.display).toBe('flex');
    const [, titre, msg] = e.overlay.firstElementChild.children;
    expect(titre.textContent).toBe('Votre abonnement est terminé');
    expect(msg.textContent).toMatch(/réabonnez-vous/);
    expect(msg.textContent).toMatch(/Pour accéder à la plateforme/);
    expect(e.journal.bandeau).toEqual(['cache']); // aucun texte de bandeau « suspendu »
  });
  it('essai expiré : même fenêtre, message de réabonnement', () => {
    const e = monter({ user: { isAdmin: false, ...ESSAI_EXPIRE } });
    e.f.checkAccessStatus();
    expect(e.f.niveau()).toBe('blocked');
    expect(e.overlay.style.display).toBe('flex');
    const [, titre, msg] = e.overlay.firstElementChild.children;
    expect(titre.textContent).toBe('Votre essai est terminé');
    expect(msg.textContent).toMatch(/Pour accéder à la plateforme, choisissez une formule/);
  });
  it('abonné actif et administrateur : aucune fenêtre', () => {
    for (const user of [
      { isAdmin: false, ...ACTIF },
      { isAdmin: true, user_metadata: {} },
    ]) {
      const e = monter({ user });
      e.overlay.style.display = 'flex';
      e.f.checkAccessStatus();
      expect(e.overlay.style.display, JSON.stringify(user)).toBe('none');
    }
  });
  it('la récupération des données est proposée pour un ancien abonné et un essai expiré, jamais quand le compte est illisible', () => {
    const affiche = (user) => {
      const e = monter({ user });
      e.f.checkAccessStatus();
      return e.recup.style.display;
    };
    expect(affiche({ isAdmin: false, ...ANCIEN })).toBe('');
    expect(affiche({ isAdmin: false, ...ESSAI_EXPIRE })).toBe('');
    expect(affiche({ isAdmin: false, user_metadata: {}, user_data: null })).toBe('none'); // données illisibles
  });
  it('compte « jamais payé, sans essai » : écran de bienvenue sans récupération (rien à récupérer)', () => {
    const e = monter();
    e.f._showAccessOverlay({ cause: 'never_paid' });
    expect(e.recup.style.display).toBe('none');
    expect(e.overlay.firstElementChild.children[1].textContent).toBe('Bienvenue');
  });
});

describe('la fenêtre de choix de formule se ferme et ramène à la fenêtre unique', () => {
  it('verrouillé : bloqué ET lecture seule ; libre : actif, chargement, niveau inconnu', () => {
    const v = (niveau) => monter({ niveau }).f._accesVerrouille();
    expect(v('blocked')).toBe(true);
    expect(v('readonly')).toBe(true);
    for (const n of ['full', 'loading', undefined]) expect(v(n), String(n)).toBe(false);
  });
  it('closeSubscribeModal ferme pour tous ; la fenêtre unique, elle, reste affichée', () => {
    for (const niveau of ['readonly', 'blocked', 'full']) {
      const e = monter({ niveau });
      e.f._showAccessOverlay({ cause: 'subscription_ended' });
      e.f.closeSubscribeModal();
      expect(e.els['modal-subscribe'].style.display, niveau).toBe('none');
      expect(e.overlay.style.display, niveau).toBe('flex');
    }
  });
  it('le bouton de fermeture est toujours visible, le clic hors cadre ferme aussi', () => {
    expect(SRC_BIOMECA).toContain("closeBtn.style.display = 'inline-block';");
    expect(SRC_BIOMECA).not.toContain("e.target === modal && window._accessLevel !== 'blocked'");
  });
});
