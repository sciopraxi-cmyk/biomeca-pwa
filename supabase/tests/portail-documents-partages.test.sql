-- Attaques sur portail-documents-partages.sql — à rejouer sur une base de TEST (jamais la production).
-- Préparation : les mêmes tables que portail-patient-base.test.sql, plus facturation-documents.sql,
-- facturation-tiers-payant.sql, portail-patient-base.sql, portail-documents-partages.sql, storage.buckets
-- et storage.foldername. Chaque contrôle lève une exception s'il est faux ; finit par « TOUT_OK ».
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),
 ('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a2','pa2@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom,prenom,ddn) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif','Alice','2010-05-17'),
 ('10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a','Fictif','Sans','1990-01-01'),
 ('10000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-00000000000a','Fictif','Suspendu','1990-01-01'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif','Bruno','1980-01-02');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,identifiant,statut) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','AAAA-AAAA','actif'),
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a2','CCCC-CCCC','suspendu'),
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','BBBB-BBBB','actif');
INSERT INTO public.documents_facturation(id,user_id,type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva) VALUES
 ('30000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000a','devis','1','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',4000,'TVA non applicable'),
 ('30000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-00000000000a','devis','1','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',4000,'TVA non applicable'),
 ('30000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-00000000000b','devis','2','{"nom":"Fictif"}','{"nom":"Prat B"}','[{"libelle":"Acte"}]',5000,'TVA non applicable');

INSERT INTO storage.objects(bucket_id,name) VALUES
 ('patient-documents','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000001.html'),('patient-documents','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000002.html'),('patient-documents','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000003.html'),('patient-documents','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000004.html'),('patient-documents','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000005.html'),('patient-documents','10000000-0000-0000-0000-0000000000b1/f0000000-0000-0000-0000-000000000006.html');

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
GRANT SELECT ON public.documents_facturation TO authenticated;

-- ── Praticien B : émet son devis, dépose un fichier ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
SELECT public.emettre_document('30000000-0000-0000-0000-0000000000d3');
SELECT essai.ctrl(public.documents_partager_facturation('10000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-0000000000d3','10000000-0000-0000-0000-0000000000b1/f0000000-0000-0000-0000-000000000006.html') IS NOT NULL, 'praticien B : partage son devis');
INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-documents','10000000-0000-0000-0000-0000000000b1/aaaaaaaa-0000-0000-0000-00000000000b.html');
SELECT essai.ctrl(public.documents_partager_rapport('10000000-0000-0000-0000-0000000000b1','rb','Rapport B','2026-10-01','10000000-0000-0000-0000-0000000000b1/aaaaaaaa-0000-0000-0000-00000000000b.html') IS NOT NULL, 'praticien B : partage un rapport');
RESET ROLE;

-- ── Praticien A : partage ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.refuse($q$SELECT public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000001.html')$q$, 'brouillon : jamais partagé');
SELECT public.emettre_document('30000000-0000-0000-0000-0000000000d1');
SELECT essai.ctrl(public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000001.html') IS NOT NULL, 'praticien A : partage son devis émis');
SELECT public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000001.html');
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages WHERE type='devis')=1, 'partager deux fois = une seule copie');
SELECT essai.ctrl((SELECT contenu->>'numero' FROM public.documents_partages WHERE type='devis') ~ '^D-', 'copie construite côté serveur (numéro)');
SELECT essai.refuse($q$SELECT public.documents_partager_facturation('10000000-0000-0000-0000-0000000000b1','30000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000b1/f0000000-0000-0000-0000-000000000006.html')$q$, 'A ne partage pas vers le patient de B');
SELECT essai.refuse($q$SELECT public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000d3','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000001.html')$q$, 'A ne partage pas le devis de B');
SELECT essai.ctrl(public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000001.html') IS NULL, 'patient sans compte : rien copié');
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages WHERE patient_id='10000000-0000-0000-0000-0000000000a2')=0, 'patient sans compte : aucune ligne');
SELECT essai.ctrl(public.documents_partager_ordonnance('10000000-0000-0000-0000-0000000000a1','ordo-1','2026-10-02','{"id":"ordo-1","lignes":[{"texte":"Soin"}],"pirate":"x"}','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000002.html') IS NOT NULL, 'praticien A : partage une ordonnance');
SELECT essai.ctrl(NOT ((SELECT contenu FROM public.documents_partages WHERE type='ordonnance') ? 'pirate'), 'ordonnance : champs inconnus retirés');
SELECT essai.refuse($q$SELECT public.documents_partager_ordonnance('10000000-0000-0000-0000-0000000000a1','x','2026-10-02','[]','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000002.html')$q$, 'ordonnance : doit être un objet');
SELECT essai.refuse($q$SELECT public.documents_partager_ordonnance('10000000-0000-0000-0000-0000000000a1','x','2026-10-02',jsonb_build_object('note',repeat('x',450000)),'10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000002.html')$q$, 'ordonnance : taille bornée');
SELECT essai.refuse($q$SELECT public.documents_partager_ordonnance('10000000-0000-0000-0000-0000000000b1','x','2026-10-02','{"id":"x"}','10000000-0000-0000-0000-0000000000b1/f0000000-0000-0000-0000-000000000006.html')$q$, 'A ne partage pas d''ordonnance vers le patient de B');
INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-documents','10000000-0000-0000-0000-0000000000a1/bbbbbbbb-0000-0000-0000-00000000000a.html');
SELECT essai.refuse($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-documents','10000000-0000-0000-0000-0000000000b1/cccccccc-0000-0000-0000-00000000000a.html')$q$, 'A ne dépose pas de fichier chez le patient de B');
SELECT essai.ctrl(public.documents_partager_rapport('10000000-0000-0000-0000-0000000000a1','ra','Rapport A','2026-10-01','10000000-0000-0000-0000-0000000000a1/bbbbbbbb-0000-0000-0000-00000000000a.html') IS NOT NULL, 'praticien A : partage un rapport');
SELECT essai.refuse($q$SELECT public.documents_partager_rapport('10000000-0000-0000-0000-0000000000a1','rx','R','2026-10-01','10000000-0000-0000-0000-0000000000b1/aaaaaaaa-0000-0000-0000-00000000000b.html')$q$, 'rapport : chemin d''un autre patient refusé');
SELECT essai.refuse($q$SELECT public.documents_partager_rapport('10000000-0000-0000-0000-0000000000a1','rx','R','2026-10-01','10000000-0000-0000-0000-0000000000a1/dddddddd-0000-0000-0000-00000000000a.html')$q$, 'rapport : fichier absent refusé');
SELECT essai.refuse($q$SELECT public.documents_partager_rapport('10000000-0000-0000-0000-0000000000a1','rx','R','2026-10-01','10000000-0000-0000-0000-0000000000a1/../x.html')$q$, 'rapport : chemin tordu refusé');
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=3, 'praticien A : voit ses 3 documents, pas ceux de B');
SELECT essai.refuse($q$INSERT INTO public.documents_partages(praticien_id,patient_id,type,source_ref,titre,contenu,fichier_chemin) VALUES ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','devis','z','z','{}','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000004.html')$q$, 'praticien : pas d''insertion directe');
SELECT essai.refuse($q$UPDATE public.documents_partages SET titre='x'$q$, 'praticien : pas de modification directe');
SELECT essai.refuse($q$DELETE FROM public.documents_partages$q$, 'praticien : pas de suppression');
SELECT essai.refuse($q$DELETE FROM storage.objects WHERE bucket_id='patient-documents'$q$, 'praticien : pas de suppression de fichier');
RESET ROLE;
INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-documents','10000000-0000-0000-0000-0000000000a3/f0000000-0000-0000-0000-000000000007.html');
INSERT INTO public.documents_partages(praticien_id,patient_id,type,source_ref,titre,contenu,fichier_chemin)
 VALUES ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a3','ordonnance','s','Ordonnance suspendu','{"id":"s"}','10000000-0000-0000-0000-0000000000a3/f0000000-0000-0000-0000-000000000007.html');

-- ── Patient A1 ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=3, 'patient A1 : voit ses 3 documents');
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages WHERE patient_id <> '10000000-0000-0000-0000-0000000000a1')=0, 'patient A1 : aucun document d''un autre');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='patient-documents')=3, 'patient A1 : voit les fichiers de ses 3 documents');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE name LIKE '%f0000000-0000-0000-0000-000000000004%')=0, 'patient A1 : ne voit pas un fichier de son dossier non rattaché à un document');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE name LIKE '10000000-0000-0000-0000-0000000000b1/%')=0, 'patient A1 : ne voit pas le fichier de B');
SELECT essai.refuse($q$INSERT INTO public.documents_partages(praticien_id,patient_id,type,source_ref,titre,contenu,fichier_chemin) VALUES ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','devis','z','z','{}','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000004.html')$q$, 'patient : n''écrit aucun document');
SELECT essai.refuse($q$UPDATE public.documents_partages SET retire=true$q$, 'patient : ne retire rien lui-même');
SELECT essai.refuse($q$UPDATE public.documents_partages SET titre='x'$q$, 'patient : ne modifie aucun document');
SELECT essai.refuse($q$DELETE FROM public.documents_partages$q$, 'patient : ne supprime aucun document');
SELECT essai.refuse($q$INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-documents','10000000-0000-0000-0000-0000000000a1/eeeeeeee-0000-0000-0000-00000000000a.html')$q$, 'patient : ne dépose aucun fichier');
SELECT essai.refuse($q$SELECT public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a1','30000000-0000-0000-0000-0000000000d1','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000001.html')$q$, 'patient : ne partage rien');
SELECT essai.refuse($q$SELECT public.documents_partager_ordonnance('10000000-0000-0000-0000-0000000000a1','p','2026-10-02','{"id":"p"}','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000002.html')$q$, 'patient : ne crée pas d''ordonnance');
SELECT essai.refuse($q$SELECT public.documents_partages_retirer(id,true) FROM public.documents_partages$q$, 'patient : n''appelle pas retirer');
SELECT essai.ctrl((SELECT count(*) FROM public.documents_facturation)=0, 'patient : ne lit pas les documents de facturation');
SELECT public.portail_document_lu((SELECT id FROM public.documents_partages WHERE type='devis'));
SELECT essai.ctrl((SELECT lu_at FROM public.documents_partages WHERE type='devis') IS NOT NULL, 'patient : marque un document lu');
SELECT public.portail_document_lu((SELECT id FROM public.documents_partages WHERE type='ordonnance'));
RESET ROLE;
SELECT essai.ctrl((SELECT lu_at FROM public.documents_partages WHERE patient_id='10000000-0000-0000-0000-0000000000b1' AND type='devis') IS NULL, 'les documents de B restent non lus');
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.portail_document_lu((SELECT id FROM public.documents_partages WHERE type='rapport'));
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT public.portail_document_lu(d.id) FROM public.documents_partages d;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=2, 'patient B1 : voit ses 2 documents, jamais ceux de A');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages WHERE praticien_id='00000000-0000-0000-0000-00000000000a' AND lu_at IS NOT NULL)=3, 'B1 n''a marqué aucun document de A comme lu');

-- ── Retrait par le praticien ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
SELECT essai.ctrl(public.documents_partages_retirer((SELECT id FROM public.documents_partages WHERE type='devis' AND praticien_id='00000000-0000-0000-0000-00000000000a' LIMIT 1),true)=false, 'B ne retire pas un document de A');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl(public.documents_partages_retirer((SELECT id FROM public.documents_partages WHERE type='rapport'),true), 'A retire le rapport');
SELECT public.documents_partager_rapport('10000000-0000-0000-0000-0000000000a1','ra','Rapport A bis','2026-10-01','10000000-0000-0000-0000-0000000000a1/bbbbbbbb-0000-0000-0000-00000000000a.html');
SELECT essai.ctrl((SELECT retire FROM public.documents_partages WHERE type='rapport'), 'repartager ne remet pas un document retiré');
SELECT public.documents_partager_ordonnance('10000000-0000-0000-0000-0000000000a1','ordo-1','2026-10-02','{"id":"ordo-1","note":"maj"}','10000000-0000-0000-0000-0000000000a1/f0000000-0000-0000-0000-000000000003.html');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=2, 'patient A1 : ne voit plus le document retiré');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE name LIKE '%bbbbbbbb%')=0 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='patient-documents')=2, 'patient A1 : le fichier du document retiré est fermé');
SELECT essai.ctrl((SELECT contenu->>'note' FROM public.documents_partages WHERE type='ordonnance')='maj', 'la copie d''une ordonnance se met à jour');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
SELECT essai.ctrl(public.documents_partages_retirer((SELECT id FROM public.documents_partages WHERE type='rapport'),false), 'A remet le rapport');
RESET ROLE;
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=3 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='patient-documents')=3, 'patient A1 : revoit le document et son fichier');
RESET ROLE;

-- ── Compte suspendu ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=0, 'compte suspendu : aucun document');
SELECT essai.ctrl((SELECT count(*) FROM storage.objects WHERE bucket_id='patient-documents')=0, 'compte suspendu : aucun fichier');
RESET ROLE;
-- compte A1 suspendu à son tour : tout se ferme, puis se rouvre
UPDATE public.patient_comptes SET statut='suspendu' WHERE identifiant='AAAA-AAAA';
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}';
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages)=0 AND (SELECT count(*) FROM storage.objects WHERE bucket_id='patient-documents')=0, 'A1 suspendu : documents et fichiers fermés');
RESET ROLE;
UPDATE public.patient_comptes SET statut='actif' WHERE identifiant='AAAA-AAAA';

-- ── Anonyme ──
SET request.jwt.claims = '';
SET ROLE anon;
SELECT essai.refuse($q$SELECT * FROM public.documents_partages$q$, 'anonyme : pas de lecture');
SELECT essai.refuse($q$SELECT public.portail_document_lu(gen_random_uuid())$q$, 'anonyme : pas de portail_document_lu');
SELECT essai.refuse($q$SELECT public.documents_partages_retirer(gen_random_uuid(),true)$q$, 'anonyme : pas de retrait');
RESET ROLE;

-- ── Suppression de la fiche : les copies suivent ──
DELETE FROM public.patients WHERE id='10000000-0000-0000-0000-0000000000a1';
SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages WHERE patient_id='10000000-0000-0000-0000-0000000000a1')=0, 'fiche supprimée : les copies partagées disparaissent');
SELECT 'TOUT_OK' AS resultat;
