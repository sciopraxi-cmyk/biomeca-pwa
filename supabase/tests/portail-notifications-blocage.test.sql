-- Attaques sur portail-notifications-blocage.sql — base JETABLE. Ordre : prelude-programme-patient.sql, portail-programme-patient.sql,
-- portail-programme-validations.sql, portail-programme-commenter.sql, portail-programme-mots.sql, portail-notifications-blocage.sql,
-- puis ce fichier. Finit par « TOUT_OK ». Données fictives.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
-- RLS de patient_comptes comme en production (le prélude est volontairement minimal). Les droits sur la colonne
-- notifications_bloquees_at viennent UNIQUEMENT de la migration testée (aucun droit ajouté ici).
ALTER TABLE public.patient_comptes ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, praticien_id, patient_id, auth_user_id, statut) ON public.patient_comptes TO authenticated;
DROP POLICY IF EXISTS select_praticien ON public.patient_comptes;
CREATE POLICY select_praticien ON public.patient_comptes FOR SELECT TO authenticated USING (praticien_id = auth.uid());
DROP POLICY IF EXISTS update_representant ON public.patient_comptes;
CREATE POLICY update_representant ON public.patient_comptes FOR UPDATE TO authenticated USING (praticien_id = auth.uid()) WITH CHECK (praticien_id = auth.uid());
GRANT SELECT ON public.programme_validations, public.programme_fins TO authenticated;

DELETE FROM public.programme_fins; DELETE FROM public.programme_validations; DELETE FROM public.programmes_patient;
DELETE FROM public.patient_comptes; DELETE FROM public.patients; DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),('00000000-0000-0000-0000-0000000000a2','pa2@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif A1'),
 ('10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a','Fictif A2'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif B1');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,statut) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','actif'),
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','actif'),
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
 '{"debut":"2026-10-26","fin":"2026-10-26","jours":[{"date":"2026-10-26","seances":[{"id":"pied","exos":[["x"]]},{"id":"express1","exos":[["x"]]}]}]}'::jsonb);
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a2',
 '{"debut":"2026-10-26","fin":"2026-10-26","jours":[{"date":"2026-10-26","seances":[{"id":"pied","exos":[["x"]]}]}]}'::jsonb);
RESET ROLE;

-- Avant blocage : A1 écrit un mot (pied) → à notifier
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_valider('2026-10-26','pied','Avant blocage');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='pied' AND patient_id='10000000-0000-0000-0000-0000000000a1'), 'avant blocage : mot à notifier');

-- Le patient ne peut ni lire ni écrire l'interrupteur
SET ROLE authenticated;
UPDATE public.patient_comptes SET notifications_bloquees_at = now();
SELECT essai.ctrl((SELECT count(*) FROM public.patient_comptes)=0, 'patient : ne lit pas la table des comptes (ne voit pas le blocage)');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.patient_comptes WHERE notifications_bloquees_at IS NOT NULL)=0, 'patient : sa tentative de blocage n''a eu aucun effet');
-- Praticien B : ne peut pas bloquer les patients de A
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id = '10000000-0000-0000-0000-0000000000a1';
RESET ROLE;
SELECT essai.ctrl((SELECT notifications_bloquees_at IS NULL FROM public.patient_comptes WHERE patient_id='10000000-0000-0000-0000-0000000000a1'), 'praticien B : n''a aucun effet sur le patient de A');
SET ROLE authenticated;
SELECT essai.refuse($q$UPDATE public.patient_comptes SET statut='suspendu'$q$, 'praticien : ne modifie pas d''autre colonne');
RESET ROLE;

-- Praticien A bloque A1 : le mot en attente est réduit au silence
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id = '10000000-0000-0000-0000-0000000000a1';
SELECT essai.ctrl((SELECT notifications_bloquees_at IS NOT NULL FROM public.patient_comptes WHERE patient_id='10000000-0000-0000-0000-0000000000a1'), 'praticien A : bloque son patient');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NOT NULL AND commentaire='Avant blocage' FROM public.programme_validations WHERE seance_id='pied' AND patient_id='10000000-0000-0000-0000-0000000000a1'), 'au blocage : mot en attente réduit au silence, mot CONSERVÉ');

-- Pendant le blocage : A1 écrit, le mot est enregistré mais jamais « à notifier »
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_valider('2026-10-26','express1','Pendant blocage');
SELECT public.programme_seance_commenter('2026-10-26','pied','Corrigé pendant blocage');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations WHERE patient_id='10000000-0000-0000-0000-0000000000a1' AND commentaire IS NOT NULL)=2, 'pendant blocage : les 2 mots sont enregistrés');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations WHERE patient_id='10000000-0000-0000-0000-0000000000a1' AND mot_at IS NOT NULL AND mot_notifie_at IS NULL)=0, 'pendant blocage : aucun mot à notifier');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_fins WHERE patient_id='10000000-0000-0000-0000-0000000000a1' AND notifie_at IS NULL)=0, 'pendant blocage : fin de programme déjà notifiée (silence)');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_fins WHERE patient_id='10000000-0000-0000-0000-0000000000a1')=1, 'la fin de programme est bien enregistrée');

-- L'autre patient du même praticien n'est pas bloqué
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_valider('2026-10-26','pied','Je ne suis pas bloqué');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NULL AND mot_at IS NOT NULL FROM public.programme_validations WHERE patient_id='10000000-0000-0000-0000-0000000000a2'), 'autre patient : mot à notifier normalement');
SELECT essai.ctrl((SELECT count(*) FROM public.programme_fins WHERE patient_id='10000000-0000-0000-0000-0000000000a2' AND notifie_at IS NULL)=1, 'autre patient : fin de programme à notifier normalement');

-- Déblocage : rien de rétroactif, les nouveaux mots notifient de nouveau
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
UPDATE public.patient_comptes SET notifications_bloquees_at = NULL WHERE patient_id = '10000000-0000-0000-0000-0000000000a1';
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.programme_validations WHERE patient_id='10000000-0000-0000-0000-0000000000a1' AND mot_notifie_at IS NULL AND mot_at IS NOT NULL)=0, 'au déblocage : rien de rétroactif');
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_commenter('2026-10-26','pied','Après déblocage');
RESET ROLE;
SELECT essai.ctrl((SELECT mot_notifie_at IS NULL FROM public.programme_validations WHERE seance_id='pied' AND patient_id='10000000-0000-0000-0000-0000000000a1'), 'après déblocage : le nouveau mot notifie');

-- Les fonctions internes ne sont pas appelables par les clients
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.portail_notifications_bloquees('10000000-0000-0000-0000-0000000000a1')$q$, 'authenticated : ne lit pas l''état de blocage par fonction');
RESET ROLE;
SET ROLE anon;
SELECT essai.refuse($q$SELECT public.portail_notifications_bloquees('10000000-0000-0000-0000-0000000000a1')$q$, 'anonyme : refusé');
RESET ROLE;

-- Fin de programme pendant blocage, rejouée sur nouveau programme publié
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id='10000000-0000-0000-0000-0000000000a2';
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a2',
 '{"debut":"2026-10-26","fin":"2026-10-26","jours":[{"date":"2026-10-26","seances":[{"id":"pied","exos":[["x"]]}]}]}'::jsonb);
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.programme_fins WHERE patient_id='10000000-0000-0000-0000-0000000000a2'), 'blocage : la fin déjà en attente est réduite au silence');
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.programme_seance_valider('2026-10-26','pied',NULL);
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.programme_fins WHERE patient_id='10000000-0000-0000-0000-0000000000a2'), 'blocage : nouvelle fin de programme enregistrée mais silencieuse');
SELECT 'TOUT_OK';
