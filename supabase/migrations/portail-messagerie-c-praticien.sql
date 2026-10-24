-- Portail patient — MESSAGERIE, bloc C/4 : fonctions du PRATICIEN (idempotent). Prérequis : blocs A, B1, B2. Suite : bloc D (portail-messagerie-d-praticien-suivi.sql).
-- Tout contrôle le propriétaire du compte portail du patient. Le praticien n'est pas limité en cadence ; il écrit même si le patient
-- est bloqué (le blocage vise les abus du patient). Message du praticien : notifie_at NULL = e-mail d'avertissement à envoyer.
CREATE OR REPLACE FUNCTION public.messagerie_envoyer_praticien(p_patient uuid, p_texte text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t text; v_id uuid;
BEGIN
  PERFORM public.messagerie_praticien_ok(p_patient);
  IF NOT public.messagerie_ouverte(p_patient) THEN RAISE EXCEPTION 'messagerie_desactivee'; END IF;
  v_t := public.messagerie_texte_ok(p_texte);
  INSERT INTO public.messages_portail (patient_id, praticien_id, sens, texte)
  VALUES (p_patient, auth.uid(), 'praticien', v_t) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.messagerie_modifier_praticien(p_id uuid, p_texte text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.messages_portail; v_t text;
BEGIN
  SELECT * INTO m FROM public.messages_portail WHERE id = p_id AND sens = 'praticien' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'message introuvable'; END IF;
  PERFORM public.messagerie_praticien_ok(m.patient_id);
  IF m.praticien_id <> auth.uid() THEN RAISE EXCEPTION 'non autorisé'; END IF;
  IF NOT public.messagerie_ouverte(m.patient_id) THEN RAISE EXCEPTION 'messagerie_desactivee'; END IF;
  v_t := public.messagerie_texte_ok(p_texte);
  IF m.created_at < now() - interval '5 minutes' THEN RAISE EXCEPTION 'delai_depasse'; END IF;
  IF (SELECT count(*) FROM public.messages_portail_versions WHERE message_id = p_id) >= 10 THEN RAISE EXCEPTION 'trop_de_modifications'; END IF;
  IF v_t = m.texte THEN RETURN true; END IF;
  INSERT INTO public.messages_portail_versions (message_id, texte) VALUES (p_id, m.texte);
  UPDATE public.messages_portail SET texte = v_t, modifie_at = now() WHERE id = p_id;
  RETURN true;
END $$;

-- Fil complet vu par le praticien : lu_at inclus (« Lu » sous ses messages).
CREATE OR REPLACE FUNCTION public.messagerie_lire_praticien(p_patient uuid)
RETURNS TABLE (id uuid, sens text, texte text, created_at timestamptz, modifie_at timestamptz, lu_at timestamptz, reste_s integer, ouverte boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.messagerie_praticien_ok(p_patient);
  RETURN QUERY
  SELECT f.id, f.sens, f.texte, f.created_at, f.modifie_at, f.lu_at,
         CASE WHEN f.sens = 'praticien' AND public.messagerie_ouverte(p_patient)
              THEN GREATEST(0, ceil(extract(epoch FROM f.created_at + interval '5 minutes' - now())))::integer ELSE 0 END,
         public.messagerie_ouverte(p_patient)
    FROM (SELECT * FROM public.messages_portail m WHERE m.patient_id = p_patient ORDER BY m.created_at DESC LIMIT 200) f
   ORDER BY f.created_at ASC;
END $$;

CREATE OR REPLACE FUNCTION public.messagerie_lu_praticien(p_patient uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public.messagerie_praticien_ok(p_patient);
  UPDATE public.messages_portail SET lu_at = now() WHERE patient_id = p_patient AND sens = 'patient' AND lu_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.messagerie_envoyer_praticien(uuid, text), public.messagerie_modifier_praticien(uuid, text),
  public.messagerie_lire_praticien(uuid), public.messagerie_lu_praticien(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.messagerie_envoyer_praticien(uuid, text), public.messagerie_modifier_praticien(uuid, text),
  public.messagerie_lire_praticien(uuid), public.messagerie_lu_praticien(uuid) TO authenticated;
