-- Questionnaire patient — bloc E3/4 : RDV déplacé ou annulé (idempotent). Prérequis : E1.
-- Déplacé : rdv_at change toujours ; si le patient peut déjà le voir, il le garde (visible_des inchangé), sinon visible_des suit le nouveau RDV.
CREATE OR REPLACE FUNCTION public.questionnaire_replanifier(p_source text, p_rdv timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'non autorisé'; END IF;
  IF p_rdv IS NULL OR p_rdv < now() THEN RAISE EXCEPTION 'rdv_passe'; END IF;
  UPDATE public.questionnaires_patient SET rdv_at = p_rdv,
    visible_des = CASE WHEN visible_des IS NULL OR visible_des <= now() THEN visible_des
                       WHEN p_rdv - interval '3 days' <= now() THEN NULL ELSE p_rdv - interval '3 days' END
   WHERE praticien_id = auth.uid() AND source_rdv = p_source AND integre_at IS NULL AND retire_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;

CREATE OR REPLACE FUNCTION public.questionnaire_retirer_source(p_source text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'non autorisé'; END IF;
  UPDATE public.questionnaires_patient SET retire_at = now()
   WHERE praticien_id = auth.uid() AND source_rdv = p_source AND integre_at IS NULL AND retire_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.questionnaire_replanifier(text, timestamptz), public.questionnaire_retirer_source(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_replanifier(text, timestamptz), public.questionnaire_retirer_source(text) TO authenticated;
