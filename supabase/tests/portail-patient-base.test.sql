-- Attaques sur portail-patient-base.sql — à rejouer sur une base de TEST (jamais la production).
-- Fournit des comptes fictifs ; chaque contrôle lève une exception s'il est faux, et finit par « TOUT_OK ».
-- Préparation : un schéma de test avec auth.users, auth.uid(), auth.jwt(), storage.objects, les rôles
-- anon / authenticated / service_role, public.patients et public.user_data (voir l'en-tête de la migration).
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),
 ('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom,prenom,ddn) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif','Alice','2010-05-17'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif','Bruno','1980-01-02');
INSERT INTO public.patient_comptes(id,praticien_id,patient_id,auth_user_id,identifiant,statut,ticket_nonce) VALUES
 ('20000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','AAAA-AAAA','actif','secret-a'),
 ('20000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','BBBB-BBBB','initial','secret-b');
INSERT INTO public.patient_connexions(compte_id,praticien_id,type) VALUES
 ('20000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','login_ok'),
 ('20000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','login_ok');

CREATE SCHEMA IF NOT EXISTS essai;
GRANT USAGE ON SCHEMA essai TO PUBLIC;
CREATE OR REPLACE FUNCTION essai.ctrl(ok boolean, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ECHEC : %', nom; END IF; RAISE WARNING 'ok : %', nom; END $$;
CREATE OR REPLACE FUNCTION essai.refuse(req text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    RAISE WARNING 'ok (refusé) : %', nom;
  END;
END $$;


-- ── Patient A1 (compte actif) ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.patient_comptes)=0, 'patient : ne lit aucun compte (ni le sien ni un autre)');
SELECT essai.ctrl((SELECT count(*) FROM public.patient_connexions)=0, 'patient : ne lit aucun journal');
SELECT essai.ctrl((SELECT count(*) FROM public.patients)=0, 'patient : ne lit aucune fiche patient');
SELECT essai.refuse($q$INSERT INTO public.patients(user_id,nom) VALUES ('00000000-0000-0000-0000-0000000000a1','x')$q$, 'patient : ne crée pas de fiche');
SELECT essai.refuse($q$INSERT INTO public.user_data(user_id,data) VALUES ('00000000-0000-0000-0000-0000000000a1','{}')$q$, 'patient : ne crée pas de dossier praticien');
SELECT essai.refuse($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-media','x')$q$, 'patient : n''écrit pas dans patient-media');
SELECT essai.refuse($q$UPDATE public.patient_comptes SET statut='actif'$q$, 'patient : ne modifie aucun compte');
SELECT essai.refuse($q$SELECT public.portail_reserver_tentative('BBBB-BBBB')$q$, 'patient : n''appelle pas le compteur');
SELECT essai.ctrl((public.portail_moi()->>'prenom')='Alice' AND (public.portail_moi()->>'mineur')='true', 'patient : portail_moi = sa seule fiche (prénom, mineur)');
SELECT essai.ctrl(public.portail_patient_actuel()='10000000-0000-0000-0000-0000000000a1', 'patient : portail_patient_actuel = sa fiche');
RESET ROLE;

-- ── Patient B1 (statut initial) : aucune donnée avant le choix du mot de passe ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl(public.portail_moi() = '{"statut":"initial"}'::jsonb, 'patient « initial » : ne reçoit que son statut');
SELECT essai.ctrl(public.portail_patient_actuel() IS NULL, 'patient « initial » : portail_patient_actuel vide');
RESET ROLE;

-- ── Jeton anonyme ──
SET request.jwt.claims = '';
SET ROLE anon;
SELECT essai.refuse($q$SELECT * FROM public.patient_comptes$q$, 'anonyme : pas de lecture des comptes');
SELECT essai.refuse($q$SELECT public.portail_moi()$q$, 'anonyme : pas de portail_moi');
RESET ROLE;

-- ── Praticien A ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.patient_comptes)=1, 'praticien : ne voit que ses comptes');
SELECT essai.ctrl((SELECT count(*) FROM public.patient_connexions)=1, 'praticien : ne voit que son journal');
SELECT essai.refuse($q$SELECT ticket_nonce FROM public.patient_comptes$q$, 'praticien : ne lit pas le billet');
SELECT essai.refuse($q$UPDATE public.patient_comptes SET statut='actif', essais_echoues=0$q$, 'praticien : ne modifie pas statut/essais');
SELECT essai.refuse($q$INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,identifiant) VALUES ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','ZZZZ-ZZZZ')$q$, 'praticien : ne crée pas de compte à la main');
SELECT essai.refuse($q$DELETE FROM public.patient_comptes$q$, 'praticien : ne supprime pas un compte à la main');
SELECT essai.refuse($q$INSERT INTO public.patient_connexions(type) VALUES ('x')$q$, 'praticien : n''écrit pas le journal');
UPDATE public.patient_comptes SET representant_legal_nom='Parent Fictif', representant_legal_lien='mère';
SELECT essai.ctrl((SELECT representant_legal_nom FROM public.patient_comptes)='Parent Fictif', 'praticien : renseigne le représentant légal');
SELECT essai.refuse($q$UPDATE public.patient_comptes SET representant_legal_nom=repeat('x',500)$q$, 'représentant : longueur bornée');
INSERT INTO public.patients(user_id,nom) VALUES ('00000000-0000-0000-0000-00000000000a','Fictif2');
SELECT essai.ctrl((SELECT count(*) FROM public.patients)=2, 'praticien : crée toujours ses fiches (la politique restrictive le laisse passer)');
-- tentative de modifier le compte d'un AUTRE praticien : 0 ligne touchée
WITH u AS (UPDATE public.patient_comptes SET representant_legal_nom='piraté' WHERE id='20000000-0000-0000-0000-0000000000b1' RETURNING 1)
SELECT essai.ctrl((SELECT count(*) FROM u)=0, 'praticien : ne touche pas le compte d''un autre praticien');
RESET ROLE;

-- ── Compteur d'essais : 5 puis blocage, remise à zéro à l'expiration ──
SELECT essai.ctrl(NOT (SELECT bloque FROM public.portail_reserver_tentative('bbbb-bbbb')), 'essai 1 permis (identifiant normalisé en majuscules)');
SELECT essai.ctrl(NOT (SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'essai 2 permis');
SELECT essai.ctrl(NOT (SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'essai 3 permis');
SELECT essai.ctrl(NOT (SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'essai 4 permis');
SELECT essai.ctrl(NOT (SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'essai 5 permis (le dernier)');
SELECT essai.ctrl((SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'essai 6 REFUSÉ : compte bloqué');
SELECT essai.ctrl((SELECT bloque_jusqu FROM public.patient_comptes WHERE identifiant='BBBB-BBBB') > now() + interval '14 minutes', 'blocage d''environ 15 minutes');
SELECT essai.ctrl((SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'essai 7 refusé aussi (le compteur ne bouge plus)');
SELECT essai.ctrl((SELECT count(*) FROM public.portail_reserver_tentative('INCONNU-0000') WHERE compte_id IS NOT NULL)=0, 'identifiant inconnu : aucune ligne');
UPDATE public.patient_comptes SET bloque_jusqu = now() - interval '1 second' WHERE identifiant='BBBB-BBBB';
SELECT essai.ctrl(NOT (SELECT bloque FROM public.portail_reserver_tentative('BBBB-BBBB')), 'après expiration : un essai est de nouveau permis');
SELECT essai.ctrl((SELECT essais_echoues FROM public.patient_comptes WHERE identifiant='BBBB-BBBB')=1, 'après expiration : compteur remis à 1');
SELECT public.portail_succes('20000000-0000-0000-0000-0000000000b1');
SELECT essai.ctrl((SELECT essais_echoues FROM public.patient_comptes WHERE identifiant='BBBB-BBBB')=0, 'succès : compteur à zéro');

-- ── Suppression de la fiche → compte Auth supprimé ──
DELETE FROM public.patients WHERE id='10000000-0000-0000-0000-0000000000b1';
SELECT essai.ctrl((SELECT count(*) FROM auth.users WHERE id='00000000-0000-0000-0000-0000000000b1')=0 AND (SELECT count(*) FROM public.patient_comptes WHERE identifiant='BBBB-BBBB')=0, 'fiche supprimée : compte patient et compte Auth supprimés');
DROP SCHEMA essai CASCADE;
SELECT 'TOUT_OK';
