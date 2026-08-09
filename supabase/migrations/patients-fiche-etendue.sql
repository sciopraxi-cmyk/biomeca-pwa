-- #223-A — Fiche patient étendue : coordonnées et contexte administratif.
-- Champs facultatifs alimentés par la saisie manuelle et, à terme (#223-B),
-- par l'import CSV Doctolib / DrSanté.
--
-- ⚠️ À exécuter dans le SQL Editor Supabase AVANT de déployer le code qui
-- envoie ces colonnes (_syncPatientToNormalizedTables) : PostgREST rejette
-- un upsert contenant une colonne inconnue, et cet échec interrompt aussi
-- la sync des bilans (return early).
--
-- Le NIR (numéro de sécurité sociale) est volontairement ABSENT : aucun
-- besoin fonctionnel côté Verticy (pas de FSE) et donnée trop sensible
-- hors hébergement HDS (cf. #142).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS civilite text,
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS cp text,
  ADD COLUMN IF NOT EXISTS ville text,
  ADD COLUMN IF NOT EXISTS medecin_traitant text,
  ADD COLUMN IF NOT EXISTS assurance text,
  ADD COLUMN IF NOT EXISTS provenance text;
