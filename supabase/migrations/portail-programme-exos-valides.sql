-- ════════════════════════════════════════════════════
-- Portail patient — lot e3b-2b (suite) : exercices validés automatiquement par le chrono
-- ════════════════════════════════════════════════════
-- Un exercice est validé quand son temps d'effort va jusqu'au bout. Une ligne par patient, jour, séance et exercice
-- (rang à partir de 0). Jour même seulement, exercice présent dans SA copie du programme, jamais modifié ni supprimé.
-- Aucun droit d'écriture direct : tout passe par programme_exo_valider.
-- Prérequis : portail-programme-validations.sql. Idempotent.
-- ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.programme_exos_valides (
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jour date NOT NULL,
  seance_id text NOT NULL CHECK (char_length(seance_id) BETWEEN 1 AND 40),
  exo smallint NOT NULL CHECK (exo BETWEEN 0 AND 11),
  valide_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, jour, seance_id, exo)
);
ALTER TABLE public.programme_exos_valides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programme_exos_valides FROM anon, authenticated;
GRANT SELECT ON public.programme_exos_valides TO authenticated;
DROP POLICY IF EXISTS select_patient ON public.programme_exos_valides;
CREATE POLICY select_patient ON public.programme_exos_valides
  FOR SELECT TO authenticated USING (patient_id = public.portail_patient_actuel());
DROP POLICY IF EXISTS select_praticien ON public.programme_exos_valides;
CREATE POLICY select_praticien ON public.programme_exos_valides
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());

CREATE OR REPLACE FUNCTION public.programme_exo_valider(p_jour date, p_seance text, p_exo int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pat uuid;
  v_prog public.programmes_patient;
  v_n int;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  v_pat := public.portail_patient_actuel();
  IF v_pat IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  IF p_jour IS NULL OR p_jour <> public.portail_aujourdhui() THEN
    RAISE EXCEPTION 'seul le jour même peut être validé';
  END IF;
  IF p_seance IS NULL OR char_length(p_seance) NOT BETWEEN 1 AND 40 OR p_exo IS NULL OR p_exo NOT BETWEEN 0 AND 11 THEN
    RAISE EXCEPTION 'exercice invalide';
  END IF;
  SELECT * INTO v_prog FROM public.programmes_patient WHERE patient_id = v_pat;
  IF v_prog.patient_id IS NULL THEN RAISE EXCEPTION 'programme introuvable'; END IF;
  IF NOT jsonb_path_exists(v_prog.contenu,
       '$.jours[*] ? (@.date == $d).seances[*] ? (@.id == $s && @.exos.size() > $e)',
       jsonb_build_object('d', to_char(p_jour, 'YYYY-MM-DD'), 's', p_seance, 'e', p_exo)) THEN
    RAISE EXCEPTION 'exercice absent du programme ce jour';
  END IF;
  INSERT INTO public.programme_exos_valides (patient_id, praticien_id, jour, seance_id, exo)
  VALUES (v_pat, v_prog.praticien_id, p_jour, p_seance, p_exo)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.programme_exo_valider(date, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_exo_valider(date, text, int) TO authenticated;
