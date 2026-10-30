-- Attaques sur portail-programme-fiches.sql — base JETABLE (prélude, portail-programme-patient.sql, puis la migration fiches).
-- Se joue APRÈS portail-programme-patient.test.sql ou seul (il recrée ses données). Finit par « TOUT_OK ». Données fictives.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM public.programmes_patient; DELETE FROM public.patient_comptes; DELETE FROM public.patients; DELETE FROM auth.users;
DELETE FROM public.exercices_base; DELETE FROM public.exercices_perso; DELETE FROM storage.objects;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid'),
 ('00000000-0000-0000-0000-00000000000b','b@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif A1'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif B1');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,statut) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','actif'),
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','actif');
INSERT INTO public.exercices_base(code,libelle,liens_youtube,pdf_fichier,texte) VALUES
 ('cat|ex1','Exercice un',ARRAY['https://youtu.be/AAAAAAAAAAA'],'assets/fiches/cat/1.pdf','Texte un'),
 ('pathologies-pied|2. Achille','Programme de réathlétisation d''une tendinopathie d''Achille',ARRAY[]::text[],'base/ach00000-0000-0000-0000-000000000001.pdf',NULL),
 ('pathologies-genou|1. Bandelette','Programme de réathlétisation d''un syndrome de la bandelette ilio tibiale',ARRAY[]::text[],'base/ban00000-0000-0000-0000-000000000002.pdf',NULL),
 ('pathologies-hanche|1. Pubalgie','Programme de réathlétisation d''une pubalgie',ARRAY[]::text[],'base/pub00000-0000-0000-0000-000000000003.pdf',NULL);
INSERT INTO storage.objects(bucket_id,name) VALUES
 ('exercices-pdf','base/ach00000-0000-0000-0000-000000000001.pdf'),('exercices-pdf','base/ban00000-0000-0000-0000-000000000002.pdf'),
 ('exercices-pdf','base/pub00000-0000-0000-0000-000000000003.pdf');

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
GRANT SELECT ON public.exercices_base, public.exercices_perso TO authenticated;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
-- fiches seules, sans aucun jour
SELECT essai.ctrl(public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1',
 '{"jours":[],"fiches":["pathologies-pied|2. Achille","pathologies-hanche|1. Pubalgie","pathologies-pied|2. Achille","inconnu|zzz"]}'::jsonb) IS NOT NULL, 'dépôt de fiches seules (jours vides)');
SELECT essai.ctrl((SELECT contenu->'fiches' FROM public.programmes_patient) = '["pathologies-pied|2. Achille","pathologies-hanche|1. Pubalgie"]'::jsonb,
 'fiches : ordre reçu, sans doublon, fiche inconnue IGNORÉE (jamais inventée)');
SELECT essai.ctrl((SELECT contenu->'catalogue'->'pathologies-pied|2. Achille'->>'pdf' FROM public.programmes_patient)='base/ach00000-0000-0000-0000-000000000001.pdf',
 'fiche : PDF lu dans la bibliothèque côté serveur');
SELECT essai.ctrl(NOT (SELECT contenu->'catalogue' ? 'inconnu|zzz' FROM public.programmes_patient), 'fiche inconnue sans nom : absente du catalogue');
SELECT essai.ctrl((SELECT jsonb_array_length(contenu->'jours') FROM public.programmes_patient)=0, 'aucun jour, aucune séance, donc aucun chrono');
-- limites
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[],"fiches":["a","b","c","d","e","f","g","h","i","j","k","l","m"]}'::jsonb)$q$, '13 fiches refusées (12 au plus)');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[],"fiches":"pathologies-pied|2. Achille"}'::jsonb)$q$, 'fiches : une chaîne au lieu d''une liste refusée');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[],"fiches":{"a":1}}'::jsonb)$q$, 'fiches : un objet refusé');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000b1','{"jours":[],"fiches":["pathologies-pied|2. Achille"]}'::jsonb)$q$, 'praticien A : refusé sur le patient de B (fiches comprises)');
-- sans « fiches » : comme avant (liste vide), et le programme avec jours reste intact
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"debut":"2026-10-25","fin":"2026-10-25","jours":[{"date":"2026-10-25","seances":[{"id":"pied","exos":[["cat|ex1"]]}]}]}'::jsonb);
SELECT essai.ctrl((SELECT contenu->'fiches' FROM public.programmes_patient)='[]'::jsonb AND (SELECT contenu->'catalogue' ? 'cat|ex1' FROM public.programmes_patient), 'programme classique : fiches = [] et exercices du jour intacts');
-- jours + fiches ensemble
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"debut":"2026-10-25","fin":"2026-10-25","jours":[{"date":"2026-10-25","seances":[{"id":"pied","exos":[["cat|ex1"]]}]}],"fiches":["pathologies-genou|1. Bandelette"]}'::jsonb);
SELECT essai.ctrl((SELECT contenu->'fiches' FROM public.programmes_patient)='["pathologies-genou|1. Bandelette"]'::jsonb AND (SELECT contenu->'catalogue' ? 'cat|ex1' FROM public.programmes_patient), 'jours ET fiches dans la même copie');
-- null accepté comme « pas de fiches »
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[],"fiches":null}'::jsonb);
SELECT essai.ctrl((SELECT contenu->'fiches' FROM public.programmes_patient)='[]'::jsonb, 'fiches null = aucune fiche');
-- dépôt final pour les contrôles côté patient
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[],"fiches":["pathologies-pied|2. Achille"]}'::jsonb);
RESET ROLE;

SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT contenu->'fiches' FROM public.programmes_patient)='["pathologies-pied|2. Achille"]'::jsonb, 'patient : lit SA liste de fiches');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=1
  AND (SELECT name FROM storage.objects WHERE bucket_id='exercices-pdf')='base/ach00000-0000-0000-0000-000000000001.pdf',
  'patient : ne lit QUE le PDF de sa fiche (1 sur 3 de la bibliothèque)');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[],"fiches":["pathologies-pied|2. Achille"]}'::jsonb)$q$, 'patient : ne dépose pas de fiches');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programmes_patient)=0 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=0, 'autre patient : ni la liste ni les PDF');
RESET ROLE;
SELECT 'TOUT_OK' AS resultat;
