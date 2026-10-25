-- Questionnaire patient — bloc A2/5 : contrôle des réponses (idempotent). Prérequis : A1.
-- Liste blanche des clés (adulte / enfant) ; texte 1000 car. max, listes de 12 mots max, nombres bornés. Renvoie les réponses nettoyées.
CREATE OR REPLACE FUNCTION public.questionnaire_valider(p_type text, p_rep jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  k text; v jsonb; r jsonb := '{}'; s text; i jsonb; n numeric;
  c_txt text[] := ARRAY['motif_autre_txt','chg_blessure_txt','chg_operation_txt','chg_maladie_txt','chg_examens_txt','chg_traitements_txt','allergies_txt','atcd_familiaux_txt','appareillage_txt','chaussures_gene_txt','notes_txt','sport_txt','sport_freq_txt'];
  a_txt text[] := ARRAY['metier_txt','sport_duree_txt','sport_objectif_txt','sport_chaussures_txt'];
  e_txt text[] := ARRAY['atcd_medicaux_txt','atcd_chirurgicaux_txt','atcd_traumatiques_txt'];
  c_on text[] := ARRAY['premiere_fois','douleur','chg_blessure','chg_operation','appareillage'];
  c_arr text[] := ARRAY['motif','douleur_zones','douleur_quand','chg_maladie_types','chg_examens','chaussures'];
BEGIN
  IF p_type NOT IN ('adulte','enfant') OR jsonb_typeof(p_rep) IS DISTINCT FROM 'object' OR length(p_rep::text) > 12000 THEN RAISE EXCEPTION 'reponses_invalides'; END IF;
  FOR k, v IN SELECT * FROM jsonb_each(p_rep) LOOP
    CONTINUE WHEN jsonb_typeof(v) = 'null';
    IF k = ANY (c_txt) OR (p_type = 'adulte' AND k = ANY (a_txt)) OR (p_type = 'enfant' AND k = ANY (e_txt)) THEN
      IF jsonb_typeof(v) <> 'string' THEN RAISE EXCEPTION 'reponses_invalides'; END IF;
      s := btrim(v #>> '{}');
      IF char_length(s) > 1000 THEN RAISE EXCEPTION 'texte_trop_long'; END IF;
      IF s <> '' THEN r := r || jsonb_build_object(k, s); END IF;
    ELSIF k = ANY (c_on) OR (p_type = 'adulte' AND k = 'sport_pratique') OR (p_type = 'enfant' AND k = 'premature') THEN
      IF v NOT IN ('"oui"'::jsonb, '"non"'::jsonb) THEN RAISE EXCEPTION 'reponses_invalides'; END IF;
      r := r || jsonb_build_object(k, v);
    ELSIF (p_type = 'adulte' AND k = 'position' AND v IN ('"assis"'::jsonb,'"debout"'::jsonb,'"marche"'::jsonb,'"mixte"'::jsonb))
       OR (p_type = 'adulte' AND k = 'sport_niveau' AND v IN ('"loisir"'::jsonb,'"competition"'::jsonb)) THEN
      r := r || jsonb_build_object(k, v);
    ELSIF k = ANY (c_arr) THEN
      IF jsonb_typeof(v) <> 'array' OR jsonb_array_length(v) > 12 THEN RAISE EXCEPTION 'reponses_invalides'; END IF;
      FOR i IN SELECT * FROM jsonb_array_elements(v) LOOP
        IF jsonb_typeof(i) <> 'string' OR (i #>> '{}') !~ '^[a-z_]{1,40}$' THEN RAISE EXCEPTION 'reponses_invalides'; END IF;
      END LOOP;
      IF jsonb_array_length(v) > 0 THEN r := r || jsonb_build_object(k, v); END IF;
    ELSIF k IN ('eva','poids','taille') OR (p_type = 'enfant' AND k IN ('age_marche_mois','terme_sa')) THEN
      IF jsonb_typeof(v) <> 'number' THEN RAISE EXCEPTION 'reponses_invalides'; END IF;
      n := (v #>> '{}')::numeric;
      IF NOT (CASE k WHEN 'eva' THEN n BETWEEN 0 AND 10 WHEN 'poids' THEN n BETWEEN 1 AND 400 WHEN 'taille' THEN n BETWEEN 30 AND 250
                     WHEN 'age_marche_mois' THEN n BETWEEN 0 AND 60 ELSE n BETWEEN 20 AND 45 END) THEN RAISE EXCEPTION 'valeur_hors_limites'; END IF;
      r := r || jsonb_build_object(k, v);
    ELSE
      RAISE EXCEPTION 'cle_inconnue';
    END IF;
  END LOOP;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.questionnaire_valider(text, jsonb) FROM PUBLIC, anon, authenticated;
