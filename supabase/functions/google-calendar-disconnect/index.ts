// Edge Function google-calendar-disconnect — déconnecte Google Calendar
// (Task #177/#179).
//
// Révoque le refresh token côté Google (best-effort — une révocation échouée
// ne doit pas bloquer la suppression locale, sinon un praticien resterait
// bloqué "connecté" dans Verticy alors qu'il veut s'en aller) puis supprime
// la ligne agenda_connections.
//
// Déploiement : supabase functions deploy google-calendar-disconnect --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ENCRYPTION_KEY_B64 = Deno.env.get('ENCRYPTION_KEY')!;

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

// Déchiffre base64(iv || ciphertext) produit par encrypt() dans google-calendar-callback.
async function decrypt(payload: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(ENCRYPTION_KEY_B64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  const userId = userData.user.id;

  const { data: row, error: selectErr } = await supaAdmin
    .from('agenda_connections')
    .select('refresh_token_encrypted')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  if (selectErr) return json({ error: 'select: ' + selectErr.message }, 500);

  if (row) {
    // Révocation best-effort côté Google — cf. commentaire d'en-tête.
    try {
      const refreshToken = await decrypt(row.refresh_token_encrypted as string);
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }),
      });
    } catch (e) {
      console.error('google token revoke failed (non-bloquant)', e);
    }
  }

  const { error: deleteErr } = await supaAdmin
    .from('agenda_connections')
    .delete()
    .eq('user_id', userId)
    .eq('provider', 'google');
  if (deleteErr) return json({ error: 'delete: ' + deleteErr.message }, 500);

  return json({ ok: true });
});
