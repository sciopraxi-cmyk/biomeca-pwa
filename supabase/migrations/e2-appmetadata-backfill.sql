-- ═══════════════════════════════════════════════════════════════════
-- #74 E2 phase 2 — Backfill app_metadata depuis user_metadata
-- ═══════════════════════════════════════════════════════════════════
--
-- Copie modules / trial_start / acces de raw_user_meta_data (falsifiable
-- par le user via /auth/v1/user) vers raw_app_meta_data (service_role
-- uniquement), pour préparer le passage en lecture app_metadata-first
-- côté client (phase 1a déjà en place) et le verrouillage phase 4.
--
-- Sémantique du merge : le || fusionne deux jsonb ; à égalité de clé,
-- la clé du membre de DROITE gagne. On place donc raw_app_meta_data
-- APRÈS le jsonb_build_object → l'existant de app_metadata (déjà écrit
-- par les Edge dual-write depuis phase 1b) n'est JAMAIS écrasé.
-- Résultat : on remplit UNIQUEMENT les clés absentes d'app_metadata,
-- provider / providers / autres claims Supabase préservés.
--
-- jsonb_strip_nulls : si une clé source est NULL (champ absent côté
-- user_metadata), on ne l'insère pas — évite d'écrire { modules: null }.
-- Le WHERE filtre les rows sans aucune des 3 clés (no-op).
--
-- Idempotent : ré-exécutable sans effet de bord (le || préserve toujours
-- la valeur app_metadata existante).
--
-- EXÉCUTION : Supabase Studio → SQL Editor → Run. Prévoir 1 SELECT de
-- vérification avant/après (ex. count des lignes concernées).
-- ═══════════════════════════════════════════════════════════════════

UPDATE auth.users
SET raw_app_meta_data =
      jsonb_strip_nulls(jsonb_build_object(
        'modules',     raw_user_meta_data->'modules',
        'trial_start', raw_user_meta_data->'trial_start',
        'acces',       raw_user_meta_data->'acces'
      ))
      || COALESCE(raw_app_meta_data, '{}'::jsonb)
WHERE raw_user_meta_data ?| array['modules','trial_start','acces'];
