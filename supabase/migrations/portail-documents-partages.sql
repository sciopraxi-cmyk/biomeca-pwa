-- ═══════════════════════════════════════════════════════════════════
-- Portail patient — lot (b2) : documents partagés (devis, factures, ordonnances, rapports)
-- ═══════════════════════════════════════════════════════════════════
-- Principes (décidés avec le praticien le 22/10/2026) :
--  * COPIES FIGÉES dans une table dédiée, jamais le blob praticien : chaque document partagé est
--    UN fichier HTML autonome (le même rendu que l'impression du praticien ; pour un rapport, photos
--    réduites incluses) dans le bucket privé `patient-documents`. Devis, factures et ordonnances
--    gardent en plus leurs données structurées (contenu jsonb, construit côté serveur pour les
--    devis et factures) : elles serviront à la signature d'un devis (lot suivant) ;
--  * partage AUTOMATIQUE à la création côté application (le patient doit avoir un compte portail),
--    le praticien peut RETIRER puis REMETTRE l'accès document par document : rien n'est supprimé,
--    un document retiré reste retiré même si l'application le repartage ;
--  * le patient ne fait que LIRE (aucun droit d'écriture) et n'accède qu'aux documents de SA fiche,
--    non retirés, tant que son compte est actif (portail_patient_actuel()) ;
--  * le fichier d'un rapport suit la même règle : retirer le document ferme aussi le fichier.
-- Prérequis : portail-patient-base.sql (comptes, portail_patient_actuel).
-- Idempotent : IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documents_partages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('devis', 'facture', 'ordonnance', 'rapport')),
  source_ref text NOT NULL CHECK (char_length(source_ref) BETWEEN 1 AND 64),
  titre text NOT NULL CHECK (char_length(titre) BETWEEN 1 AND 120),
  date_document date,
  contenu jsonb,
  fichier_chemin text NOT NULL CHECK (char_length(fichier_chemin) <= 200),
  retire boolean NOT NULL DEFAULT false,
  retire_at timestamptz,
  lu_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, type, source_ref),
  CONSTRAINT documents_partages_forme CHECK (
    (type = 'rapport' AND contenu IS NULL) OR (type <> 'rapport' AND contenu IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS documents_partages_patient_idx ON public.documents_partages(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS documents_partages_praticien_idx ON public.documents_partages(praticien_id);

ALTER TABLE public.documents_partages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documents_partages FROM anon, authenticated;
GRANT SELECT ON public.documents_partages TO authenticated;

DROP POLICY IF EXISTS select_praticien ON public.documents_partages;
CREATE POLICY select_praticien ON public.documents_partages
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());
DROP POLICY IF EXISTS select_patient ON public.documents_partages;
CREATE POLICY select_patient ON public.documents_partages
  FOR SELECT TO authenticated
  USING (patient_id = public.portail_patient_actuel() AND NOT retire);

-- Contrôle commun : praticien connecté (jamais un patient), propriétaire de la fiche, avec un
-- compte portail. Renvoie false si le patient n'a pas (encore) de compte : rien n'est copié.
CREATE OR REPLACE FUNCTION public.documents_partages_controle(p_patient uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'patient introuvable';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.patient_comptes WHERE patient_id = p_patient AND praticien_id = auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.documents_partages_controle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documents_partages_controle(uuid) TO authenticated;

-- Le fichier doit être déposé AVANT, dans le dossier de CE patient, sous un nom <uuid>.html.
CREATE OR REPLACE FUNCTION public.documents_partages_chemin_ok(p_patient uuid, p_chemin text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  IF p_chemin IS NULL OR p_chemin !~ ('^' || p_patient::text || '/[0-9a-f-]{36}\.html$') THEN
    RAISE EXCEPTION 'chemin invalide';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'patient-documents' AND name = p_chemin) THEN
    RAISE EXCEPTION 'fichier introuvable';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.documents_partages_chemin_ok(uuid, text) FROM PUBLIC, anon;

-- Devis / facture ÉMIS : copie construite côté serveur depuis le document réel.
CREATE OR REPLACE FUNCTION public.documents_partager_facturation(p_patient uuid, p_document uuid, p_chemin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.documents_facturation;
  v_id uuid;
BEGIN
  IF NOT public.documents_partages_controle(p_patient) THEN RETURN NULL; END IF;
  PERFORM public.documents_partages_chemin_ok(p_patient, p_chemin);
  SELECT * INTO d FROM public.documents_facturation
    WHERE id = p_document AND user_id = auth.uid() AND statut = 'emis';
  IF NOT FOUND THEN RAISE EXCEPTION 'document introuvable ou non émis'; END IF;
  INSERT INTO public.documents_partages (praticien_id, patient_id, type, source_ref, titre, date_document, fichier_chemin, contenu)
  VALUES (auth.uid(), p_patient, d.type, d.id::text,
          (CASE d.type WHEN 'devis' THEN 'Devis ' ELSE 'Facture ' END) || d.numero,
          d.date_document, p_chemin,
          jsonb_build_object('numero', d.numero, 'date_document', d.date_document,
            'valide_jusqu_au', d.valide_jusqu_au, 'patient', d.patient, 'emetteur', d.emetteur,
            'regime', d.regime, 'lignes', d.lignes, 'total_fixe', d.total_fixe,
            'total_cents', d.total_cents, 'tiers_payant', d.tiers_payant,
            'part_secu_cents', d.part_secu_cents, 'net_cents', d.net_cents,
            'mention_tva', d.mention_tva, 'note', d.note, 'devis_numero', d.devis_numero,
            'paiement_mode', d.paiement_mode, 'paiement_date', d.paiement_date))
  ON CONFLICT (patient_id, type, source_ref) DO UPDATE SET contenu = EXCLUDED.contenu, fichier_chemin = EXCLUDED.fichier_chemin
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.documents_partager_facturation(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documents_partager_facturation(uuid, uuid, text) TO authenticated;

-- Ordonnance (conservée dans le dossier du praticien) : copie envoyée par l'application,
-- réduite aux champs connus et bornée en taille.
CREATE OR REPLACE FUNCTION public.documents_partager_ordonnance(p_patient uuid, p_source_ref text, p_date date, p_contenu jsonb, p_chemin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_contenu jsonb;
BEGIN
  IF NOT public.documents_partages_controle(p_patient) THEN RETURN NULL; END IF;
  PERFORM public.documents_partages_chemin_ok(p_patient, p_chemin);
  IF p_contenu IS NULL OR jsonb_typeof(p_contenu) <> 'object' OR octet_length(p_contenu::text) > 400000 THEN
    RAISE EXCEPTION 'ordonnance invalide';
  END IF;
  SELECT jsonb_object_agg(k, v) INTO v_contenu FROM jsonb_each(p_contenu) AS t(k, v)
    WHERE k IN ('id', 'date', 'categorie', 'lignes', 'renouvellement', 'note', 'emetteur', 'patient', 'signature');
  IF v_contenu IS NULL THEN RAISE EXCEPTION 'ordonnance invalide'; END IF;
  INSERT INTO public.documents_partages (praticien_id, patient_id, type, source_ref, titre, date_document, fichier_chemin, contenu)
  VALUES (auth.uid(), p_patient, 'ordonnance', p_source_ref,
          'Ordonnance' || COALESCE(' du ' || to_char(p_date, 'DD/MM/YYYY'), ''), p_date, p_chemin, v_contenu)
  ON CONFLICT (patient_id, type, source_ref) DO UPDATE SET contenu = EXCLUDED.contenu, date_document = EXCLUDED.date_document, fichier_chemin = EXCLUDED.fichier_chemin
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.documents_partager_ordonnance(uuid, text, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documents_partager_ordonnance(uuid, text, date, jsonb, text) TO authenticated;

-- Rapport de bilan : même principe ; le fichier HTML est déjà envoyé dans patient-documents/<patient>/<uuid>.html.
CREATE OR REPLACE FUNCTION public.documents_partager_rapport(p_patient uuid, p_source_ref text, p_titre text, p_date date, p_chemin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.documents_partages_controle(p_patient) THEN RETURN NULL; END IF;
  PERFORM public.documents_partages_chemin_ok(p_patient, p_chemin);
  INSERT INTO public.documents_partages (praticien_id, patient_id, type, source_ref, titre, date_document, fichier_chemin)
  VALUES (auth.uid(), p_patient, 'rapport', p_source_ref, left(trim(p_titre), 120), p_date, p_chemin)
  ON CONFLICT (patient_id, type, source_ref) DO UPDATE SET titre = EXCLUDED.titre, fichier_chemin = EXCLUDED.fichier_chemin
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.documents_partager_rapport(uuid, text, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documents_partager_rapport(uuid, text, text, date, text) TO authenticated;

-- Retirer / remettre l'accès (le praticien propriétaire seulement).
CREATE OR REPLACE FUNCTION public.documents_partages_retirer(p_id uuid, p_retire boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  UPDATE public.documents_partages
     SET retire = p_retire, retire_at = CASE WHEN p_retire THEN now() ELSE NULL END
   WHERE id = p_id AND praticien_id = auth.uid();
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.documents_partages_retirer(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documents_partages_retirer(uuid, boolean) TO authenticated;

-- Le patient marque un document comme lu (seule écriture possible pour lui).
CREATE OR REPLACE FUNCTION public.portail_document_lu(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.documents_partages SET lu_at = now()
   WHERE id = p_id AND lu_at IS NULL AND NOT retire
     AND patient_id = public.portail_patient_actuel();
$$;
REVOKE ALL ON FUNCTION public.portail_document_lu(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_document_lu(uuid) TO authenticated;

-- Droit de lire un fichier de rapport : document non retiré, de SA fiche, compte actif.
CREATE OR REPLACE FUNCTION public.portail_peut_lire_fichier(p_nom text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.documents_partages d
                  WHERE d.fichier_chemin = p_nom AND NOT d.retire
                    AND d.patient_id = public.portail_patient_actuel());
$$;
REVOKE ALL ON FUNCTION public.portail_peut_lire_fichier(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_peut_lire_fichier(text) TO authenticated;

-- Bucket privé des rapports (20 Mo par fichier, HTML seulement).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('patient-documents', 'patient-documents', false, 20971520, ARRAY['text/html'])
ON CONFLICT (id) DO NOTHING;

-- Le praticien dépose et relit les fichiers des fiches qui lui appartiennent ; jamais de
-- modification ni de suppression (pas de politique UPDATE/DELETE : aucune purge automatique).
DROP POLICY IF EXISTS pd_praticien_insert ON storage.objects;
CREATE POLICY pd_praticien_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-documents'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
    AND (storage.foldername(name))[1] IN (SELECT p.id::text FROM public.patients p WHERE p.user_id = auth.uid()));
DROP POLICY IF EXISTS pd_praticien_select ON storage.objects;
CREATE POLICY pd_praticien_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-documents'
    AND (storage.foldername(name))[1] IN (SELECT p.id::text FROM public.patients p WHERE p.user_id = auth.uid()));
DROP POLICY IF EXISTS pd_patient_select ON storage.objects;
CREATE POLICY pd_patient_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'patient-documents' AND public.portail_peut_lire_fichier(name));
