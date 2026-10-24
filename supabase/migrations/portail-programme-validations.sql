-- ════════════════════════════════════════════════════
-- Portail patient — lot e3b-2b : séances validées par le patient + fin de programme (notification)
-- ════════════════════════════════════════════════════
-- Décidé avec le praticien (24/10/2026) :
--  * le patient VALIDE chaque séance (une validation par jour et par séance, commentaire facultatif de 500 car. au plus) ;
--  * seul le jour même peut être validé (heure de Paris) et seulement une séance qui figure dans SA copie du programme ;
--  * l'historique est conservé (aucune suppression, aucune modification) ;
--  * quand toutes les séances du DERNIER jour du programme sont validées, une ligne « fin » est créée une seule fois
--    par programme publié ; l'application du praticien la lit puis crée la notification patient_protocole_termine
--    (aucun nom ni contenu de santé n'est stocké dans la ligne) ;
--  * aucun droit d'écriture direct : tout passe par deux fonctions.
-- Prérequis : portail-patient-base.sql, portail-programme-patient.sql. Idempotent.
-- ════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.portail_aujourdhui() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Europe/Paris')::date $$;

CREATE TABLE IF NOT EXISTS public.programme_validations (
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jour date NOT NULL,
  seance_id text NOT NULL CHECK (char_length(seance_id) BETWEEN 1 AND 40),
  commentaire text CHECK (commentaire IS NULL OR char_length(commentaire) <= 500),
  valide_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, jour, seance_id)
);
CREATE INDEX IF NOT EXISTS programme_validations_praticien_idx ON public.programme_validations(praticien_id, valide_at DESC);

CREATE TABLE IF NOT EXISTS public.programme_fins (
  patient_id uuid PRIMARY KEY REFERENCES public.patients(id) ON DELETE CASCADE,
  praticien_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  programme_publie_at timestamptz NOT NULL,
  termine_at timestamptz NOT NULL DEFAULT now(),
  notifie_at timestamptz
);

ALTER TABLE public.programme_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programme_fins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.programme_validations, public.programme_fins FROM anon, authenticated;
GRANT SELECT ON public.programme_validations, public.programme_fins TO authenticated;

DROP POLICY IF EXISTS select_patient ON public.programme_validations;
CREATE POLICY select_patient ON public.programme_validations
  FOR SELECT TO authenticated USING (patient_id = public.portail_patient_actuel());
DROP POLICY IF EXISTS select_praticien ON public.programme_validations;
CREATE POLICY select_praticien ON public.programme_validations
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());
DROP POLICY IF EXISTS select_praticien ON public.programme_fins;
CREATE POLICY select_praticien ON public.programme_fins
  FOR SELECT TO authenticated USING (praticien_id = auth.uid());

-- Validation d'une séance par le patient connecté. Renvoie { deja: bool, termine: bool }.
CREATE OR REPLACE FUNCTION public.programme_seance_valider(p_jour date, p_seance text, p_commentaire text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pat uuid;
  v_prat uuid;
  v_prog public.programmes_patient;
  v_com text;
  v_n int;
  v_dernier date;
  v_total int;
  v_faites int;
  v_termine boolean := false;
  v_deja boolean;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  v_pat := public.portail_patient_actuel();
  IF v_pat IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  IF p_jour IS NULL OR p_jour <> public.portail_aujourdhui() THEN
    RAISE EXCEPTION 'seul le jour même peut être validé';
  END IF;
  IF p_seance IS NULL OR char_length(p_seance) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'séance invalide'; END IF;
  SELECT * INTO v_prog FROM public.programmes_patient WHERE patient_id = v_pat;
  IF v_prog.patient_id IS NULL THEN RAISE EXCEPTION 'programme introuvable'; END IF;
  IF NOT jsonb_path_exists(v_prog.contenu,
       '$.jours[*] ? (@.date == $d).seances[*] ? (@.id == $s)',
       jsonb_build_object('d', to_char(p_jour, 'YYYY-MM-DD'), 's', p_seance)) THEN
    RAISE EXCEPTION 'séance absente du programme ce jour';
  END IF;
  v_com := left(NULLIF(btrim(p_commentaire), ''), 500);
  v_prat := v_prog.praticien_id;

  INSERT INTO public.programme_validations (patient_id, praticien_id, jour, seance_id, commentaire)
  VALUES (v_pat, v_prat, p_jour, p_seance, v_com)
  ON CONFLICT (patient_id, jour, seance_id) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_deja := (v_n = 0);

  -- Fin de programme : toutes les séances du dernier jour sont validées (une seule ligne par programme publié).
  SELECT max((j ->> 'date')::date) INTO v_dernier FROM jsonb_array_elements(v_prog.contenu -> 'jours') j;
  IF p_jour = v_dernier THEN
    SELECT count(*) INTO v_total FROM jsonb_array_elements(v_prog.contenu -> 'jours') j,
      jsonb_array_elements(j -> 'seances') s WHERE (j ->> 'date')::date = v_dernier;
    SELECT count(*) INTO v_faites FROM public.programme_validations
      WHERE patient_id = v_pat AND jour = v_dernier;
    IF v_total > 0 AND v_faites >= v_total THEN
      INSERT INTO public.programme_fins (patient_id, praticien_id, programme_publie_at)
      VALUES (v_pat, v_prat, v_prog.publie_at)
      ON CONFLICT (patient_id) DO UPDATE
        SET praticien_id = EXCLUDED.praticien_id, programme_publie_at = EXCLUDED.programme_publie_at,
            termine_at = now(), notifie_at = NULL
        WHERE public.programme_fins.programme_publie_at IS DISTINCT FROM EXCLUDED.programme_publie_at;
      v_termine := true;
    END IF;
  END IF;
  RETURN jsonb_build_object('deja', v_deja, 'termine', v_termine);
END $$;
REVOKE ALL ON FUNCTION public.programme_seance_valider(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_seance_valider(date, text, text) TO authenticated;

-- Le praticien marque la fin comme notifiée ; renvoie true UNE SEULE fois (deux onglets ne notifient pas deux fois).
CREATE OR REPLACE FUNCTION public.programme_fin_notifiee(p_patient uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  UPDATE public.programme_fins SET notifie_at = now()
   WHERE patient_id = p_patient AND praticien_id = auth.uid() AND notifie_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END $$;
REVOKE ALL ON FUNCTION public.programme_fin_notifiee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_fin_notifiee(uuid) TO authenticated;
