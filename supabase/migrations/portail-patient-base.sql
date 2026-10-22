-- ═══════════════════════════════════════════════════════════════════
-- Portail patient — lot (b) : comptes patients, journal de connexion, RLS
-- ═══════════════════════════════════════════════════════════════════
-- Un patient a un compte Supabase Auth (app_metadata.role = 'patient',
-- non modifiable par le client) lié à UNE fiche de la table public.patients.
-- Le compte est créé par l'Edge Function `patient-compte` (clé service_role),
-- jamais par le client. La première connexion (identifiant + date de
-- naissance AAAAMMJJ, usage unique) passe par l'Edge Function
-- `patient-connexion`, qui compte les essais ICI (fonctions atomiques) :
-- 5 essais, puis blocage de 15 minutes.
--
-- Le mot de passe Supabase initial est aléatoire et inconnu de tous : la date
-- de naissance n'est donc jamais un mot de passe attaquable directement.
--
-- Idempotent : IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE.
-- À coller dans le SQL Editor Supabase (rôle postgres).
-- ═══════════════════════════════════════════════════════════════════

-- ─── Comptes patients ───
CREATE TABLE IF NOT EXISTS public.patient_comptes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  identifiant text NOT NULL UNIQUE,
  -- 'initial' = mot de passe à choisir à la première connexion ;
  -- 'actif' = mot de passe choisi ; 'suspendu' = accès fermé par le praticien.
  statut text NOT NULL DEFAULT 'initial' CHECK (statut IN ('initial', 'actif', 'suspendu')),
  essais_echoues integer NOT NULL DEFAULT 0,
  bloque_jusqu timestamptz,
  -- Billet à usage unique entre l'étape « date de naissance » et l'étape
  -- « choix du mot de passe » (jamais lisible par le client).
  ticket_nonce text,
  cabinet text CHECK (cabinet IS NULL OR char_length(cabinet) <= 120),
  representant_legal_nom text CHECK (representant_legal_nom IS NULL OR char_length(representant_legal_nom) <= 120),
  representant_legal_lien text CHECK (representant_legal_lien IS NULL OR char_length(representant_legal_lien) <= 60),
  premier_acces_at timestamptz,
  dernier_acces_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_comptes_praticien_idx ON public.patient_comptes(praticien_id);

ALTER TABLE public.patient_comptes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_comptes FROM anon, authenticated;
-- Lecture par le praticien propriétaire seulement (jamais ticket_nonce) ;
-- écriture client limitée au représentant légal. Tout le reste passe par les
-- Edge Functions (service_role).
GRANT SELECT (id, praticien_id, patient_id, auth_user_id, identifiant, statut, essais_echoues,
              bloque_jusqu, cabinet, representant_legal_nom, representant_legal_lien,
              premier_acces_at, dernier_acces_at, created_at)
  ON public.patient_comptes TO authenticated;
GRANT UPDATE (representant_legal_nom, representant_legal_lien)
  ON public.patient_comptes TO authenticated;

DROP POLICY IF EXISTS select_praticien ON public.patient_comptes;
CREATE POLICY select_praticien ON public.patient_comptes
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());
DROP POLICY IF EXISTS update_representant ON public.patient_comptes;
CREATE POLICY update_representant ON public.patient_comptes
  FOR UPDATE TO authenticated
  USING (praticien_id = auth.uid()) WITH CHECK (praticien_id = auth.uid());

-- ─── Journal de connexion (lecture seule pour le praticien) ───
CREATE TABLE IF NOT EXISTS public.patient_connexions (
  id bigserial PRIMARY KEY,
  compte_id uuid REFERENCES public.patient_comptes(id) ON DELETE CASCADE,
  praticien_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL,
  ip text
);
CREATE INDEX IF NOT EXISTS patient_connexions_compte_idx ON public.patient_connexions(compte_id, at DESC);
CREATE INDEX IF NOT EXISTS patient_connexions_ip_idx ON public.patient_connexions(ip, at DESC);

ALTER TABLE public.patient_connexions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_connexions FROM anon, authenticated;
GRANT SELECT ON public.patient_connexions TO authenticated;
DROP POLICY IF EXISTS select_praticien ON public.patient_connexions;
CREATE POLICY select_praticien ON public.patient_connexions
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());

-- ─── Compteur d'essais ATOMIQUE (réservé au service_role) ───
-- L'essai est compté AVANT d'être vérifié : 50 requêtes en parallèle ne
-- donnent jamais plus de 5 tentatives par fenêtre (le verrou de ligne de
-- l'UPDATE les met en file).
CREATE OR REPLACE FUNCTION public.portail_reserver_tentative(p_identifiant text)
RETURNS TABLE (compte_id uuid, auth_user_id uuid, patient_id uuid, praticien_id uuid,
               statut text, ticket_nonce text, bloque boolean, bloque_jusqu timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_n integer;
BEGIN
  UPDATE public.patient_comptes c SET
      essais_echoues = CASE WHEN c.bloque_jusqu IS NOT NULL AND c.bloque_jusqu <= now()
                            THEN 1 ELSE c.essais_echoues + 1 END,
      bloque_jusqu = CASE WHEN (CASE WHEN c.bloque_jusqu IS NOT NULL AND c.bloque_jusqu <= now()
                                     THEN 1 ELSE c.essais_echoues + 1 END) >= 5
                          THEN now() + interval '15 minutes' ELSE NULL END
    WHERE c.identifiant = upper(trim(p_identifiant))
      AND (c.bloque_jusqu IS NULL OR c.bloque_jusqu <= now())
    RETURNING c.essais_echoues INTO v_n;

  IF v_n IS NOT NULL THEN
    RETURN QUERY SELECT c.id, c.auth_user_id, c.patient_id, c.praticien_id, c.statut,
                        c.ticket_nonce, false, c.bloque_jusqu
                   FROM public.patient_comptes c WHERE c.identifiant = upper(trim(p_identifiant));
  ELSE
    -- identifiant inconnu, ou compte déjà bloqué
    RETURN QUERY SELECT c.id, c.auth_user_id, c.patient_id, c.praticien_id, c.statut,
                        c.ticket_nonce, true, c.bloque_jusqu
                   FROM public.patient_comptes c WHERE c.identifiant = upper(trim(p_identifiant));
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.portail_reserver_tentative(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portail_reserver_tentative(text) TO service_role;

-- Succès : remet le compteur à zéro.
CREATE OR REPLACE FUNCTION public.portail_succes(p_compte uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.patient_comptes
     SET essais_echoues = 0, bloque_jusqu = NULL, dernier_acces_at = now()
   WHERE id = p_compte;
$$;
REVOKE ALL ON FUNCTION public.portail_succes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portail_succes(uuid) TO service_role;

-- ─── Ce que voit le patient connecté (seule porte de lecture du lot b) ───
CREATE OR REPLACE FUNCTION public.portail_moi()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.patient_comptes;
  p public.patients;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'non authentifié'; END IF;
  SELECT * INTO c FROM public.patient_comptes WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RETURN jsonb_build_object('statut', 'aucun'); END IF;
  IF c.statut <> 'actif' THEN RETURN jsonb_build_object('statut', c.statut); END IF;
  SELECT * INTO p FROM public.patients WHERE id = c.patient_id;
  RETURN jsonb_build_object(
    'statut', 'actif',
    'prenom', COALESCE(p.prenom, ''),
    'cabinet', COALESCE(c.cabinet, ''),
    'mineur', (p.ddn IS NOT NULL AND p.ddn > (current_date - interval '18 years')::date)
  );
END $$;
REVOKE ALL ON FUNCTION public.portail_moi() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_moi() TO authenticated;

-- Identifiant de la fiche du patient connecté, SEULEMENT si son accès est actif.
-- Les tables des lots suivants (documents, exercices…) s'appuieront dessus.
CREATE OR REPLACE FUNCTION public.portail_patient_actuel()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT patient_id FROM public.patient_comptes
   WHERE auth_user_id = auth.uid() AND statut = 'actif';
$$;
REVOKE ALL ON FUNCTION public.portail_patient_actuel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portail_patient_actuel() TO authenticated;

-- ─── Supprimer la fiche patient supprime aussi son compte Auth ───
CREATE OR REPLACE FUNCTION public.portail_supprimer_compte_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.auth_user_id;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.portail_supprimer_compte_auth() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS portail_supprimer_compte_auth ON public.patient_comptes;
CREATE TRIGGER portail_supprimer_compte_auth
  AFTER DELETE ON public.patient_comptes
  FOR EACH ROW EXECUTE FUNCTION public.portail_supprimer_compte_auth();

-- ─── Défense en profondeur : un compte patient n'écrit/ne lit RIEN côté praticien ───
-- Politique RESTRICTIVE (s'ajoute aux politiques existantes par ET). Un jeton
-- sans app_metadata (praticien) passe : la valeur est NULL, donc « différente de patient ».
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_data', 'patients', 'bilans', 'documents_facturation',
                           'documents_numerotation', 'actes_catalogue', 'agenda_connections']
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS pas_patient ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY pas_patient ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        'USING ((auth.jwt() -> ''app_metadata'' ->> ''role'') IS DISTINCT FROM ''patient'') '
        'WITH CHECK ((auth.jwt() -> ''app_metadata'' ->> ''role'') IS DISTINCT FROM ''patient'')', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS pas_patient_media ON storage.objects;
CREATE POLICY pas_patient_media ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id <> 'patient-media'
         OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient')
  WITH CHECK (bucket_id <> 'patient-media'
         OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient');
