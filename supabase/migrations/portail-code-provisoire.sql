-- Portail patient — code provisoire pour une fiche SANS date de naissance (idempotent).
-- Le code remplace la date à la 1re connexion ; il est effacé dès que le patient a choisi son mot de passe.
-- Le patient ne peut pas le lire (aucun droit de colonne) ; le praticien le lit par la fonction ci-dessous (clé 🔑 de la fiche).
ALTER TABLE public.patient_comptes ADD COLUMN IF NOT EXISTS code_provisoire text
  CHECK (code_provisoire IS NULL OR code_provisoire ~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$');
REVOKE ALL (code_provisoire) ON public.patient_comptes FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.patient_comptes_effacer_code() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut IS DISTINCT FROM 'initial' THEN NEW.code_provisoire := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS patient_comptes_effacer_code ON public.patient_comptes;
CREATE TRIGGER patient_comptes_effacer_code BEFORE INSERT OR UPDATE ON public.patient_comptes
  FOR EACH ROW EXECUTE FUNCTION public.patient_comptes_effacer_code();

CREATE OR REPLACE FUNCTION public.portail_code_provisoire(p_patient uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN RAISE EXCEPTION 'non autorisé'; END IF;
  RETURN (SELECT c.code_provisoire FROM public.patient_comptes c
           WHERE c.patient_id = p_patient AND c.praticien_id = auth.uid() AND c.statut = 'initial');
END $$;
REVOKE ALL ON FUNCTION public.portail_code_provisoire(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_code_provisoire(uuid) TO authenticated;
