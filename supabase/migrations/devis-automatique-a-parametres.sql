-- Devis automatique (lot 1) — paramètres, type de devis par acte, anti-doublon par rendez-vous.
-- Idempotent. Ne modifie aucune ligne existante.
--  * actes_catalogue.devis_mode : 'simple' (montant de l'acte) ou 'semelles' (bilan + Sécu semelles
--    + complément d'honoraires) ; ne sert que si sync_doctolib est coché.
--  * devis_auto_parametres : une ligne par praticien (compte) — montant Sécu d'une paire de semelles
--    (daté, sourcé, saisi à la main, jamais codé en dur) et complément d'honoraires.
--  * documents_facturation.source_rdv : identifiant du rendez-vous Doctolib à l'origine du devis ;
--    unique par praticien (un rendez-vous ne produit qu'un devis, même si le fichier est réimporté) ;
--    jamais modifiable une fois posé.

ALTER TABLE public.actes_catalogue
  ADD COLUMN IF NOT EXISTS devis_mode text NOT NULL DEFAULT 'simple'
  CHECK (devis_mode IN ('simple', 'semelles'));

CREATE TABLE IF NOT EXISTS public.devis_auto_parametres (
  user_id            uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  secu_semelles_cents integer CHECK (secu_semelles_cents IS NULL OR secu_semelles_cents BETWEEN 0 AND 1000000),
  secu_semelles_date  date,
  secu_semelles_source text CHECK (secu_semelles_source IS NULL OR char_length(secu_semelles_source) <= 300),
  complement_cents    integer NOT NULL DEFAULT 0 CHECK (complement_cents BETWEEN 0 AND 1000000),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.devis_auto_parametres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devis_auto_param_select ON public.devis_auto_parametres;
CREATE POLICY devis_auto_param_select ON public.devis_auto_parametres
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS devis_auto_param_insert ON public.devis_auto_parametres;
CREATE POLICY devis_auto_param_insert ON public.devis_auto_parametres
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS devis_auto_param_update ON public.devis_auto_parametres;
CREATE POLICY devis_auto_param_update ON public.devis_auto_parametres
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
REVOKE ALL ON public.devis_auto_parametres FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.devis_auto_parametres TO authenticated;

CREATE OR REPLACE FUNCTION public.devis_auto_parametres_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.user_id := OLD.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS devis_auto_parametres_touch ON public.devis_auto_parametres;
CREATE TRIGGER devis_auto_parametres_touch BEFORE UPDATE ON public.devis_auto_parametres
  FOR EACH ROW EXECUTE FUNCTION public.devis_auto_parametres_touch();

ALTER TABLE public.documents_facturation
  ADD COLUMN IF NOT EXISTS source_rdv text CHECK (source_rdv IS NULL OR char_length(source_rdv) BETWEEN 1 AND 80);
CREATE UNIQUE INDEX IF NOT EXISTS documents_user_source_rdv_uniq
  ON public.documents_facturation (user_id, source_rdv) WHERE source_rdv IS NOT NULL;

-- Garde : identique à facturation-tiers-payant.sql (dernière version) + source_rdv immuable dès la création.
CREATE OR REPLACE FUNCTION public.documents_facturation_garde()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.user_id := OLD.user_id;
  NEW.updated_at := now();
  IF NEW.type <> OLD.type THEN
    RAISE EXCEPTION 'le type d''un document ne change jamais' USING ERRCODE = '23514';
  END IF;
  IF NEW.source_rdv IS DISTINCT FROM OLD.source_rdv THEN
    RAISE EXCEPTION 'le rendez-vous d''origine d''un document ne change jamais' USING ERRCODE = '23514';
  END IF;
  IF OLD.statut = 'emis' THEN
    IF NEW.statut <> OLD.statut
       OR NEW.numero IS DISTINCT FROM OLD.numero
       OR NEW.patient_ref <> OLD.patient_ref
       OR NEW.patient IS DISTINCT FROM OLD.patient
       OR NEW.emetteur IS DISTINCT FROM OLD.emetteur
       OR NEW.regime <> OLD.regime
       OR NEW.lignes IS DISTINCT FROM OLD.lignes
       OR NEW.total_fixe <> OLD.total_fixe
       OR NEW.total_cents <> OLD.total_cents
       OR NEW.tiers_payant <> OLD.tiers_payant
       OR NEW.part_secu_cents <> OLD.part_secu_cents
       OR NEW.mention_tva <> OLD.mention_tva
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.devis_numero IS DISTINCT FROM OLD.devis_numero
       OR NEW.date_document IS DISTINCT FROM OLD.date_document
       OR NEW.valide_jusqu_au IS DISTINCT FROM OLD.valide_jusqu_au
       OR NEW.emis_at IS DISTINCT FROM OLD.emis_at
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION 'document émis : seul le règlement peut être modifié' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.statut = 'emis'
        AND coalesce(current_setting('verticy.emission', true), '') <> '1' THEN
    RAISE EXCEPTION 'l''émission passe uniquement par emettre_document()' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
