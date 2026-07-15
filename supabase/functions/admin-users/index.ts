// Edge Function admin-users — gestion users depuis la page Paramètres (Task #56).
//
// Routing par action dans le body (1 endpoint POST).
// Auth : JWT extrait du header → verifié → email == ADMIN_EMAIL.
// Si pas admin → 403. Sinon route vers handle{Action}.
//
// Actions : list | setLicencePayee | setFormule | setModules | setDroits (alias rétrocompat) |
//   setResetModuleChangeLock | setSubscriptionActive.
// Actions destructives (suspend/delete/resetPassword/invite) prévues en PR D'.
//
// Refs : incident #29 (suppression de la voie service_role côté client),
// task #40 (alignement ADMIN_EMAIL), task #56 (cette PR).
//
// Déploiement : supabase functions deploy admin-users --no-verify-jwt
// (--no-verify-jwt : on fait notre propre vérification du JWT côté code pour
// pouvoir router selon l'email admin avant tout traitement, plutôt que d'avoir
// Supabase rejeter automatiquement les requêtes sans Authorization).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ADMIN_EMAIL = 'sciopraxi@gmail.com';

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

const FORMULES = new Set(['formule_1', 'formule_2', 'formule_3', 'formule_4', 'formule_5']);
const MODULES = new Set(['postural', 'podopedia', 'podo_sport']);
// #74 E2 phase 3 — valeurs canoniques du champ acces (miroir des <option>
// de #admin-acces dans index.html). setAcces écrit UNIQUEMENT app_metadata.
const ACCES_VALUES = new Set(['gratuit', 'essai', 'postural', 'sport', 'duo', 'integral']);
// Mapping rétrocompat de l'ancien enum droits → array modules (task #58).
// Identique au mapping de la migration A0 : 'all'=tous, 'sport'=podo_sport,
// 'posturo'=postural. Utilisé par l'alias setDroits pour convertir les
// appels legacy avant délégation à setModules. La validation des droits
// passe par la simple présence de la clé dans ce mapping (undefined = invalide).
const DROITS_TO_MODULES: Record<string, string[]> = {
  all: ['postural', 'podopedia', 'podo_sport'],
  sport: ['podo_sport'],
  posturo: ['postural'],
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ─── Auth : JWT → email == ADMIN_EMAIL ──────────────────────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  if ((userData.user.email ?? '').toLowerCase() !== ADMIN_EMAIL) {
    return json({ error: 'Forbidden: admin only' }, 403);
  }

  // ─── Parse body ──────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const action = body.action;

  // ─── Routing ─────────────────────────────────────────────────────────
  try {
    switch (action) {
      case 'list':
        return await handleList();
      case 'setLicencePayee':
        return await handleSetLicencePayee(body);
      case 'setFormule':
        return await handleSetFormule(body);
      case 'setModules':
        return await handleSetModules(body);
      case 'setAcces':
        return await handleSetAcces(body);
      case 'setDroits':
        // Alias rétrocompat (task #58) — convertit enum → array puis délègue.
        return await handleSetDroits(body);
      case 'setResetModuleChangeLock':
        return await handleSetResetModuleChangeLock(body);
      case 'setSubscriptionActive':
        return await handleSetSubscriptionActive(body);
      default:
        return json({ error: 'Unknown action: ' + String(action) }, 400);
    }
  } catch (e) {
    console.error('[admin-users]', action, 'unhandled error:', e);
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: 'Internal: ' + msg }, 500);
  }
});

// ──────────────────────────────────────────────────────────────────────
// Actions
// ──────────────────────────────────────────────────────────────────────

async function handleList(): Promise<Response> {
  const { data: usersData, error: usersErr } = await supaAdmin.auth.admin.listUsers();
  if (usersErr) return json({ error: 'listUsers: ' + usersErr.message }, 500);

  const { data: rows, error: rowsErr } = await supaAdmin
    .from('user_data')
    .select('email, licence_payee, formule, engagement, date_debut_abonnement, stripe_customer_id');
  if (rowsErr) return json({ error: 'user_data: ' + rowsErr.message }, 500);

  const byEmail = new Map<string, Record<string, unknown>>();
  for (const r of rows ?? []) {
    if (typeof r.email === 'string') byEmail.set(r.email.toLowerCase(), r);
  }

  const users = (usersData.users ?? []).map((u) => {
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>;
    const extra = byEmail.get((u.email ?? '').toLowerCase()) ?? {};
    // modules : array depuis user_metadata.modules (task #58, ex-droits enum).
    // #74 E2 phase 1b — préfère app_metadata.modules (infalsifiable), repli
    // sur user_metadata.modules pour rester cohérent pendant la transition.
    // Fallback [] si absent : users créés avant la migration A0 OU via flow
    // landing public pré-task #63. La fonction renvoie maintenant un array
    // exploitable directement par l'UI admin (B1 affichera 3 checkboxes).
    const rawModules = Array.isArray(appMeta.modules)
      ? (appMeta.modules as unknown[])
      : Array.isArray(meta.modules)
        ? (meta.modules as unknown[])
        : [];
    const modules: string[] = rawModules.filter((m): m is string => typeof m === 'string');
    return {
      id: u.id,
      email: u.email,
      modules,
      created_at: u.created_at,
      licence_payee: extra.licence_payee ?? false,
      formule: extra.formule ?? null,
      engagement: extra.engagement ?? null,
      date_debut_abonnement: extra.date_debut_abonnement ?? null,
      stripe_customer_id: extra.stripe_customer_id ?? null,
    };
  });

  return json({ users });
}

async function handleSetLicencePayee(body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const value = body.value;
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Invalid email' }, 400);
  if (value !== true && value !== false) {
    return json({ error: 'Invalid value (must be boolean)' }, 400);
  }

  // Sur activation : on marque aussi engagement=admin_gratuit + date pour distinguer
  // des paiements Stripe (handleCheckoutCompleted écrit engagement='sans' ou '1_an').
  // Sur désactivation : on ne touche QUE licence_payee → préserve l'historique
  // Stripe si l'utilisateur avait souscrit avant.
  const update: Record<string, unknown> = { licence_payee: value };
  if (value === true) {
    update.engagement = 'admin_gratuit';
    update.date_debut_abonnement = new Date().toISOString();
  }

  const { data, error } = await supaAdmin
    .from('user_data')
    .update(update)
    .eq('email', email)
    .select('email');
  if (error) return json({ error: 'update: ' + error.message }, 500);

  // Désactivation = action exceptionnelle (remboursement litige). Le client
  // doit alerter visuellement l'admin. Task #57 : la licence est un achat à vie.
  const response: Record<string, unknown> = { ok: true, updated: data?.length ?? 0 };
  if (value === false) {
    response.warning = 'Désactivation de la licence à vie. À réserver aux remboursements.';
  }
  return json(response);
}

async function handleSetFormule(body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const formule = typeof body.formule === 'string' ? body.formule : '';
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Invalid email' }, 400);
  if (!FORMULES.has(formule)) {
    return json({ error: 'Invalid formule (must be formule_1..formule_5)' }, 400);
  }

  const { data, error } = await supaAdmin
    .from('user_data')
    .update({ formule })
    .eq('email', email)
    .select('email');
  if (error) return json({ error: 'update: ' + error.message }, 500);
  return json({ ok: true, updated: data?.length ?? 0 });
}

// Set modules (task #58) — remplace l'ancien setDroits (enum droits) par
// un array de modules canoniques : 'postural', 'podopedia', 'podo_sport'.
//
// Validation stricte :
//   1. modules doit être un Array (sinon 400 immédiat)
//   2. Dédoublonnage silencieux via Set — anticipe des bugs callers qui
//      enverraient ['postural', 'postural']. On stocke la version dédupée.
//   3. Chaque entrée doit appartenir au set canonique MODULES.
//
// Pas de contrôle de cohérence avec la formule ici (admin = override
// volontaire, philosophie admin = responsabilité humaine). C'est l'objet de
// prepare-module-change pour les changements user-initiated.
//
// Pattern défensif identique à start-trial et à l'ex-setDroits : GET
// preliminaire pour merger le user_metadata existant (acces, nom, prenom,
// trial_start...) avant updateUserById qui sinon écraserait tout.
async function handleSetModules(body: Record<string, unknown>): Promise<Response> {
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const modules = body.modules;
  if (!userId) return json({ error: 'Missing userId' }, 400);
  if (!Array.isArray(modules)) {
    return json({ error: 'Invalid modules (must be array)' }, 400);
  }
  const uniqueModules = [...new Set(modules)];
  if (!uniqueModules.every((m) => typeof m === 'string' && MODULES.has(m))) {
    return json(
      { error: 'Invalid modules (each must be one of postural|podopedia|podo_sport)' },
      400
    );
  }

  const { data: getData, error: getErr } = await supaAdmin.auth.admin.getUserById(userId);
  if (getErr || !getData?.user) return json({ error: 'User not found' }, 404);

  const newMeta = { ...(getData.user.user_metadata ?? {}), modules: uniqueModules };
  // #74 E2 phase 1b — dual-write app_metadata (infalsifiable) avec la MÊME
  // valeur de modules. app_metadata existant préservé par fusion.
  const newAppMeta = { ...(getData.user.app_metadata ?? {}), modules: uniqueModules };
  const { error: updErr } = await supaAdmin.auth.admin.updateUserById(userId, {
    user_metadata: newMeta,
    app_metadata: newAppMeta,
  });
  if (updErr) return json({ error: 'updateUser: ' + updErr.message }, 500);

  return json({ ok: true });
}

// Set acces (task #74 E2 phase 3) — écrit UNIQUEMENT app_metadata.acces
// (infalsifiable) sans toucher user_metadata. Utilisé par adminCreateUser
// juste après le signUp pour que le nouveau compte ait dès sa naissance
// une source de vérité côté app_metadata. Les repli user_metadata côté
// client (_aboMeta) ne verront rien changer pour les comptes existants.
//
// Le body accepte soit userId, soit email (avec resolveUserIdByEmail).
// L'email est pratique pour les scripts admin ; adminCreateUser passe userId.
async function handleSetAcces(body: Record<string, unknown>): Promise<Response> {
  const userIdIn = typeof body.userId === 'string' ? body.userId : '';
  const emailIn = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const acces = typeof body.acces === 'string' ? body.acces : '';
  if (!userIdIn && !emailIn) return json({ error: 'Missing userId or email' }, 400);
  if (!ACCES_VALUES.has(acces)) {
    return json(
      { error: 'Invalid acces (must be gratuit|essai|postural|sport|duo|integral)' },
      400
    );
  }

  let userId = userIdIn;
  if (!userId) {
    if (!EMAIL_RE.test(emailIn)) return json({ error: 'Invalid email' }, 400);
    const { data: usersData, error: listErr } = await supaAdmin.auth.admin.listUsers();
    if (listErr) return json({ error: 'listUsers: ' + listErr.message }, 500);
    const found = (usersData.users ?? []).find((u) => (u.email ?? '').toLowerCase() === emailIn);
    if (!found) return json({ error: 'User not found' }, 404);
    userId = found.id;
  }

  const { data: getData, error: getErr } = await supaAdmin.auth.admin.getUserById(userId);
  if (getErr || !getData?.user) return json({ error: 'User not found' }, 404);

  const newAppMeta = { ...(getData.user.app_metadata ?? {}), acces };
  const { error: updErr } = await supaAdmin.auth.admin.updateUserById(userId, {
    app_metadata: newAppMeta,
  });
  if (updErr) return json({ error: 'updateUser: ' + updErr.message }, 500);

  return json({ ok: true });
}

// Alias rétrocompat (task #58) — convertit l'ancien enum droits ('all' |
// 'sport' | 'posturo') en array modules via le mapping de la migration A0,
// puis délègue à setModules. Conservé pour ne pas casser d'éventuels appels
// externes ou anciens clients qui n'auraient pas migré. À supprimer dans
// une PR future quand on aura validé qu'il n'y a plus aucun caller actif.
async function handleSetDroits(body: Record<string, unknown>): Promise<Response> {
  const droits = typeof body.droits === 'string' ? body.droits : '';
  const modules = DROITS_TO_MODULES[droits];
  if (!modules) {
    return json({ error: 'Invalid droits (must be all|sport|posturo)' }, 400);
  }
  return handleSetModules({ ...body, modules });
}

// Reset admin du lock 30j sur le changement de modules (task #58).
//
// Cas d'usage : un user s'est trompé dans son choix de modules juste après
// le délai de grâce 7j et veut changer avant les 30j ; ou litige où l'admin
// déverrouille manuellement après échange support.
//
// Implémentation : set last_module_change = NULL → canChangeModule
// (cf. prepare-module-change.canChangeModuleServer) retournera systématiquement
// OK au prochain check, comme si le user n'avait jamais changé ses modules.
//
// NB : module_changes_count est PRÉSERVÉ volontairement (historique d'usage,
// audit). C'est un indicateur "user qui change souvent" indépendant du lock,
// utile pour détecter d'éventuels abus systémiques. Cf. arbitrage A3.1.
//
// Audit log : action sensible (déverrouillage anti-abus), on trace
// l'admin + la cible + le timestamp pour pouvoir retrouver l'événement
// si un user conteste un déverrouillage. adminEmail = ADMIN_EMAIL (constante)
// car l'auth a déjà été vérifiée en début de handler (sinon 403). Quand on
// passera multi-admins, extraire l'email du JWT à la place de la constante.
async function handleSetResetModuleChangeLock(body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Invalid email' }, 400);

  console.log('[admin-users] setResetModuleChangeLock', {
    adminEmail: ADMIN_EMAIL,
    targetEmail: email,
    timestamp: new Date().toISOString(),
  });

  const { data, error } = await supaAdmin
    .from('user_data')
    .update({ last_module_change: null })
    .eq('email', email)
    .select('email');
  if (error) return json({ error: 'update: ' + error.message }, 500);
  return json({ ok: true, updated: data?.length ?? 0 });
}

// Suspension/réactivation manuelle de l'abonnement par l'admin (task #57).
// - active=false : reset formule/engagement/date_debut_abonnement (miroir du
//   webhook customer.subscription.deleted), mais PAS licence_payee — l'achat
//   à vie est préservé. Cas d'usage : nettoyer un état incohérent en DB,
//   refléter un remboursement hors-Stripe, etc.
// - active=true : refusé. La réactivation d'un abonnement passe obligatoirement
//   par Stripe (Payment Link → checkout.session.completed → set formule). L'admin
//   ne peut pas créer un abonnement gratuit ici ; pour cela, enchaîner
//   setLicencePayee(true) (qui set engagement='admin_gratuit') puis setFormule.
//
// Écrit dans user_data uniquement (source de vérité pour ces champs). Aucun
// trigger de sync vers auth.users.user_metadata n'existe — le client doit
// rafraîchir sa session (re-login) pour voir le changement.
async function handleSetSubscriptionActive(body: Record<string, unknown>): Promise<Response> {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const active = body.active;
  if (!email || !EMAIL_RE.test(email)) return json({ error: 'Invalid email' }, 400);
  if (active !== true && active !== false) {
    return json({ error: 'Invalid active (must be boolean)' }, 400);
  }
  if (active === true) {
    return json({ ok: false, error: 'reactivation_must_go_through_stripe' }, 400);
  }

  const { data, error } = await supaAdmin
    .from('user_data')
    .update({ formule: null, engagement: null, date_debut_abonnement: null })
    .eq('email', email)
    .select('email');
  if (error) return json({ error: 'update: ' + error.message }, 500);
  return json({ ok: true, updated: data?.length ?? 0 });
}
