import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';

// #260 — gardes d'impression de applyReadOnlyUI (inchangées). NOTE du 20/10/2026 : un ancien
// abonné (« lecture seule ») ne voit plus l'application mais une fenêtre unique de
// réabonnement ; ces gardes restent en défense en profondeur.
const SRC = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');

function extraire(debut, fin) {
  const a = SRC.indexOf(debut);
  const b = SRC.indexOf(fin, a);
  expect(a, debut).toBeGreaterThan(-1);
  expect(b, fin).toBeGreaterThan(a);
  return SRC.slice(a, b);
}

function monde(level) {
  const bouton = (onclick) => {
    const b = { onclick, classes: new Set(), attrs: {} };
    b.classList = { add: (c) => b.classes.add(c), remove: (c) => b.classes.delete(c) };
    b.setAttribute = (k, v) => (b.attrs[k] = v);
    b.removeAttribute = (k) => delete b.attrs[k];
    return b;
  };
  const noms = [
    'openNewPatientModal',
    'creerBilanSport',
    'creerBilanPosturo',
    'creerBilanPedicurie',
    'creerBilanPodopediatrie',
    'printRapportPosturo',
    'printReport',
    'printBilan',
  ];
  const boutons = noms.map((n) => bouton(n));
  const document = {
    querySelectorAll: (sel) => {
      const motifs = [...sel.matchAll(/\[onclick\*="(\w+)"\]/g)].map((m) => m[1]);
      return boutons.filter((b) => motifs.some((m) => b.onclick.includes(m)));
    },
  };
  boutons.forEach((b) => {
    b.matches = (sel) =>
      [...sel.matchAll(/\[onclick\*="(\w+)"\]/g)].some((m) => b.onclick.includes(m[1]));
  });
  const code = extraire('function _accessPermetImpression', '// showAccessRestrictedModal');
  const fenetre = { _accessLevel: level };
  const api = new Function(
    'document',
    'window',
    `${code}\nreturn { applyReadOnlyUI, _accessPermetImpression };`
  )(document, fenetre);
  return { api, boutons, fenetre };
}

const desactive = (b) => b.attrs.disabled === 'true';

describe('#260 impression en lecture seule', () => {
  it('readonly : création bloquée, impression active', () => {
    const m = monde('readonly');
    m.api.applyReadOnlyUI('readonly');
    for (const b of m.boutons) {
      expect(desactive(b), b.onclick).toBe(!b.onclick.startsWith('print'));
    }
  });

  it('blocked : tout est désactivé', () => {
    const m = monde('blocked');
    m.api.applyReadOnlyUI('blocked');
    expect(m.boutons.every(desactive)).toBe(true);
  });

  it('full : rien de désactivé', () => {
    const m = monde('full');
    m.api.applyReadOnlyUI('full');
    expect(m.boutons.some(desactive)).toBe(false);
  });

  it('passer de blocked à readonly réactive l’impression', () => {
    const m = monde('blocked');
    m.api.applyReadOnlyUI('blocked');
    m.api.applyReadOnlyUI('readonly');
    expect(desactive(m.boutons.find((b) => b.onclick === 'printBilan'))).toBe(false);
    expect(desactive(m.boutons.find((b) => b.onclick === 'creerBilanSport'))).toBe(true);
  });

  it('garde d’impression : full, readonly, absent = oui ; blocked, loading = non', () => {
    for (const [l, ok] of [
      ['full', true],
      ['readonly', true],
      [undefined, true],
      ['blocked', false],
      ['loading', false],
    ]) {
      expect(monde(l).api._accessPermetImpression(), String(l)).toBe(ok);
    }
  });

  it('les 5 fonctions d’impression utilisent la garde commune, plus l’ancien test', () => {
    for (const f of [
      'function printRapportPosturo',
      'async function printReport',
      'function printRapportPedicurie',
      'async function printRapportPodopediatrie',
      'function printBilan',
    ]) {
      const i = SRC.indexOf(f);
      expect(i, f).toBeGreaterThan(-1);
      const debut = SRC.slice(i, i + 700);
      expect(debut, f).toContain('_accessPermetImpression()');
      expect(debut, f).not.toContain("_accessLevel !== 'full'");
    }
  });

  it("le bandeau « abonnement suspendu » n'existe plus : décision du 20/10/2026, un ancien abonné a une fenêtre unique de réabonnement (remplace #260 pour la lecture seule)", () => {
    expect(SRC).not.toContain('pour créer de nouveaux bilans et exporter en PDF');
    expect(SRC).not.toContain('Votre abonnement est suspendu');
    expect(SRC).toContain("_showAccessOverlay({ cause: 'subscription_ended' })");
  });
});
