-- Signature du devis par le patient — bloc B1/6 : lecture et code pour mineur (patient seulement, idempotent). Prérequis : A1, A2.
-- État des devis du patient connecté (jamais ceux retirés). Aucune lecture directe des tables.
CREATE OR REPLACE FUNCTION public.devis_etats_patient()
RETURNS TABLE (document_id uuid, signe_at timestamptz, expire boolean, signable boolean, mineur boolean, empreinte text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, s.signe_at,
         COALESCE((d.contenu ->> 'valide_jusqu_au')::date < public.portail_aujourdhui(), true),
         s.id IS NULL AND COALESCE((d.contenu ->> 'valide_jusqu_au')::date >= public.portail_aujourdhui(), false),
         (p.ddn IS NULL OR p.ddn > (public.portail_aujourdhui() - interval '18 years')::date),
         d.empreinte
    FROM public.documents_partages d
    JOIN public.patients p ON p.id = d.patient_id
    LEFT JOIN public.devis_signatures s ON s.document_id = d.id
   WHERE d.patient_id = public.portail_patient_actuel() AND d.type = 'devis' AND NOT d.retire
$$;

-- Code à 6 chiffres pour un mineur (ou date de naissance inconnue). Adulte : aucun code.
-- En « mode essai » le code est rendu à l'écran (aucun e-mail réel avant HDS) ; sinon jamais.
CREATE OR REPLACE FUNCTION public.devis_signature_code_demander(p_document uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pat uuid := public.portail_patient_actuel();
  e record; v_code text;
BEGIN
  IF v_pat IS NULL THEN RAISE EXCEPTION 'non autorisé'; END IF;
  SELECT * INTO e FROM public.devis_etats_patient() x WHERE x.document_id = p_document;
  IF NOT FOUND THEN RAISE EXCEPTION 'devis_introuvable'; END IF;
  IF e.signe_at IS NOT NULL THEN RAISE EXCEPTION 'deja_signe'; END IF;
  IF e.expire THEN RAISE EXCEPTION 'devis_expire'; END IF;
  IF NOT e.mineur THEN RETURN jsonb_build_object('requis', false); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('devis_code:' || p_document::text));
  IF (SELECT count(*) FROM public.devis_signature_codes WHERE document_id = p_document AND created_at > now() - interval '15 minutes') >= 3 THEN
    RAISE EXCEPTION 'trop_de_codes';
  END IF;
  UPDATE public.devis_signature_codes SET utilise_at = now() WHERE document_id = p_document AND utilise_at IS NULL;
  v_code := lpad((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 1000000)::text, 6, '0');
  INSERT INTO public.devis_signature_codes (document_id, patient_id, code_hash, expire_at)
  VALUES (p_document, v_pat, encode(sha256(convert_to(v_code || ':' || p_document::text, 'UTF8')), 'hex'), now() + interval '10 minutes');
  RETURN jsonb_build_object('requis', true, 'expire_s', 600,
    'code_essai', (SELECT CASE WHEN valeur = '1' THEN v_code END FROM public.portail_reglages WHERE cle = 'signature_code_essai'));
END $$;
REVOKE ALL ON FUNCTION public.devis_etats_patient(), public.devis_signature_code_demander(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devis_etats_patient(), public.devis_signature_code_demander(uuid) TO authenticated;
