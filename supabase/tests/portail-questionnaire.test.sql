-- Attaques sur le QUESTIONNAIRE PATIENT (portail-questionnaire-a1/a2/b/c1/c2) — base JETABLE. Chaîne : celle du banc de la signature
-- (lancer_sql_signature.sh) + portail-messagerie-a-tables.sql + les 5 blocs questionnaire, puis ce fichier. Données fictives.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
-- colonnes de la vraie table patients absentes du schéma factice du banc
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS sport text, ADD COLUMN IF NOT EXISTS metier text, ADD COLUMN IF NOT EXISTS poids numeric, ADD COLUMN IF NOT EXISTS taille numeric;
ALTER TABLE public.patient_comptes ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, praticien_id, patient_id, auth_user_id, statut) ON public.patient_comptes TO authenticated;
GRANT UPDATE (notifications_bloquees_at) ON public.patient_comptes TO authenticated;
DELETE FROM public.questionnaires_patient; DELETE FROM public.patient_comptes; DELETE FROM public.patients; DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),('00000000-0000-0000-0000-0000000000a2','pa2@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a3','pa3@exemple.invalid'),('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom,ddn,antecedents,examens,sport,metier,poids,taille) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif Adulte','1980-05-17','Entorse 2015','Radio 2019','Course','Infirmier',72,178),
 ('10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a','Fictif Enfant', (current_date - interval '8 years')::date,NULL,NULL,NULL,NULL,NULL,NULL),
 ('10000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-00000000000a','Fictif SansDdn',NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif B1','1990-01-01',NULL,NULL,NULL,NULL,NULL,NULL);
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,statut,identifiant) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','actif','QQQQ-0001'),
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','actif','QQQQ-0002'),
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3','actif','QQQQ-0003'),
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','actif','QQQQ-0004');
CREATE SCHEMA IF NOT EXISTS essai; GRANT USAGE ON SCHEMA essai TO PUBLIC;
CREATE OR REPLACE FUNCTION essai.ctrl(ok boolean, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'ECHEC : %', nom; END IF; RAISE WARNING 'ok : %', nom; END $$;
CREATE OR REPLACE FUNCTION essai.refuse(req text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    RAISE WARNING 'ok (refusé) : %', nom;
  END;
END $$;
CREATE OR REPLACE FUNCTION essai.refuse_msg(req text, msg text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    IF SQLERRM <> msg THEN RAISE EXCEPTION 'ECHEC (mauvais message « % » au lieu de « % ») : %', SQLERRM, msg, nom; END IF;
    RAISE WARNING 'ok (refusé « % ») : %', msg, nom;
  END;
END $$;
GRANT USAGE ON SCHEMA essai TO authenticated;

\set PA '''{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}'''
\set PA2 '''{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"role":"patient"}}'''
\set PB '''{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}'''
\set PRA '''{"sub":"00000000-0000-0000-0000-00000000000a"}'''
\set PRB '''{"sub":"00000000-0000-0000-0000-00000000000b"}'''
\set A1 '10000000-0000-0000-0000-0000000000a1'
\set A2 '10000000-0000-0000-0000-0000000000a2'
\set A3 '10000000-0000-0000-0000-0000000000a3'
\set B1 '10000000-0000-0000-0000-0000000000b1'

-- ═══ Accès direct interdit au patient ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaires_patient) = 0, 'patient : 0 ligne en lecture directe');
SELECT essai.refuse('INSERT INTO public.questionnaires_patient(patient_id,praticien_id,type) VALUES (''10000000-0000-0000-0000-0000000000a1'',''00000000-0000-0000-0000-0000000000a1'',''adulte'')', 'patient : insertion directe');
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000a1'')', 'non autorisé', 'patient ne peut pas demander');
SELECT essai.ctrl(public.questionnaire_etat_patient() IS NULL, 'patient : aucun questionnaire = null');
RESET ROLE;

-- ═══ Praticien : demander ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000b1'')', 'non autorisé', 'praticien A : patient d''un autre');
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000a1'', now() - interval ''1 hour'')', 'rdv_passe', 'RDV passé refusé');
CREATE TEMP TABLE ids(nom text, id uuid); GRANT ALL ON ids TO authenticated;
INSERT INTO ids SELECT 'adulte', public.questionnaire_demander(:'A1', now() + interval '3 days');
INSERT INTO ids SELECT 'enfant', public.questionnaire_demander(:'A2', now() + interval '3 days');
INSERT INTO ids SELECT 'sansddn', public.questionnaire_demander(:'A3');
SELECT essai.ctrl((SELECT type FROM public.questionnaires_patient WHERE patient_id = :'A1') = 'adulte', 'type adulte');
SELECT essai.ctrl((SELECT type FROM public.questionnaires_patient WHERE patient_id = :'A2') = 'enfant', 'type enfant (8 ans)');
SELECT essai.ctrl((SELECT type FROM public.questionnaires_patient WHERE patient_id = :'A3') = 'adulte', 'ddn inconnue = adulte');
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000a1'')', 'questionnaire_deja_ouvert', 'un seul questionnaire ouvert');
RESET ROLE;
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaires_patient) = 0, 'praticien B ne voit rien');
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_a_notifier()) = 0, 'praticien B : rien à notifier');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaires_patient) = 3, 'praticien A voit ses 3');

-- ═══ Patient : lecture de son questionnaire + fiche ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() ->> 'type' = 'adulte', 'patient adulte : son questionnaire');
SELECT essai.ctrl(public.questionnaire_etat_patient() -> 'fiche' ->> 'antecedents' = 'Entorse 2015', 'patient : fiche en lecture (antécédents)');
SELECT essai.ctrl((public.questionnaire_etat_patient() -> 'fiche' ->> 'poids')::numeric = 72, 'patient : fiche (poids)');
SELECT essai.ctrl((public.questionnaire_etat_patient() ->> 'modifiable')::boolean, 'modifiable avant le RDV');
SELECT essai.ctrl(public.questionnaire_etat_patient() ->> 'rempli_at' IS NULL, 'pas encore rempli');
SET request.jwt.claims = :PB; 
SELECT essai.ctrl(public.questionnaire_etat_patient() IS NULL, 'autre patient : rien');

-- ═══ Patient : enregistrer ═══
SET request.jwt.claims = :PA;
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''enfant''), ''{"douleur":"oui"}'')', 'questionnaire_introuvable', 'questionnaire d''un autre patient');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{}'')', 'reponses_vides', 'réponses vides');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"pirate":"x"}'')', 'cle_inconnue', 'clé inconnue');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"premature":"oui"}'')', 'cle_inconnue', 'clé enfant refusée à un adulte');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"eva":11}'')', 'valeur_hors_limites', 'EVA 11');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"poids":0}'')', 'valeur_hors_limites', 'poids 0');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"eva":"5"}'')', 'reponses_invalides', 'EVA en texte');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"douleur":"peut-être"}'')', 'reponses_invalides', 'oui/non invalide');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"position":"couché"}'')', 'cle_inconnue', 'choix hors liste');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"motif":["<script>"]}'')', 'reponses_invalides', 'élément de liste invalide');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"notes_txt":' || to_json(repeat('x', 1001)) || '}'')', 'texte_trop_long', 'texte > 1000');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"motif":["a","b","c","d","e","f","g","h","i","j","k","l","m"]}'')', 'reponses_invalides', 'liste > 12');
SELECT essai.refuse('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''[1]'')', 'tableau au lieu d''objet');
SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom='adulte'),
  '{"motif":["douleur","semelles"],"douleur":"oui","douleur_zones":["talon"],"eva":6,"chg_blessure":"oui","chg_blessure_txt":"  Entorse cheville D  ","poids":74,"taille":178,"sport_pratique":"oui","sport_txt":"Trail","notes_txt":"","douleur_quand":[],"position":null}');
SELECT essai.ctrl((public.questionnaire_etat_patient() -> 'reponses' ->> 'chg_blessure_txt') = 'Entorse cheville D', 'texte nettoyé (espaces)');
SELECT essai.ctrl(NOT (public.questionnaire_etat_patient() -> 'reponses') ? 'notes_txt', 'texte vide supprimé');
SELECT essai.ctrl(NOT (public.questionnaire_etat_patient() -> 'reponses') ? 'douleur_quand', 'liste vide supprimée');
SELECT essai.ctrl(NOT (public.questionnaire_etat_patient() -> 'reponses') ? 'position', 'null supprimé');
SELECT essai.ctrl(public.questionnaire_etat_patient() ->> 'rempli_at' IS NOT NULL, 'rempli_at posé');
SET request.jwt.claims = :PA2;
SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom='enfant'), '{"premature":"oui","terme_sa":32,"age_marche_mois":14,"motif":["pieds_plats"]}');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''enfant''), ''{"metier_txt":"x"}'')', 'cle_inconnue', 'clé adulte refusée à un enfant');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''enfant''), ''{"terme_sa":10}'')', 'valeur_hors_limites', 'terme 10 SA');
RESET ROLE;

-- ═══ Praticien : lecture, notification, modification patient ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_a_notifier()) = 2, '2 à notifier (adulte + enfant)');
SELECT essai.ctrl((SELECT rempli_at IS NOT NULL AND reponses ->> 'douleur' = 'oui' FROM public.questionnaire_lire_praticien(:'A1') LIMIT 1), 'praticien lit les réponses');
SELECT essai.ctrl((SELECT notifie_at IS NULL FROM public.questionnaires_patient WHERE patient_id = :'A1'), 'pas encore notifié');
SELECT essai.ctrl(public.questionnaire_notifie((SELECT id FROM ids WHERE nom='adulte')), 'notifié (1re fois)');
SELECT essai.ctrl(NOT public.questionnaire_notifie((SELECT id FROM ids WHERE nom='adulte')), 'notifié une seule fois');
RESET ROLE;
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl(NOT public.questionnaire_notifie((SELECT id FROM ids WHERE nom='enfant')), 'praticien B ne peut pas notifier');
SELECT essai.refuse_msg('SELECT public.questionnaire_retirer((SELECT id FROM ids WHERE nom=''enfant''))', 'non autorisé', 'praticien B ne retire pas');
SELECT essai.refuse_msg('SELECT * FROM public.questionnaire_lire_praticien(''10000000-0000-0000-0000-0000000000a1'')', 'non autorisé', 'praticien B ne lit pas');
RESET ROLE;
UPDATE public.questionnaires_patient SET rempli_at = '2020-01-01' WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() ->> 'rempli_at' IS NOT NULL, 'patient : toujours visible après notification');
SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom='adulte'), '{"douleur":"non","eva":2}');
SELECT essai.ctrl((public.questionnaire_etat_patient() -> 'reponses' ->> 'douleur') = 'non', 'patient modifie ses réponses (remplace)');
SELECT essai.ctrl(NOT (public.questionnaire_etat_patient() -> 'reponses') ? 'poids', 'la nouvelle version remplace l''ancienne en entier');
RESET ROLE;
SELECT essai.ctrl((SELECT modifie_at IS NOT NULL AND nb_enregistrements = 2 FROM public.questionnaires_patient WHERE patient_id = :'A1'), 'modifie_at + compteur');
SELECT essai.ctrl((SELECT rempli_at = '2020-01-01' FROM public.questionnaires_patient WHERE patient_id = :'A1'), 'rempli_at conservé à la modification');

-- ═══ Après le RDV ═══
UPDATE public.questionnaires_patient SET rdv_at = now() - interval '1 minute' WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(NOT (public.questionnaire_etat_patient() ->> 'modifiable')::boolean, 'non modifiable après le RDV');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"douleur":"oui"}'')', 'delai_depasse', 'écriture refusée après le RDV');
RESET ROLE;

-- ═══ Limite de modifications ═══
UPDATE public.questionnaires_patient SET rdv_at = NULL, nb_enregistrements = 100 WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''adulte''), ''{"douleur":"oui"}'')', 'trop_de_modifications', 'plafond de 100 enregistrements');
RESET ROLE;

-- ═══ Retrait par le praticien ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_retirer((SELECT id FROM ids WHERE nom='enfant')), 'retrait');
SELECT essai.ctrl(NOT public.questionnaire_retirer((SELECT id FROM ids WHERE nom='enfant')), 'retrait une seule fois');
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_a_notifier() WHERE patient_id = :'A2') = 0, 'questionnaire retiré : jamais notifié');
RESET ROLE;
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() IS NULL, 'retiré = invisible au patient');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''enfant''), ''{"douleur":"oui"}'')', 'questionnaire_introuvable', 'retiré = non modifiable');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_demander(:'A2') IS NOT NULL, 'un nouveau questionnaire possible après retrait');
RESET ROLE;

-- ═══ Patient suspendu et blocage des notifications ═══
UPDATE public.patient_comptes SET statut = 'suspendu' WHERE patient_id = :'A3';
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","app_metadata":{"role":"patient"}}'; SET ROLE authenticated;
SELECT essai.refuse('SELECT public.questionnaire_etat_patient()', 'compte suspendu : refusé');
RESET ROLE;
UPDATE public.patient_comptes SET statut = 'actif' WHERE patient_id = :'A3';
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id = :'A3';
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","app_metadata":{"role":"patient"}}'; SET ROLE authenticated;
SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom='sansddn'), '{"douleur":"oui"}');
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.questionnaires_patient WHERE patient_id = :'A3'), 'patient bloqué : déjà « notifié » (silence)');
-- blocage posé APRÈS le remplissage : purge par trigger
UPDATE public.patient_comptes SET notifications_bloquees_at = NULL WHERE patient_id = :'A1';
UPDATE public.questionnaires_patient SET notifie_at = NULL WHERE patient_id = :'A1';
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id = :'A1';
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.questionnaires_patient WHERE patient_id = :'A1'), 'blocage posé après coup : purge');

-- ═══ Suppression du patient = cascade ═══
DELETE FROM public.patients WHERE id = :'B1';
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaires_patient WHERE patient_id = :'B1') = 0, 'cascade à la suppression de la fiche');
-- Validation directe : fonction non appelable par le client
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse('SELECT public.questionnaire_valider(''adulte'', ''{"douleur":"oui"}'')', 'questionnaire_valider non exécutable par le client');
RESET ROLE;
SELECT 'TOUT_OK';
