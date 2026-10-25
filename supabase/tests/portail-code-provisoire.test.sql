-- Attaques sur le CODE PROVISOIRE (portail-code-provisoire.sql) — base JETABLE. Chaîne : celle du banc de la signature
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

-- En base jetable, les comptes ont été créés « actif » : on les passe en « initial » avec un code
UPDATE public.patient_comptes SET statut = 'initial', code_provisoire = 'ABCD-2345' WHERE patient_id = '10000000-0000-0000-0000-0000000000a3';
SELECT essai.ctrl((SELECT code_provisoire FROM public.patient_comptes WHERE patient_id = :'A3') = 'ABCD-2345', 'le code est enregistré (compte initial)');
SELECT essai.refuse('UPDATE public.patient_comptes SET code_provisoire = ''abc'' WHERE patient_id = ''10000000-0000-0000-0000-0000000000a3''', 'format du code contrôlé (minuscules refusées)');
SELECT essai.refuse('UPDATE public.patient_comptes SET code_provisoire = ''ABCD-0123'' WHERE patient_id = ''10000000-0000-0000-0000-0000000000a3''', 'caractères ambigus (0 1) refusés');
-- praticien A : lit le code de son patient
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.portail_code_provisoire(:'A3') = 'ABCD-2345', 'le praticien lit le code de son patient');
SELECT essai.ctrl(public.portail_code_provisoire(:'A1') IS NULL, 'compte sans code : NULL');
SELECT essai.refuse('SELECT code_provisoire FROM public.patient_comptes', 'le praticien ne lit pas la colonne en direct');
RESET ROLE;
-- praticien B : pas celui d'un autre
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl(public.portail_code_provisoire(:'A3') IS NULL, 'praticien B : NULL (pas son patient)');
RESET ROLE;
-- le patient : ni la fonction ni la colonne
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.portail_code_provisoire(''10000000-0000-0000-0000-0000000000a3'')', 'non autorisé', 'le patient n''appelle pas la fonction');
SELECT essai.refuse('SELECT code_provisoire FROM public.patient_comptes', 'le patient ne lit pas la colonne');
RESET ROLE;
SET ROLE anon;
SELECT essai.refuse('SELECT public.portail_code_provisoire(''10000000-0000-0000-0000-0000000000a3'')', 'anonyme refusé');
RESET ROLE;
-- le code disparaît dès que le compte n'est plus « initial » (garde de la base, même si le serveur oubliait)
UPDATE public.patient_comptes SET statut = 'actif' WHERE patient_id = :'A3';
SELECT essai.ctrl((SELECT code_provisoire IS NULL FROM public.patient_comptes WHERE patient_id = :'A3'), 'compte actif : code effacé par la base');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.portail_code_provisoire(:'A3') IS NULL, 'compte actif : la fonction ne renvoie plus rien');
RESET ROLE;
UPDATE public.patient_comptes SET statut = 'initial', code_provisoire = 'EFGH-6789' WHERE patient_id = :'A3';
UPDATE public.patient_comptes SET statut = 'suspendu' WHERE patient_id = :'A3';
SELECT essai.ctrl((SELECT code_provisoire IS NULL FROM public.patient_comptes WHERE patient_id = :'A3'), 'compte suspendu : code effacé');
INSERT INTO auth.users(id,email) VALUES ('00000000-0000-0000-0000-0000000000a4','pa4@exemple.invalid');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,statut,identifiant,code_provisoire) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a4','actif','QQQQ-0009','ABCD-2345') ON CONFLICT DO NOTHING;
SELECT essai.ctrl((SELECT count(*) FROM public.patient_comptes WHERE code_provisoire IS NOT NULL) = 0, 'aucun code ne subsiste sur un compte non initial');
SELECT 'TOUT_OK';
