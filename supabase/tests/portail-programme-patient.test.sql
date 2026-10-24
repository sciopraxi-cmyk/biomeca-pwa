-- Attaques sur portail-programme-patient.sql — base JETABLE (prélude : prelude-programme-patient.sql, puis la migration).
-- Finit par « TOUT_OK ». Les personnes et exercices sont fictifs.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM public.programmes_patient; DELETE FROM public.patient_comptes; DELETE FROM public.patients; DELETE FROM auth.users;
DELETE FROM public.exercices_base; DELETE FROM public.exercices_perso; DELETE FROM storage.objects;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),('00000000-0000-0000-0000-0000000000a2','pa2@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif A1'),
 ('10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a','Fictif A2 sans compte'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif B1');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,statut) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','actif'),
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','actif');
INSERT INTO public.exercices_base(code,libelle,liens_youtube,pdf_fichier,texte) VALUES
 ('cat|ex1','Exercice un',ARRAY['https://youtu.be/AAAAAAAAAAA'],'assets/fiches/cat/1.pdf','Texte un'),
 ('cat|ex2','Exercice deux',ARRAY['https://youtu.be/BBBBBBBBBBB'],'base/aaaaaaaa-0000-0000-0000-000000000001.pdf',NULL);
INSERT INTO public.exercices_perso(id,user_id,libelle,liens_youtube,pdf_chemin) VALUES
 ('50000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Perso A',ARRAY['https://youtu.be/CCCCCCCCCCC'],'00000000-0000-0000-0000-00000000000a/p.pdf'),
 ('50000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Perso B',ARRAY['https://youtu.be/DDDDDDDDDDD'],NULL);
INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','base/aaaaaaaa-0000-0000-0000-000000000001.pdf'),('exercices-pdf','base/zzzzzzzz-0000-0000-0000-000000000009.pdf');

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
GRANT SELECT ON public.exercices_base, public.exercices_perso TO authenticated; -- comme en production : la RLS décide (aucune policy praticien sur la base)

-- ── Praticien A dépose ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base)=0, 'praticien : ne lit pas la base d''exercices (donc pas les liens)');
SELECT essai.ctrl(public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1',
 '{"debut":"2026-10-25","fin":"2026-10-26","noms":{"cat|ancien":"Ancien exercice"},"jours":[{"date":"2026-10-25","seances":[{"id":"pied","titre":"Programme du pied","exos":[["cat|ex1"],["cat|ex2","perso:50000000-0000-0000-0000-0000000000a1"],["perso:50000000-0000-0000-0000-0000000000b1"],["cat|ancien"],["cat|inconnu"]]}]}]}'::jsonb) IS NOT NULL, 'praticien A : dépôt accepté');
SELECT essai.ctrl((SELECT contenu->'catalogue'->'cat|ex1'->'liens'->>0 FROM public.programmes_patient)='https://youtu.be/AAAAAAAAAAA', 'copie : lien de la base ajouté côté serveur');
SELECT essai.ctrl((SELECT contenu->'catalogue'->'perso:50000000-0000-0000-0000-0000000000a1'->>'nom' FROM public.programmes_patient)='Perso A', 'copie : exercice perso du praticien');
SELECT essai.ctrl(NOT (SELECT contenu->'catalogue' ? 'perso:50000000-0000-0000-0000-0000000000b1' FROM public.programmes_patient), 'copie : exercice perso d''un AUTRE praticien refusé');
SELECT essai.ctrl((SELECT contenu->'catalogue'->'cat|ancien'->>'nom' FROM public.programmes_patient)='Ancien exercice', 'copie : exercice inconnu = nom de secours sans vidéo');
SELECT essai.ctrl(NOT (SELECT contenu->'catalogue' ? 'cat|inconnu' FROM public.programmes_patient), 'copie : code inconnu sans nom = absent');
SELECT essai.ctrl(public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a2','{"jours":[]}'::jsonb) IS NULL, 'patient sans compte portail : rien copié');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000b1','{"jours":[]}'::jsonb)$q$, 'praticien A : refusé sur le patient de B');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"x":1}'::jsonb)$q$, 'programme sans jours refusé');
SELECT essai.refuse($q$INSERT INTO public.programmes_patient(patient_id,praticien_id,contenu) VALUES ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','{}')$q$, 'écriture directe refusée');
SELECT essai.refuse($q$UPDATE public.programmes_patient SET contenu='{}'$q$, 'modification directe refusée');
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"debut":"2026-11-01","fin":"2026-11-02","jours":[]}'::jsonb);
SELECT essai.ctrl((SELECT count(*) FROM public.programmes_patient)=1 AND (SELECT contenu->>'debut' FROM public.programmes_patient)='2026-11-01', 'nouveau programme REMPLACE l''ancien (1 ligne)');
SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1',
 '{"debut":"2026-10-25","fin":"2026-10-26","jours":[{"date":"2026-10-25","seances":[{"id":"pied","exos":[["cat|ex2"]]}]}]}'::jsonb);
RESET ROLE;
-- Praticien B
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programmes_patient)=0, 'praticien B : ne voit pas le programme du patient de A');
RESET ROLE;
-- Patient A1
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programmes_patient)=1, 'patient A1 : lit SON programme');
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base)=0 AND (SELECT count(*) FROM public.exercices_perso)=0, 'patient : ne lit AUCUNE base d''exercices');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[]}'::jsonb)$q$, 'patient : ne dépose pas de programme');
SELECT essai.refuse($q$UPDATE public.programmes_patient SET contenu='{}'$q$, 'patient : ne modifie pas son programme');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=1, 'patient : ne voit que la fiche PDF de SA copie (1 sur 2)');
SELECT essai.ctrl((SELECT name FROM storage.objects WHERE bucket_id='exercices-pdf')='base/aaaaaaaa-0000-0000-0000-000000000001.pdf', 'patient : c''est la bonne fiche');
RESET ROLE;
-- Patient B1 : aucun programme, aucune fiche
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.programmes_patient)=0, 'patient B1 : ne voit pas le programme de A1');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=0, 'patient B1 : aucune fiche PDF privée');
RESET ROLE;
-- Anonyme
SET ROLE anon;
SELECT essai.refuse($q$SELECT count(*) FROM public.programmes_patient$q$, 'anonyme : refusé');
SELECT essai.refuse($q$SELECT public.programme_patient_deposer('10000000-0000-0000-0000-0000000000a1','{"jours":[]}'::jsonb)$q$, 'anonyme : ne dépose pas');
RESET ROLE;
SELECT 'TOUT_OK';
