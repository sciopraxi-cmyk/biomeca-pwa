-- ═══════════════════════════════════════════════════════════════════
-- RLS policies — storage.objects pour le bucket `patient-media`
-- Task #36 PR A — fondation Supabase Storage pour les photos JPEG des
-- patients (migration depuis localStorage base64).
-- ═══════════════════════════════════════════════════════════════════
--
-- PRÉREQUIS : le bucket `patient-media` (privé) doit avoir été créé
-- manuellement via Supabase Studio → Storage → New bucket.
--
-- EXÉCUTION : copier-coller ce fichier dans Supabase Studio
-- → SQL Editor → Run.
--
-- CONVENTION DE PATH appliquée par les helpers js/storage.js :
--   {user_id}/{patient_id}/{type}/{bilan_id}/{filename}
--
-- (storage.foldername(name))[1] extrait le premier segment du path,
-- qui DOIT être l'auth.uid() de l'utilisateur. Toute requête sur un
-- chemin commençant par un autre user_id est refusée par Postgres
-- avant même que l'objet ne soit lu.
-- ═══════════════════════════════════════════════════════════════════

CREATE POLICY "Users can view own files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'patient-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'patient-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'patient-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'patient-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
