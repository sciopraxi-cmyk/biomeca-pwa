-- Lot C (1) : actes personnalisés rattachés à un acte Sécurité sociale, prise en charge par
-- défaut, synchronisation Doctolib ; régime C2S/CMU accepté par les documents.
-- Idempotent. Ne modifie aucune ligne existante.
ALTER TABLE public.actes_catalogue
  ADD COLUMN IF NOT EXISTS acte_reference text CHECK (acte_reference IS NULL OR char_length(acte_reference) <= 60),
  ADD COLUMN IF NOT EXISTS regime_defaut text CHECK (regime_defaut IS NULL OR regime_defaut IN ('standard', 'ald', 'c2s')),
  ADD COLUMN IF NOT EXISTS sync_doctolib boolean NOT NULL DEFAULT false;

ALTER TABLE public.documents_facturation DROP CONSTRAINT IF EXISTS documents_facturation_regime_check;
ALTER TABLE public.documents_facturation
  ADD CONSTRAINT documents_facturation_regime_check
  CHECK (regime IN ('standard', 'ald', 'alsace_moselle', 'c2s'));
