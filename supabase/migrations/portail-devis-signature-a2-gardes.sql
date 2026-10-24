-- Signature du devis par le patient — bloc A2/6 : gardes de fixité (idempotent). Prérequis : bloc A1.
-- Une signature ne se modifie jamais ; un devis signé reste figé (contenu, fichier, patient).
CREATE OR REPLACE FUNCTION public.devis_signatures_fige() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'devis_signatures' THEN
    IF (to_jsonb(NEW) - 'notifie_at') IS DISTINCT FROM (to_jsonb(OLD) - 'notifie_at') THEN
      RAISE EXCEPTION 'signature_figee';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM public.devis_signatures WHERE document_id = OLD.id)
    AND (NEW.contenu IS DISTINCT FROM OLD.contenu OR NEW.fichier_chemin IS DISTINCT FROM OLD.fichier_chemin
      OR NEW.patient_id IS DISTINCT FROM OLD.patient_id OR NEW.type IS DISTINCT FROM OLD.type
      OR NEW.source_ref IS DISTINCT FROM OLD.source_ref OR NEW.titre IS DISTINCT FROM OLD.titre) THEN
    RAISE EXCEPTION 'devis_signe_fige';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.devis_signatures_fige() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS devis_signatures_fige ON public.devis_signatures;
CREATE TRIGGER devis_signatures_fige BEFORE UPDATE ON public.devis_signatures FOR EACH ROW EXECUTE FUNCTION public.devis_signatures_fige();
DROP TRIGGER IF EXISTS documents_partages_fige ON public.documents_partages;
CREATE TRIGGER documents_partages_fige BEFORE UPDATE ON public.documents_partages FOR EACH ROW EXECUTE FUNCTION public.devis_signatures_fige();
