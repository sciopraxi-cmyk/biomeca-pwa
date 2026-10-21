-- Facturation, étape 2b-1 — devis et factures par patient.
--
-- Principes (décidés avec le praticien le 20/10/2026) :
--  * numéro D-AAAA-NNNN / F-AAAA-NNNN, continu et sans trou par praticien, type et année,
--    attribué UNIQUEMENT à l'émission par emettre_document() (un brouillon n'a pas de numéro) ;
--  * un document émis n'est plus modifiable ni supprimable : seul le règlement (facture) peut
--    être enregistré. Une erreur se corrige par un avoir (étape ultérieure) ;
--  * lignes, patient et émetteur sont des INSTANTANÉS copiés dans le document : changer le
--    catalogue, la fiche patient ou le praticien ne modifie jamais une facture émise ;
--  * montants en centimes (entiers), sans TVA (mention légale dans le document).
--
-- ⚠️ Appliquée à la main (SQL Editor), puis revérifiée par un test réel (tentative de modifier,
-- supprimer ou émettre à la main un document ; lecture par un autre compte), jamais seulement lue.
-- Idempotent : CREATE ... IF NOT EXISTS, DROP POLICY / TRIGGER IF EXISTS, CREATE OR REPLACE.

CREATE TABLE IF NOT EXISTS public.documents_facturation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('devis', 'facture')),
  statut          text NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'emis')),
  numero          text,
  -- identifiant local du patient (patients[].id), SANS clé étrangère : supprimer un patient
  -- ne doit jamais supprimer ses factures.
  patient_ref     text NOT NULL CHECK (char_length(patient_ref) BETWEEN 1 AND 64),
  patient         jsonb NOT NULL,
  emetteur        jsonb NOT NULL,
  regime          text NOT NULL DEFAULT 'standard' CHECK (regime IN ('standard', 'ald', 'alsace_moselle')),
  lignes          jsonb NOT NULL CHECK (jsonb_typeof(lignes) = 'array' AND jsonb_array_length(lignes) <= 50),
  total_fixe      boolean NOT NULL DEFAULT false,
  total_cents     integer NOT NULL CHECK (total_cents BETWEEN 0 AND 10000000),
  mention_tva     text NOT NULL CHECK (char_length(mention_tva) BETWEEN 1 AND 300),
  note            text CHECK (note IS NULL OR char_length(note) <= 1000),
  devis_numero    text CHECK (devis_numero IS NULL OR char_length(devis_numero) <= 40),
  date_document   date,
  valide_jusqu_au date,
  paiement_mode   text CHECK (paiement_mode IS NULL OR paiement_mode IN ('especes', 'cheque', 'carte', 'virement')),
  paiement_date   date,
  emis_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documents_statut_numero CHECK (
    (statut = 'brouillon' AND numero IS NULL AND emis_at IS NULL AND date_document IS NULL)
    OR (statut = 'emis' AND numero IS NOT NULL AND emis_at IS NOT NULL AND date_document IS NOT NULL)),
  CONSTRAINT documents_paiement_coherent CHECK ((paiement_mode IS NULL) = (paiement_date IS NULL)),
  CONSTRAINT documents_paiement_facture_emise CHECK (
    paiement_mode IS NULL OR (type = 'facture' AND statut = 'emis'))
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_user_numero_uniq
  ON public.documents_facturation (user_id, numero) WHERE numero IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_user_patient_idx
  ON public.documents_facturation (user_id, patient_ref);

-- Compteurs : jamais accessibles directement, uniquement par emettre_document().
CREATE TABLE IF NOT EXISTS public.documents_numerotation (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type    text NOT NULL CHECK (type IN ('devis', 'facture')),
  annee   integer NOT NULL,
  dernier integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, type, annee)
);
ALTER TABLE public.documents_numerotation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documents_numerotation FROM anon, authenticated;

-- Garde : propriétaire et type immuables ; document émis figé (sauf règlement) ;
-- passage à « émis » uniquement par emettre_document() (drapeau de transaction).
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
DROP TRIGGER IF EXISTS documents_facturation_garde ON public.documents_facturation;
CREATE TRIGGER documents_facturation_garde BEFORE UPDATE ON public.documents_facturation
  FOR EACH ROW EXECUTE FUNCTION public.documents_facturation_garde();

ALTER TABLE public.documents_facturation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_own ON public.documents_facturation;
CREATE POLICY select_own ON public.documents_facturation
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own ON public.documents_facturation;
CREATE POLICY insert_own ON public.documents_facturation
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND statut = 'brouillon' AND numero IS NULL);

DROP POLICY IF EXISTS update_own ON public.documents_facturation;
CREATE POLICY update_own ON public.documents_facturation
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Suppression : brouillons uniquement.
DROP POLICY IF EXISTS delete_brouillon_own ON public.documents_facturation;
CREATE POLICY delete_brouillon_own ON public.documents_facturation
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND statut = 'brouillon');

REVOKE ALL ON public.documents_facturation FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents_facturation TO authenticated;

-- Émission : numéro suivant (verrou de ligne = pas de doublon, pas de trou : si la
-- transaction échoue, le compteur est annulé avec elle).
CREATE OR REPLACE FUNCTION public.emettre_document(p_id uuid)
RETURNS public.documents_facturation
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.documents_facturation;
  v_annee integer;
  v_n integer;
  v_jour date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non authentifié'; END IF;
  SELECT * INTO d FROM public.documents_facturation
    WHERE id = p_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'document introuvable'; END IF;
  IF d.statut <> 'brouillon' THEN RAISE EXCEPTION 'document déjà émis'; END IF;
  IF jsonb_array_length(d.lignes) < 1 THEN RAISE EXCEPTION 'document sans ligne'; END IF;
  v_jour := (clock_timestamp() AT TIME ZONE 'Europe/Paris')::date;
  v_annee := extract(year FROM v_jour)::integer;
  INSERT INTO public.documents_numerotation (user_id, type, annee, dernier)
    VALUES (auth.uid(), d.type, v_annee, 0) ON CONFLICT DO NOTHING;
  UPDATE public.documents_numerotation SET dernier = dernier + 1
    WHERE user_id = auth.uid() AND type = d.type AND annee = v_annee
    RETURNING dernier INTO v_n;
  PERFORM set_config('verticy.emission', '1', true);
  UPDATE public.documents_facturation SET
      statut = 'emis',
      numero = (CASE d.type WHEN 'devis' THEN 'D' ELSE 'F' END) || '-' || v_annee || '-' || lpad(v_n::text, 4, '0'),
      emis_at = clock_timestamp(),
      date_document = v_jour,
      valide_jusqu_au = CASE WHEN d.type = 'devis' THEN v_jour + 90 ELSE NULL END
    WHERE id = p_id RETURNING * INTO d;
  PERFORM set_config('verticy.emission', '0', true);
  RETURN d;
END $$;
REVOKE ALL ON FUNCTION public.emettre_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emettre_document(uuid) TO authenticated;
