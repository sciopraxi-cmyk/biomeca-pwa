// Edge Function apple-calendar-status — état de connexion Apple Calendar
// pour l'onglet Agenda (Task #178).
//
// agenda_connections est RLS-verrouillée (service_role uniquement, cf.
// migration agenda-google-oauth.sql). Cette fonction expose UNIQUEMENT les
// deux informations non sensibles (connected, calendar_name) — jamais
// ics_url_encrypted (l'URL ICS est un secret de facto, cf. commentaire
// apple-calendar-connect).
//
// Déploiement : supabase functions deploy apple-calendar-status --no-verify-jwt

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

  const { data: row, error: selectErr } = await supaAdmin
    .from('agenda_connections')
    .select('calendar_name')
    .eq('user_id', userData.user.id)
    .eq('provider', 'apple')
    .maybeSingle();
  if (selectErr) return json({ error: 'select: ' + selectErr.message }, 500);

  return json({ connected: !!row, calendar_name: row?.calendar_name ?? null });
});
