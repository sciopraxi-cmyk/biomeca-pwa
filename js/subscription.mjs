// ═══════════════════════════════════════════════════════════════════
// PLAN_MODULES — source de vérité mapping plan ↔ modules (task #58)
// ═══════════════════════════════════════════════════════════════════
//
// Test-mirror module : utilisé directement par C3 (showSubscribeModulesView)
// et par les tests Vitest. Sera aussi importé par la prod biomeca.js si on
// décide d'en faire la source unique (sinon duplication assumée comme
// calc.mjs et access.mjs).
//
// Pour chaque plan (indexé 0-4, cohérent avec landing.js _plans et le
// pricing dans index.html lignes 113-117) :
//   - required : array de modules toujours inclus (cochés+disabled en vue 2)
//   - choose : null si aucune flexibilité, sinon {from, count} pour
//              modules au choix (cochables avec contrainte count exact)
//
// IDs de modules canoniques (cohérents avec landing.js _modules ligne 65) :
//   'postural', 'podopedia', 'podo_sport'
//
// Note de cohérence avec landing.js _plans :
//   landing `{fixed:[], choose:2, pool:[...]}` ≡ PR58 `{required:[...], choose:null}`
//     (choose 2/2 dans pool de 2 = forcés les 2 → required)
//   landing `{fixed:[X], choose:1, pool:[A,B]}` ≡ PR58 `{required:[X], choose:{from:[A,B], count:1}}`
//   landing `{fixed:[X,Y,Z], choose:0, pool:[]}` ≡ PR58 `{required:[X,Y,Z], choose:null}`

// ⚠️  Avertissement task #58 : le module 'podopedia' apparaît dans PLAN_MODULES
// pour cohérence avec le futur, MAIS son UI consommatrice n'est PAS encore
// implémentée (badge "Prochainement" dans index.html ligne ~2095). Le wizard
// C2 doit RESTREINDRE les choix utilisateur pour ne pas proposer 'podopedia'
// dans les "choose.from" tant que le module n'est pas fonctionnel.
// À retirer ce commentaire quand le module Podopédiatrie sera développé.
export const PLAN_MODULES = [
  {
    planIdx: 0,
    name: 'Essentiel',
    required: [],
    choose: { from: ['postural', 'podopedia'], count: 1 },
  },
  { planIdx: 1, name: 'Sport', required: ['podo_sport'], choose: null },
  { planIdx: 2, name: 'Duo', required: ['postural', 'podopedia'], choose: null },
  {
    planIdx: 3,
    name: 'Duo Sport',
    required: ['podo_sport'],
    choose: { from: ['postural', 'podopedia'], count: 1 },
  },
  { planIdx: 4, name: 'Intégral', required: ['postural', 'podopedia', 'podo_sport'], choose: null },
];

// Retourne les modules par défaut d'un plan (required + premiers `count` de choose.from).
// Utilisé par C3 pour initialiser la vue 2 avec une sélection cohérente.
export function defaultModulesForPlan(planIdx) {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return [];
  const fromChoose = plan.choose ? plan.choose.from.slice(0, plan.choose.count) : [];
  return [...plan.required, ...fromChoose];
}

// Valide qu'un set de modules est cohérent avec un plan donné.
// Retourne { ok: true } | { ok: false, reason: 'missing_required' | 'wrong_choose_count' | 'unknown_plan' }.
export function isValidModulesForPlan(planIdx, modules) {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return { ok: false, reason: 'unknown_plan' };
  if (!plan.required.every((m) => modules.includes(m))) {
    return { ok: false, reason: 'missing_required' };
  }
  if (plan.choose) {
    const chosen = modules.filter((m) => plan.choose.from.includes(m)).length;
    if (chosen !== plan.choose.count) {
      return { ok: false, reason: 'wrong_choose_count' };
    }
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════
// canChangeModule — fonction pure testable, test-mirror de
// canChangeModuleServer dans supabase/functions/prepare-module-change/index.ts.
// Toute modif ici DOIT être répercutée serveur et vice-versa. Référence task #58.
//
// Args :
//   userData : { date_debut_abonnement: string | null, last_module_change: string | null }
//   now      : Date (injectable pour tests déterministes)
//
// Retourne null si OK (autorisé), sinon { reason, next_change_date? }.
//
// Logique anti-abus :
//   - Pas de date_debut_abonnement → première souscription, toujours OK.
//   - Dans les 7j post-souscription initiale (grace period) → toujours OK,
//     le user a le droit de tâtonner sur son choix initial de modules.
//   - Hors grace period mais jamais changé (last_module_change === null) → OK.
//   - Hors grace period + dernier changement il y a ≥30j → OK (lock expiré).
//   - Sinon → blocked, avec next_change_date = lastChange + 30j (ISO).
//
// NB : le caller (prepare-module-change) n'appelle canChangeModule QUE si
// modules changent ET plan inchangé (cf. Q3 de task #58 — changement de plan
// = transaction commerciale légitime, exemptée du lock).
// ═══════════════════════════════════════════════════════════════════
export function canChangeModule(userData, now) {
  // Première souscription : pas de date_debut → toujours OK.
  if (!userData.date_debut_abonnement) return null;

  const debut = new Date(userData.date_debut_abonnement).getTime();
  const nowMs = now.getTime();
  const sevenDaysMs = 7 * 86400 * 1000;
  // Grace period 7j post-souscription initiale : changement libre.
  if (nowMs - debut <= sevenDaysMs) return null;

  // Hors grace period : jamais changé → OK.
  if (!userData.last_module_change) return null;

  const lastChange = new Date(userData.last_module_change).getTime();
  const thirtyDaysMs = 30 * 86400 * 1000;
  if (nowMs - lastChange >= thirtyDaysMs) return null;

  // Lock actif : calcule la prochaine date possible.
  return {
    reason: 'locked',
    next_change_date: new Date(lastChange + thirtyDaysMs).toISOString(),
  };
}
