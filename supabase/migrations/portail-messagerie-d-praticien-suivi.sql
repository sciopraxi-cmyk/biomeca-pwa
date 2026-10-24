-- Portail patient — MESSAGERIE, bloc D/4 : suivi côté PRATICIEN (pastilles, notifications, e-mails) (idempotent). Prérequis : blocs A, B1, B2, C.
-- Pastilles de la fiche : messages du patient pas encore lus, par patient (praticien connecté seulement).
CREATE OR REPLACE FUNCTION public.messagerie_non_lus_praticien() RETURNS TABLE (patient_id uuid, n integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.patient_id, count(*)::integer FROM public.messages_portail m
   WHERE m.praticien_id = auth.uid() AND m.sens = 'patient' AND m.lu_at IS NULL
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
   GROUP BY m.patient_id
$$;

-- Notifications à créer (messages du patient pas encore notifiés ; jamais ceux d'un patient bloqué) puis marquage unique.
CREATE OR REPLACE FUNCTION public.messagerie_a_notifier() RETURNS TABLE (id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.patient_id FROM public.messages_portail m
   WHERE m.praticien_id = auth.uid() AND m.sens = 'patient' AND m.notifie_at IS NULL
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
   ORDER BY m.created_at LIMIT 50
$$;
CREATE OR REPLACE FUNCTION public.messagerie_notifie(p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'non autorisé'; END IF;
  UPDATE public.messages_portail SET notifie_at = now()
   WHERE id = p_id AND praticien_id = auth.uid() AND sens = 'patient' AND notifie_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;

-- Boîte d'essai des e-mails d'avertissement au patient (sans contenu) : messages du praticien pas encore signalés.
CREATE OR REPLACE FUNCTION public.messagerie_emails_a_envoyer() RETURNS TABLE (id uuid, patient_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.patient_id FROM public.messages_portail m
   WHERE m.praticien_id = auth.uid() AND m.sens = 'praticien' AND m.notifie_at IS NULL
     AND (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient'
   ORDER BY m.created_at LIMIT 50
$$;

REVOKE ALL ON FUNCTION public.messagerie_envoyer_praticien(uuid, text), public.messagerie_modifier_praticien(uuid, text),
  public.messagerie_lire_praticien(uuid), public.messagerie_lu_praticien(uuid), public.messagerie_non_lus_praticien(),
  public.messagerie_a_notifier(), public.messagerie_notifie(uuid), public.messagerie_emails_a_envoyer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messagerie_envoyer_praticien(uuid, text), public.messagerie_modifier_praticien(uuid, text),
  public.messagerie_lire_praticien(uuid), public.messagerie_lu_praticien(uuid), public.messagerie_non_lus_praticien(),
  public.messagerie_a_notifier(), public.messagerie_notifie(uuid), public.messagerie_emails_a_envoyer() TO authenticated;

-- Au blocage d'un patient, ses messages en attente de notification sont réduits au silence (rien ne sortira au déblocage).
CREATE OR REPLACE FUNCTION public.messagerie_blocage_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.notifications_bloquees_at IS NOT NULL AND OLD.notifications_bloquees_at IS NULL THEN
    UPDATE public.messages_portail SET notifie_at = now()
     WHERE patient_id = NEW.patient_id AND sens = 'patient' AND notifie_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.messagerie_blocage_purge() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS messagerie_blocage_purge ON public.patient_comptes;
CREATE TRIGGER messagerie_blocage_purge AFTER UPDATE OF notifications_bloquees_at ON public.patient_comptes
  FOR EACH ROW EXECUTE FUNCTION public.messagerie_blocage_purge();
