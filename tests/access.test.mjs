import { describe, it, expect, vi } from 'vitest';
import { computeAccessLevel } from '../js/access.mjs';

// Helpers de fixtures : timestamps relatifs à un point fixe pour stabilité
// (évite tout drift Date.now() entre exécutions).
const REF = new Date('2026-01-01T00:00:00Z').getTime();
const days = (n) => n * 86400000;

describe('computeAccessLevel', () => {
  it("1. Admin retourne 'full' immédiatement (bypass complet)", () => {
    const r = computeAccessLevel({ isAdmin: true, meta: {}, userData: null }, REF);
    expect(r).toBe('full');
  });

  it("2. licence_payee=true + formule active retourne 'full'", () => {
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: {},
        userData: { licence_payee: true, formule: 'formule_3' },
      },
      REF
    );
    expect(r).toBe('full');
  });

  it("3. !licence + trial_start il y a 5j retourne 'full' (essai actif)", () => {
    const trialStartIso = new Date(REF - days(5)).toISOString();
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: { trial_start: trialStartIso },
        userData: { licence_payee: false, formule: null },
      },
      REF
    );
    expect(r).toBe('full');
  });

  it("4. !licence + trial_start il y a 20j retourne 'blocked' (essai expiré)", () => {
    const trialStartIso = new Date(REF - days(20)).toISOString();
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: { trial_start: trialStartIso },
        userData: { licence_payee: false, formule: null },
      },
      REF
    );
    expect(r).toBe('blocked');
  });

  it("5. licence + formule=null + trial expiré retourne 'readonly'", () => {
    const trialStartIso = new Date(REF - days(20)).toISOString();
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: { trial_start: trialStartIso },
        userData: { licence_payee: true, formule: null },
      },
      REF
    );
    expect(r).toBe('readonly');
  });

  it("6. licence + formule=null + jamais de trial retourne 'readonly'", () => {
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: {},
        userData: { licence_payee: true, formule: null },
      },
      REF
    );
    expect(r).toBe('readonly');
  });

  it("7. État illégitime !licence && formule retourne 'blocked' + log Illegitimate", () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: {},
        userData: { licence_payee: false, formule: 'formule_2' },
      },
      REF
    );
    expect(r).toBe('blocked');
    expect(errSpy).toHaveBeenCalled();
    expect(errSpy.mock.calls[0][0]).toContain('Illegitimate');
    errSpy.mockRestore();
  });

  it("8. userData === undefined retourne 'loading' (fetch jamais lancé)", () => {
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: {},
        userData: undefined,
      },
      REF
    );
    expect(r).toBe('loading');
  });

  it("9. userData === null retourne 'blocked' (fail-secure)", () => {
    const r = computeAccessLevel(
      {
        isAdmin: false,
        meta: {},
        userData: null,
      },
      REF
    );
    expect(r).toBe('blocked');
  });
});
