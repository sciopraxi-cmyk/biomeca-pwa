-- Questionnaire patient — bloc A1/5 : table (idempotent). Prérequis : portail-messagerie-a-tables.sql, portail-notifications-blocage.sql. Suite : A2, B, C.
-- Un questionnaire « ouvert » par patient (jusqu'à son intégration au bilan). Aucune lecture directe côté patient : tout passe par des fonctions.
CREATE TABLE IF NOT EXISTS public.questionnaires_patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('adulte', 'enfant')),
  rdv_at timestamptz,
  reponses jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(reponses) = 'object' AND length(reponses::text) <= 12000),
  envoye_at timestamptz NOT NULL DEFAULT now(),
  rempli_at timestamptz,
  modifie_at timestamptz,
  nb_enregistrements integer NOT NULL DEFAULT 0 CHECK (nb_enregistrements <= 100),
  notifie_at timestamptz,
  rappel_at timestamptz,
  integre_at timestamptz,
  retire_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS questionnaires_patient_un_ouvert ON public.questionnaires_patient (patient_id)
  WHERE integre_at IS NULL AND retire_at IS NULL;
ALTER TABLE public.questionnaires_patient ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.questionnaires_patient FROM anon, authenticated;
GRANT SELECT ON public.questionnaires_patient TO authenticated;
DROP POLICY IF EXISTS select_praticien ON public.questionnaires_patient;
CREATE POLICY select_praticien ON public.questionnaires_patient FOR SELECT TO authenticated USING (praticien_id = auth.uid());
