-- Questionnaire patient — bloc C1/5 : fonctions du PRATICIEN et notification (idempotent). Prérequis : A1, A2, B. Suite : C2.
-- Le type (adulte/enfant) vient de la date de naissance (inconnue = adulte). Le praticien doit être propriétaire du compte portail.
CREATE OR REPLACE FUNCTION public.questionnaire_demander(p_patient uuid, p_rdv timestamptz DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ddn date; v_id uuid;
BEGIN
  PERFORM public.messagerie_praticien_ok(p_patient);
  IF p_rdv IS NOT NULL AND p_rdv < now() THEN RAISE EXCEPTION 'rdv_passe'; END IF;
  SELECT ddn INTO v_ddn FROM public.patients WHERE id = p_patient;
  INSERT INTO public.questionnaires_patient (patient_id, praticien_id, type, rdv_at)
  VALUES (p_patient, auth.uid(), CASE WHEN v_ddn IS NULL OR v_ddn <= (public.portail_aujourdhui() - interval '18 years')::date THEN 'adulte' ELSE 'enfant' END, p_rdv)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'questionnaire_deja_ouvert';
END $$;

CREATE OR REPLACE FUNCTION public.questionnaire_lire_praticien(p_patient uuid)
RETURNS TABLE (id uuid, type text, rdv_at timestamptz, envoye_at timestamptz, rempli_at timestamptz, modifie_at timestamptz, integre_at timestamptz, retire_at timestamptz, reponses jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.messagerie_praticien_ok(p_patient);
  RETURN QUERY SELECT q.id, q.type, q.rdv_at, q.envoye_at, q.rempli_at, q.modifie_at, q.integre_at, q.retire_at, q.reponses
    FROM public.questionnaires_patient q WHERE q.patient_id = p_patient AND q.praticien_id = auth.uid() ORDER BY q.envoye_at DESC LIMIT 10;
END $$;

CREATE OR REPLACE FUNCTION public.questionnaire_retirer(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p uuid; v_n integer;
BEGIN
  SELECT patient_id INTO v_p FROM public.questionnaires_patient WHERE id = p_id AND praticien_id = auth.uid();
  IF v_p IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  PERFORM public.messagerie_praticien_ok(v_p);
  UPDATE public.questionnaires_patient SET retire_at = now() WHERE id = p_id AND integre_at IS NULL AND retire_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;

REVOKE ALL ON FUNCTION public.questionnaire_demander(uuid, timestamptz), public.questionnaire_lire_praticien(uuid), public.questionnaire_retirer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_demander(uuid, timestamptz), public.questionnaire_lire_praticien(uuid), public.questionnaire_retirer(uuid) TO authenticated;
