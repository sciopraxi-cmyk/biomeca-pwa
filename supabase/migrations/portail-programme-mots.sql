-- ════════════════════════════════════════════════════
-- Portail patient — lot e3b-2b (suite) : le praticien est prévenu quand le patient écrit son ressenti
-- ════════════════════════════════════════════════════
-- Un déclencheur note l'heure du mot (mot_at) à chaque nouveau mot ou mot modifié, et remet « notifié » à zéro ; un mot effacé
-- n'est pas notifié. Le praticien lit les mots non notifiés (RLS existante) puis appelle programme_mot_notifie, qui renvoie
-- true UNE seule fois par mot. Les anciens mots déjà en base sont marqués « déjà notifiés » (pas de notification surprise).
-- Aucune modification des fonctions déjà posées. Prérequis : portail-programme-validations.sql. Idempotent.
-- ════════════════════════════════════════════════════
ALTER TABLE public.programme_validations ADD COLUMN IF NOT EXISTS mot_at timestamptz;
ALTER TABLE public.programme_validations ADD COLUMN IF NOT EXISTS mot_notifie_at timestamptz;

UPDATE public.programme_validations
   SET mot_at = valide_at, mot_notifie_at = now()
 WHERE commentaire IS NOT NULL AND mot_at IS NULL;

CREATE OR REPLACE FUNCTION public.programme_validations_mot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.commentaire IS NULL THEN
    NEW.mot_at := NULL;
    NEW.mot_notifie_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.commentaire IS DISTINCT FROM OLD.commentaire THEN
    NEW.mot_at := now();
    NEW.mot_notifie_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS programme_validations_mot ON public.programme_validations;
CREATE TRIGGER programme_validations_mot BEFORE INSERT OR UPDATE OF commentaire ON public.programme_validations
  FOR EACH ROW EXECUTE FUNCTION public.programme_validations_mot();

CREATE INDEX IF NOT EXISTS programme_validations_mots_idx ON public.programme_validations(praticien_id)
  WHERE mot_at IS NOT NULL AND mot_notifie_at IS NULL;

CREATE OR REPLACE FUNCTION public.programme_mot_notifie(p_patient uuid, p_jour date, p_seance text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  UPDATE public.programme_validations SET mot_notifie_at = now()
   WHERE patient_id = p_patient AND jour = p_jour AND seance_id = p_seance
     AND praticien_id = auth.uid() AND mot_at IS NOT NULL AND mot_notifie_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.programme_mot_notifie(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_mot_notifie(uuid, date, text) TO authenticated;
