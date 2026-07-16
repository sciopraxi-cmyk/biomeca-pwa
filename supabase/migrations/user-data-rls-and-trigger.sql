-- ═══════════════════════════════════════════════════════════════════
-- Sécurité user_data — RLS (isolation par praticien) + trigger anti-fraude
-- ═══════════════════════════════════════════════════════════════════
-- Extrait de la base de production (projet tzivizoacdyopwfzerrb) le 16/07/2026
-- dans le cadre du durcissement #74 : ces règles n'existaient QUE dans la base,
-- sans trace dans le dépôt. Les versionner permet de les auditer et de les
-- rejouer à l'identique (ex. bascule Scalingo HDS, reconstruction de la base).
--
-- ⚠️ DOCUMENTATION / REPRISE — NE PAS RÉEXÉCUTER SUR LA PROD :
-- les règles y sont déjà présentes. Ce fichier sert d'archive versionnée
-- et de source pour recréer la base à l'identique sur un nouvel environnement.
-- Idempotent malgré tout (DROP POLICY / DROP TRIGGER / CREATE OR REPLACE).
--
-- Idempotent : DROP POLICY IF EXISTS avant chaque CREATE.

ALTER TABLE public.user_data ENABLE ROW LEVEL SECURITY;

-- ─── RLS : un praticien n'accède QU'À sa propre ligne ───
DROP POLICY IF EXISTS select_own ON public.user_data;
CREATE POLICY select_own ON public.user_data
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS insert_own ON public.user_data;
CREATE POLICY insert_own ON public.user_data
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS update_own ON public.user_data;
CREATE POLICY update_own ON public.user_data
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS delete_own ON public.user_data;
CREATE POLICY delete_own ON public.user_data
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── Trigger anti-fraude : champs administratifs non modifiables ───
-- Neutralise l'auto-élévation (ex. licence_payee = true) côté client.
-- Fonctionne car PostgREST exécute la requête avec le rôle du JWT
-- ('authenticated'), contrairement à gotrue/auth.users qui écrit en rôle
-- admin — raison pour laquelle les champs d'abonnement ont dû migrer vers
-- app_metadata (cf. chantier #74 E2) plutôt que d'être protégés par trigger.
-- Le service_role (Edge Functions) n'est pas 'authenticated' → reste autorisé.
CREATE OR REPLACE FUNCTION public.prevent_admin_field_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.licence_payee IS DISTINCT FROM OLD.licence_payee
    OR NEW.formule IS DISTINCT FROM OLD.formule
    OR NEW.engagement IS DISTINCT FROM OLD.engagement
    OR NEW.date_debut_abonnement IS DISTINCT FROM OLD.date_debut_abonnement
    OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
      RAISE EXCEPTION 'Modification non autorisée des champs administratifs (id, user_id, email, licence_payee, formule, engagement, date_debut_abonnement, stripe_customer_id)';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_user_data_admin_fields ON public.user_data;
CREATE TRIGGER protect_user_data_admin_fields
  BEFORE UPDATE ON public.user_data
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_field_update();
