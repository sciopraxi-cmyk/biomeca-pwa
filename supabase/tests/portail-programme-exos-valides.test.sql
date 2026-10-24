-- Attaques sur portail-programme-exos-valides.sql — base JETABLE. Ordre : prelude-programme-patient.sql, portail-programme-patient.sql,
-- portail-programme-validations.sql, portail-programme-exos-valides.sql, puis ce fichier. Finit par « TOUT_OK ». Données fictives.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM public.programme_exos_valides; DELETE FROM public.programme_fins; DELETE FROM public.programme_validations;
DELETE FROM public.programmes_patient; DELETE FROM public.patient_comptes; DELETE FROM public.patients; DELETE FROM auth.users;
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
 '{"debut":"2026-10-26","fin":"2026-10-27","jours":[{"date":"2026-10-26","seances":[{"id":"express1","exos":[["x"],["x"],["x"],["x"]]},{"id":"pied","exos":[["x"]]}]},{"date":"2026-10-27","seances":[{"id":"pied","exos":[["x"]]}]}]}'::jsonb);
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','pied',0)$q$, 'praticien : ne valide pas à la place du patient');
SELECT essai.refuse($q$INSERT INTO public.programme_exos_valides(patient_id,praticien_id,jour,seance_id,exo) VALUES ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','2026-10-26','pied',0)$q$, 'praticien : écriture directe refusée');
RESET ROLE;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-27','pied',0)$q$, 'demain refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-25','pied',0)$q$, 'hier refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','express2',0)$q$, 'séance absente ce jour refusée');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','pied',1)$q$, 'exercice 2 d''une séance à 1 exercice refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','express1',4)$q$, 'exercice 5 d''une séance à 4 exercices refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','express1',-1)$q$, 'rang négatif refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','express1',99)$q$, 'rang 99 refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','express1',NULL)$q$, 'rang vide refusé');
SELECT essai.refuse($q$SELECT public.programme_exo_valider(NULL,'express1',0)$q$, 'jour vide refusé');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_exos_valides)=0, 'aucune ligne après les refus');
SELECT essai.ctrl(public.programme_exo_valider('2026-10-26','express1',0) IS TRUE, '1er exercice validé');
SELECT essai.ctrl(public.programme_exo_valider('2026-10-26','express1',0) IS FALSE, 'revalider : pas de doublon (false)');
SELECT public.programme_exo_valider('2026-10-26','express1',3);
SELECT public.programme_exo_valider('2026-10-26','pied',0);
SELECT essai.ctrl((SELECT count(*) FROM public.programme_exos_valides)=3, 'patient : lit SES 3 exercices validés');
SELECT essai.refuse($q$UPDATE public.programme_exos_valides SET exo=1$q$, 'patient : modification directe refusée');
SELECT essai.refuse($q$DELETE FROM public.programme_exos_valides$q$, 'patient : suppression directe refusée');
SELECT essai.refuse($q$INSERT INTO public.programme_exos_valides(patient_id,praticien_id,jour,seance_id,exo) VALUES ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','2026-10-26','pied',0)$q$, 'patient : écriture directe refusée');
RESET ROLE;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','express1',1)$q$, 'jeton sans le rôle patient : refusé');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_exos_valides)=0, 'patient B1 : ne voit rien de A1');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','pied',0)$q$, 'patient B1 sans programme : refusé');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_exos_valides)=0, 'praticien B : ne voit rien de A1');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_exos_valides)=3, 'praticien A : lit les 3 exercices validés');
RESET ROLE;
SET ROLE anon;
SELECT essai.refuse($q$SELECT count(*) FROM public.programme_exos_valides$q$, 'anonyme : lecture refusée');
SELECT essai.refuse($q$SELECT public.programme_exo_valider('2026-10-26','pied',0)$q$, 'anonyme : validation refusée');
RESET ROLE;
SELECT 'TOUT_OK';
