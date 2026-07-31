-- ═══════════════════════════════════════════════════════════════════
-- Task #82 / #102 — Schéma normalisé patients + bilans
-- ═══════════════════════════════════════════════════════════════════
-- Sort du modèle "un seul blob JSON par praticien" (public.user_data,
-- colonne data jsonb contenant TOUT patients[] + praticiens[]). Ce blob
-- est chargé en entier au login et réécrit en entier à chaque save
-- (savePatients(), js/biomeca.js) — c'est lui qui sature le quota
-- localStorage (5-10 Mo) en prod avec une patientèle réelle.
--
-- Ce fichier crée deux tables normalisées :
--   - public.patients  : identité + infos administratives du patient
--   - public.bilans     : UN bilan par ligne (en cours OU archivé), tous
--                          modules confondus (sport/posturo/podopediatrie/
--                          pedicurie), contenu clinique en jsonb
--                          (structure très variable selon le module —
--                          normaliser chaque champ clinique serait un
--                          chantier séparé, hors scope ici).
--
-- Permet le chargement à la demande : liste légère des patients au
-- login (SELECT id, nom, prenom... FROM patients), contenu complet
-- d'un bilan chargé seulement à l'ouverture (SELECT * FROM bilans
-- WHERE patient_id = ...), écriture incrémentale par bilan au lieu du
-- blob entier.
--
-- Choix d'IDs natifs uuid (gen_random_uuid()) plutôt que de reprendre
-- le format existant (patient.id = Date.now() côté client, bilan._bilanId
-- = crypto.randomUUID() déjà). Décision du 31/07/2026 avec Joel : aucun
-- vrai patient en base actuellement (uniquement des patients de test),
-- donc pas de migration de données historiques à prévoir — on peut
-- repartir propre plutôt que de mapper les anciens id numériques.
--
-- Idempotent : CREATE TABLE IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS
-- avant chaque CREATE, comme user-data-rls-and-trigger.sql.
--
-- ⚠️ Ne remplace PAS encore public.user_data — double-lecture prévue le
-- temps de la bascule côté JS (loadSupabaseData / savePatients), voir
-- séquencement task #102. Le blob reste la source de vérité tant que
-- le code client n'a pas basculé dessus.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Table patients ───
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nom text NOT NULL,
  prenom text,
  ddn date,
  sport text,
  metier text,
  type_bilan text,
  lat text,
  poids numeric,
  taille numeric,
  prat_id uuid,
  email text,
  tel text,
  -- État "bilan en cours" par module — miroir des champs
  -- currentBilan<Module>SousType actuels (js/biomeca.js), nécessaires
  -- pour savoir si un bilan non archivé est en cours d'édition.
  current_bilan_sport_sous_type text,
  current_bilan_posturo_sous_type text,
  current_bilan_podopediatrie_sous_type text,
  current_bilan_pedicurie_sous_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patients_user_id_idx ON public.patients(user_id);

-- ─── Table bilans ───
CREATE TABLE IF NOT EXISTS public.bilans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- Dénormalisé depuis patients.user_id : évite un JOIN dans chaque
  -- policy RLS (lecture/écriture bilans se fait sur ce champ direct).
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('sport', 'posturo', 'podopediatrie', 'pedicurie')),
  status text NOT NULL CHECK (status IN ('in_progress', 'archived')),
  sous_type text, -- 'initial' | 'controle' | ... (nullable, module-dépendant)
  label text,
  bilan_date date,
  -- Contenu clinique complet du bilan (ex-mesures / bilanData / etc.).
  -- Reste en jsonb : la structure varie énormément par module et par
  -- section (cf. les 9 onglets sport, les sections posturo...) —
  -- normaliser chaque champ serait un chantier séparé, hors scope ici.
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bilans_patient_id_idx ON public.bilans(patient_id);
CREATE INDEX IF NOT EXISTS bilans_user_id_idx ON public.bilans(user_id);
CREATE INDEX IF NOT EXISTS bilans_patient_module_status_idx ON public.bilans(patient_id, module, status);

-- ─── RLS : un praticien n'accède QU'À ses propres patients / bilans ───
-- Motif identique à user-data-rls-and-trigger.sql (select_own/insert_own/
-- update_own/delete_own, TO authenticated, auth.uid() = user_id).
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bilans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_own ON public.patients;
CREATE POLICY select_own ON public.patients
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own ON public.patients;
CREATE POLICY insert_own ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_own ON public.patients;
CREATE POLICY update_own ON public.patients
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS delete_own ON public.patients;
CREATE POLICY delete_own ON public.patients
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS select_own ON public.bilans;
CREATE POLICY select_own ON public.bilans
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own ON public.bilans;
CREATE POLICY insert_own ON public.bilans
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_own ON public.bilans;
CREATE POLICY update_own ON public.bilans
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS delete_own ON public.bilans;
CREATE POLICY delete_own ON public.bilans
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── Trigger updated_at automatique (patients + bilans) ───
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_patients_updated_at ON public.patients;
CREATE TRIGGER set_patients_updated_at
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_bilans_updated_at ON public.bilans;
CREATE TRIGGER set_bilans_updated_at
  BEFORE UPDATE ON public.bilans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
