-- Questionnaire patient — bloc D/6 : intégration au bilan (idempotent). Prérequis : A1 à C2.
-- Marque le questionnaire « intégré » (une seule fois) ; il n'est alors plus « ouvert » : le patient n'y a plus accès et un nouveau peut être envoyé.
CREATE OR REPLACE FUNCTION public.questionnaire_integrer(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_p uuid; v_n integer;
BEGIN
  SELECT patient_id INTO v_p FROM public.questionnaires_patient WHERE id = p_id AND praticien_id = auth.uid() AND rempli_at IS NOT NULL;
  IF v_p IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  PERFORM public.messagerie_praticien_ok(v_p);
  UPDATE public.questionnaires_patient SET integre_at = now() WHERE id = p_id AND integre_at IS NULL AND retire_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.questionnaire_integrer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_integrer(uuid) TO authenticated;
