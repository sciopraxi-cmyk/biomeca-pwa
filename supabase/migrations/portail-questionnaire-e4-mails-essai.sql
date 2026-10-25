-- Questionnaire patient — bloc E4/4 : e-mails d'essai à signaler (envoi dès que visible, rappel à J-1) (idempotent). Prérequis : E1.
-- Rappel : seulement si le questionnaire n'est pas rempli, à partir de RDV − 1 jour et au moins 12 h après l'envoi.
CREATE OR REPLACE FUNCTION public.questionnaire_envois_a_signaler() RETURNS TABLE (id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.patient_id FROM public.questionnaires_patient q
   WHERE q.praticien_id = auth.uid() AND q.integre_at IS NULL AND q.retire_at IS NULL AND q.envoi_signale_at IS NULL
     AND COALESCE(q.visible_des, q.envoye_at) <= now() AND (q.rdv_at IS NULL OR q.rdv_at > now())
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' ORDER BY q.envoye_at LIMIT 50
$$;
CREATE OR REPLACE FUNCTION public.questionnaire_rappels_a_faire() RETURNS TABLE (id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.patient_id FROM public.questionnaires_patient q
   WHERE q.praticien_id = auth.uid() AND q.rempli_at IS NULL AND q.rappel_at IS NULL AND q.integre_at IS NULL AND q.retire_at IS NULL
     AND q.rdv_at IS NOT NULL AND q.rdv_at > now() AND now() >= q.rdv_at - interval '1 day'
     AND q.envoi_signale_at IS NOT NULL AND now() >= q.envoi_signale_at + interval '12 hours'
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' ORDER BY q.rdv_at LIMIT 50
$$;
CREATE OR REPLACE FUNCTION public.questionnaire_marquer_mail(p_id uuid, p_genre text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' OR p_genre NOT IN ('envoi', 'rappel') THEN RAISE EXCEPTION 'non autorisé'; END IF;
  IF p_genre = 'envoi' THEN
    UPDATE public.questionnaires_patient SET envoi_signale_at = now() WHERE id = p_id AND praticien_id = auth.uid() AND envoi_signale_at IS NULL;
  ELSE
    UPDATE public.questionnaires_patient SET rappel_at = now() WHERE id = p_id AND praticien_id = auth.uid() AND rappel_at IS NULL;
  END IF;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.questionnaire_envois_a_signaler(), public.questionnaire_rappels_a_faire(), public.questionnaire_marquer_mail(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_envois_a_signaler(), public.questionnaire_rappels_a_faire(), public.questionnaire_marquer_mail(uuid, text) TO authenticated;
