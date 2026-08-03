// Edge Function google-calendar-events — lecture/écriture des événements
// Google Calendar depuis Verticy (Task #181, suite de #177/#179).
//
// GET  : liste les événements à venir (30 prochains jours, 20 max) du
//        calendrier "primary" du praticien connecté.
// POST : crée un événement sur ce même calendrier.
//
// Le refresh token stocké (agenda_connections.refresh_token_encrypted,
// AES-GCM) n'est jamais renvoyé au client : cette fonction le déchiffre
// côté serveur, l'échange contre un access_token de courte durée via
// oauth2.googleapis.com/token, puis appelle l'API Calendar avec ce
// dernier. Aucune persistance de l'access_token — il est jeté à la fin
// de la requête.
//
// Déploiement : supabase functions deploy google-calendar-events --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const ENCRYPTION_KEY_B64 = Deno.env.get('ENCRYPTION_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

// Échange le refresh token contre un access_token de courte durée.
// Ne persiste rien — jeté après l'appel Calendar de cette requête.
async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(
      'token refresh failed: ' + (data.error_description || data.error || res.status)
    );
  }
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST')
    return json({ error: 'Method not allowed' }, 405);

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
  if (!row) return json({ error: 'Google Calendar non connecté' }, 409);

  let accessToken: string;
  try {
    const refreshToken = await decrypt(row.refresh_token_encrypted as string);
    accessToken = await getAccessToken(refreshToken);
  } catch (e) {
    console.error('[google-calendar-events] token refresh failed', e);
    return json(
      { error: "Impossible de rafraîchir l'accès Google. Reconnecte Google Calendar." },
      502
    );
  }

  if (req.method === 'GET') {
    const timeMin = new Date().toISOString();
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('maxResults', '20');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok)
      return json({ error: 'calendar list: ' + (data.error?.message || res.status) }, 502);

    const events = (data.items || []).map((e: any) => ({
      id: e.id,
      summary: e.summary || '(sans titre)',
      start: e.start?.dateTime || e.start?.date || null,
      end: e.end?.dateTime || e.end?.date || null,
      htmlLink: e.htmlLink || null,
    }));
    return json({ events });
  }

  // POST — création d'un événement
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }
  const { summary, start, end, description } = body || {};
  if (!summary || !start || !end) {
    return json({ error: 'summary, start et end sont requis' }, 400);
  }

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      summary,
      description: description || undefined,
      start: { dateTime: start },
      end: { dateTime: end },
    }),
  });
  const data = await res.json();
  if (!res.ok)
    return json({ error: 'calendar create: ' + (data.error?.message || res.status) }, 502);

  return json({
    ok: true,
    event: {
      id: data.id,
      summary: data.summary,
      start: data.start?.dateTime,
      end: data.end?.dateTime,
      htmlLink: data.htmlLink,
    },
  });
});
