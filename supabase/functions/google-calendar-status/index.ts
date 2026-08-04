// Edge Function google-calendar-status — état de connexion Google Calendar
// pour l'onglet Agenda (Task #177/#179, multi-comptes #187).
//
// agenda_connections est RLS-verrouillée (service_role uniquement, cf.
// migration agenda-google-oauth.sql) : le client ne peut pas lire directement
// combien de comptes sont connectés ni avec quels emails. Cette fonction
// expose UNIQUEMENT les informations non sensibles par connexion (id,
// google_email, updated_at) — jamais refresh_token_encrypted.
//
// #187 : renvoie désormais un TABLEAU de connexions (0, 1 ou N comptes
// Google), plus le booléen connected dérivé (compat rétro pour tout code
// qui ne lirait que ce champ). L'id de chaque connexion sert de
// connectionId côté client — passé à google-calendar-events (création) et
// google-calendar-disconnect (déconnexion d'un compte précis).
//
// Déploiement : supabase functions deploy google-calendar-status --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);

  const { data: rows, error: selectErr } = await supaAdmin
    .from('agenda_connections')
    .select('id, google_email, updated_at')
    .eq('user_id', userData.user.id)
    .eq('provider', 'google')
    .order('created_at', { ascending: true });

  if (selectErr) return json({ error: 'select: ' + selectErr.message }, 500);

  const connections = rows || [];
  return json({
    connected: connections.length > 0,
    connections,
    // Compat rétro : ancien champ google_email (1er compte), au cas où un
    // client pas encore rechargé lirait encore ce format.
    google_email: connections[0]?.google_email ?? null,
  });
});
