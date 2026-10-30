-- ════════════════════════════════════════════════════
-- Portail patient — fiches de réathlétisation (chantier B lot 4) : « fiches seules », sans chrono ni séance
-- ════════════════════════════════════════════════════
-- Décidé avec le praticien le 30/10/2026 : les programmes de réathlétisation (genou, hanche, pied) ne sont plus des exercices
-- des circuits Express. Ils se COCHENT dans le bilan (comme le programme du pied) et, côté patient, ne donnent que l'accès à
-- la fiche PDF (aucun chronomètre, aucune validation).
--  * le praticien envoie, EN PLUS de ses jours, une liste « fiches » de CODES d'exercices (12 au plus) ;
--  * la fonction (SECURITY DEFINER) les range dans le catalogue de la copie figée (nom, PDF, texte : lus dans la bibliothèque,
--    jamais par le praticien) et garde la liste « fiches » dans la copie ;
--  * la lecture des PDF par le patient passe déjà par portail_peut_lire_pdf_programme (catalogue de SA copie) : rien à changer ;
--  * une fiche inconnue de la bibliothèque est IGNORÉE (jamais inventée) ; un programme peut n'avoir que des fiches (jours vides).
-- Prérequis : portail-programme-patient.sql. Idempotent (CREATE OR REPLACE). Ne supprime rien.
-- ════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.programme_patient_deposer(p_patient uuid, p_programme jsonb)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codes text[];
  v_cat jsonb := '{}'::jsonb;
  v_noms jsonb;
  v_fiches_in jsonb;
  v_fiches jsonb;
  c text;
  r_base public.exercices_base;
  r_perso public.exercices_perso;
  v_out jsonb;
  v_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR (auth.jwt() -> 'app_metadata' ->> 'role') IS NOT DISTINCT FROM 'patient' THEN
    RAISE EXCEPTION 'non autorisé';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'patient introuvable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patient_comptes WHERE patient_id = p_patient AND praticien_id = auth.uid()) THEN
    RETURN NULL; -- pas de compte portail : rien n'est copié
  END IF;
  IF p_programme IS NULL OR jsonb_typeof(p_programme) <> 'object' OR octet_length(p_programme::text) > 400000
     OR jsonb_typeof(p_programme -> 'jours') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_programme -> 'jours') > 60 THEN
    RAISE EXCEPTION 'programme invalide';
  END IF;
  -- fiches seules (facultatif) : liste de codes, 12 au plus
  IF p_programme ? 'fiches' AND jsonb_typeof(p_programme -> 'fiches') IS DISTINCT FROM 'null' THEN
    IF jsonb_typeof(p_programme -> 'fiches') <> 'array' OR jsonb_array_length(p_programme -> 'fiches') > 12 THEN
      RAISE EXCEPTION 'fiches invalides';
    END IF;
    v_fiches_in := p_programme -> 'fiches';
  ELSE
    v_fiches_in := '[]'::jsonb;
  END IF;
  v_noms := CASE WHEN jsonb_typeof(p_programme -> 'noms') = 'object' THEN p_programme -> 'noms' ELSE '{}'::jsonb END;

  SELECT array_agg(DISTINCT x) INTO v_codes FROM (
    SELECT jsonb_path_query(p_programme, '$.jours[*].seances[*].exos[*][*]') #>> '{}' AS x
    UNION ALL
    SELECT jsonb_array_elements_text(v_fiches_in)) q
    WHERE x IS NOT NULL AND char_length(x) <= 200;
  FOREACH c IN ARRAY COALESCE(v_codes, '{}') LOOP
    IF c LIKE 'perso:%' THEN
      BEGIN
        SELECT * INTO r_perso FROM public.exercices_perso
          WHERE id = substr(c, 7)::uuid AND user_id = auth.uid();
      EXCEPTION WHEN invalid_text_representation THEN r_perso := NULL; END;
      IF r_perso.id IS NOT NULL THEN
        v_cat := v_cat || jsonb_build_object(c, jsonb_build_object('nom', r_perso.libelle,
          'liens', to_jsonb(r_perso.liens_youtube), 'pdf', r_perso.pdf_chemin, 'texte', r_perso.texte));
      END IF;
      r_perso := NULL;
    ELSE
      SELECT * INTO r_base FROM public.exercices_base WHERE code = c;
      IF r_base.id IS NOT NULL THEN
        v_cat := v_cat || jsonb_build_object(c, jsonb_build_object('nom', r_base.libelle,
          'liens', to_jsonb(r_base.liens_youtube), 'pdf', r_base.pdf_fichier, 'texte', r_base.texte));
      END IF;
      r_base := NULL;
    END IF;
    -- exercice inconnu (ancien libellé) : le nom envoyé par l'application sert de secours, sans vidéo
    IF NOT (v_cat ? c) AND jsonb_typeof(v_noms -> c) = 'string' THEN
      v_cat := v_cat || jsonb_build_object(c, jsonb_build_object('nom', left(v_noms ->> c, 200),
        'liens', '[]'::jsonb, 'pdf', NULL, 'texte', NULL));
    END IF;
  END LOOP;

  -- liste « fiches » de la copie : dans l'ordre reçu, sans doublon, seulement les fiches présentes dans le catalogue
  SELECT COALESCE(jsonb_agg(t.x ORDER BY t.ord), '[]'::jsonb) INTO v_fiches FROM (
    SELECT DISTINCT ON (e.x) e.x, e.ord
    FROM jsonb_array_elements_text(v_fiches_in) WITH ORDINALITY AS e(x, ord)
    WHERE char_length(e.x) <= 200 AND v_cat ? e.x
    ORDER BY e.x, e.ord) t;

  v_out := jsonb_build_object('debut', p_programme -> 'debut', 'fin', p_programme -> 'fin',
                              'jours', p_programme -> 'jours', 'catalogue', v_cat, 'fiches', v_fiches);
  INSERT INTO public.programmes_patient (patient_id, praticien_id, contenu, publie_at)
  VALUES (p_patient, auth.uid(), v_out, now())
  ON CONFLICT (patient_id) DO UPDATE SET contenu = EXCLUDED.contenu, publie_at = now(), praticien_id = EXCLUDED.praticien_id
  RETURNING publie_at INTO v_at;
  RETURN v_at;
END $$;
REVOKE ALL ON FUNCTION public.programme_patient_deposer(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.programme_patient_deposer(uuid, jsonb) TO authenticated;
