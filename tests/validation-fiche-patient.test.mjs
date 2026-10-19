// Audit 19/10 — validation de la fiche patient (date future, poids, taille, e-mail)
// + blocs admin masqués pour un non-admin + CSS mobile.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const valider = new Function(`${fonction('validerFichePatient')}; return validerFichePatient;`)();
const NOW = new Date('2026-10-19T12:00:00Z').getTime();
const ok = (v) => valider(v, NOW);

describe('validerFichePatient', () => {
  it('fiche cohérente ou champs facultatifs vides → pas d’erreur', () => {
    expect(ok({ ddn: '1985-06-15', poids: '72', taille: '178', email: 'a@b.fr' })).toBe('');
    expect(ok({ ddn: '2020-01-01', poids: '', taille: '', email: '' })).toBe('');
    expect(ok({ ddn: '', poids: undefined, taille: null, email: undefined })).toBe('');
  });
  it('date de naissance future / invraisemblable refusée', () => {
    expect(ok({ ddn: '2999-01-01' })).toMatch(/futur/);
    expect(ok({ ddn: '2026-10-20' })).toMatch(/futur/);
    expect(ok({ ddn: '1850-01-01' })).toMatch(/120 ans/);
    expect(ok({ ddn: '2026-10-19' })).toBe('');
  });
  it('poids et taille hors bornes refusés, bornes acceptées', () => {
    expect(ok({ poids: '-50' })).toMatch(/Poids/);
    expect(ok({ poids: '0' })).toMatch(/Poids/);
    expect(ok({ poids: '401' })).toMatch(/Poids/);
    expect(ok({ poids: 'abc' })).toMatch(/Poids/);
    expect(ok({ poids: '3.5' })).toBe('');
    expect(ok({ taille: '99999' })).toMatch(/Taille/);
    expect(ok({ taille: '19' })).toMatch(/Taille/);
    expect(ok({ taille: '50' })).toBe('');
  });
  it('e-mail invalide refusé', () => {
    expect(ok({ email: 'pas-un-email' })).toMatch(/e-mail/);
    expect(ok({ email: 'a@b' })).toMatch(/e-mail/);
    expect(ok({ email: ' jean@exemple.fr ' })).toBe('');
  });
});

describe('branchement', () => {
  it('création ET édition appellent la validation', () => {
    expect(fonction('createPatient')).toContain('validerFichePatient(');
    expect(fonction('saveEditPatient')).toContain('validerFichePatient(');
  });
  it('identifiant patient unique même dans la même milliseconde', () => {
    expect(fonction('createPatient')).toMatch(
      /while \(patients\.some\(x => x\.id === _idPatient\)\)/
    );
  });
  it('Paramètres : liste admin non appelée pour un non-admin', () => {
    const f = fonction('renderParamsPratList');
    expect(f.indexOf('if (!pwaUser?.isAdmin) return;')).toBeGreaterThan(-1);
    expect(f.indexOf('if (!pwaUser?.isAdmin) return;')).toBeLessThan(f.indexOf('adminListUsers('));
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('id="params-bloc-acces"');
    expect(html).toContain('id="params-bloc-users"');
  });
});

describe('CSS mobile', () => {
  const css = readFileSync(new URL('../css/biomeca.css', import.meta.url), 'utf8');
  it('barre du haut à hauteur libre en mobile', () => {
    expect(css).toMatch(/\.topbar \{[^}]*height: auto; min-height: 56px/);
  });
  it('barre patients repliable, assistant en pastille', () => {
    expect(css).toMatch(/\.pt-toolbar \{ flex-wrap: wrap; \}/);
    expect(css).toMatch(/#help-float \{ width: 44px;/);
  });
  it('SRC chargé', () => expect(SRC_BIOMECA.length).toBeGreaterThan(1000));
});
