-- Attaques sur la SIGNATURE DU DEVIS (portail-devis-signature-a1 … d) — base JETABLE. Lancer : /root/lancer_sql_sig.sh (prelude, chaîne portail + facturation, puis ce fichier).
-- Patients fictifs : a1 mineur (code), a2 adulte, b1 autre praticien. Finit par « TOUT_OK ».
\set ON_ERROR_STOP on
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS essai; GRANT USAGE ON SCHEMA essai TO PUBLIC;
CREATE OR REPLACE FUNCTION essai.ctrl(ok boolean, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'ECHEC : %', nom; END IF; RAISE WARNING 'ok : %', nom; END $$;
CREATE OR REPLACE FUNCTION essai.refuse_msg(req text, msg text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    IF msg <> '*' AND SQLERRM <> msg THEN RAISE EXCEPTION 'ECHEC (message « % » au lieu de « % ») : %', SQLERRM, msg, nom; END IF;
    RAISE WARNING 'ok (refusé « % ») : %', SQLERRM, nom;
  END;
END $$;
DROP TABLE IF EXISTS essai.mem; CREATE TABLE essai.mem(k text PRIMARY KEY, v text); GRANT ALL ON essai.mem TO PUBLIC;
DELETE FROM auth.users;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-0000-0000-00000000000a','a@exemple.invalid'),('00000000-0000-0000-0000-00000000000b','b@exemple.invalid'),
 ('00000000-0000-0000-0000-0000000000a1','pa@exemple.invalid'),('00000000-0000-0000-0000-0000000000a2','pa2@exemple.invalid'),('00000000-0000-0000-0000-0000000000b1','pb@exemple.invalid');
INSERT INTO public.patients(id,user_id,nom,prenom,ddn) VALUES
 ('10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a','Fictif','Alice', (current_date - interval '10 years')::date),
 ('10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a','Fictif','Adulte','1990-01-01'),
 ('10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000b','Fictif','Bruno','1980-01-02');
INSERT INTO public.patient_comptes(praticien_id,patient_id,auth_user_id,identifiant,statut) VALUES
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a1','AAAA-AAAA','actif'),
 ('00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a2','CCCC-CCCC','actif'),
 ('00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b1','BBBB-BBBB','actif');
-- Copies figées de devis : e1/e2 mineur valides, e3 mineur EXPIRÉ, e4 mineur RETIRÉ, e5/e7/e8 adulte, e6 patient de l'autre praticien.
INSERT INTO public.documents_partages(id,praticien_id,patient_id,type,source_ref,titre,fichier_chemin,contenu,retire)
SELECT ('50000000-0000-0000-0000-0000000000e' || n)::uuid, ('00000000-0000-0000-0000-00000000000' || CASE WHEN n = 6 THEN 'b' ELSE 'a' END)::uuid,
       ('10000000-0000-0000-0000-0000000000' || CASE WHEN n IN (5,7,8) THEN 'a2' WHEN n = 6 THEN 'b1' ELSE 'a1' END)::uuid,
       'devis', 's' || n, 'Devis D-' || n, 'x/f' || n || '.html',
       jsonb_build_object('numero', 'D-' || n, 'valide_jusqu_au', CASE WHEN n = 3 THEN current_date - 1 ELSE current_date + 30 END, 'total_cents', 4000), n = 4
  FROM generate_series(1, 8) n;
SELECT set_config('t.trace', 'data:image/png;base64,' || repeat('iVBORw0KGgo', 30), false);
\set PA '''{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}'''
\set PA2 '''{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"role":"patient"}}'''
\set PB '''{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}'''
\set PRA '''{"sub":"00000000-0000-0000-0000-00000000000a"}'''
\set PRB '''{"sub":"00000000-0000-0000-0000-00000000000b"}'''
\set E1 50000000-0000-0000-0000-0000000000e1
\set E2 50000000-0000-0000-0000-0000000000e2
\set E3 50000000-0000-0000-0000-0000000000e3
\set E4 50000000-0000-0000-0000-0000000000e4
\set E5 50000000-0000-0000-0000-0000000000e5
\set E6 50000000-0000-0000-0000-0000000000e6
\set E7 50000000-0000-0000-0000-0000000000e7
\set E8 50000000-0000-0000-0000-0000000000e8

SELECT essai.ctrl((SELECT count(*) FROM public.documents_partages WHERE empreinte ~ '^[0-9a-f]{64}$') = 8, 'empreinte SHA-256 posée sur chaque copie');
SELECT essai.ctrl((SELECT empreinte FROM public.documents_partages WHERE id = :'E1') = encode(sha256(convert_to((SELECT contenu::text FROM public.documents_partages WHERE id = :'E1'),'UTF8')),'hex'), 'empreinte = SHA-256 du contenu figé');

-- ═══ Aucun droit direct ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures) = 0, 'patient : ne voit aucune ligne de signature (politique praticien seulement)');
SELECT essai.refuse_msg('SELECT * FROM public.devis_signature_codes', '*', 'patient : lecture directe des codes interdite');
SELECT essai.refuse_msg('SELECT * FROM public.portail_reglages', '*', 'patient : réglages illisibles');
SELECT essai.refuse_msg('UPDATE public.portail_reglages SET valeur = ''1''', '*', 'patient : réglages non modifiables');
SELECT essai.refuse_msg($q$INSERT INTO public.devis_signatures(document_id,praticien_id,patient_id,numero,empreinte,trace,ip,mineur,code_verifie) VALUES ('50000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','D-1',repeat('a',64),current_setting('t.trace'),'1.1.1.1',false,false)$q$, '*', 'patient : pas d''insertion directe d''une signature');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg($q$INSERT INTO public.devis_signatures(document_id,praticien_id,patient_id,numero,empreinte,trace,ip,mineur,code_verifie) VALUES ('50000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a1','D-1',repeat('a',64),current_setting('t.trace'),'1.1.1.1',false,false)$q$, '*', 'praticien : ne fabrique pas de signature');
SELECT essai.refuse_msg($q$UPDATE public.documents_partages SET contenu = '{}'::jsonb WHERE id = '50000000-0000-0000-0000-0000000000e1'$q$, '*', 'praticien : ne modifie pas une copie figée');
SELECT essai.ctrl((SELECT count(*) FROM public.devis_etats_patient()) = 0, 'praticien : devis_etats_patient vide');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5','x','x')$q$, 'non autorisé', 'praticien : ne signe pas à la place du patient');
SELECT essai.refuse_msg($q$SELECT public.devis_signature_code_demander('50000000-0000-0000-0000-0000000000e1')$q$, 'non autorisé', 'praticien : ne demande pas de code');
RESET ROLE;

-- ═══ États vus par le patient ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_etats_patient()) = 3, 'patient a1 : voit 3 devis (ni retiré, ni d''un autre)');
SELECT essai.ctrl((SELECT expire AND NOT signable FROM public.devis_etats_patient() WHERE document_id = :'E3'), 'devis expiré : signalé, non signable');
SELECT essai.ctrl((SELECT signable AND mineur AND NOT expire FROM public.devis_etats_patient() WHERE document_id = :'E1'), 'devis valide : signable, mineur détecté');
SELECT essai.ctrl((SELECT count(*) FROM public.devis_etats_patient() WHERE document_id IN (:'E4', :'E5', :'E6')) = 0, 'retiré / autre patient / autre praticien : invisibles');
SELECT essai.refuse_msg($q$SELECT public.devis_signature_code_demander('50000000-0000-0000-0000-0000000000e3')$q$, 'devis_expire', 'devis expiré : pas de code');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e3', (SELECT empreinte FROM public.documents_partages WHERE id='50000000-0000-0000-0000-0000000000e3'), current_setting('t.trace'), '123456')$q$, 'devis_expire', 'devis expiré : signature refusée');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e4','x',current_setting('t.trace'),'123456')$q$, 'devis_introuvable', 'devis retiré : plus signable');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5','x',current_setting('t.trace'))$q$, 'devis_introuvable', 'devis d''un autre patient (même praticien)');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e6','x',current_setting('t.trace'))$q$, 'devis_introuvable', 'devis d''un autre praticien');
RESET ROLE;
SET request.jwt.claims = :PB; SET ROLE authenticated;
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e1','x',current_setting('t.trace'))$q$, 'devis_introuvable', 'patient b1 : ne signe pas le devis de a1');
RESET ROLE;

-- ═══ ADULTE : signature sans code ═══
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl((public.devis_signature_code_demander(:'E5')->>'requis')::boolean = false, 'adulte : aucun code demandé');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5','faux',current_setting('t.trace'))$q$, 'devis_modifie', 'empreinte fausse : refusée');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id='50000000-0000-0000-0000-0000000000e5'),'abc')$q$, 'trace_invalide', 'tracé invalide : refusé');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id='50000000-0000-0000-0000-0000000000e5'),'data:image/svg+xml;base64,AAAA')$q$, 'trace_invalide', 'tracé SVG refusé');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id='50000000-0000-0000-0000-0000000000e5'),'data:image/png;base64,AAAA')$q$, 'trace_invalide', 'tracé trop court refusé');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id='50000000-0000-0000-0000-0000000000e5'),'data:image/svg+xml;base64,' || repeat('A',300))$q$, 'trace_invalide', 'tracé SVG long refusé (seul le PNG passe)');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id='50000000-0000-0000-0000-0000000000e5'),'data:image/png;base64,' || repeat('A',150001))$q$, 'trace_invalide', 'tracé trop lourd refusé');
SELECT set_config('request.headers', '{"x-forwarded-for":"203.0.113.7, 10.0.0.1","user-agent":"Essai/1.0"}', false);
SELECT essai.ctrl((public.devis_signer(:'E5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id=:'E5'),current_setting('t.trace'))->>'ok')::boolean, 'adulte : signe');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e5',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id='50000000-0000-0000-0000-0000000000e5'),current_setting('t.trace'))$q$, 'deja_signe', 'signature unique : pas de seconde');
SELECT essai.ctrl((SELECT signe_at IS NOT NULL AND NOT signable FROM public.devis_etats_patient() WHERE document_id = :'E5'), 'état : signé, plus signable');
SELECT essai.refuse_msg($q$SELECT public.devis_signature_code_demander('50000000-0000-0000-0000-0000000000e5')$q$, 'deja_signe', 'devis signé : pas de code');
RESET ROLE;
SELECT essai.ctrl((SELECT ip = '203.0.113.7' AND user_agent = 'Essai/1.0' AND NOT mineur AND NOT code_verifie AND numero = 'D-5' AND signe_at > now() - interval '1 minute' FROM public.devis_signatures WHERE document_id = :'E5'), 'preuve : IP du serveur (1re de x-forwarded-for), agent, numéro, date');
SELECT essai.ctrl((SELECT empreinte FROM public.devis_signatures WHERE document_id = :'E5') = (SELECT empreinte FROM public.documents_partages WHERE id = :'E5'), 'preuve : empreinte du devis figé');
SELECT essai.refuse_msg($q$INSERT INTO public.devis_signatures(document_id,praticien_id,patient_id,numero,empreinte,trace,ip,mineur,code_verifie) VALUES ('50000000-0000-0000-0000-0000000000e8','00000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-0000000000a2','D-8',repeat('a',64),'data:image/svg+xml;base64,' || repeat('A',300),'1.1.1.1',false,false)$q$, '*', 'table : un tracé qui n''est pas un PNG est refusé même en insertion directe');
SELECT essai.refuse_msg($q$UPDATE public.devis_signatures SET ip = '9.9.9.9'$q$, 'signature_figee', 'signature : IP non modifiable');
SELECT essai.refuse_msg($q$UPDATE public.devis_signatures SET trace = trace || 'A'$q$, 'signature_figee', 'signature : tracé non modifiable');
SELECT essai.refuse_msg($q$UPDATE public.devis_signatures SET signe_at = now() + interval '1 day'$q$, 'signature_figee', 'signature : date non modifiable');
SELECT essai.refuse_msg($q$UPDATE public.documents_partages SET contenu = contenu || '{"total_cents": 1}' WHERE id = '50000000-0000-0000-0000-0000000000e5'$q$, 'devis_signe_fige', 'devis signé : contenu figé');
SELECT essai.refuse_msg($q$UPDATE public.documents_partages SET fichier_chemin = 'x/autre.html' WHERE id = '50000000-0000-0000-0000-0000000000e5'$q$, 'devis_signe_fige', 'devis signé : fichier figé');
SELECT essai.refuse_msg($q$UPDATE public.documents_partages SET titre = 'Devis falsifié' WHERE id = '50000000-0000-0000-0000-0000000000e5'$q$, 'devis_signe_fige', 'devis signé : titre figé');
-- Retrait (6a) : permis, la preuve reste ; le devis n'est plus listé.
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.documents_partages_retirer(:'E5', true), 'praticien : retire un devis signé');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures WHERE document_id = :'E5') = 1, 'retrait : la signature reste');
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_etats_patient() WHERE document_id = :'E5') = 0, 'retiré : invisible pour le patient');
RESET ROLE;
UPDATE public.documents_partages SET retire = false WHERE id = :'E5';

-- ═══ Visibilité de la preuve + notifications ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures) = 1, 'praticien a : lit sa signature (avec tracé)');
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures_a_notifier()) = 1, 'praticien a : 1 signature à notifier');
RESET ROLE;
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures) = 0, 'praticien b : ne lit pas la signature de a');
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures_a_notifier()) = 0, 'praticien b : rien à notifier');
SELECT essai.ctrl(NOT public.devis_signature_notifie((SELECT id FROM public.devis_signatures LIMIT 1)) , 'praticien b : ne marque pas la signature de a') WHERE false;
RESET ROLE;
INSERT INTO essai.mem SELECT 'sig5', id::text FROM public.devis_signatures WHERE document_id = :'E5';
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.ctrl(NOT public.devis_signature_notifie((SELECT v::uuid FROM essai.mem WHERE k = 'sig5')), 'praticien b : ne marque pas la signature de a');
RESET ROLE;
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT * FROM public.devis_signatures_a_notifier()', '*', 'patient : pas de liste de notifications') WHERE false;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures_a_notifier()) = 0, 'patient : liste de notifications vide');
SELECT essai.refuse_msg($q$SELECT public.devis_signature_notifie((SELECT v::uuid FROM essai.mem WHERE k = 'sig5'))$q$, 'non autorisé', 'patient : ne marque pas notifié');
RESET ROLE;
-- Patient bloqué : le blocage réduit au silence les signatures en attente (rien de rétroactif au déblocage).
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id = '10000000-0000-0000-0000-0000000000a2';
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.devis_signatures WHERE document_id = :'E5'), 'blocage : signature en attente réduite au silence');
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl((public.devis_signer(:'E7',(SELECT empreinte FROM public.devis_etats_patient() WHERE document_id=:'E7'),current_setting('t.trace'))->>'ok')::boolean, 'patient bloqué : signe quand même');
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.devis_signatures WHERE document_id = :'E7'), 'patient bloqué : signature inscrite « déjà notifiée »');
UPDATE public.patient_comptes SET notifications_bloquees_at = NULL WHERE patient_id = '10000000-0000-0000-0000-0000000000a2';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signatures_a_notifier()) = 0, 'déblocage : rien de rétroactif');
RESET ROLE;

-- ═══ Falsification du devis après affichage ═══
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT set_config('t.emp8', (SELECT empreinte FROM public.devis_etats_patient() WHERE document_id = :'E8'), false);
RESET ROLE;
UPDATE public.documents_partages SET contenu = jsonb_set(contenu, '{total_cents}', '99900') WHERE id = :'E8';
SELECT essai.ctrl((SELECT empreinte <> current_setting('t.emp8') FROM public.documents_partages WHERE id = :'E8'), 'devis modifié : nouvelle empreinte');
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e8', current_setting('t.emp8'), current_setting('t.trace'))$q$, 'devis_modifie', 'devis changé après affichage : signature refusée');
RESET ROLE;
ALTER TABLE public.documents_partages DISABLE TRIGGER documents_partages_empreinte;
UPDATE public.documents_partages SET contenu = jsonb_set(contenu, '{total_cents}', '1') WHERE id = :'E8';
ALTER TABLE public.documents_partages ENABLE TRIGGER documents_partages_empreinte;
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e8', (SELECT empreinte FROM public.documents_partages WHERE id='50000000-0000-0000-0000-0000000000e8' LIMIT 1), current_setting('t.trace'))$q$, 'devis_modifie', 'empreinte stockée trafiquée : recalcul serveur refuse');
RESET ROLE;

-- ═══ MINEUR : code ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT set_config('request.headers', '{"x-forwarded-for":"198.51.100.4"}', false);
SELECT set_config('t.emp1', (SELECT empreinte FROM public.devis_etats_patient() WHERE document_id = :'E1'), false);
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e1', current_setting('t.emp1'), current_setting('t.trace'))$q$, 'code_requis', 'mineur : sans code, refusé');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e1', current_setting('t.emp1'), current_setting('t.trace'), '123456')$q$, 'code_requis', 'mineur : aucun code émis, refusé');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e1', current_setting('t.emp1'), current_setting('t.trace'), 'abcdef')$q$, 'code_requis', 'mineur : code mal formé');
INSERT INTO essai.mem SELECT 'c1', public.devis_signature_code_demander(:'E1')->>'code_essai';
SELECT essai.ctrl((SELECT v ~ '^[0-9]{6}$' FROM essai.mem WHERE k='c1'), 'mineur : code à 6 chiffres (mode essai)');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signature_codes WHERE code_hash = (SELECT v FROM essai.mem WHERE k='c1')) = 0, 'code jamais stocké en clair');
SELECT essai.ctrl((SELECT expire_at BETWEEN now() + interval '9 minutes' AND now() + interval '10 minutes 5 seconds' FROM public.devis_signature_codes WHERE document_id = :'E1'), 'code valable 10 minutes');
INSERT INTO essai.mem SELECT 'faux1', CASE WHEN v = '000000' THEN '000001' ELSE '000000' END FROM essai.mem WHERE k = 'c1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='faux1'))->>'restants')::int = 4, 'mauvais code : 4 essais restants (compte conservé)');
SELECT essai.ctrl((public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='faux1'))->>'restants')::int = 3, 'mauvais code : 3 restants');
SELECT public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='faux1'));
SELECT public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='faux1'));
SELECT essai.ctrl((public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='faux1'))->>'restants')::int = 0, '5e mauvais code : 0 restant');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='c1'))$q$, 'code_requis', '5 échecs : même le bon code est refusé');
-- Nouveau code ; un code d'un AUTRE devis ne marche pas ; le bon code signe.
INSERT INTO essai.mem SELECT 'c1b', public.devis_signature_code_demander(:'E1')->>'code_essai';
INSERT INTO essai.mem SELECT 'd2', public.devis_signature_code_demander(:'E2')->>'code_essai';
SELECT essai.ctrl(NOT (public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='d2'))->>'ok')::boolean, 'code d''un autre devis : refusé');
SELECT essai.ctrl((public.devis_signer(:'E1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='c1b'))->>'ok')::boolean, 'mineur : bon code, signe');
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e1', current_setting('t.emp1'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='c1b'))$q$, 'deja_signe', 'code réutilisé : refusé');
RESET ROLE;
SELECT essai.ctrl((SELECT mineur AND code_verifie AND ip = '198.51.100.4' FROM public.devis_signatures WHERE document_id = :'E1'), 'preuve mineur : code vérifié, IP serveur');
SELECT essai.ctrl((SELECT count(*) FROM public.devis_signature_codes WHERE document_id = :'E1' AND utilise_at IS NULL) = 0, 'tous les codes du devis signé sont consommés');
-- Devis e2 : réglage « essai » coupé = jamais de code rendu ; limites ; expiration ; invalidation du précédent.
UPDATE public.portail_reglages SET valeur = '0' WHERE cle = 'signature_code_essai';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((public.devis_signature_code_demander(:'E2')->>'code_essai') IS NULL, 'mode essai coupé : le code n''est jamais rendu à l''écran');
RESET ROLE;
UPDATE public.portail_reglages SET valeur = '1' WHERE cle = 'signature_code_essai';
SET request.jwt.claims = :PA; SET ROLE authenticated;
INSERT INTO essai.mem SELECT 'e2', public.devis_signature_code_demander(:'E2')->>'code_essai';
RESET ROLE;
UPDATE public.devis_signature_codes SET expire_at = now() - interval '1 second' WHERE document_id = :'E2' AND utilise_at IS NULL;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT set_config('t.emp2', (SELECT empreinte FROM public.devis_etats_patient() WHERE document_id = :'E2'), false);
SELECT essai.refuse_msg($q$SELECT public.devis_signer('50000000-0000-0000-0000-0000000000e2', current_setting('t.emp2'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='e2'))$q$, 'code_requis', 'code expiré : refusé');
SELECT essai.refuse_msg($q$SELECT public.devis_signature_code_demander('50000000-0000-0000-0000-0000000000e2')$q$, 'trop_de_codes', '4e code en 15 min : refusé');
RESET ROLE;
UPDATE public.devis_signature_codes SET created_at = created_at - interval '20 minutes' WHERE document_id = :'E2';
SET request.jwt.claims = :PA; SET ROLE authenticated;
INSERT INTO essai.mem SELECT 'e3', public.devis_signature_code_demander(:'E2')->>'code_essai';
INSERT INTO essai.mem SELECT 'e4', public.devis_signature_code_demander(:'E2')->>'code_essai';
SELECT essai.ctrl(NOT (public.devis_signer(:'E2', current_setting('t.emp2'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='e3'))->>'ok')::boolean OR (SELECT v FROM essai.mem WHERE k='e3') = (SELECT v FROM essai.mem WHERE k='e4'), 'nouveau code : le précédent est invalidé');
SELECT set_config('request.headers', '', false);
SELECT essai.ctrl((public.devis_signer(:'E2', current_setting('t.emp2'), current_setting('t.trace'), (SELECT v FROM essai.mem WHERE k='e4'))->>'ok')::boolean, 'mineur : signe sans en-tête réseau');
RESET ROLE;
SELECT essai.ctrl((SELECT ip = 'inconnue' FROM public.devis_signatures WHERE document_id = :'E2'), 'sans en-tête : IP « inconnue » (jamais une valeur du client)');

-- ═══ Repartage : un devis signé ne bouge plus, un devis non signé se met à jour ═══
INSERT INTO storage.objects(bucket_id,name) VALUES ('patient-documents','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000071.html'),('patient-documents','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000072.html');
INSERT INTO public.documents_facturation(id,user_id,type,patient_ref,patient,emetteur,lignes,total_cents,mention_tva) VALUES
 ('30000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000a','devis','2','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',4000,'TVA non applicable'),
 ('30000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-00000000000a','devis','2','{"nom":"Fictif"}','{"nom":"Prat A"}','[{"libelle":"Acte"}]',4000,'TVA non applicable');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT public.emettre_document('30000000-0000-0000-0000-0000000000f1'); SELECT public.emettre_document('30000000-0000-0000-0000-0000000000f2');
INSERT INTO essai.mem SELECT 'p1', public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000071.html')::text;
INSERT INTO essai.mem SELECT 'p2', public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000072.html')::text;
RESET ROLE;
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT public.devis_signer((SELECT v::uuid FROM essai.mem WHERE k='p1'), (SELECT empreinte FROM public.devis_etats_patient() WHERE document_id=(SELECT v::uuid FROM essai.mem WHERE k='p1')), current_setting('t.trace'));
RESET ROLE;
ALTER TABLE public.documents_facturation DISABLE TRIGGER USER;
UPDATE public.documents_facturation SET total_cents = 9999, lignes = '[{"libelle":"Autre"}]' WHERE id IN ('30000000-0000-0000-0000-0000000000f1','30000000-0000-0000-0000-0000000000f2');
ALTER TABLE public.documents_facturation ENABLE TRIGGER USER;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000f1','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000071.html') = (SELECT v::uuid FROM essai.mem WHERE k='p1'), 'repartage d''un devis signé : même identifiant, sans erreur');
SELECT public.documents_partager_facturation('10000000-0000-0000-0000-0000000000a2','30000000-0000-0000-0000-0000000000f2','10000000-0000-0000-0000-0000000000a2/f0000000-0000-0000-0000-000000000072.html');
RESET ROLE;
SELECT essai.ctrl((SELECT (contenu ->> 'total_cents')::int = 4000 FROM public.documents_partages WHERE id = (SELECT v::uuid FROM essai.mem WHERE k='p1')), 'repartage : le devis SIGNÉ garde son contenu');
SELECT essai.ctrl((SELECT (contenu ->> 'total_cents')::int = 9999 FROM public.documents_partages WHERE id = (SELECT v::uuid FROM essai.mem WHERE k='p2')), 'repartage : un devis NON signé se met à jour');
DO $$ BEGIN RAISE WARNING 'TOUT_OK'; END $$;
