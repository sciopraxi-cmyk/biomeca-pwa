-- ═══════════════════════════════════════════════════════════════════
-- user_data — fermeture de la faille « DELETE + INSERT » (audit 19/10/2026)
-- ═══════════════════════════════════════════════════════════════════
-- Constat (reproduit le 19/10 sur la base de production avec le compte de
-- test, ligne restaurée à l'identique ensuite) : le trigger anti-fraude ne
-- couvre que UPDATE. Un praticien connecté pouvait donc supprimer sa propre
-- ligne (policy delete_own) puis la recréer (policy insert_own) avec
-- licence_payee / formule / engagement / stripe_customer_id de son choix.
-- licence_payee + formule pilotent computeAccessLevel côté client.
--
-- Correctif :
--  1. INSERT par un utilisateur 'authenticated' : les champs administratifs
--     sont forcés à leur valeur par défaut (le client n'envoie que
--     user_id, data, updated_at — js/biomeca.js saveData). Le service_role
--     (Edge Functions : stripe-webhook, admin-users…) n'est pas touché.
--  2. delete_own supprimée : le client ne supprime jamais cette ligne
--     (suppression de compte = service_role).
--  3. search_path figé sur la fonction SECURITY DEFINER existante.
--
-- ⚠️ À APPLIQUER par Joël dans l'éditeur SQL Supabase (la prod n'est pas
-- modifiée par une fusion Git). Idempotent.

CREATE OR REPLACE FUNCTION public.prevent_admin_field_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.licence_payee := false;
    NEW.formule := NULL;
    NEW.engagement := NULL;
    NEW.date_debut_abonnement := NULL;
    NEW.stripe_customer_id := NULL;
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_user_data_admin_fields_insert ON public.user_data;
CREATE TRIGGER protect_user_data_admin_fields_insert
  BEFORE INSERT ON public.user_data
  FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_field_insert();

DROP POLICY IF EXISTS delete_own ON public.user_data;

ALTER FUNCTION public.prevent_admin_field_update() SET search_path = public, pg_temp;
