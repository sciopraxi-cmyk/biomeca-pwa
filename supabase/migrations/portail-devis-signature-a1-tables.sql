-- Signature du devis par le patient — bloc A1/6 : tables et gardes (idempotent). Prérequis : portail-documents-partages.sql, portail-notifications-blocage.sql.
ALTER TABLE public.documents_partages ADD COLUMN IF NOT EXISTS empreinte text;
CREATE OR REPLACE FUNCTION public.documents_partages_empreinte() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.empreinte := CASE WHEN NEW.contenu IS NULL THEN NULL ELSE encode(sha256(convert_to(NEW.contenu::text, 'UTF8')), 'hex') END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS documents_partages_empreinte ON public.documents_partages;
CREATE TRIGGER documents_partages_empreinte BEFORE INSERT OR UPDATE OF contenu ON public.documents_partages
  FOR EACH ROW EXECUTE FUNCTION public.documents_partages_empreinte();
UPDATE public.documents_partages SET contenu = contenu WHERE contenu IS NOT NULL AND empreinte IS NULL;

CREATE TABLE IF NOT EXISTS public.devis_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL UNIQUE REFERENCES public.documents_partages(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  numero text NOT NULL,
  empreinte text NOT NULL CHECK (empreinte ~ '^[0-9a-f]{64}$'),
  trace text NOT NULL CHECK (trace ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' AND char_length(trace) BETWEEN 200 AND 150000),
  signe_at timestamptz NOT NULL DEFAULT now(),
  ip text NOT NULL CHECK (char_length(ip) <= 64),
  user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 200),
  mineur boolean NOT NULL,
  code_verifie boolean NOT NULL,
  notifie_at timestamptz
);
ALTER TABLE public.devis_signatures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.devis_signatures FROM anon, authenticated;
GRANT SELECT ON public.devis_signatures TO authenticated;
DROP POLICY IF EXISTS select_praticien ON public.devis_signatures;
CREATE POLICY select_praticien ON public.devis_signatures FOR SELECT TO authenticated USING (praticien_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.devis_signature_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents_partages(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  expire_at timestamptz NOT NULL,
  essais integer NOT NULL DEFAULT 0,
  utilise_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.devis_signature_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.devis_signature_codes FROM anon, authenticated;

-- Réglage « mode essai » : tant qu'aucun e-mail réel ne part, le code est affiché à l'écran du patient.
CREATE TABLE IF NOT EXISTS public.portail_reglages (cle text PRIMARY KEY, valeur text NOT NULL);
ALTER TABLE public.portail_reglages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.portail_reglages FROM anon, authenticated;
INSERT INTO public.portail_reglages VALUES ('signature_code_essai', '1') ON CONFLICT DO NOTHING;
