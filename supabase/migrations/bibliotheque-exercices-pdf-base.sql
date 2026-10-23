-- Bibliothèque d'exercices : l'administrateur supprime ou remplace la fiche PDF d'un exercice de la base.
-- Prérequis : bibliotheque-exercices.sql. Idempotent. pdf_fichier = fichier livré avec l'application
-- (assets/fiches/...) OU fichier déposé par l'administrateur (base/<uuid>.pdf). NULL = aucune fiche.
-- Les praticiens lisent le chemin (le PDF n'est pas confidentiel : il est remis aux patients) ; les liens
-- vidéo et les textes restent invisibles pour eux.
ALTER TABLE public.exercices_base DROP CONSTRAINT IF EXISTS exercices_base_pdf_fichier_check;
ALTER TABLE public.exercices_base ADD CONSTRAINT exercices_base_pdf_fichier_check CHECK (pdf_fichier IS NULL
  OR pdf_fichier ~ '^assets/fiches/[a-z0-9-]+/[^/]+\.pdf$'
  OR pdf_fichier ~ '^base/[0-9a-f-]{36}\.pdf$');

DROP FUNCTION IF EXISTS public.exercices_base_liste();
CREATE FUNCTION public.exercices_base_liste()
RETURNS TABLE (categorie_id uuid, categorie_code text, categorie_libelle text, bilans text[], exercice_id uuid, exercice_code text, libelle text, a_video boolean, a_pdf boolean, a_texte boolean, pdf_fichier text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.code, c.libelle, c.bilans, e.id, e.code, e.libelle,
         cardinality(e.liens_youtube) > 0, e.pdf_fichier IS NOT NULL, e.texte IS NOT NULL, e.pdf_fichier
  FROM exercices_base_categories c JOIN exercices_base e ON e.categorie_id = c.id
  WHERE c.actif AND e.actif AND auth.uid() IS NOT NULL
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
  ORDER BY c.ordre, c.libelle, e.ordre, e.libelle $$;
REVOKE ALL ON FUNCTION public.exercices_base_liste() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.exercices_base_liste() TO authenticated;

DROP POLICY IF EXISTS ex_pdf_base_lire ON storage.objects;
CREATE POLICY ex_pdf_base_lire ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercices-pdf' AND (storage.foldername(name))[1] = 'base');
DROP POLICY IF EXISTS ex_pdf_base_deposer ON storage.objects;
CREATE POLICY ex_pdf_base_deposer ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercices-pdf' AND (storage.foldername(name))[1] = 'base' AND public.est_admin_verticy());
DROP POLICY IF EXISTS ex_pdf_base_supprimer ON storage.objects;
CREATE POLICY ex_pdf_base_supprimer ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercices-pdf' AND (storage.foldername(name))[1] = 'base' AND public.est_admin_verticy());
