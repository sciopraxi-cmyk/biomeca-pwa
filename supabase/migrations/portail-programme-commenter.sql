-- ════════════════════════════════════════════════════
-- Portail patient — lot e3b-2b (suite) : le patient peut écrire (ou corriger) son mot APRÈS la validation de la séance
-- ════════════════════════════════════════════════════
-- Seul le patient connecté, seulement le jour même, seulement sur une séance qu'il a déjà validée, 500 caractères au plus.
-- Aucun droit d'écriture direct. Prérequis : portail-programme-validations.sql. Idempotent.
-- ════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.programme_seance_commenter(p_jour date, p_seance text, p_commentaire text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pat uuid;
  v_n int;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  v_pat := public.portail_patient_actuel();
  IF v_pat IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  IF p_jour IS NULL OR p_jour <> public.portail_aujourdhui() THEN
    RAISE EXCEPTION 'seul le jour même peut être commenté';
  END IF;
  IF p_seance IS NULL OR char_length(p_seance) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'séance invalide'; END IF;
  UPDATE public.programme_validations
     SET commentaire = left(NULLIF(btrim(p_commentaire), ''), 500)
   WHERE patient_id = v_pat AND jour = p_jour AND seance_id = p_seance;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'séance non validée'; END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.programme_seance_commenter(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_seance_commenter(date, text, text) TO authenticated;
