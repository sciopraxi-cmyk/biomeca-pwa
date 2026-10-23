-- Bibliothèque d'exercices : suppression par le praticien de SES exercices (et du PDF correspondant).
-- Prérequis : bibliotheque-exercices.sql. Idempotent. La base SCIOPRAXI reste sans suppression (désactivation).
-- Les policies « proprio » et « pas_patient » (FOR ALL) couvrent déjà DELETE : seul le droit manquait.
-- Une catégorie personnelle encore utilisée ne peut pas être supprimée (clé étrangère).
GRANT DELETE ON public.exercices_perso, public.exercices_perso_categories TO authenticated;
DROP POLICY IF EXISTS ex_pdf_supprimer ON storage.objects;
CREATE POLICY ex_pdf_supprimer ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercices-pdf' AND (storage.foldername(name))[1] = auth.uid()::text);
