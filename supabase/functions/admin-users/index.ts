// Edge Function admin-users — gestion users depuis la page Paramètres (Task #56).
//
// Routing par action dans le body (1 endpoint POST).
// Auth : JWT extrait du header → verifié → email == ADMIN_EMAIL.
// Si pas admin → 403. Sinon route vers handle{Action}.
//
// Actions : list | setLicencePayee | setFormule | setDroits.
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
const DROITS = new Set(['all', 'sport', 'posturo']);
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
      case 'setDroits':
        return await handleSetDroits(body);
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
    const extra = byEmail.get((u.email ?? '').toLowerCase()) ?? {};
    return {
      id: u.id,
      email: u.email,
      droits: (meta.droits as string) || 'all',
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
  return json({ ok: true, updated: data?.length ?? 0 });
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

async function handleSetDroits(body: Record<string, unknown>): Promise<Response> {
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const droits = typeof body.droits === 'string' ? body.droits : '';
  if (!userId) return json({ error: 'Missing userId' }, 400);
  if (!DROITS.has(droits)) {
    return json({ error: 'Invalid droits (must be all|sport|posturo)' }, 400);
  }

  // GET preliminaire pour merger le user_metadata existant — sinon updateUserById
  // écrase tout le user_metadata (ex. acces, nom, prenom, trial_start...).
  const { data: getData, error: getErr } = await supaAdmin.auth.admin.getUserById(userId);
  if (getErr || !getData?.user) return json({ error: 'User not found' }, 404);

  const newMeta = { ...(getData.user.user_metadata ?? {}), droits };
  const { error: updErr } = await supaAdmin.auth.admin.updateUserById(userId, {
    user_metadata: newMeta,
  });
  if (updErr) return json({ error: 'updateUser: ' + updErr.message }, 500);

  return json({ ok: true });
}
