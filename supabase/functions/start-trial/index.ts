// Edge Function start-trial — démarre l'essai gratuit 14 jours d'un user (Task #57).
//
// Le client (checkAccessStatus) déclenche cet appel quand il détecte un user
// authentifié qui n'a ni licence, ni formule, ni trial_start. La fonction
// écrit user_metadata.trial_start, user_metadata.acces='essai' et
// user_metadata.modules (array complet ['postural', 'podopedia', 'podo_sport'])
// via service_role.
//
// Le client ne peut PAS écrire ces champs directement : un trigger SQL bloque
// le rôle authenticated sur user_metadata pour ces colonnes critiques (cohérent
// avec l'audit RLS task #21).
//
// Auth : tout user authentifié peut appeler la fonction pour son propre compte.
// Pas de check admin.
//
// Anti-reset : si trial_start ou acces existe déjà, refus → le user ne peut pas
// reset son essai en spammant la fonction. Le refus est silencieux côté business
// (retour { ok:false, error:'trial_already_started' | 'acces_already_set' }) :
// le caller peut ignorer.
//
// Refs : incident #29 (clé admin retirée du client), audit RLS task #21,
// PR D (admin-users), task #57 (architecture commerce), task #58 (refonte
// droits enum → modules array : trial démarre avec accès complet à tous
// les modules pendant 14j, cohérent avec l'esprit "découverte plein
// produit" de l'essai).
//
// Déploiement : supabase functions deploy start-trial --no-verify-jwt
// (on fait notre propre vérif du JWT côté code pour homogénéité avec admin-users).

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

  // ─── Auth : JWT user authentifié (pas de check admin) ──────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  const user = userData.user;

  // ─── Anti-reset : refus si trial déjà démarré ─────────────────────
  // GET preliminaire explicite — on lit l'état le plus récent côté serveur
  // (le JWT pourrait avoir des claims périmées), et on prépare le merge.
  const { data: freshData, error: getErr } = await supaAdmin.auth.admin.getUserById(user.id);
  if (getErr || !freshData?.user) return json({ error: 'User lookup failed' }, 500);
  const meta = (freshData.user.user_metadata ?? {}) as Record<string, unknown>;

  if (meta.trial_start) {
    return json({ ok: false, error: 'trial_already_started' }, 409);
  }
  // Anti-double-trial : si acces est déjà set (gratuit, integral, essai créé
  // manuellement par l'admin, etc.), on respecte la décision admin et on refuse
  // l'auto-démarrage. Cohérent avec Q2 — le checkAccessStatus côté client a la
  // même garde, c'est juste une seconde ligne de défense.
  if (meta.acces) {
    return json({ ok: false, error: 'acces_already_set' }, 409);
  }

  // ─── Action : merge + write ────────────────────────────────────────
  // Préservation explicite des autres champs (nom, prenom, etc.) :
  // updateUserById merge déjà, mais le GET + spread garantit qu'on contrôle
  // le payload final côté code — pas de surprise si Supabase change le
  // comportement default. Pattern identique à handleSetModules dans admin-users.
  //
  // modules (task #58) : array complet à la création du trial → le user
  // découvre l'intégralité du produit pendant 14j. Source de vérité ici =
  // le canon ['postural', 'podopedia', 'podo_sport'] (test-mirror avec
  // js/subscription.mjs et prepare-module-change/index.ts).
  // NB : on écrase volontairement `modules` même si présent dans meta —
  // au stade trial, on n'a aucune raison d'avoir un set restreint, et
  // start-trial est gardé par anti-reset (trial_start absent + acces absent).
  const trialStart = new Date().toISOString();
  const accesEssai = 'essai';
  const modulesFull = ['postural', 'podopedia', 'podo_sport'];
  const newMeta = {
    ...meta,
    trial_start: trialStart,
    acces: accesEssai,
    modules: modulesFull,
  };
  // #74 E2 phase 1b — dual-write app_metadata (infalsifiable) avec les MÊMES
  // valeurs. On préserve app_metadata existant (fusion), user_metadata reste
  // écrit tel quel pour rester compatible avec les gardes/lectures pré-phase 2.
  const currentAppMeta = (freshData.user.app_metadata ?? {}) as Record<string, unknown>;
  const newAppMeta = {
    ...currentAppMeta,
    trial_start: trialStart,
    acces: accesEssai,
    modules: modulesFull,
  };
  const { error: updErr } = await supaAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: newMeta,
    app_metadata: newAppMeta,
  });
  if (updErr) return json({ error: 'updateUser: ' + updErr.message }, 500);

  return json({
    ok: true,
    trial_start: newMeta.trial_start,
    acces: 'essai',
    modules: newMeta.modules,
  });
});
