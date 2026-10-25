-- Questionnaire patient — bloc E1/4 : programmation à J-3 (idempotent). Prérequis : A1 à D.
-- visible_des : le patient ne voit le questionnaire qu'à partir de cette date (RDV − 3 jours ; vide = visible tout de suite).
-- source_rdv : identifiant du RDV d'origine (un RDV = un questionnaire, rejouer l'appel ne crée pas de doublon).
ALTER TABLE public.questionnaires_patient ADD COLUMN IF NOT EXISTS visible_des timestamptz;
ALTER TABLE public.questionnaires_patient ADD COLUMN IF NOT EXISTS source_rdv text CHECK (source_rdv IS NULL OR char_length(source_rdv) <= 80);
ALTER TABLE public.questionnaires_patient ADD COLUMN IF NOT EXISTS envoi_signale_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS questionnaires_patient_source ON public.questionnaires_patient (praticien_id, source_rdv)
  WHERE source_rdv IS NOT NULL AND retire_at IS NULL;

DROP FUNCTION IF EXISTS public.questionnaire_demander(uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.questionnaire_demander(p_patient uuid, p_rdv timestamptz DEFAULT NULL, p_source text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ddn date; v_id uuid;
BEGIN
  PERFORM public.messagerie_praticien_ok(p_patient);
  IF p_rdv IS NOT NULL AND p_rdv < now() THEN RAISE EXCEPTION 'rdv_passe'; END IF;
  IF p_source IS NOT NULL THEN
    SELECT id INTO v_id FROM public.questionnaires_patient WHERE praticien_id = auth.uid() AND patient_id = p_patient AND source_rdv = p_source AND retire_at IS NULL;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  SELECT ddn INTO v_ddn FROM public.patients WHERE id = p_patient;
  INSERT INTO public.questionnaires_patient (patient_id, praticien_id, type, rdv_at, visible_des, source_rdv)
  VALUES (p_patient, auth.uid(), CASE WHEN v_ddn IS NULL OR v_ddn <= (public.portail_aujourdhui() - interval '18 years')::date THEN 'adulte' ELSE 'enfant' END,
          p_rdv, CASE WHEN p_rdv IS NULL OR p_rdv - interval '3 days' <= now() THEN NULL ELSE p_rdv - interval '3 days' END, p_source)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'questionnaire_deja_ouvert';
END $$;
REVOKE ALL ON FUNCTION public.questionnaire_demander(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_demander(uuid, timestamptz, text) TO authenticated;
