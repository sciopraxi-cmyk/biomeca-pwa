-- Attaques sur la PROGRAMMATION du questionnaire (portail-questionnaire-e1 à e4) — base JETABLE. Chaîne : celle du banc de la signature
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


CREATE TEMP TABLE ids(nom text, id uuid); GRANT ALL ON ids TO authenticated;
-- ═══ Programmation à J-3 ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000b1'', now() + interval ''7 days'', ''ag:x'')', 'non autorisé', 'praticien A : patient d''un autre praticien');
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000a1'', now() - interval ''1 hour'', ''ag:p'')', 'rdv_passe', 'RDV passé refusé');
INSERT INTO ids SELECT 'a1', public.questionnaire_demander(:'A1', now() + interval '7 days', 'ag:rdv-a1');
RESET ROLE;
SELECT essai.ctrl((SELECT visible_des BETWEEN now() + interval '4 days' - interval '1 minute' AND now() + interval '4 days' + interval '1 minute' FROM public.questionnaires_patient WHERE patient_id = :'A1'), 'RDV dans 7 jours : visible_des = RDV − 3 jours');
SELECT essai.ctrl((SELECT source_rdv = 'ag:rdv-a1' FROM public.questionnaires_patient WHERE patient_id = :'A1'), 'source_rdv enregistrée');
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() IS NULL, 'avant J-3 : le patient ne voit rien');
SELECT essai.refuse_msg('SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom=''a1''), ''{"douleur":"oui"}'')', 'questionnaire_introuvable', 'avant J-3 : le patient ne peut pas écrire');
RESET ROLE;
-- le serveur atteint J-3
UPDATE public.questionnaires_patient SET visible_des = now() - interval '1 minute' WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() ->> 'type' = 'adulte', 'à J-3 : le patient voit son questionnaire');
SELECT public.questionnaire_enregistrer((SELECT id FROM ids WHERE nom='a1'), '{"douleur":"oui"}');
SELECT essai.ctrl(public.questionnaire_etat_patient() -> 'reponses' ->> 'douleur' = 'oui', 'à J-3 : il peut répondre');
RESET ROLE;
-- idempotence par source
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_demander(:'A1', now() + interval '7 days', 'ag:rdv-a1') = (SELECT id FROM ids WHERE nom='a1'), 'même source : même questionnaire, pas de doublon');
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaires_patient WHERE patient_id = :'A1') = 1, 'un seul questionnaire pour ce patient');
SELECT essai.refuse_msg('SELECT public.questionnaire_demander(''10000000-0000-0000-0000-0000000000a1'', now() + interval ''9 days'', ''ag:autre-rdv'')', 'questionnaire_deja_ouvert', 'autre RDV, questionnaire déjà ouvert');
-- RDV proche : visible tout de suite
INSERT INTO ids SELECT 'a2', public.questionnaire_demander(:'A2', now() + interval '2 days', 'ag:rdv-a2');
INSERT INTO ids SELECT 'a3', public.questionnaire_demander(:'A3', NULL, NULL);
RESET ROLE;
SELECT essai.ctrl((SELECT visible_des IS NULL FROM public.questionnaires_patient WHERE patient_id = :'A2'), 'RDV dans 2 jours : visible tout de suite');
SELECT essai.ctrl((SELECT visible_des IS NULL AND source_rdv IS NULL AND rdv_at IS NULL FROM public.questionnaires_patient WHERE patient_id = :'A3'), 'sans RDV : visible tout de suite, comme avant');
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() ->> 'type' = 'enfant', 'RDV proche : le parent voit tout de suite le questionnaire enfant');
RESET ROLE;

-- ═══ Déplacer / annuler ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.questionnaire_replanifier(''ag:rdv-a1'', now() - interval ''1 day'')', 'rdv_passe', 'replanifier dans le passé refusé');
SELECT essai.ctrl(NOT public.questionnaire_replanifier('ag:inconnu', now() + interval '5 days'), 'source inconnue : rien');
RESET ROLE;
-- A2 est déjà visible : le RDV recule à 20 jours, le parent GARDE l'accès
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_replanifier('ag:rdv-a2', now() + interval '20 days'), 'RDV déplacé à 20 jours');
RESET ROLE;
SELECT essai.ctrl((SELECT visible_des IS NULL AND rdv_at > now() + interval '19 days' FROM public.questionnaires_patient WHERE patient_id = :'A2'), 'déjà visible : visible_des inchangé, rdv_at mis à jour');
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_etat_patient() IS NOT NULL, 'déjà visible : le parent garde son accès');
RESET ROLE;
-- A3 : pas de source ; un questionnaire pas encore visible se décale avec le RDV
UPDATE public.questionnaires_patient SET visible_des = now() + interval '2 days', rdv_at = now() + interval '5 days', source_rdv = 'ag:rdv-a3' WHERE patient_id = :'A3';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_replanifier('ag:rdv-a3', now() + interval '30 days'), 'pas encore visible : replanifié');
RESET ROLE;
SELECT essai.ctrl((SELECT visible_des BETWEEN now() + interval '27 days' - interval '1 minute' AND now() + interval '27 days' + interval '1 minute' FROM public.questionnaires_patient WHERE patient_id = :'A3'), 'pas encore visible : visible_des suit le nouveau RDV');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_replanifier('ag:rdv-a3', now() + interval '2 days'), 'RDV rapproché à 2 jours');
RESET ROLE;
SELECT essai.ctrl((SELECT visible_des IS NULL FROM public.questionnaires_patient WHERE patient_id = :'A3'), 'RDV rapproché : visible tout de suite');
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl(NOT public.questionnaire_replanifier('ag:rdv-a3', now() + interval '9 days'), 'praticien B ne replanifie pas le RDV d''un autre');
SELECT essai.ctrl(NOT public.questionnaire_retirer_source('ag:rdv-a3'), 'praticien B ne retire pas le questionnaire d''un autre');
RESET ROLE;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.questionnaire_replanifier(''ag:rdv-a3'', now() + interval ''9 days'')', 'non autorisé', 'le patient ne replanifie pas');
SELECT essai.refuse_msg('SELECT public.questionnaire_retirer_source(''ag:rdv-a3'')', 'non autorisé', 'le patient ne retire pas');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_retirer_source('ag:rdv-a3'), 'RDV annulé : questionnaire retiré');
SELECT essai.ctrl(NOT public.questionnaire_retirer_source('ag:rdv-a3'), 'retrait une seule fois');
SELECT essai.ctrl(NOT public.questionnaire_replanifier('ag:rdv-a3', now() + interval '9 days'), 'retiré : plus replanifiable');
INSERT INTO ids SELECT 'a3bis', public.questionnaire_demander(:'A3', now() + interval '6 days', 'ag:rdv-a3');
SELECT essai.ctrl((SELECT id FROM ids WHERE nom='a3bis') <> (SELECT id FROM ids WHERE nom='a3'), 'même source après retrait : nouveau questionnaire possible');
RESET ROLE;
SELECT essai.ctrl((SELECT retire_at IS NOT NULL FROM public.questionnaires_patient WHERE id = (SELECT id FROM ids WHERE nom='a3')), 'l''ancien reste retiré (historique)');

-- ═══ E-mails d'essai : envoi à signaler, rappel J-1 ═══
UPDATE public.questionnaires_patient SET envoi_signale_at = NULL, rappel_at = NULL WHERE retire_at IS NULL;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_envois_a_signaler() WHERE patient_id = :'A2') = 1, 'RDV proche, visible : envoi à signaler');
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_envois_a_signaler() WHERE patient_id = :'A3') = 0, 'pas encore visible (J-3 pas atteint) : rien à signaler');
RESET ROLE;
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_envois_a_signaler()) = 0, 'praticien B : rien à signaler');
SELECT essai.ctrl(NOT public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom='a2'), 'envoi'), 'praticien B ne marque pas');
RESET ROLE;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_envois_a_signaler()) = 0, 'le patient ne voit aucun envoi à signaler');
SELECT essai.refuse_msg('SELECT public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom=''a2''), ''envoi'')', 'non autorisé', 'le patient ne marque pas');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom=''a2''), ''autre'')', 'non autorisé', 'genre inconnu refusé');
SELECT essai.ctrl(public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom='a2'), 'envoi'), 'envoi signalé (1re fois)');
SELECT essai.ctrl(NOT public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom='a2'), 'envoi'), 'envoi signalé une seule fois');
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_envois_a_signaler() WHERE patient_id = :'A2') = 0, 'envoi déjà signalé : plus listé');
-- rappel : le RDV de A2 est à 20 jours -> pas de rappel ; on le met à demain, envoi signalé il y a 13 h
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire()) = 0, 'RDV lointain : pas de rappel');
RESET ROLE;
-- RDV lointain mais envoi ancien : toujours pas de rappel (le rappel attend J-1)
UPDATE public.questionnaires_patient SET rdv_at = now() + interval '20 days', envoi_signale_at = now() - interval '13 hours', rappel_at = NULL WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0, 'RDV dans 20 jours, envoi il y a 13 h : pas de rappel avant J-1');
RESET ROLE;
UPDATE public.questionnaires_patient SET rdv_at = now() + interval '20 hours', envoi_signale_at = now() - interval '13 hours' WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 1, 'RDV demain, non rempli, envoi il y a 13 h : rappel à faire');
RESET ROLE;
UPDATE public.questionnaires_patient SET envoi_signale_at = now() - interval '2 hours' WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0, 'envoi il y a moins de 12 h : pas de rappel (pas deux e-mails d''affilée)');
RESET ROLE;
UPDATE public.questionnaires_patient SET envoi_signale_at = now() - interval '13 hours' WHERE patient_id = :'A2';
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire()) = 0, 'praticien B : aucun rappel');
SELECT essai.ctrl(NOT public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom='a2'), 'rappel'), 'praticien B ne marque pas le rappel d''un autre');
RESET ROLE;
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire()) = 0, 'le parent ne voit aucun rappel à faire');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom='a2'), 'rappel'), 'rappel marqué (1re fois)');
SELECT essai.ctrl(NOT public.questionnaire_marquer_mail((SELECT id FROM ids WHERE nom='a2'), 'rappel'), 'rappel une seule fois');
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0, 'rappel fait : plus listé');
RESET ROLE;
-- rempli : jamais de rappel
UPDATE public.questionnaires_patient SET rappel_at = NULL, rempli_at = now() WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0, 'questionnaire rempli : pas de rappel');
RESET ROLE;
-- RDV passé, envoi ancien, non rempli : pas de rappel
UPDATE public.questionnaires_patient SET rappel_at = NULL, rempli_at = NULL, envoi_signale_at = now() - interval '30 hours', rdv_at = now() - interval '1 hour' WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0, 'RDV passé : pas de rappel (même avec un envoi ancien)');
RESET ROLE;
-- RDV passé : ni envoi ni rappel
UPDATE public.questionnaires_patient SET rappel_at = NULL, rempli_at = NULL, envoi_signale_at = NULL, rdv_at = now() - interval '1 hour' WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0 AND (SELECT count(*) FROM public.questionnaire_envois_a_signaler() WHERE patient_id = :'A2') = 0, 'RDV passé : ni envoi ni rappel');
RESET ROLE;
-- retiré : ni envoi ni rappel
UPDATE public.questionnaires_patient SET rdv_at = now() + interval '20 hours', envoi_signale_at = now() - interval '13 hours', retire_at = now() WHERE patient_id = :'A2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaire_rappels_a_faire() WHERE patient_id = :'A2') = 0, 'retiré : pas de rappel');
RESET ROLE;
-- accès direct aux nouvelles colonnes : le patient ne lit toujours rien
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.questionnaires_patient) = 0, 'patient : 0 ligne en lecture directe (colonnes de programmation comprises)');
RESET ROLE;
SELECT 'TOUT_OK';
