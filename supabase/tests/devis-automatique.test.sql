-- Attaques sur devis-automatique-a-parametres.sql — base de TEST jetable uniquement.
-- Préparation : prelude-programme-patient.sql, actes-catalogue.sql, actes-catalogue-remboursement.sql,
-- facturation-actes-categories.sql, facturation-documents.sql, facturation-tiers-payant.sql, puis la migration.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),
 ('00000000-0000-0000-0000-00000000000b','b@exemple.invalid');
CREATE SCHEMA IF NOT EXISTS essai;
GRANT USAGE ON SCHEMA essai TO PUBLIC;
CREATE OR REPLACE FUNCTION essai.ctrl(ok boolean, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF NOT ok THEN RAISE EXCEPTION 'ECHEC : %', nom; END IF; RAISE WARNING 'ok : %', nom; END $$;
CREATE OR REPLACE FUNCTION essai.refuse(req text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR unique_violation OR others THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    RAISE WARNING 'ok (refusé) : %', nom;
  END;
END $$;

-- ── Praticien A ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
INSERT INTO public.actes_catalogue(libelle, montant_cents, perso, sync_doctolib, devis_mode) VALUES ('Bilan podologique', 6000, true, true, 'semelles');
INSERT INTO public.actes_catalogue(libelle, montant_cents, perso) VALUES ('Consultation', 3000, true);
SELECT essai.ctrl((SELECT devis_mode FROM public.actes_catalogue WHERE libelle='Consultation') = 'simple', 'devis_mode : défaut simple');
SELECT essai.refuse($q$UPDATE public.actes_catalogue SET devis_mode='autre' WHERE libelle='Consultation'$q$, 'devis_mode inconnu refusé');
INSERT INTO public.devis_auto_parametres(secu_semelles_cents, secu_semelles_date, secu_semelles_source, complement_cents) VALUES (13500, '2026-10-01', 'Avenant 2026', 2500);
SELECT essai.ctrl((SELECT count(*) FROM public.devis_auto_parametres) = 1, 'A lit ses paramètres');
SELECT essai.refuse($q$INSERT INTO public.devis_auto_parametres(user_id, complement_cents) VALUES ('00000000-0000-0000-0000-00000000000b', 1)$q$, 'A ne crée pas de paramètres pour B');
SELECT essai.refuse($q$UPDATE public.devis_auto_parametres SET complement_cents = -1$q$, 'complément négatif refusé');
SELECT essai.refuse($q$UPDATE public.devis_auto_parametres SET secu_semelles_cents = 99999999$q$, 'montant Sécu hors borne refusé');
UPDATE public.devis_auto_parametres SET complement_cents = 3000;
SELECT essai.ctrl((SELECT complement_cents FROM public.devis_auto_parametres) = 3000, 'A modifie ses paramètres');
UPDATE public.devis_auto_parametres SET user_id = '00000000-0000-0000-0000-00000000000b';
SELECT essai.ctrl((SELECT count(*) FROM public.devis_auto_parametres) = 1, 'user_id jamais transféré');

-- devis automatique : un RDV = un devis
INSERT INTO public.documents_facturation(id,type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva,source_rdv)
 VALUES ('30000000-0000-0000-0000-0000000000d1','devis','1','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',6000,'TVA non applicable','rdv-001');
SELECT essai.refuse($q$INSERT INTO public.documents_facturation(type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva,source_rdv)
 VALUES ('devis','1','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',6000,'TVA non applicable','rdv-001')$q$, 'même RDV : second devis refusé');
INSERT INTO public.documents_facturation(type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva,source_rdv)
 VALUES ('devis','2','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',3000,'TVA non applicable','rdv-002');
INSERT INTO public.documents_facturation(type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva)
 VALUES ('devis','3','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',3000,'TVA non applicable');
INSERT INTO public.documents_facturation(type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva)
 VALUES ('devis','4','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',3000,'TVA non applicable');
SELECT essai.ctrl(true, 'plusieurs devis manuels sans RDV autorisés');
SELECT essai.refuse($q$UPDATE public.documents_facturation SET source_rdv='rdv-999' WHERE id='30000000-0000-0000-0000-0000000000d1'$q$, 'source_rdv jamais modifié (brouillon)');
SELECT essai.refuse($q$UPDATE public.documents_facturation SET source_rdv=NULL WHERE id='30000000-0000-0000-0000-0000000000d1'$q$, 'source_rdv jamais effacé');
SELECT public.emettre_document('30000000-0000-0000-0000-0000000000d1');
SELECT essai.ctrl((SELECT numero FROM public.documents_facturation WHERE id='30000000-0000-0000-0000-0000000000d1') ~ '^D-[0-9]{4}-0001$', 'émission : premier numéro continu');
SELECT essai.refuse($q$UPDATE public.documents_facturation SET total_cents=1 WHERE id='30000000-0000-0000-0000-0000000000d1'$q$, 'devis émis : montant figé');
SELECT essai.refuse($q$UPDATE public.documents_facturation SET tiers_payant=true WHERE id='30000000-0000-0000-0000-0000000000d1'$q$, 'devis émis : tiers payant figé (garde de tiers-payant conservée)');
SELECT essai.refuse($q$UPDATE public.documents_facturation SET source_rdv='rdv-999' WHERE id='30000000-0000-0000-0000-0000000000d1'$q$, 'source_rdv jamais modifié (émis)');
DELETE FROM public.documents_facturation WHERE id='30000000-0000-0000-0000-0000000000d1';
SELECT essai.ctrl((SELECT count(*) FROM public.documents_facturation WHERE id='30000000-0000-0000-0000-0000000000d1') = 1, 'devis émis : jamais supprimé');
RESET ROLE;

-- ── Suppression d'actes (actes-catalogue-supprimer-perso.sql) ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
SET ROLE authenticated;
INSERT INTO public.actes_catalogue(code, libelle, montant_cents, perso) VALUES ('POD-X', 'Référentiel', 1000, false);
DELETE FROM public.actes_catalogue WHERE code = 'POD-X';
SELECT essai.ctrl((SELECT count(*) FROM public.actes_catalogue WHERE code='POD-X') = 1, 'acte du référentiel : jamais supprimé');
DELETE FROM public.actes_catalogue WHERE libelle = 'Consultation';
SELECT essai.ctrl((SELECT count(*) FROM public.actes_catalogue WHERE libelle='Consultation') = 0, 'acte personnalisé : supprimé');
SELECT essai.ctrl((SELECT count(*) FROM public.documents_facturation WHERE source_rdv='rdv-001') = 1, 'documents intacts après suppression d''un acte');
RESET ROLE;

-- ── Praticien B : même identifiant de RDV chez lui = autorisé ; ne voit rien de A ──
SET request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
SET ROLE authenticated;
INSERT INTO public.documents_facturation(type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva,source_rdv)
 VALUES ('devis','1','{"nom":"Fictif"}','{"nom":"Prat B"}','[{"libelle":"Acte"}]',5000,'TVA non applicable','rdv-001');
SELECT essai.ctrl(true, 'B : même RDV que A autorisé (unicité par praticien)');
SELECT essai.ctrl((SELECT count(*) FROM public.devis_auto_parametres) = 0, 'B ne voit pas les paramètres de A');
SELECT essai.ctrl((SELECT count(*) FROM public.actes_catalogue) = 0, 'B ne voit pas le catalogue de A');
DELETE FROM public.actes_catalogue;
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.actes_catalogue WHERE libelle='Bilan podologique') = 1, 'B ne supprime pas le catalogue de A');
SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.documents_facturation) = 1, 'B ne voit que ses documents');
RESET ROLE;

-- ── Anonyme ──
SET ROLE anon;
SELECT essai.refuse($q$SELECT * FROM public.devis_auto_parametres$q$, 'anonyme : paramètres illisibles');
RESET ROLE;
SELECT 'TOUT_OK';
