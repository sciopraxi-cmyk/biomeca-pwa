-- #226-A — Antécédents et examens réalisés sur la fiche patient.
-- Données stables du patient (pas du bilan) : redescendues dans les anamnèses
-- des bilans (pré-remplissage si jamais saisi) et complétables depuis un bilan
-- EN COURS (jamais depuis une archive).
--
-- ⚠️ À exécuter dans le SQL Editor Supabase AVANT de déployer le code qui
-- envoie ces colonnes (même contrainte PostgREST que #223-A : une colonne
-- inconnue fait échouer l'upsert patient ET coupe la sync des bilans).
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS antecedents text,
  ADD COLUMN IF NOT EXISTS examens text;
