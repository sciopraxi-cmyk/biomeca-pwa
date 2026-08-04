// Edge Function apple-calendar-disconnect — oublie l'URL du flux ICS
// enregistrée (Task #178). Rien à révoquer côté Apple (lien public sans
// jeton, contrairement au refresh token Google) — simple suppression de
// la ligne agenda_connections.
//
// Déploiement : supabase functions deploy apple-calendar-disconnect --no-verify-jwt

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);

  const { error: deleteErr } = await supaAdmin
    .from('agenda_connections')
    .delete()
    .eq('user_id', userData.user.id)
    .eq('provider', 'apple');
  if (deleteErr) return json({ error: 'delete: ' + deleteErr.message }, 500);

  return json({ ok: true });
});
