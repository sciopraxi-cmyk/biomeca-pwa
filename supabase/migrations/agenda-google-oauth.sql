-- ═══════════════════════════════════════════════════════════════════
-- Tâche #177 — Intégration agenda Google Calendar (OAuth lecture/écriture)
-- ═══════════════════════════════════════════════════════════════════
-- Deux tables, toutes deux verrouillées à service_role (Edge Functions)
-- UNIQUEMENT — RLS activée, AUCUNE policy pour authenticated/anon. Le
-- client ne lit/écrit jamais ces tables directement via PostgREST ; il
-- passe par des Edge Functions dédiées (google-calendar-init,
-- google-calendar-callback, et à venir google-calendar-status /
-- google-calendar-disconnect).
--
-- oauth_states — éphémère, CSRF + liaison utilisateur pendant l'aller-
-- retour OAuth. google-calendar-init insère une ligne juste avant de
-- rediriger vers Google ; google-calendar-callback la consomme (lookup
-- + DELETE) au retour. Une ligne non consommée après 15 min est
-- considérée périmée (vérifié en code, pas de purge automatique ici —
-- volume négligeable, cf. #35 qui concerne le localStorage client, pas
-- cette table serveur).
--
-- agenda_connections — persistante, un refresh token Google par
-- (user_id, provider). Le refresh token est chiffré côté Edge Function
-- (AES-GCM, clé ENCRYPTION_KEY dans les secrets Supabase) avant
-- d'atteindre cette table : le RLS protège contre un praticien qui
-- lirait le token d'un autre, le chiffrement protège contre une fuite
-- de la base ou de la clé service_role elle-même (précédent : incident
-- #29, clé service_role exposée dans le bundle client).
--
-- Idempotent : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.oauth_states (
  state       text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('google')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.oauth_states IS
  'Jetons CSRF éphémères pour l''aller-retour OAuth (#177). Consommés (DELETE) par google-calendar-callback. Aucun accès authenticated/anon — service_role uniquement.';

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- Aucune policy créée volontairement : RLS activée + 0 policy = table
-- inaccessible à authenticated/anon via PostgREST. service_role
-- (Edge Functions) contourne toujours RLS et reste seul à pouvoir lire/écrire.

CREATE TABLE IF NOT EXISTS public.agenda_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider                text NOT NULL CHECK (provider IN ('google')),
  refresh_token_encrypted text NOT NULL,
  google_email            text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

COMMENT ON TABLE public.agenda_connections IS
  'Connexions agenda tiers par praticien (#177). refresh_token_encrypted = AES-GCM chiffré côté Edge Function, jamais en clair en base. Aucun accès authenticated/anon — service_role uniquement, exposé au client via google-calendar-status (connected/google_email seulement, jamais le token).';

ALTER TABLE public.agenda_connections ENABLE ROW LEVEL SECURITY;
-- Idem oauth_states : RLS activée, 0 policy, service_role uniquement.
