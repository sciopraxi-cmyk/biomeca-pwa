-- Schéma factice minimal pour portail-programme-patient.test.sql (base JETABLE uniquement).
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid $$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb,'{}'::jsonb) $$;
CREATE TABLE IF NOT EXISTS storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON storage.objects TO authenticated;
CREATE TABLE IF NOT EXISTS public.patients(id uuid PRIMARY KEY, user_id uuid, nom text);
CREATE TABLE IF NOT EXISTS public.patient_comptes(id uuid DEFAULT gen_random_uuid(), praticien_id uuid, patient_id uuid, auth_user_id uuid, statut text);
CREATE OR REPLACE FUNCTION public.portail_patient_actuel() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
 $$ SELECT patient_id FROM public.patient_comptes WHERE auth_user_id = auth.uid() AND statut = 'actif' LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.exo_liens_ok(l text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE TABLE IF NOT EXISTS public.exercices_base_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE, libelle text);
CREATE TABLE IF NOT EXISTS public.exercices_base(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), categorie_id uuid, code text UNIQUE, libelle text, liens_youtube text[] NOT NULL DEFAULT '{}', pdf_fichier text, texte text, actif boolean DEFAULT true);
CREATE TABLE IF NOT EXISTS public.exercices_perso(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, libelle text, liens_youtube text[] NOT NULL DEFAULT '{}', pdf_chemin text, texte text, actif boolean DEFAULT true);
ALTER TABLE public.exercices_base ENABLE ROW LEVEL SECURITY; ALTER TABLE public.exercices_perso ENABLE ROW LEVEL SECURITY;
