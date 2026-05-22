import { describe, it, expect } from 'vitest';
import {
  PLAN_MODULES,
  defaultModulesForPlan,
  isValidModulesForPlan,
  canChangeModule,
} from '../js/subscription.mjs';

// Helpers de fixtures : timestamps relatifs à un point fixe pour stabilité
// (évite tout drift Date.now() entre exécutions). Pattern identique à
// tests/access.test.mjs.
const REF = new Date('2026-01-01T00:00:00Z').getTime();
const NOW = new Date(REF);
const days = (n) => n * 86400000;
const iso = (ms) => new Date(ms).toISOString();

describe('canChangeModule', () => {
  it('1. Première souscription (pas de date_debut_abonnement) → null', () => {
    const r = canChangeModule({ date_debut_abonnement: null, last_module_change: null }, NOW);
    expect(r).toBeNull();
  });

  it('2. date_debut il y a 3j, jamais changé → null (grace period actif)', () => {
    const r = canChangeModule(
      { date_debut_abonnement: iso(REF - days(3)), last_module_change: null },
      NOW
    );
    expect(r).toBeNull();
  });

  it("3. date_debut il y a 5j, changé hier → null (grace l'emporte sur lock)", () => {
    const r = canChangeModule(
      {
        date_debut_abonnement: iso(REF - days(5)),
        last_module_change: iso(REF - days(1)),
      },
      NOW
    );
    expect(r).toBeNull();
  });

  it('4. date_debut il y a 30j, jamais changé → null (hors grace, jamais changé)', () => {
    const r = canChangeModule(
      { date_debut_abonnement: iso(REF - days(30)), last_module_change: null },
      NOW
    );
    expect(r).toBeNull();
  });

  it('5. date_debut il y a 60j, changé il y a 10j → locked + next_change_date à J+20', () => {
    const r = canChangeModule(
      {
        date_debut_abonnement: iso(REF - days(60)),
        last_module_change: iso(REF - days(10)),
      },
      NOW
    );
    expect(r).toEqual({
      reason: 'locked',
      next_change_date: iso(REF + days(20)),
    });
  });

  it('6. date_debut il y a 60j, changé il y a 35j → null (lock expiré)', () => {
    const r = canChangeModule(
      {
        date_debut_abonnement: iso(REF - days(60)),
        last_module_change: iso(REF - days(35)),
      },
      NOW
    );
    expect(r).toBeNull();
  });

  it('7. date_debut il y a 60j, changé maintenant → locked + next_change_date à J+30', () => {
    const r = canChangeModule(
      {
        date_debut_abonnement: iso(REF - days(60)),
        last_module_change: iso(REF),
      },
      NOW
    );
    expect(r).toEqual({
      reason: 'locked',
      next_change_date: iso(REF + days(30)),
    });
  });
});

describe('PLAN_MODULES (defaultModulesForPlan + isValidModulesForPlan)', () => {
  it("1. Plan 0 (Essentiel) : default = ['postural'], isValid(['postural']) = ok", () => {
    expect(defaultModulesForPlan(0)).toEqual(['postural']);
    expect(isValidModulesForPlan(0, ['postural'])).toEqual({ ok: true });
  });

  it("2. Plan 1 (Sport) : default = ['podo_sport'], isValid([]) = missing_required", () => {
    expect(defaultModulesForPlan(1)).toEqual(['podo_sport']);
    expect(isValidModulesForPlan(1, [])).toEqual({
      ok: false,
      reason: 'missing_required',
    });
  });

  it("3. Plan 2 (Duo) : default = ['postural','podopedia'], isValid(['postural']) = missing_required", () => {
    expect(defaultModulesForPlan(2)).toEqual(['postural', 'podopedia']);
    expect(isValidModulesForPlan(2, ['postural'])).toEqual({
      ok: false,
      reason: 'missing_required',
    });
  });

  it("4. Plan 3 (Duo Sport) : default = ['podo_sport','postural'], isValid(2-from-choose) = wrong_choose_count", () => {
    expect(defaultModulesForPlan(3)).toEqual(['podo_sport', 'postural']);
    expect(isValidModulesForPlan(3, ['podo_sport', 'postural', 'podopedia'])).toEqual({
      ok: false,
      reason: 'wrong_choose_count',
    });
  });

  it('5. Plan 4 (Intégral) : default = tous, isValid(tous) = ok', () => {
    expect(defaultModulesForPlan(4)).toEqual(['postural', 'podopedia', 'podo_sport']);
    expect(isValidModulesForPlan(4, ['postural', 'podopedia', 'podo_sport'])).toEqual({ ok: true });
  });
});
