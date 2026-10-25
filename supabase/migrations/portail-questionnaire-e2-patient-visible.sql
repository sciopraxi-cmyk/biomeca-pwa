-- Questionnaire patient — bloc E2/4 : le patient ne voit et n'écrit qu'à partir de visible_des (idempotent). Prérequis : E1.
CREATE OR REPLACE FUNCTION public.questionnaire_etat_patient() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid := public.messagerie_patient_courant(); q public.questionnaires_patient; f record;
BEGIN
  SELECT * INTO q FROM public.questionnaires_patient WHERE patient_id = v_pat AND integre_at IS NULL AND retire_at IS NULL
     AND (visible_des IS NULL OR now() >= visible_des);
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT antecedents, examens, sport, metier, poids, taille INTO f FROM public.patients WHERE id = v_pat;
  RETURN jsonb_build_object('id', q.id, 'type', q.type, 'rdv_at', q.rdv_at, 'rempli_at', q.rempli_at,
    'modifiable', (q.rdv_at IS NULL OR now() <= q.rdv_at), 'reponses', q.reponses,
    'fiche', jsonb_build_object('antecedents', f.antecedents, 'examens', f.examens, 'sport', f.sport, 'metier', f.metier, 'poids', f.poids, 'taille', f.taille));
END $$;

CREATE OR REPLACE FUNCTION public.questionnaire_enregistrer(p_id uuid, p_reponses jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid := public.messagerie_patient_courant(); q public.questionnaires_patient; v_rep jsonb;
BEGIN
  SELECT * INTO q FROM public.questionnaires_patient WHERE id = p_id AND patient_id = v_pat AND integre_at IS NULL AND retire_at IS NULL
     AND (visible_des IS NULL OR now() >= visible_des) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'questionnaire_introuvable'; END IF;
  IF q.rdv_at IS NOT NULL AND now() > q.rdv_at THEN RAISE EXCEPTION 'delai_depasse'; END IF;
  IF q.nb_enregistrements >= 100 THEN RAISE EXCEPTION 'trop_de_modifications'; END IF;
  v_rep := public.questionnaire_valider(q.type, p_reponses);
  IF v_rep = '{}'::jsonb THEN RAISE EXCEPTION 'reponses_vides'; END IF;
  UPDATE public.questionnaires_patient SET reponses = v_rep, rempli_at = COALESCE(rempli_at, now()),
    modifie_at = CASE WHEN rempli_at IS NOT NULL THEN now() END, nb_enregistrements = nb_enregistrements + 1,
    notifie_at = CASE WHEN rempli_at IS NULL AND public.portail_notifications_bloquees(v_pat) THEN now() ELSE notifie_at END
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.questionnaire_etat_patient(), public.questionnaire_enregistrer(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.questionnaire_etat_patient(), public.questionnaire_enregistrer(uuid, jsonb) TO authenticated;
