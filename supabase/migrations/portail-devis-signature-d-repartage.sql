-- Signature du devis par le patient — bloc D/6 : le repartage ne touche jamais un devis signé (idempotent). Prérequis : A1 à C.
-- Même fonction que portail-documents-partages.sql, avec une seule garde en plus (WHERE NOT EXISTS signature).
CREATE OR REPLACE FUNCTION public.documents_partager_facturation(p_patient uuid, p_document uuid, p_chemin text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d public.documents_facturation;
  v_id uuid;
BEGIN
  IF NOT public.documents_partages_controle(p_patient) THEN RETURN NULL; END IF;
  PERFORM public.documents_partages_chemin_ok(p_patient, p_chemin);
  SELECT * INTO d FROM public.documents_facturation
    WHERE id = p_document AND user_id = auth.uid() AND statut = 'emis';
  IF NOT FOUND THEN RAISE EXCEPTION 'document introuvable ou non émis'; END IF;
  INSERT INTO public.documents_partages (praticien_id, patient_id, type, source_ref, titre, date_document, fichier_chemin, contenu)
  VALUES (auth.uid(), p_patient, d.type, d.id::text,
          (CASE d.type WHEN 'devis' THEN 'Devis ' ELSE 'Facture ' END) || d.numero,
          d.date_document, p_chemin,
          jsonb_build_object('numero', d.numero, 'date_document', d.date_document,
            'valide_jusqu_au', d.valide_jusqu_au, 'patient', d.patient, 'emetteur', d.emetteur,
            'regime', d.regime, 'lignes', d.lignes, 'total_fixe', d.total_fixe,
            'total_cents', d.total_cents, 'tiers_payant', d.tiers_payant,
            'part_secu_cents', d.part_secu_cents, 'net_cents', d.net_cents,
            'mention_tva', d.mention_tva, 'note', d.note, 'devis_numero', d.devis_numero,
            'paiement_mode', d.paiement_mode, 'paiement_date', d.paiement_date))
  ON CONFLICT (patient_id, type, source_ref) DO UPDATE SET contenu = EXCLUDED.contenu, fichier_chemin = EXCLUDED.fichier_chemin
    WHERE NOT EXISTS (SELECT 1 FROM public.devis_signatures s WHERE s.document_id = public.documents_partages.id)
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.documents_partages WHERE patient_id = p_patient AND type = d.type AND source_ref = d.id::text;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.documents_partager_facturation(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.documents_partager_facturation(uuid, uuid, text) TO authenticated;
