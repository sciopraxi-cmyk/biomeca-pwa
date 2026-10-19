-- help-chat : compteur journalier ATOMIQUE (audit 19/10/2026).
-- Avant : lecture puis upsert côté Edge Function → des requêtes parallèles
-- lisaient la même valeur et dépassaient DAILY_LIMIT. Maintenant : une seule
-- instruction SQL incrémente SI la limite n'est pas atteinte.
-- Renvoie le nouveau compteur, ou NULL si la limite est atteinte.
-- ⚠️ À APPLIQUER par Joël dans l'éditeur SQL Supabase AVANT de redéployer help-chat.
CREATE OR REPLACE FUNCTION public.help_chat_incrementer(p_user uuid, p_day date, p_limit integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE n integer;
BEGIN
  INSERT INTO public.help_chat_usage AS u (user_id, day, count)
  VALUES (p_user, p_day, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = u.count + 1
    WHERE u.count < p_limit
  RETURNING u.count INTO n;
  RETURN n; -- NULL si la clause WHERE a empêché la mise à jour
END;
$function$;
REVOKE ALL ON FUNCTION public.help_chat_incrementer(uuid, date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_chat_incrementer(uuid, date, integer) TO service_role;
