-- Facturation, étape 2b-1 (suite) — tiers payant.
-- Le praticien qui télétransmet est payé directement par la Sécurité sociale : le document
-- n'indique que le montant dû par le patient.
--   tiers_payant     : case cochée à l'enregistrement ;
--   part_secu_cents  : part payée directement par la Sécu, FIGÉE dans le document (franchise
--                      déduite : elle reste due par le patient). 0 sans tiers payant ;
--   net_cents        : montant dû par le patient = total_cents − part_secu_cents (colonne
--                      calculée par la base, jamais saisie).
-- Les deux champs rejoignent la liste des champs figés d'un document émis.
-- Idempotent : IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, CREATE OR REPLACE.

ALTER TABLE public.documents_facturation
  ADD COLUMN IF NOT EXISTS tiers_payant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS part_secu_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.documents_facturation DROP CONSTRAINT IF EXISTS documents_tiers_payant_coherent;
ALTER TABLE public.documents_facturation ADD CONSTRAINT documents_tiers_payant_coherent CHECK (
  part_secu_cents >= 0 AND part_secu_cents <= total_cents AND (tiers_payant OR part_secu_cents = 0));

ALTER TABLE public.documents_facturation
  ADD COLUMN IF NOT EXISTS net_cents integer GENERATED ALWAYS AS (total_cents - part_secu_cents) STORED;

CREATE OR REPLACE FUNCTION public.documents_facturation_garde()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.user_id := OLD.user_id;
  NEW.updated_at := now();
  IF NEW.type <> OLD.type THEN
    RAISE EXCEPTION 'le type d''un document ne change jamais' USING ERRCODE = '23514';
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
