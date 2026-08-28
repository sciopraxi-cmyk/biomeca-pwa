import { describe, it, expect } from 'vitest';
import {
  PLAN_MODULES,
  defaultModulesForPlan,
  isValidModulesForPlan,
  canChangeModule,
  describeEngagement,
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

// ═══════════════════════════════════════════════════════════════════
// describeEngagement (#241)
// ═══════════════════════════════════════════════════════════════════
//
// Ce comportement n'était couvert par RIEN — c'est pour cela que le test
// mort `engagement === '12_mois'` a survécu depuis l'origine. Les quatre
// valeurs couvertes ici sont celles réellement écrites en base ; aucun
// chemin d'écriture ne pose '12_mois' (vérifié sur tout le dépôt).

describe('describeEngagement — les quatre valeurs réelles', () => {
  const NOW_ENG = new Date('2026-06-15T12:00:00Z');

  it("1. 'sans' → « Sans engagement », résiliation libre", () => {
    const r = describeEngagement('sans', '2026-01-15T00:00:00Z', NOW_ENG);
    expect(r.etat).toBe('connu');
    expect(r.label).toBe('Sans engagement');
    expect(r.peutResilier).toBe(true);
    expect(r.moisRestants).toBeNull();
  });

  it("2. '1_an' en cours → libellé avec décompte, résiliation BLOQUÉE", () => {
    const r = describeEngagement('1_an', '2026-01-15T00:00:00Z', NOW_ENG);
    expect(r.etat).toBe('connu');
    expect(r.peutResilier).toBe(false);
    expect(r.moisRestants).toBe(7);
    expect(r.label).toBe('Engagement 12 mois — 7 mois restants');
    expect(r.finEngagement.getFullYear()).toBe(2027);
    expect(r.finEngagement.getMonth()).toBe(0);
  });

  it("3. 'admin_gratuit' → libellé propre, JAMAIS « Sans engagement »", () => {
    const r = describeEngagement('admin_gratuit', '2026-01-15T00:00:00Z', NOW_ENG);
    expect(r.label).toBe('Licence offerte (activation administrateur)');
    expect(r.label).not.toContain('Sans engagement');
    // Pas un abonnement avec engagement : aucun blocage de résiliation.
    expect(r.peutResilier).toBe(true);
  });

  it("4. 'partenaire_podaxia' → libellé propre, aucun blocage", () => {
    const r = describeEngagement('partenaire_podaxia', '2026-01-15T00:00:00Z', NOW_ENG);
    expect(r.label).toBe('Accès partenaire PODAXIA');
    expect(r.label).not.toContain('Sans engagement');
    expect(r.peutResilier).toBe(true);
  });

  it("5. '12_mois' (valeur morte, écrite par personne) tombe dans le repli inconnu", () => {
    const r = describeEngagement('12_mois', '2026-01-15T00:00:00Z', NOW_ENG);
    expect(r.etat).toBe('inconnu');
    expect(r.peutResilier).toBe(true);
  });
});

describe('describeEngagement — valeurs dégradées', () => {
  const NOW_ENG = new Date('2026-06-15T12:00:00Z');

  it('6. Valeur inconnue → repli explicite, jamais un libellé rassurant', () => {
    const r = describeEngagement('formule_mystere', '2026-01-15T00:00:00Z', NOW_ENG);
    expect(r.etat).toBe('inconnu');
    expect(r.label).toContain('non reconnu');
    expect(r.label).toContain('formule_mystere');
    expect(r.label).not.toContain('Sans engagement');
    expect(r.peutResilier).toBe(true);
  });

  it('7. Valeur absente (null) → « Aucun abonnement actif », pas de blocage', () => {
    const r = describeEngagement(null, null, NOW_ENG);
    expect(r.etat).toBe('absent');
    expect(r.label).toBe('Aucun abonnement actif');
    expect(r.peutResilier).toBe(true);
    expect(r.finEngagement).toBeNull();
  });

  it('8. Valeur absente (chaîne vide) → même traitement que null', () => {
    expect(describeEngagement('', null, NOW_ENG).etat).toBe('absent');
    expect(describeEngagement(undefined, undefined, NOW_ENG).etat).toBe('absent');
  });

  it("9. '1_an' SANS date de début → pas de blocage, mais l'anomalie est dite", () => {
    // Un blocage sans date de sortie calculable serait insoluble pour
    // l'utilisateur. On libère, et le libellé ne fait pas comme si tout
    // était normal.
    const r = describeEngagement('1_an', null, NOW_ENG);
    expect(r.peutResilier).toBe(true);
    expect(r.label).toBe('Engagement 12 mois — date de début inconnue');
    expect(r.moisRestants).toBeNull();
    expect(r.finEngagement).toBeNull();
  });

  it('10. Les trois valeurs sans engagement ne bloquent JAMAIS, même date de début récente', () => {
    const hier = '2026-06-14T00:00:00Z';
    for (const v of ['sans', 'admin_gratuit', 'partenaire_podaxia']) {
      expect(describeEngagement(v, hier, NOW_ENG).peutResilier).toBe(true);
    }
  });
});

describe('describeEngagement — bornes de date (#241)', () => {
  it("11. Évalué le jour EXACT de l'échéance → échu, résiliation libre", () => {
    const r = describeEngagement('1_an', '2026-03-10T09:00:00Z', new Date('2027-03-10T09:00:00Z'));
    expect(r.peutResilier).toBe(true);
    expect(r.moisRestants).toBe(0);
    expect(r.label).toBe('Engagement 12 mois — échu');
  });

  it("12. La veille de l'échéance → encore bloqué, décompte arrondi à 1", () => {
    const r = describeEngagement('1_an', '2026-03-10T09:00:00Z', new Date('2027-03-09T09:00:00Z'));
    expect(r.peutResilier).toBe(false);
    expect(r.moisRestants).toBe(1);
  });

  it("13. Souscrit le DERNIER jour du mois, évalué au 1er du mois d'échéance → encore bloqué", () => {
    // Le calcul en mois calendaires de l'ancien code donnait
    // (2027−2026)×12 + (0−0) = 12 mois « écoulés » et libérait l'abonné
    // 30 jours trop tôt. La comparaison à l'échéance réelle le retient.
    const r = describeEngagement('1_an', '2026-01-31T00:00:00Z', new Date('2027-01-01T00:00:00Z'));
    expect(r.peutResilier).toBe(false);
    expect(r.moisRestants).toBe(1);
    expect(r.finEngagement.getDate()).toBe(31);
    expect(r.finEngagement.getMonth()).toBe(0);
    expect(r.finEngagement.getFullYear()).toBe(2027);
  });

  it("14. Souscrit le dernier jour du mois, évalué au lendemain de l'échéance → échu", () => {
    const r = describeEngagement('1_an', '2026-01-31T00:00:00Z', new Date('2027-02-01T00:00:00Z'));
    expect(r.peutResilier).toBe(true);
    expect(r.moisRestants).toBe(0);
  });

  it('15. 29 février : setMonth reporte au 1er mars, décalage du côté qui retient', () => {
    const r = describeEngagement('1_an', '2024-02-29T00:00:00Z', new Date('2025-02-28T00:00:00Z'));
    expect(r.peutResilier).toBe(false);
    expect(r.finEngagement.getMonth()).toBe(2);
    expect(r.finEngagement.getDate()).toBe(1);
  });

  it('16. Le décompte affiché ne vaut jamais 0 tant que le compte est bloqué', () => {
    // Balayage sur toute la durée d'engagement : dès que peutResilier est
    // false, moisRestants doit être ≥ 1 — sinon le badge annoncerait
    // « 0 mois restants » sur un compte encore retenu.
    const debut = '2026-01-31T00:00:00Z';
    for (let j = 0; j < 400; j++) {
      const now = new Date(Date.UTC(2026, 0, 31) + j * 86400000);
      const r = describeEngagement('1_an', debut, now);
      if (!r.peutResilier) expect(r.moisRestants).toBeGreaterThanOrEqual(1);
      else expect(r.moisRestants).toBe(0);
    }
  });
});
