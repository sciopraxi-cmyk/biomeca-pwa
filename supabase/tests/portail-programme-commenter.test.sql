-- Attaques sur portail-programme-commenter.sql — base JETABLE. Ordre : prelude-programme-patient.sql, portail-programme-patient.sql,
-- portail-programme-validations.sql, portail-programme-commenter.sql, puis ce fichier. Finit par « TOUT_OK ». Données fictives.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM public.programme_fins; DELETE FROM public.programme_validations; DELETE FROM public.programmes_patient;
DELETE FROM public.patient_comptes; DELETE FROM public.patients; DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif A1'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif B1');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,statut) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','actif'),
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','actif');
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
DROP TABLE IF EXISTS essai.jour; CREATE TABLE essai.jour(d date); GRANT SELECT ON essai.jour TO PUBLIC;
INSERT INTO essai.jour VALUES ('2026-10-26');
CREATE OR REPLACE FUNCTION public.portail_aujourdhui() RETURNS date LANGUAGE sql STABLE AS $$ SELECT d FROM essai.jour $$;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1',
 '{"debut":"2026-10-26","fin":"2026-10-27","jours":[{"date":"2026-10-26","seances":[{"id":"pied","exos":[["x"]]},{"id":"express1","exos":[["x"]]}]},{"date":"2026-10-27","seances":[{"id":"pied","exos":[["x"]]}]}]}'::jsonb);
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','pied','x')$q$, 'praticien : n''écrit pas à la place du patient');
RESET ROLE;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','pied','avant validation')$q$, 'séance non validée : refusé');
SELECT public.programme_seance_valider('2026-10-26','pied',NULL);
SELECT essai.ctrl((SELECT commentaire FROM public.programme_validations WHERE seance_id='pied') IS NULL, 'validée sans mot');
SELECT essai.ctrl(public.programme_seance_commenter('2026-10-26','pied','  Un peu dur  ') IS TRUE, 'mot ajouté après la validation');
SELECT essai.ctrl((SELECT commentaire FROM public.programme_validations WHERE seance_id='pied')='Un peu dur', 'mot enregistré et nettoyé');
SELECT essai.ctrl(public.programme_seance_commenter('2026-10-26','pied',repeat('é',700)) IS TRUE, 'long mot accepté');
SELECT essai.ctrl((SELECT char_length(commentaire) FROM public.programme_validations WHERE seance_id='pied')=500, 'mot coupé à 500');
SELECT essai.ctrl(public.programme_seance_commenter('2026-10-26','pied','   ') IS TRUE, 'mot vide accepté');
SELECT essai.ctrl((SELECT commentaire FROM public.programme_validations WHERE seance_id='pied') IS NULL, 'mot vide = effacé');
SELECT public.programme_seance_commenter('2026-10-26','pied','corrigé');
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','express1','x')$q$, 'autre séance non validée : refusé');
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','inconnue','x')$q$, 'séance inconnue refusée');
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-27','pied','x')$q$, 'demain refusé');
SELECT essai.refuse($q$SELECT public.programme_seance_commenter(NULL,'pied','x')$q$, 'jour vide refusé');
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26',NULL,'x')$q$, 'séance vide refusée');
SELECT essai.refuse($q$UPDATE public.programme_validations SET commentaire='direct'$q$, 'modification directe refusée');
RESET ROLE;
SELECT essai.ctrl((SELECT commentaire FROM public.programme_validations WHERE seance_id='pied')='corrigé', 'le dernier mot est bien en base');

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','pied','x')$q$, 'jeton sans rôle patient : refusé');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','pied','piraté')$q$, 'autre patient : refusé');
RESET ROLE;
UPDATE essai.jour SET d='2026-10-27';
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-26','pied','trop tard')$q$, 'lendemain : mot figé');
RESET ROLE;
SELECT essai.ctrl((SELECT commentaire FROM public.programme_validations WHERE seance_id='pied')='corrigé', 'mot intact après les refus');
SET ROLE anon;
SELECT essai.refuse($q$SELECT public.programme_seance_commenter('2026-10-27','pied','x')$q$, 'anonyme : refusé');
RESET ROLE;
SELECT 'TOUT_OK';
