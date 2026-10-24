-- Portail patient — MESSAGERIE, bloc A/4 : tables, droits, contrôles (idempotent)
-- Fil unique par patient, texte seul, 1000 car. ; aucun droit direct : tout passe par des fonctions SECURITY DEFINER.
-- Prérequis : portail-notifications-blocage.sql. Suite : b1, b2, c, d (dans l’ordre).
ALTER TABLE public.patient_comptes ADD COLUMN IF NOT EXISTS messagerie_desactivee_at timestamptz;
GRANT SELECT (messagerie_desactivee_at) ON public.patient_comptes TO authenticated;
GRANT UPDATE (messagerie_desactivee_at) ON public.patient_comptes TO authenticated;

CREATE TABLE IF NOT EXISTS public.messages_portail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sens text NOT NULL CHECK (sens IN ('patient', 'praticien')),
  texte text NOT NULL CHECK (char_length(texte) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  modifie_at timestamptz,
  lu_at timestamptz,
  notifie_at timestamptz
);
CREATE INDEX IF NOT EXISTS messages_portail_fil_idx ON public.messages_portail(patient_id, created_at);
CREATE TABLE IF NOT EXISTS public.messages_portail_versions (
  id bigserial PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES public.messages_portail(id) ON DELETE CASCADE,
  texte text NOT NULL,
  remplace_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages_portail ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_portail_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.messages_portail, public.messages_portail_versions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.messagerie_texte_ok(p_texte text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text := btrim(replace(COALESCE(p_texte, ''), E'\r', ''));
BEGIN
  IF char_length(v) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'texte_invalide'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.messagerie_texte_ok(text) FROM PUBLIC, anon, authenticated;

-- Patient connecté (jamais un praticien) ; renvoie sa fiche.
CREATE OR REPLACE FUNCTION public.messagerie_patient_courant() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  v := public.portail_patient_actuel();
  IF v IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.messagerie_patient_courant() FROM PUBLIC, anon, authenticated;

-- Praticien connecté (jamais un patient), propriétaire du compte portail de CE patient.
CREATE OR REPLACE FUNCTION public.messagerie_praticien_ok(p_patient uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient'
     OR NOT EXISTS (SELECT 1 FROM public.patient_comptes WHERE patient_id = p_patient AND praticien_id = auth.uid()) THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.messagerie_praticien_ok(uuid) FROM PUBLIC, anon, authenticated;

-- Messagerie ouverte pour ce patient (compte actif et non désactivée).
CREATE OR REPLACE FUNCTION public.messagerie_ouverte(p_patient uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT statut <> 'suspendu' AND messagerie_desactivee_at IS NULL
                     FROM public.patient_comptes WHERE patient_id = p_patient), false)
$$;
REVOKE ALL ON FUNCTION public.messagerie_ouverte(uuid) FROM PUBLIC, anon, authenticated;
