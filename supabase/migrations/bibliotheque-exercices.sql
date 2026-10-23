-- Bibliothèque d'exercices (lot e, étape 1). Idempotent. Aucune suppression : on désactive.
-- BASE (contact@verticy.fr seul) : liens/PDF/texte invisibles des praticiens, qui ne voient que les noms
-- (fonction exercices_base_liste). PERSO : chaque praticien, visible de lui seul.
-- Plusieurs vidéos par exercice (jusqu'à 20), toutes des liens YouTube.
-- Bloc 1 : tables et fonction d'administration
CREATE OR REPLACE FUNCTION public.est_admin_verticy() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'contact@verticy.fr'
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' $$;

CREATE OR REPLACE FUNCTION public.exo_liens_ok(liens text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT liens IS NOT NULL AND coalesce(cardinality(liens), 0) <= 20 AND NOT EXISTS (
    SELECT 1 FROM unnest(liens) u
    WHERE u IS NULL OR char_length(u) > 200
       OR u !~ '^https://(www\.|m\.)?(youtube\.com/(watch\?v=|shorts/|embed/)|youtu\.be/)[A-Za-z0-9_-]{11}([&?#/].*)?$') $$;

CREATE TABLE IF NOT EXISTS public.exercices_base_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(code) <= 60),
  libelle text NOT NULL CHECK (char_length(btrim(libelle)) BETWEEN 1 AND 120),
  bilans text[] NOT NULL DEFAULT '{}',
  ordre int NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true);

CREATE TABLE IF NOT EXISTS public.exercices_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie_id uuid NOT NULL REFERENCES public.exercices_base_categories(id),
  code text NOT NULL UNIQUE CHECK (char_length(code) <= 200),
  libelle text NOT NULL CHECK (char_length(btrim(libelle)) BETWEEN 1 AND 200),
  liens_youtube text[] NOT NULL DEFAULT '{}' CHECK (public.exo_liens_ok(liens_youtube)),
  pdf_fichier text CHECK (pdf_fichier IS NULL OR char_length(pdf_fichier) <= 300),
  texte text CHECK (texte IS NULL OR char_length(texte) <= 4000),
  ordre int NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now());

-- Bloc 2 : catégories et exercices personnels
CREATE TABLE IF NOT EXISTS public.exercices_perso_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  libelle text NOT NULL CHECK (char_length(btrim(libelle)) BETWEEN 1 AND 120),
  actif boolean NOT NULL DEFAULT true);

CREATE TABLE IF NOT EXISTS public.exercices_perso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  categorie_base_id uuid REFERENCES public.exercices_base_categories(id),
  categorie_perso_id uuid REFERENCES public.exercices_perso_categories(id),
  libelle text NOT NULL CHECK (char_length(btrim(libelle)) BETWEEN 1 AND 200),
  liens_youtube text[] NOT NULL DEFAULT '{}' CHECK (public.exo_liens_ok(liens_youtube)),
  pdf_chemin text CHECK (pdf_chemin IS NULL OR char_length(pdf_chemin) <= 200),
  texte text CHECK (texte IS NULL OR char_length(texte) <= 4000),
  actif boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((categorie_base_id IS NULL) <> (categorie_perso_id IS NULL)));
CREATE INDEX IF NOT EXISTS exercices_perso_user_idx ON public.exercices_perso (user_id);

-- Bloc 3 : droits, fonction de lecture sans liens, stockage des PDF personnels
ALTER TABLE public.exercices_base_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercices_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercices_perso_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercices_perso ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['exercices_base_categories','exercices_base'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS admin_tout ON public.%I', t);
    EXECUTE format('CREATE POLICY admin_tout ON public.%I FOR ALL TO authenticated USING (public.est_admin_verticy()) WITH CHECK (public.est_admin_verticy())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['exercices_perso_categories','exercices_perso'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS proprio ON public.%I', t);
    EXECUTE format('CREATE POLICY proprio ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS pas_patient ON public.%I', t);
    EXECUTE format('CREATE POLICY pas_patient ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') IS DISTINCT FROM ''patient'') WITH CHECK ((auth.jwt() -> ''app_metadata'' ->> ''role'') IS DISTINCT FROM ''patient'')', t);
  END LOOP;
END $$;
REVOKE ALL ON public.exercices_base_categories, public.exercices_base, public.exercices_perso_categories, public.exercices_perso FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.exercices_base_categories, public.exercices_base, public.exercices_perso_categories, public.exercices_perso TO authenticated;

CREATE OR REPLACE FUNCTION public.exercices_base_liste()
RETURNS TABLE (categorie_id uuid, categorie_code text, categorie_libelle text, bilans text[], exercice_id uuid, exercice_code text, libelle text, a_video boolean, a_pdf boolean, a_texte boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.code, c.libelle, c.bilans, e.id, e.code, e.libelle,
         cardinality(e.liens_youtube) > 0, e.pdf_fichier IS NOT NULL, e.texte IS NOT NULL
  FROM exercices_base_categories c JOIN exercices_base e ON e.categorie_id = c.id
  WHERE c.actif AND e.actif AND auth.uid() IS NOT NULL
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
  ORDER BY c.ordre, c.libelle, e.ordre, e.libelle $$;
REVOKE ALL ON FUNCTION public.exercices_base_liste() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercices_base_liste() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('exercices-pdf', 'exercices-pdf', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760, allowed_mime_types = ARRAY['application/pdf'];
DROP POLICY IF EXISTS ex_pdf_lire ON storage.objects;
CREATE POLICY ex_pdf_lire ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercices-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ex_pdf_deposer ON storage.objects;
CREATE POLICY ex_pdf_deposer ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercices-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS ex_pdf_pas_patient ON storage.objects;
CREATE POLICY ex_pdf_pas_patient ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id <> 'exercices-pdf' OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient')
  WITH CHECK (bucket_id <> 'exercices-pdf' OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient');
