// supabase/functions/prepare-module-change/index.ts
//
// Prépare un changement de plan/modules pour un user authentifié.
// Vérifie les règles anti-abus (grace period 7j + lock 30j SI plan inchangé),
// enregistre l'intention en pending_* dans user_data (TTL 1h), et retourne
// l'URL Payment Link Stripe correspondante. Le client redirige ensuite vers
// cette URL ; au retour signé Stripe (checkout.session.completed),
// stripe-webhook applique les pending_modules à user_metadata.modules.
//
// Règle anti-abus (cf. task #58 décision Q3) :
//   - Changement de plan (formule_N → formule_M) = transaction commerciale
//     légitime, AUTORISÉE sans lock.
//   - Changement de modules SANS changement de plan (switch intra-formule)
//     = soumis au lock 30j + grace period 7j post-souscription initiale.
//   - Modules identiques + plan identique = no-op, autorisé sans check.
//
// Sécurité :
//   - JWT user requis (auth.getUser sur le bearer token)
//   - Validation modules vs plan côté serveur (source de vérité métier)
//   - Validation canChangeModule côté serveur (source de vérité anti-abus)
//   - 409 si lock actif + next_change_date pour UX claire
//   - UPSERT défensif sur user_id (clé unique) : crée la row user_data si
//     absente (cas rare nouveau user dont le row n'a pas encore été créé
//     par signup)
//
// Refs : task #58.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── PLAN_MODULES (test-mirror) ──────────────────────────────────────────────
// IMPORTANT — test-mirror : 4 endroits à garder sync
//   - js/subscription.mjs (source de vérité Vitest)
//   - js/biomeca.js MS_PLAN_MODULES (UI wizard)
//   - supabase/functions/prepare-module-change/index.ts (validation server in-app) ← ICI
//   - supabase/functions/stripe-webhook/index.ts (apply post-paiement)
const PLAN_MODULES = [
  { required: [], choose: { from: ['postural', 'podopedia'], count: 1 } },
  { required: ['podo_sport'], choose: null },
  { required: ['postural', 'podopedia'], choose: null },
  { required: ['podo_sport'], choose: { from: ['postural', 'podopedia'], count: 1 } },
  { required: ['postural', 'podopedia', 'podo_sport'], choose: null },
] as const;

// Retourne les modules par défaut d'un plan (required + premiers `count` de choose.from).
// Test-mirror de defaultModulesForPlan dans js/subscription.mjs. Ajout #63 :
// utilisé par les Edge Functions pour set un fallback cohérent au paiement landing
// (où le user n'a pas explicité son choix de modules optionnels via le wizard).
function defaultModulesForPlan(planIdx: number): string[] {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return [];
  const fromChoose = plan.choose ? plan.choose.from.slice(0, plan.choose.count) : [];
  return [...plan.required, ...fromChoose];
}

function isValidModulesForPlan(planIdx: number, modules: string[]): boolean {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return false;
  if (!plan.required.every((m) => modules.includes(m))) return false;
  if (plan.choose) {
    const chosen = modules.filter((m) => plan.choose!.from.includes(m)).length;
    if (chosen !== plan.choose.count) return false;
  }
  return true;
}

// ─── Payment Links Stripe (dupliqué de landing.js + biomeca.js) ──────────────
// Source de vérité = Stripe Dashboard. À synchroniser quand un Payment Link
// change dans le dashboard. Indexé [planIdx] dans 4 variantes.
const PAYMENT_LINKS = {
  avecLicence: {
    mensuel: [
      'https://buy.stripe.com/bJeeVebOC4IQdjJ4WTfAc01',
      'https://buy.stripe.com/eVq14o9GufnubbBfBxfAc03',
      'https://buy.stripe.com/fZueVe8Cq1wEa7x751fAc05',
      'https://buy.stripe.com/3cIcN67ym6QYa7x1KHfAc07',
      'https://buy.stripe.com/4gM6oIbOCcbifrR1KHfAc09',
    ],
    annuel: [
      'https://buy.stripe.com/4gMcN6dWK3EMgvV1KHfAc0l',
      'https://buy.stripe.com/8x24gAcSG6QY3J91KHfAc0m',
      'https://buy.stripe.com/3cIaEYaKycbi3J90GDfAc0n',
      'https://buy.stripe.com/aFaeVeg4SfnucfFgFBfAc0o',
      'https://buy.stripe.com/9B68wQdWK2AI2F5extfAc0p',
    ],
  },
  sansLicence: {
    mensuel: [
      'https://buy.stripe.com/eVqdRa3i64IQa7xahdfAc0b',
      'https://buy.stripe.com/28E28s8Cq2AI4Nd60XfAc0d',
      'https://buy.stripe.com/aFa5kE6ui1wE3J9cplfAc0f',
      'https://buy.stripe.com/eVqaEY19Y8Z6bbBblhfAc0h',
      'https://buy.stripe.com/7sYaEY6ui1wE1B1blhfAc0j',
    ],
    annuel: [
      'https://buy.stripe.com/eVq7sM4ma4IQ0wXahdfAc0q',
      'https://buy.stripe.com/3cI5kE2e2ejqa7xahdfAc0r',
      'https://buy.stripe.com/28EbJ2g4S6QY5RhdtpfAc0s',
      'https://buy.stripe.com/14AfZi3i6a3a4Nd2OLfAc0t',
      'https://buy.stripe.com/cNi6oI4ma4IQ0wXfBxfAc0u',
    ],
  },
} as const;

function paymentLinkFor(planIdx: number, isAnnuel: boolean, hasLicence: boolean): string | null {
  const branch = hasLicence ? PAYMENT_LINKS.sansLicence : PAYMENT_LINKS.avecLicence;
  const arr = isAnnuel ? branch.annuel : branch.mensuel;
  return arr[planIdx] ?? null;
}

// ─── canChangeModule — source de vérité serveur ──────────────────────────────
// Retourne null si OK (autorisé), sinon { reason, next_change_date? }.
// NB : appelée UNIQUEMENT si modules changent ET plan inchangé (cf. Q3).
function canChangeModuleServer(
  userData: { date_debut_abonnement: string | null; last_module_change: string | null },
  now: Date
): { reason: string; next_change_date?: string } | null {
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

// ─── Handler principal ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Auth : JWT user
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  const user = userData.user;
  const email = user.email;
  if (!email) return json({ error: 'No email on user' }, 401);

  // Parse body
  let body: { planIdx?: number; modules?: string[]; isAnnuel?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const { planIdx, modules, isAnnuel } = body;

  // Validation types
  if (typeof planIdx !== 'number' || planIdx < 0 || planIdx > 4 || !Number.isInteger(planIdx)) {
    return json({ error: 'Invalid planIdx (must be integer 0-4)' }, 400);
  }
  if (!Array.isArray(modules) || !modules.every((m) => typeof m === 'string')) {
    return json({ error: 'Invalid modules (must be string array)' }, 400);
  }
  if (typeof isAnnuel !== 'boolean') {
    return json({ error: 'Invalid isAnnuel (must be boolean)' }, 400);
  }

  // Validation cohérence modules vs plan
  if (!isValidModulesForPlan(planIdx, modules)) {
    return json({ error: 'Invalid modules for plan ' + planIdx }, 400);
  }

  // Lire user_data (licence_payee + formule + date_debut + last_module_change)
  const { data: rows, error: rowErr } = await supaAdmin
    .from('user_data')
    .select('licence_payee, formule, date_debut_abonnement, last_module_change')
    .eq('user_id', user.id)
    .limit(1);
  if (rowErr) return json({ error: 'user_data fetch: ' + rowErr.message }, 500);
  const row = rows?.[0];

  // Détection changement plan vs formule actuelle
  // Format attendu user_data.formule : 'formule_N' où N = planIdx + 1 (cf. stripe-webhook identifyFormule)
  const currentFormule = row?.formule as string | null | undefined;
  const currentPlanIdx = currentFormule?.startsWith('formule_')
    ? parseInt(currentFormule.replace('formule_', ''), 10) - 1
    : null;
  const planChanged = currentPlanIdx === null || currentPlanIdx !== planIdx;

  // Détection changement modules vs metadata actuel.
  // #74 E2 phase 4 — lecture depuis app_metadata (source unique infalsifiable).
  const currentModules: string[] = Array.isArray(user.app_metadata?.modules)
    ? user.app_metadata!.modules
    : [];
  const sortedCurrent = [...currentModules].sort();
  const sortedNew = [...modules].sort();
  const modulesChanged =
    sortedCurrent.length !== sortedNew.length || sortedCurrent.some((m, i) => m !== sortedNew[i]);

  // Anti-abus : check lock UNIQUEMENT si modules changent ET plan inchangé.
  // Changement de plan = transaction commerciale légitime (Q3).
  if (modulesChanged && !planChanged && row) {
    const check = canChangeModuleServer(
      {
        date_debut_abonnement: row.date_debut_abonnement ?? null,
        last_module_change: row.last_module_change ?? null,
      },
      new Date()
    );
    if (check) {
      return json(
        { ok: false, error: check.reason, next_change_date: check.next_change_date },
        409
      );
    }
  }

  // OK : enregistrer le pending via UPSERT sur user_id (clé unique).
  // Défensif si row absente (cas rare nouveau user pas encore initialisé).
  const upsertPayload = {
    user_id: user.id,
    email,
    pending_modules: modules,
    pending_plan_idx: planIdx,
    pending_created_at: new Date().toISOString(),
  };
  const { error: upsertErr } = await supaAdmin
    .from('user_data')
    .upsert(upsertPayload, { onConflict: 'user_id' });
  if (upsertErr) return json({ error: 'user_data upsert: ' + upsertErr.message }, 500);

  // Construire l'URL Payment Link selon (planIdx, isAnnuel, licence_payee)
  const hasLicence = row?.licence_payee === true;
  const url = paymentLinkFor(planIdx, isAnnuel, hasLicence);
  if (!url) {
    return json(
      {
        error:
          'No Payment Link for plan ' +
          planIdx +
          ' (annuel=' +
          isAnnuel +
          ', hasLicence=' +
          hasLicence +
          ')',
      },
      500
    );
  }

  return json({ ok: true, payment_link_url: url });
});
