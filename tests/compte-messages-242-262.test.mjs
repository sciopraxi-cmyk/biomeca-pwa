import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { engagementHorsStripe } from '../js/subscription.mjs';

// #242 (licence offerte / partenaire : pas de parcours de résiliation Stripe)
// et #262 (échec de lecture : message visible, jamais un abandon muet).
// Les fonctions réelles de js/biomeca.js sont extraites et exécutées avec un
// DOM et un réseau factices (aucune donnée réelle).
const SRC = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');

function extraire(debut, fin) {
  const a = SRC.indexOf(debut);
  const b = SRC.indexOf(fin, a);
  expect(a, debut).toBeGreaterThan(-1);
  expect(b, fin).toBeGreaterThan(a);
  return SRC.slice(a, b);
}
const CODE = [
  extraire('var _ENGAGEMENT_LABELS', 'async function loadAbonnementInfo'),
  extraire('async function loadAbonnementInfo', 'function gererAbonnement'),
  extraire('async function resilierAbonnement', '// ===== IMPORT CSV PATIENTS'),
].join('\n');

function monde(rec, { token = 't' } = {}) {
  const els = {};
  const get = (id) => (els[id] ??= { id, style: {}, textContent: '', innerHTML: '' });
  const alertes = [];
  const ouvertures = [];
  const confirmations = [];
  const f = new Function(
    'pwaUser',
    'supa',
    'document',
    'alert',
    'confirm',
    'window',
    '_stripePortalUrl',
    CODE + '\nreturn { loadAbonnementInfo, resilierAbonnement, _engagementHorsStripe };'
  );
  const api = f(
    token ? { id: 'u', token } : { id: 'u' },
    { getUserRecord: async () => rec },
    { getElementById: get },
    (m) => alertes.push(m),
    (m) => (confirmations.push(m), true),
    { open: (u) => ouvertures.push(u) },
    'https://portail.exemple.invalid/'
  );
  return { api, els, get, alertes, ouvertures, confirmations };
}

const ligne = (engagement) => ({
  ok: true,
  row: {
    licence_payee: true,
    formule: 'x',
    engagement,
    date_debut_abonnement: '2026-01-15T00:00:00Z',
  },
});

describe('#242 licence offerte / partenaire', () => {
  it('le miroir pur et la copie du runtime répondent pareil', () => {
    const { api } = monde(ligne('sans'));
    for (const e of ['sans', '1_an', 'admin_gratuit', 'partenaire_podaxia', null, 'x']) {
      expect(api._engagementHorsStripe(e)).toBe(engagementHorsStripe(e));
    }
    expect(engagementHorsStripe('admin_gratuit')).toBe(true);
    expect(engagementHorsStripe('partenaire_podaxia')).toBe(true);
    expect(engagementHorsStripe('sans')).toBe(false);
    expect(engagementHorsStripe('1_an')).toBe(false);
  });

  for (const e of ['admin_gratuit', 'partenaire_podaxia']) {
    it(`${e} : « Mon compte » n'offre ni résiliation ni renouvellement`, async () => {
      const m = monde(ligne(e));
      m.get('mc-resilier-wrap').style.display = 'block';
      await m.api.loadAbonnementInfo();
      expect(m.els['mc-resilier-wrap'].style.display).toBe('none');
      expect(m.els['mc-renouvellement'].textContent).toContain('Aucun prélèvement');
      expect(m.els['mc-renouvellement'].textContent).not.toContain('Prochain renouvellement');
    });

    it(`${e} : résilier explique et n'ouvre JAMAIS le portail Stripe`, async () => {
      const m = monde(ligne(e));
      await m.api.resilierAbonnement();
      expect(m.alertes.length).toBe(1);
      expect(m.alertes[0]).toContain('rien à résilier');
      expect(m.ouvertures).toEqual([]);
      expect(m.confirmations).toEqual([]);
    });
  }

  it("témoin : un abonnement 'sans' garde le parcours Stripe", async () => {
    const m = monde(ligne('sans'));
    await m.api.loadAbonnementInfo();
    expect(m.els['mc-resilier-wrap'].style.display).toBe('block');
    expect(m.els['mc-renouvellement'].textContent).toContain('Prochain renouvellement');
    await m.api.resilierAbonnement();
    expect(m.confirmations.length).toBe(1);
    expect(m.ouvertures).toEqual(['https://portail.exemple.invalid/']);
  });
});

describe('#262 échec de lecture visible', () => {
  it('« Mon compte » : lecture en échec → message rouge, pas un écran vide', async () => {
    const m = monde({ ok: false, row: null });
    await m.api.loadAbonnementInfo();
    expect(m.els['mc-licence-status'].innerHTML).toContain('Impossible de lire votre abonnement');
  });

  it('« Mon compte » : aucune ligne → message distinct', async () => {
    const m = monde({ ok: true, row: null });
    await m.api.loadAbonnementInfo();
    expect(m.els['mc-licence-status'].innerHTML).toContain('Aucune information');
  });

  it("résilier : lecture en échec → alerte « aucune résiliation n'a été faite »", async () => {
    const m = monde({ ok: false, row: null });
    await m.api.resilierAbonnement();
    expect(m.alertes.length).toBe(1);
    expect(m.alertes[0]).toContain("Aucune résiliation n'a été faite");
    expect(m.ouvertures).toEqual([]);
  });

  it('résilier : aucune ligne → alerte aussi', async () => {
    const m = monde({ ok: true, row: null });
    await m.api.resilierAbonnement();
    expect(m.alertes.length).toBe(1);
    expect(m.ouvertures).toEqual([]);
  });

  it('résilier : session absente → alerte, pas de silence', async () => {
    const m = monde(ligne('sans'), { token: null });
    await m.api.resilierAbonnement();
    expect(m.alertes.length).toBe(1);
    expect(m.ouvertures).toEqual([]);
  });
});
