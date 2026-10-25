-- Signature du devis par le patient — bloc C/6 : suivi côté PRATICIEN (idempotent). Prérequis : A1 à B2.
-- Notifications : signatures pas encore notifiées (jamais celles d'un patient bloqué) puis marquage unique.
CREATE OR REPLACE FUNCTION public.devis_signatures_a_notifier() RETURNS TABLE (id uuid, patient_id uuid, document_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.patient_id, s.document_id FROM public.devis_signatures s
   WHERE s.praticien_id = auth.uid() AND s.notifie_at IS NULL
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
   ORDER BY s.signe_at LIMIT 50
$$;
CREATE OR REPLACE FUNCTION public.devis_signature_notifie(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'non autorisé'; END IF;
  UPDATE public.devis_signatures SET notifie_at = now() WHERE id = p_id AND praticien_id = auth.uid() AND notifie_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.devis_signatures_a_notifier(), public.devis_signature_notifie(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_signatures_a_notifier(), public.devis_signature_notifie(uuid) TO authenticated;

-- Au blocage d'un patient, ses signatures en attente de notification sont réduites au silence.
CREATE OR REPLACE FUNCTION public.devis_signatures_blocage_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.notifications_bloquees_at IS NOT NULL AND OLD.notifications_bloquees_at IS NULL THEN
    UPDATE public.devis_signatures SET notifie_at = now() WHERE patient_id = NEW.patient_id AND notifie_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.devis_signatures_blocage_purge() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS devis_signatures_blocage_purge ON public.patient_comptes;
CREATE TRIGGER devis_signatures_blocage_purge AFTER UPDATE OF notifications_bloquees_at ON public.patient_comptes
  FOR EACH ROW EXECUTE FUNCTION public.devis_signatures_blocage_purge();
