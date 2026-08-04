// Edge Function apple-calendar-connect — enregistre l'URL du flux ICS
// public iCloud d'un praticien (Task #178).
//
// Contrairement à Google, pas d'aller-retour OAuth : le praticien colle
// directement l'URL de partage "Calendrier public" de son app Calendrier
// (Réglages iCloud > Calendrier > clic droit sur UN calendrier iCloud natif
// > Partager le calendrier > Calendrier public → lien webcal://...). Le
// choix du calendrier précis (et pas un compte externe type Google visible
// dans la même app) revient au praticien — cf. échange avec Scio le
// 04/08/2026 : partager le bon calendrier iCloud évite par construction un
// doublon avec les événements déjà synchronisés via Google Calendar.
//
// Cette fonction teste le lien (fetch + vérifie que ça ressemble à un ICS)
// avant de le stocker : une connexion "réussie" mais qui ne remonte jamais
// d'événement serait un échec silencieux (cf. le principe du rapport
// amputé dans CLAUDE.md). Le lien est chiffré comme un secret (AES-GCM,
// ENCRYPTION_KEY) : quiconque le possède lit l'agenda complet du calendrier
// partagé.
//
// Déploiement : supabase functions deploy apple-calendar-connect --no-verify-jwt

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

// Chiffre `plaintext` en AES-GCM avec ENCRYPTION_KEY. Retourne base64(iv || ciphertext).
async function encrypt(plaintext: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(ENCRYPTION_KEY_B64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

// webcal:// n'est pas un schéma que fetch() sait suivre — c'est un simple
// alias historique d'https:// utilisé par les apps calendrier.
function normalizeIcsUrl(raw: string): string {
  return raw.trim().replace(/^webcal:\/\//i, 'https://');
}

function extractCalName(icsText: string): string | null {
  const m = icsText.match(/^X-WR-CALNAME:(.*)$/m);
  return m ? m[1].trim() : null;
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }
  const rawUrl = (body?.icsUrl || '').toString();
  if (!rawUrl) return json({ error: 'icsUrl requis' }, 400);

  const icsUrl = normalizeIcsUrl(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(icsUrl);
  } catch {
    return json({ error: 'URL invalide' }, 400);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return json({ error: 'URL invalide (http/https/webcal uniquement)' }, 400);
  }

  // ─── Test du lien avant stockage ───────────────────────────────────
  let icsText: string;
  try {
    const res = await fetch(icsUrl, { headers: { 'User-Agent': 'Verticy/1.0' } });
    if (!res.ok) return json({ error: 'Le flux ICS a répondu ' + res.status }, 400);
    icsText = await res.text();
  } catch (e) {
    console.error('[apple-calendar-connect] fetch test failed', e);
    return json({ error: 'Impossible de joindre ce flux ICS' }, 400);
  }
  if (!icsText.includes('BEGIN:VCALENDAR')) {
    return json({ error: 'Ce lien ne ressemble pas à un flux ICS valide' }, 400);
  }
  const calendarName = extractCalName(icsText);

  const encryptedUrl = await encrypt(icsUrl);
  const { error: upsertErr } = await supaAdmin.from('agenda_connections').upsert(
    {
      user_id: userId,
      provider: 'apple',
      ics_url_encrypted: encryptedUrl,
      calendar_name: calendarName,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );
  if (upsertErr) {
    console.error('[apple-calendar-connect] upsert failed', upsertErr);
    return json({ error: 'storage: ' + upsertErr.message }, 500);
  }

  return json({ ok: true, calendar_name: calendarName });
});
