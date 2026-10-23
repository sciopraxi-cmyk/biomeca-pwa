-- Attaques sur bibliotheque-exercices.sql — base JETABLE seulement. Finit par « TOUT_OK ».
-- Lancement : psql -v ON_ERROR_STOP=1 -v migration=/chemin/bibliotheque-exercices.sql -v migration2=/chemin/bibliotheque-exercices-suppression.sql -v migration3=/chemin/bibliotheque-exercices-pdf-base.sql -f bibliotheque-exercices.test.sql
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY, email text);
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt() ->> 'sub', '')::uuid $$;
CREATE TABLE IF NOT EXISTS storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE IF NOT EXISTS storage.objects(id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
CREATE OR REPLACE FUNCTION storage.foldername(n text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(n, '/') $$;
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),('00000000-0000-0000-0000-0000000000ad','contact@verticy.fr'),('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid') ON CONFLICT DO NOTHING;
\i :migration
\i :migration
\i :migration2
\i :migration2
\i :migration3
\i :migration3
CREATE SCHEMA IF NOT EXISTS essai; GRANT USAGE ON SCHEMA essai TO PUBLIC;
CREATE OR REPLACE FUNCTION essai.ctrl(ok boolean, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ECHEC : %', nom; END IF; RAISE WARNING 'ok : %', nom; END $$;
CREATE OR REPLACE FUNCTION essai.refuse(req text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    RAISE WARNING 'ok (refusé) : %', nom;
  END;
END $$;
GRANT EXECUTE ON FUNCTION essai.ctrl(boolean,text), essai.refuse(text,text) TO PUBLIC;

-- ADMIN
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"contact@verticy.fr"}';
SET ROLE authenticated;
INSERT INTO public.exercices_base_categories(id,code,libelle,bilans) VALUES ('c0000000-0000-0000-0000-000000000001','systeme-visuel','Système visuel','{sport,posturo}');
INSERT INTO public.exercices_base(categorie_id,code,libelle,liens_youtube,pdf_fichier,texte) VALUES
 ('c0000000-0000-0000-0000-000000000001','systeme-visuel|1','Fixation',ARRAY['https://www.youtube.com/watch?v=abcdefghijk','https://youtu.be/bcdefghijkl'],'assets/fiches/systeme-visuel/1.pdf','Texte secret'),
 ('c0000000-0000-0000-0000-000000000001','systeme-visuel|2','Poursuite','{}',NULL,NULL);
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base)=2, 'admin : écrit et lit la base');
SELECT essai.refuse($q$INSERT INTO public.exercices_base(categorie_id,code,libelle,liens_youtube) VALUES ('c0000000-0000-0000-0000-000000000001','x','X',ARRAY['https://evil.example/watch?v=abcdefghijk'])$q$, 'lien non YouTube refusé');
SELECT essai.refuse($q$INSERT INTO public.exercices_base(categorie_id,code,libelle,liens_youtube) VALUES ('c0000000-0000-0000-0000-000000000001','y','Y',ARRAY['https://youtu.be/bcdefghijkl','javascript:alert(1)'])$q$, 'javascript: refusé');
SELECT essai.refuse($q$INSERT INTO public.exercices_base(categorie_id,code,libelle) VALUES ('c0000000-0000-0000-0000-000000000001','systeme-visuel|1','Doublon')$q$, 'code unique');
SELECT essai.refuse($q$INSERT INTO public.exercices_base(categorie_id,code,libelle,liens_youtube) VALUES ('c0000000-0000-0000-0000-000000000001','z','Z',array_fill('https://youtu.be/bcdefghijkl'::text, ARRAY[21]))$q$, 'plus de 20 liens refusé');
SELECT essai.refuse($q$INSERT INTO public.exercices_base(categorie_id,code,libelle,liens_youtube) VALUES ('c0000000-0000-0000-0000-000000000001','w','W',ARRAY['https://youtu.be/bcdefghijkl',NULL])$q$, 'lien NULL dans la liste refusé');
RESET ROLE;

-- PRATICIEN A
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","email":"a@exemple.invalid"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base)=0, 'praticien : ne lit pas la base (liens invisibles)');
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base_categories)=0, 'praticien : ne lit pas les catégories de base directement');
SELECT essai.refuse($q$INSERT INTO public.exercices_base_categories(code,libelle) VALUES ('p','P')$q$, 'praticien : n''écrit pas dans la base');
CREATE TEMP TABLE n1 AS WITH u AS (UPDATE public.exercices_base SET liens_youtube='{}' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n1)=0, 'praticien : ne modifie pas la base (0 ligne touchée)');
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base_liste())=2, 'praticien : voit les 2 noms via la fonction');
SELECT essai.ctrl((SELECT a_video FROM public.exercices_base_liste() WHERE libelle='Fixation') AND NOT (SELECT a_video FROM public.exercices_base_liste() WHERE libelle='Poursuite'), 'praticien : sait seulement s''il y a une vidéo');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM jsonb_object_keys(to_jsonb((SELECT l FROM public.exercices_base_liste() l LIMIT 1))) k WHERE k IN ('liens_youtube','texte')), 'la fonction ne renvoie aucun lien ni texte');
INSERT INTO public.exercices_perso_categories(id,libelle) VALUES ('d0000000-0000-0000-0000-000000000001','Ma catégorie');
INSERT INTO public.exercices_perso(categorie_perso_id,libelle,liens_youtube) VALUES ('d0000000-0000-0000-0000-000000000001','Mon exo',ARRAY['https://youtu.be/abcdefghijk']);
INSERT INTO public.exercices_perso(categorie_base_id,libelle,texte) VALUES ('c0000000-0000-0000-0000-000000000001','Mon exo dans catégorie de base','Consigne');
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_perso)=2, 'praticien : crée ses exercices (catégorie perso ou de base)');
SELECT essai.refuse($q$INSERT INTO public.exercices_perso(libelle) VALUES ('Sans catégorie')$q$, 'une catégorie obligatoire');
SELECT essai.refuse($q$INSERT INTO public.exercices_perso(categorie_base_id,categorie_perso_id,libelle) VALUES ('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Deux')$q$, 'une seule catégorie');
SELECT essai.refuse($q$INSERT INTO public.exercices_perso(user_id,categorie_perso_id,libelle) VALUES ('00000000-0000-0000-0000-00000000000b','d0000000-0000-0000-0000-000000000001','Usurpation')$q$, 'pas d''écriture au nom d''un autre');
SELECT essai.refuse($q$DELETE FROM public.exercices_base$q$, 'praticien : ne supprime pas la base');
SELECT essai.refuse($q$DELETE FROM public.exercices_base_categories$q$, 'praticien : ne supprime pas les catégories de base');
SELECT essai.refuse($q$DELETE FROM public.exercices_perso_categories WHERE id='d0000000-0000-0000-0000-000000000001'$q$, 'catégorie encore utilisée : suppression refusée');
SELECT essai.refuse($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','00000000-0000-0000-0000-00000000000b/x.pdf')$q$, 'PDF : pas de dépôt chez un autre');
INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','00000000-0000-0000-0000-00000000000a/x.pdf');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=1, 'PDF : dépôt dans son dossier');
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','00000000-0000-0000-0000-00000000000b/y.pdf');

-- PRATICIEN B
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","email":"b@exemple.invalid"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_perso)=0 AND (SELECT count(*) FROM public.exercices_perso_categories)=0, 'B : ne voit rien de A');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=1 AND (SELECT count(*) FROM storage.objects WHERE name LIKE '%000a/%')=0, 'B : ne voit que son PDF');
CREATE TEMP TABLE n2 AS WITH u AS (UPDATE public.exercices_perso SET libelle='pirate' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n2)=0, 'B : 0 ligne de A touchée');
CREATE TEMP TABLE n3 AS WITH u AS (DELETE FROM public.exercices_perso RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n3)=0, 'B : ne supprime rien de A');
CREATE TEMP TABLE n4 AS WITH u AS (DELETE FROM storage.objects WHERE bucket_id='exercices-pdf' AND name LIKE '%000a/%' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n4)=0, 'B : ne supprime pas le PDF de A');
RESET ROLE;
SELECT essai.ctrl((SELECT libelle FROM public.exercices_perso WHERE libelle='pirate') IS NULL, 'rien modifié');
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","email":"a@exemple.invalid"}';
SET ROLE authenticated;
CREATE TEMP TABLE n5 AS WITH u AS (DELETE FROM public.exercices_perso WHERE libelle='Mon exo' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n5)=1, 'A : supprime son propre exercice');
CREATE TEMP TABLE n6 AS WITH u AS (DELETE FROM storage.objects WHERE bucket_id='exercices-pdf' AND name='00000000-0000-0000-0000-00000000000a/x.pdf' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n6)=1, 'A : supprime son propre PDF');
RESET ROLE;

-- ── PDF de la base ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"contact@verticy.fr"}';
SET ROLE authenticated;
INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','base/aaaaaaaa-0000-0000-0000-00000000000a.pdf');
UPDATE public.exercices_base SET pdf_fichier='base/aaaaaaaa-0000-0000-0000-00000000000a.pdf' WHERE code='systeme-visuel|2';
SELECT essai.ctrl((SELECT pdf_fichier FROM public.exercices_base_liste() WHERE libelle='Poursuite')='base/aaaaaaaa-0000-0000-0000-00000000000a.pdf', 'admin : remplacement visible dans la liste');
SELECT essai.refuse($q$UPDATE public.exercices_base SET pdf_fichier='../secret.pdf' WHERE code='systeme-visuel|2'$q$, 'chemin PDF libre refusé');
SELECT essai.refuse($q$UPDATE public.exercices_base SET pdf_fichier='base/../x.pdf' WHERE code='systeme-visuel|2'$q$, 'chemin avec .. refusé');
SELECT essai.refuse($q$UPDATE public.exercices_base SET pdf_fichier='http://evil.example/x.pdf' WHERE code='systeme-visuel|2'$q$, 'URL externe refusée');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","email":"a@exemple.invalid"}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE name='base/aaaaaaaa-0000-0000-0000-00000000000a.pdf')=1, 'praticien : lit le PDF de la base');
SELECT essai.refuse($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','base/bbbbbbbb-0000-0000-0000-00000000000b.pdf')$q$, 'praticien : ne dépose pas dans la base');
CREATE TEMP TABLE n8 AS WITH u AS (DELETE FROM storage.objects WHERE name LIKE 'base/%' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n8)=0, 'praticien : ne supprime pas un PDF de la base');
CREATE TEMP TABLE n9 AS WITH u AS (UPDATE public.exercices_base SET pdf_fichier=NULL RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n9)=0, 'praticien : ne modifie pas les fiches de la base');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000ad","email":"contact@verticy.fr"}';
SET ROLE authenticated;
UPDATE public.exercices_base SET pdf_fichier=NULL WHERE code='systeme-visuel|2';
SELECT essai.ctrl((SELECT a_pdf FROM public.exercices_base_liste() WHERE libelle='Poursuite')=false, 'admin : suppression de la fiche visible côté praticien');
CREATE TEMP TABLE n10 AS WITH u AS (DELETE FROM storage.objects WHERE name='base/aaaaaaaa-0000-0000-0000-00000000000a.pdf' RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n10)=1, 'admin : supprime le fichier remplacé');
RESET ROLE;

-- PATIENT
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"pa@exemple.invalid","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_perso)=0 AND (SELECT count(*) FROM public.exercices_base)=0, 'patient : aucune lecture directe');
SELECT essai.ctrl((SELECT count(*) FROM public.exercices_base_liste())=0, 'patient : la fonction ne renvoie rien');
SELECT essai.refuse($q$INSERT INTO public.exercices_perso_categories(libelle) VALUES ('P')$q$, 'patient : n''écrit pas');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='exercices-pdf')=0, 'patient : ne lit aucun PDF de la bibliothèque');
CREATE TEMP TABLE n7 AS WITH u AS (DELETE FROM public.exercices_perso RETURNING 1) SELECT count(*) AS n FROM u;
SELECT essai.ctrl((SELECT n FROM n7)=0, 'patient : ne supprime rien');
SELECT essai.refuse($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('exercices-pdf','00000000-0000-0000-0000-0000000000a1/p.pdf')$q$, 'patient : ne dépose pas de PDF');
-- faux admin : e-mail identique mais patient
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","email":"contact@verticy.fr","app_metadata":{"role":"patient"}}';
SELECT essai.refuse($q$INSERT INTO public.exercices_base_categories(code,libelle) VALUES ('faux','Faux')$q$, 'compte patient ne devient pas admin');
RESET ROLE;
-- anonyme
SET ROLE anon;
SELECT essai.refuse($q$SELECT * FROM public.exercices_base$q$, 'anonyme : aucun accès');
SELECT essai.refuse($q$SELECT * FROM public.exercices_base_liste()$q$, 'anonyme : pas de fonction');
RESET ROLE;
SELECT 'TOUT_OK';
