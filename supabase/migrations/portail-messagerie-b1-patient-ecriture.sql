-- Portail patient — MESSAGERIE, bloc B1/4 : fonctions du PATIENT (idempotent). Prérequis : bloc A. Suite : portail-messagerie-b2-patient-lecture.sql.
-- Écrire (5 / 10 min, 30 / 24 h), corriger dans les 5 min, lire, marquer lu. Le patient ne reçoit JAMAIS lu_at ni notifie_at.
CREATE OR REPLACE FUNCTION public.messagerie_envoyer_patient(p_texte text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid; v_p uuid; v_t text; v_id uuid;
BEGIN
  v_pat := public.messagerie_patient_courant();
  IF NOT public.messagerie_ouverte(v_pat) THEN RAISE EXCEPTION 'messagerie_desactivee'; END IF;
  v_t := public.messagerie_texte_ok(p_texte);
  PERFORM pg_advisory_xact_lock(hashtext('messagerie:' || v_pat::text));
  IF (SELECT count(*) FROM public.messages_portail WHERE patient_id = v_pat AND sens = 'patient' AND created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.messages_portail WHERE patient_id = v_pat AND sens = 'patient' AND created_at > now() - interval '24 hours') >= 30 THEN
    RAISE EXCEPTION 'trop_de_messages';
  END IF;
  SELECT praticien_id INTO v_p FROM public.patient_comptes WHERE patient_id = v_pat;
  INSERT INTO public.messages_portail (patient_id, praticien_id, sens, texte, notifie_at)
  VALUES (v_pat, v_p, 'patient', v_t, CASE WHEN public.portail_notifications_bloquees(v_pat) THEN now() END)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.messagerie_modifier_patient(p_id uuid, p_texte text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pat uuid; m public.messages_portail; v_t text;
BEGIN
  v_pat := public.messagerie_patient_courant();
  IF NOT public.messagerie_ouverte(v_pat) THEN RAISE EXCEPTION 'messagerie_desactivee'; END IF;
  v_t := public.messagerie_texte_ok(p_texte);
  SELECT * INTO m FROM public.messages_portail WHERE id = p_id AND patient_id = v_pat AND sens = 'patient' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'message introuvable'; END IF;
  IF m.created_at < now() - interval '5 minutes' THEN RAISE EXCEPTION 'delai_depasse'; END IF;
  IF (SELECT count(*) FROM public.messages_portail_versions WHERE message_id = p_id) >= 10 THEN RAISE EXCEPTION 'trop_de_modifications'; END IF;
  IF v_t = m.texte THEN RETURN true; END IF;
  INSERT INTO public.messages_portail_versions (message_id, texte) VALUES (p_id, m.texte);
  UPDATE public.messages_portail SET texte = v_t, modifie_at = now() WHERE id = p_id;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.messagerie_envoyer_patient(text), public.messagerie_modifier_patient(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messagerie_envoyer_patient(text), public.messagerie_modifier_patient(uuid, text) TO authenticated;
