// Edge Function google-calendar-init — démarre la connexion OAuth Google Calendar
// (Task #177, 1/2).
//
// Appelée par le client (Bearer JWT du praticien) quand il clique "Connecter
// Google Calendar" dans l'onglet Agenda. Génère un jeton d'état aléatoire
// (CSRF + liaison à user_id le temps de l'aller-retour OAuth), l'enregistre
// dans oauth_states, et renvoie l'URL d'autorisation Google complète — le
// client fait ensuite window.location.href = url (redirection pleine page,
// pas un fetch : Google doit voir une navigation réelle).
//
// scope=calendar.events (lecture/écriture des événements, pas la gestion des
// agendas eux-mêmes — cf. décision #177 : scope le plus restreint suffisant).
// access_type=offline + prompt=consent : force Google à renvoyer un refresh
// token à CHAQUE connexion (par défaut, Google ne le renvoie qu'au tout
// premier consentement — inutile ici, on veut pouvoir reconnecter proprement
// après une révocation ou un changement de compte Google).
//
// oauth_states : RLS activée sans policy (cf. migration agenda-google-oauth.sql)
// — accessible uniquement via ce service_role client, jamais par le praticien
// directement.
//
// Déploiement : supabase functions deploy google-calendar-init --no-verify-jwt
// (vérification JWT faite ici, cohérent avec start-trial/admin-users).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-callback`;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ─── Auth : JWT user authentifié (même pattern que start-trial) ────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  const user = userData.user;

  // ─── Génère le jeton d'état et l'enregistre ─────────────────────────
  // crypto.randomUUID() : 122 bits d'aléa, largement suffisant pour un jeton
  // CSRF à durée de vie de quelques minutes (consommé par google-calendar-callback,
  // considéré périmé après 15 min côté callback).
  const state = crypto.randomUUID();

  const { error: insertErr } = await supaAdmin
    .from('oauth_states')
    .insert({ state, user_id: user.id, provider: 'google' });
  if (insertErr) return json({ error: 'insert oauth_states: ' + insertErr.message }, 500);

  // ─── Construit l'URL d'autorisation Google ──────────────────────────
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return json({ ok: true, url: authUrl.toString() });
});
