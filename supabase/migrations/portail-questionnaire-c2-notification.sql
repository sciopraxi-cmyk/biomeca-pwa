-- Questionnaire patient — bloc C2/5 : notification au praticien (idempotent). Prérequis : A1 à C1.
CREATE OR REPLACE FUNCTION public.questionnaire_a_notifier() RETURNS TABLE (id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.id, q.patient_id FROM public.questionnaires_patient q
   WHERE q.praticien_id = auth.uid() AND q.rempli_at IS NOT NULL AND q.notifie_at IS NULL AND q.retire_at IS NULL
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' ORDER BY q.rempli_at LIMIT 50
$$;
CREATE OR REPLACE FUNCTION public.questionnaire_notifie(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'non autorisé'; END IF;
  UPDATE public.questionnaires_patient SET notifie_at = now() WHERE id = p_id AND praticien_id = auth.uid() AND notifie_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;

CREATE OR REPLACE FUNCTION public.questionnaire_blocage_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.notifications_bloquees_at IS NOT NULL AND OLD.notifications_bloquees_at IS NULL THEN
    UPDATE public.questionnaires_patient SET notifie_at = now() WHERE patient_id = NEW.patient_id AND rempli_at IS NOT NULL AND notifie_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS questionnaire_blocage_purge ON public.patient_comptes;
CREATE TRIGGER questionnaire_blocage_purge AFTER UPDATE OF notifications_bloquees_at ON public.patient_comptes
  FOR EACH ROW EXECUTE FUNCTION public.questionnaire_blocage_purge();
REVOKE ALL ON FUNCTION public.questionnaire_blocage_purge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.questionnaire_a_notifier(), public.questionnaire_notifie(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_a_notifier(), public.questionnaire_notifie(uuid) TO authenticated;
