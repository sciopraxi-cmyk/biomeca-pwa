-- Attaques sur portail-programme-mots.sql — base JETABLE. Ordre : prelude-programme-patient.sql, portail-programme-patient.sql,
-- portail-programme-validations.sql, portail-programme-commenter.sql, portail-programme-mots.sql, puis ce fichier. Finit par « TOUT_OK ».
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
 '{"debut":"2026-10-26","fin":"2026-10-26","jours":[{"date":"2026-10-26","seances":[{"id":"pied","exos":[["x"]]},{"id":"express1","exos":[["x"]]},{"id":"chauffe","exos":[["x"]]}]}]}'::jsonb);
RESET ROLE;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_valider('2026-10-26','pied',NULL);         -- sans mot
SELECT public.programme_seance_valider('2026-10-26','express1','Genou sensible'); -- avec mot
SELECT public.programme_seance_valider('2026-10-26','chauffe',NULL);
RESET ROLE;
SELECT essai.ctrl((SELECT mot_at IS NULL AND mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='pied'), 'sans mot : rien à notifier');
SELECT essai.ctrl((SELECT mot_at IS NOT NULL AND mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='express1'), 'mot envoyé avec la validation : à notifier');

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_commenter('2026-10-26','pied','Très fatigué');
SELECT public.programme_seance_commenter('2026-10-26','chauffe','   ');   -- vide : pas de notification
SELECT essai.refuse($q$UPDATE public.programme_validations SET mot_notifie_at = now()$q$, 'patient : ne touche pas à « notifié »');
SELECT essai.refuse($q$SELECT public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','pied')$q$, 'patient : ne marque pas notifié');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_at IS NOT NULL AND mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='pied'), 'mot ajouté après la validation : à notifier');
SELECT essai.ctrl((SELECT mot_at IS NULL FROM public.programme_validations WHERE seance_id='chauffe'), 'mot vide : pas à notifier');

-- Praticien B : ne voit rien, ne marque rien
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations WHERE mot_at IS NOT NULL AND mot_notifie_at IS NULL)=0, 'praticien B : ne voit aucun mot de A');
SELECT essai.ctrl(public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','pied') IS FALSE, 'praticien B : ne marque pas le mot de A');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='pied'), 'mot de A toujours à notifier');

-- Praticien A : liste, notifie UNE fois
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations WHERE mot_at IS NOT NULL AND mot_notifie_at IS NULL)=2, 'praticien A : 2 mots à notifier');
SELECT essai.ctrl(public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','pied') IS TRUE, '1re notification du mot « pied »');
SELECT essai.ctrl(public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','pied') IS FALSE, 'pas de 2e notification');
SELECT essai.ctrl(public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','chauffe') IS FALSE, 'mot vide : rien à marquer');
SELECT essai.ctrl(public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','express1') IS TRUE, '1re notification du mot « express1 »');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations WHERE mot_at IS NOT NULL AND mot_notifie_at IS NULL)=0, 'plus rien à notifier');
RESET ROLE;

-- Le patient corrige son mot : nouvelle notification. Même texte renvoyé : aucune.
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_commenter('2026-10-26','pied','Très fatigué');  -- identique
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NOT NULL FROM public.programme_validations WHERE seance_id='pied'), 'même texte renvoyé : pas de renotification');
SET ROLE authenticated;
SELECT public.programme_seance_commenter('2026-10-26','pied','Beaucoup mieux ce soir');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NULL AND mot_at IS NOT NULL FROM public.programme_validations WHERE seance_id='pied'), 'mot corrigé : à notifier de nouveau');
-- Le patient efface son mot : plus rien
SET ROLE authenticated;
SELECT public.programme_seance_commenter('2026-10-26','pied',NULL);
RESET ROLE;
SELECT essai.ctrl((SELECT mot_at IS NULL AND mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='pied'), 'mot effacé : plus à notifier');

-- Anonyme et jeton patient
SET ROLE anon;
SELECT essai.refuse($q$SELECT public.programme_mot_notifie('10000000-0000-0000-0000-0000000000a1','2026-10-26','pied')$q$, 'anonyme : refusé');
RESET ROLE;

-- Rattrapage des anciens mots : marqués déjà notifiés (rejeu de la migration sur des données existantes)
UPDATE public.programme_validations SET mot_at = NULL, mot_notifie_at = NULL WHERE seance_id = 'express1';
\i migrations/portail-programme-mots.sql
SELECT essai.ctrl((SELECT mot_at IS NOT NULL AND mot_notifie_at IS NOT NULL FROM public.programme_validations WHERE seance_id='express1'), 'ancien mot : marqué déjà notifié par la migration');
SELECT essai.ctrl((SELECT mot_at IS NULL FROM public.programme_validations WHERE seance_id='pied'), 'la migration rejouée ne touche pas aux autres');
SELECT 'TOUT_OK';
