-- ════════════════════════════════════════════════════
-- Portail patient — le praticien peut bloquer les notifications d'un patient (abus de messages)
-- ════════════════════════════════════════════════════
-- Interrupteur par patient (fenêtre 🔑) : notifications_bloquees_at renseigné = blocage. Les mots et les validations restent
-- ENREGISTRÉS et lisibles dans « Suivi des séances », mais ne créent plus de notification : ils sont inscrits « déjà notifiés »
-- par le serveur. Débloquer ne notifie pas ce qui a été écrit pendant le blocage. Le patient ne voit jamais le blocage
-- et ne peut pas le modifier. Couvre le ressenti, la fin de programme, et la future messagerie (même colonne).
-- Prérequis : portail-programme-validations.sql, portail-programme-mots.sql. Idempotent.
-- ════════════════════════════════════════════════════
ALTER TABLE public.patient_comptes ADD COLUMN IF NOT EXISTS notifications_bloquees_at timestamptz;
GRANT SELECT (notifications_bloquees_at) ON public.patient_comptes TO authenticated;
GRANT UPDATE (notifications_bloquees_at) ON public.patient_comptes TO authenticated;

CREATE OR REPLACE FUNCTION public.portail_notifications_bloquees(p_patient uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT notifications_bloquees_at IS NOT NULL FROM public.patient_comptes WHERE patient_id = p_patient), false)
$$;
REVOKE ALL ON FUNCTION public.portail_notifications_bloquees(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.programme_validations_mot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.commentaire IS NULL THEN
    NEW.mot_at := NULL;
    NEW.mot_notifie_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.commentaire IS DISTINCT FROM OLD.commentaire THEN
    NEW.mot_at := now();
    NEW.mot_notifie_at := CASE WHEN public.portail_notifications_bloquees(NEW.patient_id) THEN now() END;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.programme_fins_bloquees() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.notifie_at IS NULL AND public.portail_notifications_bloquees(NEW.patient_id) THEN
    NEW.notifie_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS programme_fins_bloquees ON public.programme_fins;
CREATE TRIGGER programme_fins_bloquees BEFORE INSERT OR UPDATE ON public.programme_fins
  FOR EACH ROW EXECUTE FUNCTION public.programme_fins_bloquees();

-- Au moment du blocage : ce qui attendait d'être notifié est aussi réduit au silence (rien ne sortira au déblocage).
CREATE OR REPLACE FUNCTION public.portail_blocage_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.notifications_bloquees_at IS NOT NULL AND OLD.notifications_bloquees_at IS NULL THEN
    UPDATE public.programme_validations SET mot_notifie_at = now()
     WHERE patient_id = NEW.patient_id AND mot_at IS NOT NULL AND mot_notifie_at IS NULL;
    UPDATE public.programme_fins SET notifie_at = now()
     WHERE patient_id = NEW.patient_id AND notifie_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS portail_blocage_purge ON public.patient_comptes;
CREATE TRIGGER portail_blocage_purge AFTER UPDATE OF notifications_bloquees_at ON public.patient_comptes
  FOR EACH ROW EXECUTE FUNCTION public.portail_blocage_purge();
