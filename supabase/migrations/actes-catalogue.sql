-- Facturation, étape 1 — catalogue d'actes du praticien.
-- Une ligne = un acte facturable : acte du référentiel conventionnel (copié, daté,
-- sourcé, MODIFIABLE) ou acte personnalisé (titre et montant libres, perso = true).
-- Montants en centimes d'euro (entiers) : aucun arrondi flottant. Sans TVA.
--
-- ⚠️ Appliquée à la main sur la base (SQL Editor), puis revérifiée par un test
-- réel (tentative de lecture / écriture d'un autre compte), jamais seulement lue.
-- Le praticien n'a PAS de policy DELETE : un acte se désactive (actif = false),
-- pour que le catalogue garde la trace de ce qui a pu être facturé.
-- Idempotent : CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS.

CREATE TABLE IF NOT EXISTS public.actes_catalogue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  code          text,                      -- ex. 'POD-1' (référentiel) ; null pour un acte personnalisé
  libelle       text NOT NULL CHECK (char_length(btrim(libelle)) BETWEEN 1 AND 120),
  cotation      text CHECK (cotation IS NULL OR char_length(cotation) <= 40),
  montant_cents integer NOT NULL CHECK (montant_cents BETWEEN 0 AND 10000000),
  remboursement text CHECK (remboursement IS NULL OR char_length(remboursement) <= 200),
  note          text CHECK (note IS NULL OR char_length(note) <= 500),
  source        text CHECK (source IS NULL OR char_length(source) <= 300),
  date_effet    date,
  perso         boolean NOT NULL DEFAULT false,
  actif         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Un même code de référentiel n'apparaît qu'une fois par praticien (import idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS actes_catalogue_user_code_uniq
  ON public.actes_catalogue (user_id, code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS actes_catalogue_user_idx ON public.actes_catalogue (user_id);

CREATE OR REPLACE FUNCTION public.actes_catalogue_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  NEW.user_id := OLD.user_id;   -- le propriétaire ne change jamais
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS actes_catalogue_touch ON public.actes_catalogue;
CREATE TRIGGER actes_catalogue_touch BEFORE UPDATE ON public.actes_catalogue
  FOR EACH ROW EXECUTE FUNCTION public.actes_catalogue_touch();

ALTER TABLE public.actes_catalogue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_own ON public.actes_catalogue;
CREATE POLICY select_own ON public.actes_catalogue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own ON public.actes_catalogue;
CREATE POLICY insert_own ON public.actes_catalogue
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_own ON public.actes_catalogue;
CREATE POLICY update_own ON public.actes_catalogue
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Aucune policy DELETE (volontaire) ; aucun accès anon.
REVOKE ALL ON public.actes_catalogue FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.actes_catalogue TO authenticated;
