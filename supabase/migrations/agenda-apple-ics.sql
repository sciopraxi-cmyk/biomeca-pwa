-- ═══════════════════════════════════════════════════════════════════
-- Tâche #178 — Intégration agenda Apple Calendar (ICS lecture seule)
-- ═══════════════════════════════════════════════════════════════════
-- Réutilise agenda_connections (migration agenda-google-oauth.sql, #177)
-- plutôt qu'une table dédiée : même modèle de chiffrement (AES-GCM,
-- ENCRYPTION_KEY), même RLS (service_role uniquement, 0 policy), un seul
-- endroit où auditer "qui a connecté quoi".
--
-- Différence avec Google : pas de refresh token OAuth — le praticien colle
-- l'URL du flux ICS public de SON calendrier iCloud natif (Réglages iCloud
-- > Calendrier > clic droit sur un calendrier > Partager le calendrier >
-- Calendrier public → lien webcal://...). ics_url_encrypted reçoit le même
-- traitement de chiffrement que refresh_token_encrypted : cette URL est un
-- secret de facto, quiconque la possède peut lire l'agenda partagé.
-- calendar_name (X-WR-CALNAME extrait du flux à la connexion) est purement
-- informatif, jamais utilisé pour une décision de sécurité.
--
-- refresh_token_encrypted devient NULLABLE (les lignes provider='apple'
-- n'en ont pas) ; une contrainte CHECK impose la colonne pertinente selon
-- le provider pour empêcher une ligne 'google' sans token ou 'apple' sans
-- URL de se glisser silencieusement en base.
--
-- Idempotent : ALTER COLUMN DROP NOT NULL / ADD COLUMN IF NOT EXISTS /
-- DROP CONSTRAINT IF EXISTS sont tous rejouables sans erreur.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.agenda_connections
  ALTER COLUMN refresh_token_encrypted DROP NOT NULL;

ALTER TABLE public.agenda_connections
  ADD COLUMN IF NOT EXISTS ics_url_encrypted text,
  ADD COLUMN IF NOT EXISTS calendar_name     text;

ALTER TABLE public.agenda_connections
  DROP CONSTRAINT IF EXISTS agenda_connections_provider_check;
ALTER TABLE public.agenda_connections
  ADD CONSTRAINT agenda_connections_provider_check
  CHECK (provider IN ('google', 'apple'));

ALTER TABLE public.agenda_connections
  DROP CONSTRAINT IF EXISTS agenda_connections_provider_payload_check;
ALTER TABLE public.agenda_connections
  ADD CONSTRAINT agenda_connections_provider_payload_check
  CHECK (
    (provider = 'google' AND refresh_token_encrypted IS NOT NULL)
    OR
    (provider = 'apple'  AND ics_url_encrypted IS NOT NULL)
  );

COMMENT ON COLUMN public.agenda_connections.ics_url_encrypted IS
  'URL du flux ICS public iCloud (#178), chiffrée AES-GCM comme refresh_token_encrypted — cette URL donne un accès en lecture à l''agenda du praticien à quiconque la possède.';
COMMENT ON COLUMN public.agenda_connections.calendar_name IS
  'Nom du calendrier iCloud (X-WR-CALNAME du flux ICS), informatif uniquement — jamais utilisé pour une décision de sécurité.';
