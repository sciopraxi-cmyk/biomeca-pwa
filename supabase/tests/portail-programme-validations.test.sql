-- Attaques sur portail-programme-validations.sql — base JETABLE. Ordre : prelude-programme-patient.sql, portail-programme-patient.sql,
-- portail-programme-validations.sql, puis ce fichier. Finit par « TOUT_OK ». Personnes et exercices fictifs.
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
-- Horloge de test : « aujourd'hui » vient d'une table (la fonction réelle lit l'heure de Paris).
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

-- Praticien A dépose le programme : 26/10 = pied + express1 ; 27/10 (dernier jour) = pied + express2
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1',
 '{"debut":"2026-10-26","fin":"2026-10-27","jours":[{"date":"2026-10-26","seances":[{"id":"pied","exos":[["x"]]},{"id":"express1","exos":[["x"]]}]},{"date":"2026-10-27","seances":[{"id":"pied","exos":[["x"]]},{"id":"express2","exos":[["x"]]}]}]}'::jsonb);
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-26','pied',NULL)$q$, 'praticien : ne valide pas à la place du patient');
SELECT essai.refuse($q$INSERT INTO public.programme_validations(patient_id,praticien_id,jour,seance_id) VALUES ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','2026-10-26','pied')$q$, 'praticien : écriture directe refusée');
SELECT essai.refuse($q$INSERT INTO public.programme_fins(patient_id,praticien_id,programme_publie_at) VALUES ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a',now())$q$, 'praticien : fin écrite à la main refusée');
RESET ROLE;

-- Patient A1
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-27','pied',NULL)$q$, 'demain refusé');
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-25','pied',NULL)$q$, 'hier refusé');
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-26','express2',NULL)$q$, 'séance absente ce jour refusée');
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-26','inconnue',NULL)$q$, 'séance inconnue refusée');
SELECT essai.refuse($q$SELECT public.programme_seance_valider(NULL,'pied',NULL)$q$, 'jour vide refusé');
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-26',NULL,NULL)$q$, 'séance vide refusée');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations)=0, 'aucune validation après les refus');
SELECT essai.ctrl(public.programme_seance_valider('2026-10-26','pied',repeat('é',600)) = '{"deja":false,"termine":false}'::jsonb, 'validation du pied : acceptée, pas terminé');
SELECT essai.ctrl((SELECT char_length(commentaire) FROM public.programme_validations WHERE seance_id='pied')=500, 'commentaire coupé à 500');
SELECT essai.ctrl(public.programme_seance_valider('2026-10-26','pied','autre') = '{"deja":true,"termine":false}'::jsonb, 'deuxième validation : deja = true');
SELECT essai.ctrl((SELECT char_length(commentaire) FROM public.programme_validations WHERE seance_id='pied')=500 AND (SELECT count(*) FROM public.programme_validations)=1, 'rien écrasé, une seule ligne');
SELECT public.programme_seance_valider('2026-10-26','express1','   ');
SELECT essai.ctrl((SELECT commentaire FROM public.programme_validations WHERE seance_id='express1') IS NULL, 'commentaire vide = NULL');
SELECT essai.refuse($q$UPDATE public.programme_validations SET commentaire='x'$q$, 'patient : modification directe refusée');
SELECT essai.refuse($q$DELETE FROM public.programme_validations$q$, 'patient : suppression directe refusée');
SELECT essai.refuse($q$INSERT INTO public.programme_validations(patient_id,praticien_id,jour,seance_id) VALUES ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','2026-10-26','pied')$q$, 'patient : écriture directe refusée');
SELECT essai.refuse($q$SELECT public.programme_fin_notifiee('10000000-0000-0000-0000-0000000000a1')$q$, 'patient : ne marque pas la fin notifiée');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations)=2, 'patient : lit SES 2 validations');
RESET ROLE;
UPDATE essai.jour SET d='2026-10-27';
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl(public.programme_seance_valider('2026-10-27','pied','ok')->>'termine'='false', 'dernier jour, 1 séance sur 2 : pas de fin');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_fins)=0, 'aucune ligne de fin');
SELECT essai.ctrl(public.programme_seance_valider('2026-10-27','express2',NULL)->>'termine'='true', 'dernier jour, 2 séances sur 2 : fin');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_fins WHERE notifie_at IS NULL)=1, 'une ligne de fin, non notifiée');
SELECT termine_at AS t0 FROM public.programme_fins \gset
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_valider('2026-10-27','express2','encore');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_fins)=0, 'patient : ne lit pas la table des fins');
RESET ROLE;
SELECT essai.ctrl((SELECT termine_at FROM public.programme_fins)=:'t0'::timestamptz, 'revalider ne refait pas la fin');
-- Autres personnes
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations)=0, 'patient B1 : ne voit rien de A1');
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-27','pied',NULL)$q$, 'patient B1 sans programme : refusé');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1"}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-27','pied',NULL)$q$, 'compte patient sans le rôle patient dans le jeton : refusé');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations)=0 AND (SELECT count(*) FROM public.programme_fins)=0, 'praticien B : ne voit rien de A1');
SELECT essai.ctrl(public.programme_fin_notifiee('10000000-0000-0000-0000-0000000000a1') IS FALSE, 'praticien B : ne marque pas la fin de A1');
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at FROM public.programme_fins) IS NULL, 'fin toujours non notifiée');
SET ROLE anon;
SELECT essai.refuse($q$SELECT count(*) FROM public.programme_validations$q$, 'anonyme : lecture refusée');
SELECT essai.refuse($q$SELECT public.programme_seance_valider('2026-10-27','pied',NULL)$q$, 'anonyme : validation refusée');
RESET ROLE;
-- Praticien A : lit, notifie une seule fois
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations)=4, 'praticien A : lit les 4 validations');
SELECT essai.ctrl(public.programme_fin_notifiee('10000000-0000-0000-0000-0000000000a1') IS TRUE, 'praticien A : 1re notification');
SELECT essai.ctrl(public.programme_fin_notifiee('10000000-0000-0000-0000-0000000000a1') IS FALSE, 'praticien A : pas de 2e notification');
-- Nouveau programme publié : la fin suivante notifie de nouveau
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1',
 '{"debut":"2026-10-27","fin":"2026-10-27","jours":[{"date":"2026-10-27","seances":[{"id":"pied","exos":[["x"]]}]}]}'::jsonb);
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl(public.programme_seance_valider('2026-10-27','pied',NULL) = '{"deja":true,"termine":true}'::jsonb, 'nouveau programme, séance déjà validée : fin du nouveau programme');
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at FROM public.programme_fins) IS NULL, 'nouvelle fin : à notifier de nouveau');
SELECT 'TOUT_OK';
