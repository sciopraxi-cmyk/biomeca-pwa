-- ═══════════════════════════════════════════════════════════════════
-- Tâche #187 — Google Calendar multi-comptes (illimité)
-- ═══════════════════════════════════════════════════════════════════
-- agenda_connections n'autorisait jusqu'ici qu'UNE ligne par (user_id,
-- provider) — UNIQUE(user_id, provider), posée par agenda-google-oauth.sql.
-- Scio veut pouvoir connecter plusieurs comptes Google (comme dans son app
-- Calendar native, qui affiche plusieurs comptes simultanément) — cette
-- contrainte doit sauter POUR GOOGLE uniquement. Apple Calendar reste
-- volontairement single-compte (un seul lien ICS partagé, #178) : rien ne
-- change de ce côté.
--
-- account_key distingue les lignes d'un même (user_id, provider) :
--   - provider='apple'  → toujours la valeur littérale 'apple' → au plus
--     une ligne par praticien (comportement inchangé).
--   - provider='google' → l'email du compte Google connecté → au plus une
--     ligne PAR compte, autant de lignes que de comptes distincts. Une
--     reconnexion du MÊME compte (même email) met à jour sa ligne (rotation
--     du refresh token) au lieu d'en créer une seconde.
-- google_email devient donc de facto requis pour toute NOUVELLE connexion
-- Google (google-calendar-callback échoue explicitement si l'email n'a pas
-- pu être récupéré, plutôt que de stocker une ligne ambiguë sans identité
-- — même logique de fail-fast que le test-fetch de apple-calendar-connect,
-- #178, et le principe CLAUDE.md du rapport amputé qui ne doit pas avoir
-- l'air normal).
--
-- Idempotent : DROP CONSTRAINT IF EXISTS / ADD COLUMN IF NOT EXISTS /
-- UPDATE ... WHERE account_key IS NULL sont tous rejouables sans erreur.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.agenda_connections
  DROP CONSTRAINT IF EXISTS agenda_connections_user_id_provider_key;

ALTER TABLE public.agenda_connections
  ADD COLUMN IF NOT EXISTS account_key text;

-- Backfill : au plus une ligne par provider existait jusqu'ici (ancienne
-- contrainte UNIQUE(user_id, provider)), donc aucune collision possible.
UPDATE public.agenda_connections
  SET account_key = CASE
    WHEN provider = 'apple' THEN 'apple'
    ELSE COALESCE(google_email, 'google-' || id::text)
  END
  WHERE account_key IS NULL;

ALTER TABLE public.agenda_connections
  ALTER COLUMN account_key SET NOT NULL;

ALTER TABLE public.agenda_connections
  DROP CONSTRAINT IF EXISTS agenda_connections_provider_account_key;
ALTER TABLE public.agenda_connections
  ADD CONSTRAINT agenda_connections_provider_account_key
  UNIQUE (user_id, provider, account_key);

COMMENT ON COLUMN public.agenda_connections.account_key IS
  'Distingue les lignes d''un même (user_id, provider) — #187. Valeur fixe ''apple'' pour Apple (single-compte) ; email du compte pour Google (multi-comptes illimité).';
