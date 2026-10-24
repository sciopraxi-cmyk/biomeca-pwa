-- ════════════════════════════════════════════════════
-- Portail patient — lot e3b-2a : programme d'exercices du patient (copie figée)
-- ════════════════════════════════════════════════════
-- Principes (décidés avec le praticien le 24/10/2026) :
--  * UNE copie figée du programme par patient (le nouveau remplace l'ancien) : jours → séances → exercices
--    (1 à 3 sous-exercices simultanés) + catalogue des exercices utilisés (nom, vidéos, fiche PDF, texte) ;
--  * le praticien envoie seulement des CODES d'exercices : la fonction SECURITY DEFINER lit les liens vidéo
--    dans la bibliothèque (le praticien ne les lit jamais) et construit la copie ;
--  * le patient lit SA copie seulement (aucun accès à la bibliothèque) ; le praticien lit celles de ses patients
--    (aperçu du portail pendant la consultation) ;
--  * un patient lit les fiches PDF du bucket privé exercices-pdf uniquement si elles figurent dans SA copie.
-- Prérequis : bibliotheque-exercices.sql, portail-patient-base.sql. Idempotent.
-- ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.programmes_patient (
  patient_id uuid PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contenu jsonb NOT NULL,
  publie_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programmes_patient_taille CHECK (octet_length(contenu::text) <= 600000)
);
CREATE INDEX IF NOT EXISTS programmes_patient_praticien_idx ON public.programmes_patient(praticien_id);

ALTER TABLE public.programmes_patient ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programmes_patient FROM anon, authenticated;
GRANT SELECT ON public.programmes_patient TO authenticated;

DROP POLICY IF EXISTS select_praticien ON public.programmes_patient;
CREATE POLICY select_praticien ON public.programmes_patient
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());
DROP POLICY IF EXISTS select_patient ON public.programmes_patient;
CREATE POLICY select_patient ON public.programmes_patient
  FOR SELECT TO authenticated USING (patient_id = public.portail_patient_actuel());

-- Dépôt du programme (praticien propriétaire de la fiche, patient avec compte portail).
-- p_programme = { debut, fin, jours:[{date, seances:[{id, titre, chrono, exos:[[code,…],…]}]}], noms:{code:libellé} }
CREATE OR REPLACE FUNCTION public.programme_patient_deposer(p_patient uuid, p_programme jsonb)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codes text[];
  v_cat jsonb := '{}'::jsonb;
  v_noms jsonb;
  c text;
  r_base public.exercices_base;
  r_perso public.exercices_perso;
  v_out jsonb;
  v_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'patient introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_comptes WHERE patient_id = p_patient AND praticien_id = auth.uid()) THEN
    RETURN NULL; -- pas de compte portail : rien n'est copié
  END IF;
  IF p_programme IS NULL OR jsonb_typeof(p_programme) <> 'object' OR octet_length(p_programme::text) > 400000
     OR jsonb_typeof(p_programme -> 'jours') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_programme -> 'jours') > 60 THEN
    RAISE EXCEPTION 'programme invalide';
  END IF;
  v_noms := CASE WHEN jsonb_typeof(p_programme -> 'noms') = 'object' THEN p_programme -> 'noms' ELSE '{}'::jsonb END;

  SELECT array_agg(DISTINCT x) INTO v_codes FROM (
    SELECT jsonb_path_query(p_programme, '$.jours[*].seances[*].exos[*][*]') #>> '{}' AS x) q
    WHERE x IS NOT NULL AND char_length(x) <= 200;
  FOREACH c IN ARRAY COALESCE(v_codes, '{}') LOOP
    IF c LIKE 'perso:%' THEN
      BEGIN
        SELECT * INTO r_perso FROM public.exercices_perso
          WHERE id = substr(c, 7)::uuid AND user_id = auth.uid();
      EXCEPTION WHEN invalid_text_representation THEN r_perso := NULL; END;
      IF r_perso.id IS NOT NULL THEN
        v_cat := v_cat || jsonb_build_object(c, jsonb_build_object('nom', r_perso.libelle,
          'liens', to_jsonb(r_perso.liens_youtube), 'pdf', r_perso.pdf_chemin, 'texte', r_perso.texte));
      END IF;
      r_perso := NULL;
    ELSE
      SELECT * INTO r_base FROM public.exercices_base WHERE code = c;
      IF r_base.id IS NOT NULL THEN
        v_cat := v_cat || jsonb_build_object(c, jsonb_build_object('nom', r_base.libelle,
          'liens', to_jsonb(r_base.liens_youtube), 'pdf', r_base.pdf_fichier, 'texte', r_base.texte));
      END IF;
      r_base := NULL;
    END IF;
    -- exercice inconnu (ancien libellé) : le nom envoyé par l'application sert de secours, sans vidéo
    IF NOT (v_cat ? c) AND jsonb_typeof(v_noms -> c) = 'string' THEN
      v_cat := v_cat || jsonb_build_object(c, jsonb_build_object('nom', left(v_noms ->> c, 200),
        'liens', '[]'::jsonb, 'pdf', NULL, 'texte', NULL));
    END IF;
  END LOOP;

  v_out := jsonb_build_object('debut', p_programme -> 'debut', 'fin', p_programme -> 'fin',
                              'jours', p_programme -> 'jours', 'catalogue', v_cat);
  INSERT INTO public.programmes_patient (patient_id, praticien_id, contenu, publie_at)
  VALUES (p_patient, auth.uid(), v_out, now())
  ON CONFLICT (patient_id) DO UPDATE SET contenu = EXCLUDED.contenu, publie_at = now(), praticien_id = EXCLUDED.praticien_id
  RETURNING publie_at INTO v_at;
  RETURN v_at;
END $$;
REVOKE ALL ON FUNCTION public.programme_patient_deposer(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_patient_deposer(uuid, jsonb) TO authenticated;

-- Le patient lit une fiche PDF du bucket privé exercices-pdf seulement si elle est dans SA copie.
CREATE OR REPLACE FUNCTION public.portail_peut_lire_pdf_programme(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.programmes_patient pp
    WHERE pp.patient_id = public.portail_patient_actuel()
      AND jsonb_path_exists(pp.contenu, '$.catalogue.*.pdf ? (@ == $n)', jsonb_build_object('n', p_name)));
$$;
REVOKE ALL ON FUNCTION public.portail_peut_lire_pdf_programme(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_peut_lire_pdf_programme(text) TO authenticated;

DROP POLICY IF EXISTS exercices_pdf_lecture_patient ON storage.objects;
CREATE POLICY exercices_pdf_lecture_patient ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exercices-pdf' AND public.portail_peut_lire_pdf_programme(name));
