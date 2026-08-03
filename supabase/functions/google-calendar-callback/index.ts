// Edge Function google-calendar-callback — reçoit le retour OAuth Google
// Calendar, échange le code contre les tokens, chiffre et stocke le refresh
// token (Task #177, 2/2).
//
// URL enregistrée telle quelle comme "Authorized redirect URI" côté Google
// Cloud Console (client OAuth "Verticy - Agenda") :
//   https://<projet>.supabase.co/functions/v1/google-calendar-callback
//
// Ce n'est PAS un appel fetch du client : c'est Google qui redirige le
// navigateur du praticien ici (GET, pas d'Authorization header). L'identité
// du praticien est retrouvée via le paramètre state, généré et enregistré
// par google-calendar-init juste avant la redirection vers Google.
//
// Chiffrement du refresh token (décision #177, cf. échange avec Scio le
// 03/08/2026) : AES-GCM, clé ENCRYPTION_KEY (32 octets, base64) dans les
// secrets Supabase. Le RLS sur agenda_connections empêche déjà un praticien
// de lire le token d'un autre ; le chiffrement protège en plus contre une
// fuite de la base ou de la clé service_role elle-même (précédent : incident
// #29). Si ENCRYPTION_KEY est un jour perdue, les connexions existantes
// deviennent illisibles mais pas dangereuses (juste indéchiffrables) — le
// praticien reconnecte son agenda, pas de perte de données patient.
//
// Déploiement : supabase functions deploy google-calendar-callback --no-verify-jwt
// (obligatoire : Google appelle cette URL sans JWT Supabase, --no-verify-jwt
// désactive la vérification automatique qui bloquerait sinon la requête).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-callback`;
const ENCRYPTION_KEY_B64 = Deno.env.get('ENCRYPTION_KEY')!;

// URL de retour dans l'app après connexion (succès ou échec). Toujours la
// prod GitHub Pages — Google ne nous dit pas d'où est partie la demande, donc
// pas d'origin dynamique possible ici (limite connue : reconnexion depuis
// localhost renvoie quand même sur la prod).
const APP_URL = 'https://sciopraxi-cmyk.github.io/biomeca-pwa/';

// État périmé au-delà de 15 min (aller-retour OAuth normal = quelques
// secondes à quelques minutes ; au-delà, on refuse plutôt que de risquer un
// state rejoué).
const STATE_TTL_MS = 15 * 60 * 1000;

function redirectToApp(status: 'connected' | 'error', detail?: string): Response {
  const url = new URL(APP_URL);
  url.searchParams.set('agenda_google', status);
  if (detail) url.searchParams.set('agenda_google_detail', detail);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleError = url.searchParams.get('error');

  if (googleError) {
    // L'utilisateur a annulé le consentement côté Google (ou autre refus).
    return redirectToApp('error', googleError);
  }
  if (!code || !state) {
    return redirectToApp('error', 'missing_code_or_state');
  }

  // ─── Consomme le state : retrouve user_id, vérifie la fraîcheur ────
  const { data: stateRow, error: stateErr } = await supaAdmin
    .from('oauth_states')
    .select('user_id, created_at')
    .eq('state', state)
    .eq('provider', 'google')
    .maybeSingle();

  if (stateErr || !stateRow) {
    return redirectToApp('error', 'unknown_state');
  }
  // Supprime immédiatement (state à usage unique), avant toute autre étape
  // qui pourrait échouer — on ne veut pas qu'un state reste réutilisable en
  // cas d'erreur plus loin.
  await supaAdmin.from('oauth_states').delete().eq('state', state);

  const ageMs = Date.now() - new Date(stateRow.created_at).getTime();
  if (ageMs > STATE_TTL_MS) {
    return redirectToApp('error', 'state_expired');
  }
  const userId = stateRow.user_id as string;

  // ─── Échange le code contre les tokens Google ───────────────────────
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.refresh_token) {
    // Cas connu : refresh_token absent si l'utilisateur avait déjà consenti
    // SANS prompt=consent lors d'un appel précédent avec un autre client —
    // ne devrait pas arriver ici puisque google-calendar-init force toujours
    // prompt=consent, mais on le journalise plutôt que de planter en silence.
    console.error('google token exchange failed', tokenData);
    return redirectToApp('error', 'token_exchange_failed');
  }

  // ─── Email du compte Google connecté (best-effort, purement informatif) ───
  // Nécessite les scopes openid/email en plus de calendar.events pour être
  // rempli — sinon reste null et l'UI affichera juste "Connecté" sans email.
  let googleEmail: string | null = null;
  try {
    const userinfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (userinfoResp.ok) {
      const userinfo = await userinfoResp.json();
      googleEmail = userinfo.email ?? null;
    }
  } catch (_e) {
    // best-effort — une erreur ici ne doit pas faire échouer la connexion
  }

  // ─── Chiffre et stocke ───────────────────────────────────────────────
  const encryptedRefreshToken = await encrypt(tokenData.refresh_token as string);

  const { error: upsertErr } = await supaAdmin.from('agenda_connections').upsert(
    {
      user_id: userId,
      provider: 'google',
      refresh_token_encrypted: encryptedRefreshToken,
      google_email: googleEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,provider' }
  );
  if (upsertErr) {
    console.error('agenda_connections upsert failed', upsertErr);
    return redirectToApp('error', 'storage_failed');
  }

  return redirectToApp('connected');
});
