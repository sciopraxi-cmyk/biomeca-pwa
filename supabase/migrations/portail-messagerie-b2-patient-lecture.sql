-- Portail patient — MESSAGERIE, bloc B2/4 : lecture côté PATIENT (idempotent). Prérequis : blocs A, B1. Le patient ne reçoit JAMAIS lu_at.
-- Fil du patient (200 derniers) : jamais lu_at ; reste_s = secondes de modification restantes (0 = plus modifiable).
CREATE OR REPLACE FUNCTION public.messagerie_lire_patient()
RETURNS TABLE (id uuid, sens text, texte text, created_at timestamptz, modifie_at timestamptz, reste_s integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid := public.messagerie_patient_courant();
BEGIN
  RETURN QUERY
  SELECT f.id, f.sens, f.texte, f.created_at, f.modifie_at,
         CASE WHEN f.sens = 'patient' AND public.messagerie_ouverte(v_pat)
              THEN GREATEST(0, ceil(extract(epoch FROM f.created_at + interval '5 minutes' - now())))::integer ELSE 0 END
    FROM (SELECT * FROM public.messages_portail m WHERE m.patient_id = v_pat ORDER BY m.created_at DESC LIMIT 200) f
   ORDER BY f.created_at ASC;
END $$;

-- Pastille de l'accueil : messagerie ouverte ? combien de messages du praticien pas encore lus ?
CREATE OR REPLACE FUNCTION public.messagerie_resume_patient() RETURNS TABLE (ouverte boolean, non_lus integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid := public.messagerie_patient_courant();
BEGIN
  RETURN QUERY SELECT public.messagerie_ouverte(v_pat),
    (SELECT count(*)::integer FROM public.messages_portail WHERE patient_id = v_pat AND sens = 'praticien' AND lu_at IS NULL);
END $$;

CREATE OR REPLACE FUNCTION public.messagerie_lu_patient() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid := public.messagerie_patient_courant(); v_n integer;
BEGIN
  UPDATE public.messages_portail SET lu_at = now() WHERE patient_id = v_pat AND sens = 'praticien' AND lu_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.messagerie_lire_patient(), public.messagerie_resume_patient(), public.messagerie_lu_patient() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messagerie_lire_patient(), public.messagerie_resume_patient(), public.messagerie_lu_patient() TO authenticated;
