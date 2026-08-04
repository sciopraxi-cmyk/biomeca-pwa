// Edge Function google-calendar-events — lecture/écriture des événements
// Google Calendar depuis Verticy (Task #181/#182, suite de #177/#179,
// multi-comptes #187).
//
// GET    : liste les événements sur une plage [timeMin, timeMax] (query
//          params ISO), agrégés depuis TOUS les comptes Google connectés du
//          praticien (#187 : plus un seul compte possible). Chaque événement
//          est tagué connectionId + accountEmail pour que le client puisse
//          le colorer par compte et savoir où agir dessus. Un compte dont le
//          rafraîchissement échoue (token révoqué côté Google, etc.) est
//          exclu du résultat SANS faire échouer les autres — mais signalé
//          via failedAccounts pour que l'UI l'affiche visiblement plutôt que
//          de laisser croire à une simple absence de rendez-vous (principe
//          CLAUDE.md : un manque ne doit jamais ressembler à une normalité).
// POST   : crée un événement — connectionId requis dans le corps JSON
//          (compte cible, choisi côté client s'il y en a plusieurs).
// PATCH  : modifie un événement existant — id + connectionId requis dans le
//          corps JSON (connectionId = compte propriétaire de l'événement,
//          inchangé depuis sa création : on ne déplace pas un événement
//          d'un compte à l'autre).
// DELETE : supprime un événement existant — id + connectionId en query
//          params (?id=...&connectionId=...).
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
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

function toClientEvent(e: any, connectionId: string, accountEmail: string | null) {
  return {
    id: e.id,
    summary: e.summary || '(sans titre)',
    description: e.description || '',
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    htmlLink: e.htmlLink || null,
    source: 'google',
    connectionId,
    accountEmail,
  };
}

type ConnectionRow = { id: string; refresh_token_encrypted: string; google_email: string | null };

// Charge UNE connexion Google précise, vérifiée appartenir à userId — un
// connectionId d'un autre praticien (ou inexistant) renvoie null plutôt que
// de lever une exception opaque.
async function getConnectionRow(
  userId: string,
  connectionId: string
): Promise<ConnectionRow | null> {
  const { data, error } = await supaAdmin
    .from('agenda_connections')
    .select('id, refresh_token_encrypted, google_email')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw new Error('select connection: ' + error.message);
  return (data as ConnectionRow) || null;
}

async function accessTokenFor(row: ConnectionRow): Promise<string> {
  const refreshToken = await decrypt(row.refresh_token_encrypted);
  return getAccessToken(refreshToken);
}

const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (!ALLOWED_METHODS.includes(req.method)) return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  const userId = userData.user.id;

  const reqUrl = new URL(req.url);
  const eventsBase = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  // ─── GET — agrège TOUS les comptes Google connectés (#187) ─────────────
  if (req.method === 'GET') {
    const { data: rows, error: selErr } = await supaAdmin
      .from('agenda_connections')
      .select('id, refresh_token_encrypted, google_email')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .order('created_at', { ascending: true });
    if (selErr) return json({ error: 'select: ' + selErr.message }, 500);
    if (!rows || rows.length === 0) return json({ events: [], failedAccounts: [] });

    const now = new Date();
    const defaultMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const timeMin = reqUrl.searchParams.get('timeMin') || now.toISOString();
    const timeMax = reqUrl.searchParams.get('timeMax') || defaultMax.toISOString();

    const settled = await Promise.allSettled(
      (rows as ConnectionRow[]).map(async (row) => {
        const accessToken = await accessTokenFor(row);
        const url = new URL(eventsBase);
        url.searchParams.set('timeMin', timeMin);
        url.searchParams.set('timeMax', timeMax);
        // 250 = maximum accepté par l'API Calendar par page ; largement
        // suffisant pour une grille semaine/mois d'un cabinet, par compte —
        // pas de pagination gérée au-delà (limitation connue).
        url.searchParams.set('maxResults', '250');
        url.searchParams.set('singleEvents', 'true');
        url.searchParams.set('orderBy', 'startTime');
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || String(res.status));
        return (data.items || []).map((e: any) => toClientEvent(e, row.id, row.google_email));
      })
    );

    const events: any[] = [];
    const failedAccounts: { connectionId: string; google_email: string | null; error: string }[] =
      [];
    settled.forEach((r, i) => {
      const row = (rows as ConnectionRow[])[i];
      if (r.status === 'fulfilled') {
        events.push(...r.value);
      } else {
        console.error('[google-calendar-events] compte', row.google_email, 'échoué:', r.reason);
        failedAccounts.push({
          connectionId: row.id,
          google_email: row.google_email,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });

    return json({ events, failedAccounts });
  }

  // ─── DELETE — suppression, id + connectionId en query params ───────────
  if (req.method === 'DELETE') {
    const id = reqUrl.searchParams.get('id');
    const connectionId = reqUrl.searchParams.get('connectionId');
    if (!id || !connectionId) return json({ error: 'id et connectionId requis' }, 400);

    const row = await getConnectionRow(userId, connectionId);
    if (!row) return json({ error: 'Compte Google introuvable ou non autorisé' }, 404);

    let accessToken: string;
    try {
      accessToken = await accessTokenFor(row);
    } catch (e) {
      console.error('[google-calendar-events] token refresh failed', e);
      return json(
        { error: "Impossible de rafraîchir l'accès Google pour ce compte. Reconnecte-le." },
        502
      );
    }

    const res = await fetch(`${eventsBase}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Google renvoie 204 No Content sans corps JSON en cas de succès.
    if (!res.ok && res.status !== 410) {
      let detail = String(res.status);
      try {
        const data = await res.json();
        detail = data.error?.message || detail;
      } catch {
        /* pas de corps JSON — on garde le status */
      }
      return json({ error: 'calendar delete: ' + detail }, 502);
    }
    return json({ ok: true });
  }

  // ─── POST / PATCH — corps JSON commun ──────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  if (req.method === 'PATCH') {
    const { id, summary, start, end, description, connectionId } = body || {};
    if (!id || !summary || !start || !end || !connectionId) {
      return json({ error: 'id, summary, start, end et connectionId sont requis' }, 400);
    }
    const row = await getConnectionRow(userId, connectionId);
    if (!row) return json({ error: 'Compte Google introuvable ou non autorisé' }, 404);

    let accessToken: string;
    try {
      accessToken = await accessTokenFor(row);
    } catch (e) {
      console.error('[google-calendar-events] token refresh failed', e);
      return json(
        { error: "Impossible de rafraîchir l'accès Google pour ce compte. Reconnecte-le." },
        502
      );
    }

    const res = await fetch(`${eventsBase}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary,
        description: description || '',
        start: { dateTime: start },
        end: { dateTime: end },
      }),
    });
    const data = await res.json();
    if (!res.ok)
      return json({ error: 'calendar update: ' + (data.error?.message || res.status) }, 502);
    return json({ ok: true, event: toClientEvent(data, row.id, row.google_email) });
  }

  // POST — création d'un événement
  const { summary, start, end, description, connectionId } = body || {};
  if (!summary || !start || !end || !connectionId) {
    return json({ error: 'summary, start, end et connectionId sont requis' }, 400);
  }
  const row = await getConnectionRow(userId, connectionId);
  if (!row) return json({ error: 'Compte Google introuvable ou non autorisé' }, 404);

  let accessToken: string;
  try {
    accessToken = await accessTokenFor(row);
  } catch (e) {
    console.error('[google-calendar-events] token refresh failed', e);
    return json(
      { error: "Impossible de rafraîchir l'accès Google pour ce compte. Reconnecte-le." },
      502
    );
  }

  const res = await fetch(eventsBase, {
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

  return json({ ok: true, event: toClientEvent(data, row.id, row.google_email) });
});
