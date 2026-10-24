-- Signature du devis par le patient — bloc B2/6 : la signature elle-même (patient seulement, idempotent). Prérequis : A1, A2, B1.
-- IP et date sont pris PAR LE SERVEUR (en-têtes de la requête), jamais fournis par le client.
-- Mauvais code : on RENVOIE l'erreur (un RAISE annulerait le compte des essais) ; tout le reste lève une exception courte.
CREATE OR REPLACE FUNCTION public.devis_signer(p_document uuid, p_empreinte text, p_trace text, p_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pat uuid := public.portail_patient_actuel();
  d public.documents_partages; p public.patients; c public.devis_signature_codes;
  v_h jsonb; v_ip text; v_mineur boolean; v_emp text; v_at timestamptz;
BEGIN
  IF v_pat IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('devis_signer:' || p_document::text));
  SELECT * INTO d FROM public.documents_partages
   WHERE id = p_document AND patient_id = v_pat AND type = 'devis' AND NOT retire;
  IF NOT FOUND THEN RAISE EXCEPTION 'devis_introuvable'; END IF;
  IF EXISTS (SELECT 1 FROM public.devis_signatures WHERE document_id = d.id) THEN RAISE EXCEPTION 'deja_signe'; END IF;
  IF COALESCE((d.contenu ->> 'valide_jusqu_au')::date < public.portail_aujourdhui(), true) THEN RAISE EXCEPTION 'devis_expire'; END IF;
  v_emp := encode(sha256(convert_to(d.contenu::text, 'UTF8')), 'hex');
  IF v_emp IS DISTINCT FROM d.empreinte OR p_empreinte IS DISTINCT FROM v_emp THEN RAISE EXCEPTION 'devis_modifie'; END IF;
  IF p_trace IS NULL OR p_trace !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' OR char_length(p_trace) NOT BETWEEN 200 AND 150000 THEN
    RAISE EXCEPTION 'trace_invalide';
  END IF;
  SELECT * INTO p FROM public.patients WHERE id = v_pat;
  v_mineur := p.ddn IS NULL OR p.ddn > (public.portail_aujourdhui() - interval '18 years')::date;
  IF v_mineur THEN
    IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'code_requis'; END IF;
    SELECT * INTO c FROM public.devis_signature_codes
     WHERE document_id = d.id AND utilise_at IS NULL AND expire_at > now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'code_requis'; END IF;
    IF c.code_hash <> encode(sha256(convert_to(p_code || ':' || d.id::text, 'UTF8')), 'hex') THEN
      UPDATE public.devis_signature_codes SET essais = essais + 1, utilise_at = CASE WHEN essais + 1 >= 5 THEN now() END WHERE id = c.id;
      RETURN jsonb_build_object('ok', false, 'erreur', 'code_invalide', 'restants', GREATEST(4 - c.essais, 0));
    END IF;
    UPDATE public.devis_signature_codes SET utilise_at = now() WHERE id = c.id;
  END IF;
  BEGIN v_h := nullif(current_setting('request.headers', true), '')::jsonb; EXCEPTION WHEN others THEN v_h := NULL; END;
  v_ip := left(trim(split_part(COALESCE(v_h ->> 'x-forwarded-for', v_h ->> 'cf-connecting-ip', v_h ->> 'x-real-ip', ''), ',', 1)), 64);
  INSERT INTO public.devis_signatures (document_id, praticien_id, patient_id, numero, empreinte, trace, ip, user_agent, mineur, code_verifie, notifie_at)
  VALUES (d.id, d.praticien_id, v_pat, COALESCE(d.contenu ->> 'numero', ''), v_emp, p_trace, COALESCE(NULLIF(v_ip, ''), 'inconnue'),
          left(v_h ->> 'user-agent', 200), v_mineur, v_mineur,
          CASE WHEN public.portail_notifications_bloquees(v_pat) THEN now() END)
  RETURNING signe_at INTO v_at;
  RETURN jsonb_build_object('ok', true, 'signe_at', v_at);
END $$;
REVOKE ALL ON FUNCTION public.devis_signer(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_signer(uuid, text, text, text) TO authenticated;
