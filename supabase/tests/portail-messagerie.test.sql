-- Attaques sur la MESSAGERIE (portail-messagerie-a/b1/b2/c/d) — base JETABLE. Ordre : prelude-programme-patient.sql,
-- portail-programme-patient.sql, -validations, -commenter, -mots, portail-notifications-blocage.sql, portail-messagerie-a-tables.sql,
-- -b1-patient-ecriture, -b2-patient-lecture, -c-praticien, -d-praticien-suivi, puis ce fichier. Finit par « TOUT_OK ». Données fictives.
\set ON_ERROR_STOP on
SET client_min_messages = warning;
ALTER TABLE public.patient_comptes ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, praticien_id, patient_id, auth_user_id, statut) ON public.patient_comptes TO authenticated;
DROP POLICY IF EXISTS select_praticien ON public.patient_comptes;
CREATE POLICY select_praticien ON public.patient_comptes FOR SELECT TO authenticated USING (praticien_id = auth.uid());
DROP POLICY IF EXISTS update_representant ON public.patient_comptes;
CREATE POLICY update_representant ON public.patient_comptes FOR UPDATE TO authenticated USING (praticien_id = auth.uid()) WITH CHECK (praticien_id = auth.uid());

DELETE FROM public.messages_portail; DELETE FROM public.programme_fins; DELETE FROM public.programme_validations; DELETE FROM public.programmes_patient;
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
-- Refus avec un message précis (le client s'en sert).
CREATE OR REPLACE FUNCTION essai.refuse_msg(req text, msg text, nom text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE req; RAISE EXCEPTION 'ECHEC (accepté à tort) : %', nom;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ECHEC (accepté%' THEN RAISE; END IF;
    IF SQLERRM <> msg THEN RAISE EXCEPTION 'ECHEC (mauvais message « % » au lieu de « % ») : %', SQLERRM, msg, nom; END IF;
    RAISE WARNING 'ok (refusé « % ») : %', msg, nom;
  END;
END $$;

\set PA '''{"sub":"00000000-0000-0000-0000-0000000000a1","app_metadata":{"role":"patient"}}'''
\set PA2 '''{"sub":"00000000-0000-0000-0000-0000000000a2","app_metadata":{"role":"patient"}}'''
\set PB '''{"sub":"00000000-0000-0000-0000-0000000000b1","app_metadata":{"role":"patient"}}'''
\set PRA '''{"sub":"00000000-0000-0000-0000-00000000000a"}'''
\set PRB '''{"sub":"00000000-0000-0000-0000-00000000000b"}'''
\set A1 '10000000-0000-0000-0000-0000000000a1'
\set A2 '10000000-0000-0000-0000-0000000000a2'
\set B1 '10000000-0000-0000-0000-0000000000b1'

-- ═══ Aucun accès direct aux tables ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse('SELECT * FROM public.messages_portail', 'patient : lecture directe interdite');
SELECT essai.refuse('INSERT INTO public.messages_portail(patient_id,praticien_id,sens,texte) VALUES (''10000000-0000-0000-0000-0000000000a1'',''00000000-0000-0000-0000-00000000000a'',''patient'',''x'')', 'patient : écriture directe interdite');
SELECT essai.refuse('SELECT * FROM public.messages_portail_versions', 'patient : versions illisibles');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse('SELECT * FROM public.messages_portail', 'praticien : lecture directe interdite');
SELECT essai.refuse('UPDATE public.messages_portail SET lu_at = now()', 'praticien : écriture directe interdite');
RESET ROLE;
SET ROLE anon;
SELECT essai.refuse('SELECT public.messagerie_envoyer_patient(''x'')', 'anonyme : envoi interdit');
SELECT essai.refuse('SELECT * FROM public.messagerie_lire_patient()', 'anonyme : lecture interdite');
RESET ROLE;

-- ═══ Le patient écrit ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('  Bonjour, une question  ') AS m1 \gset
SELECT essai.ctrl(:'m1' IS NOT NULL, 'patient : message envoyé');
SELECT essai.ctrl((SELECT texte FROM public.messagerie_lire_patient() WHERE id = :'m1') = 'Bonjour, une question', 'texte nettoyé aux extrémités');
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_patient(''   '')', 'texte_invalide', 'message vide refusé');
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_patient(NULL)', 'texte_invalide', 'message NULL refusé');
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_patient(repeat(''a'',1001))', 'texte_invalide', '1001 caractères refusés');
SELECT public.messagerie_envoyer_patient(repeat('é',1000)) AS m2 \gset
SELECT essai.ctrl(:'m2' IS NOT NULL, '1000 caractères acceptés');
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NULL AND lu_at IS NULL AND sens = 'patient' AND praticien_id = '00000000-0000-0000-0000-00000000000a' FROM public.messages_portail WHERE id = :'m1'), 'message : à notifier, non lu, bon praticien');

-- Le patient ne voit jamais lu_at ni notifie_at
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messagerie_lire_patient' AND column_name IN ('lu_at','notifie_at')), 'lecture patient : pas de colonne lu');
SELECT essai.ctrl((SELECT count(*) FROM public.messagerie_lire_patient()) = 2, 'patient : voit son fil (2)');
SELECT essai.ctrl((SELECT reste_s FROM public.messagerie_lire_patient() WHERE id = :'m1') BETWEEN 290 AND 300, 'reste_s ≈ 300');
RESET ROLE;
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname = 'messagerie_lire_patient' AND pg_get_function_result(p.oid) ~ 'lu_at|notifie_at'), 'signature patient sans lu_at');

-- ═══ Cadence : 5 / 10 min, 30 / 24 h, par patient ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('m3'); SELECT public.messagerie_envoyer_patient('m4'); SELECT public.messagerie_envoyer_patient('m5');
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_patient(''m6'')', 'trop_de_messages', '6e message en 10 min refusé');
RESET ROLE;
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.ctrl(public.messagerie_envoyer_patient('autre patient') IS NOT NULL, 'la limite est PAR patient');
RESET ROLE;
UPDATE public.messages_portail SET created_at = now() - interval '11 minutes' WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(public.messagerie_envoyer_patient('après 10 min') IS NOT NULL, 'après 10 min on peut réécrire');
RESET ROLE;
-- 30 messages dans les 24 h (on en fabrique 24 de plus, vieux d'1 h : 6 + 24 = 30)
INSERT INTO public.messages_portail(patient_id,praticien_id,sens,texte,created_at,notifie_at)
  SELECT :'A1','00000000-0000-0000-0000-00000000000a','patient','x',now() - interval '1 hour', now() FROM generate_series(1,24);
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_patient(''trop'')', 'trop_de_messages', '31e message en 24 h refusé');
RESET ROLE;
UPDATE public.messages_portail SET created_at = now() - interval '25 hours' WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('après 24 h') AS mj \gset
SELECT essai.ctrl(:'mj' IS NOT NULL, 'après 24 h on peut réécrire');
RESET ROLE;
DELETE FROM public.messages_portail WHERE patient_id = :'A1';
DELETE FROM public.messages_portail WHERE patient_id = :'A2';

-- ═══ Modification dans les 5 minutes, jamais de suppression ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('Original') AS p1 \gset
SELECT essai.ctrl(public.messagerie_modifier_patient(:'p1', ' Corrigé '), 'patient : modifie son message');
SELECT essai.ctrl((SELECT texte = 'Corrigé' AND modifie_at IS NOT NULL FROM public.messagerie_lire_patient() WHERE id = :'p1'), 'texte et horodatage de modification');
SELECT essai.refuse_msg('SELECT public.messagerie_modifier_patient(''' || :'p1' || ''', ''   '')', 'texte_invalide', 'modification vide refusée');
SELECT essai.refuse('DELETE FROM public.messages_portail', 'patient : suppression interdite');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) = 1 AND min(texte) = 'Original' FROM public.messages_portail_versions WHERE message_id = :'p1'), 'ancienne version conservée');
SET request.jwt.claims = :PA2; SET ROLE authenticated;
SELECT essai.refuse('SELECT public.messagerie_modifier_patient(''' || :'p1' || ''', ''pirate'')', 'un autre patient ne modifie pas ce message');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse('SELECT public.messagerie_modifier_praticien(''' || :'p1' || ''', ''pirate'')', 'le praticien ne modifie pas un message du patient');
SELECT essai.refuse('SELECT public.messagerie_modifier_patient(''' || :'p1' || ''', ''pirate'')', 'un praticien n''appelle pas la fonction patient');
SELECT essai.refuse('DELETE FROM public.messages_portail', 'praticien : suppression interdite');
RESET ROLE;
UPDATE public.messages_portail SET created_at = now() - interval '301 seconds' WHERE id = :'p1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.messagerie_modifier_patient(''' || :'p1' || ''', ''trop tard'')', 'delai_depasse', 'après 5 min : modification refusée');
SELECT essai.ctrl((SELECT reste_s = 0 FROM public.messagerie_lire_patient() WHERE id = :'p1'), 'reste_s = 0 après 5 min');
RESET ROLE;
UPDATE public.messages_portail SET created_at = now() - interval '299 seconds' WHERE id = :'p1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl(public.messagerie_modifier_patient(:'p1', 'Encore bon'), 'à 299 s : encore modifiable');
SELECT public.messagerie_modifier_patient(:'p1', 'v' || g) FROM generate_series(1,8) g;
SELECT essai.refuse_msg('SELECT public.messagerie_modifier_patient(''' || :'p1' || ''', ''de trop'')', 'trop_de_modifications', '11e modification refusée');
RESET ROLE;
DELETE FROM public.messages_portail WHERE patient_id = :'A1';

-- ═══ Praticien : lit, écrit, « Lu » ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('Question patient') AS q1 \gset
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) = 1 AND bool_and(lu_at IS NULL) FROM public.messagerie_lire_praticien(:'A1')), 'praticien : lit le fil, message non lu');
SELECT essai.ctrl((SELECT n FROM public.messagerie_non_lus_praticien() WHERE patient_id = :'A1') = 1, 'pastille praticien = 1');
SELECT essai.ctrl(public.messagerie_lu_praticien(:'A1') = 1, 'praticien : marque lu');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_non_lus_praticien()), 'plus de non-lu');
SELECT public.messagerie_envoyer_praticien(:'A1', 'Réponse du praticien') AS r1 \gset
RESET ROLE;
SELECT essai.ctrl((SELECT sens = 'praticien' AND notifie_at IS NULL AND lu_at IS NULL FROM public.messages_portail WHERE id = :'r1'), 'message praticien : e-mail à envoyer, non lu');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(EXISTS (SELECT 1 FROM public.messagerie_emails_a_envoyer() WHERE id = :'r1'), 'boîte d''essai : e-mail en attente');
SELECT essai.ctrl((SELECT lu_at IS NULL FROM public.messagerie_lire_praticien(:'A1') WHERE id = :'r1'), 'praticien : pas encore « Lu »');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_emails_a_envoyer() WHERE id = :'q1'), 'boîte d''essai : jamais un message du patient');
RESET ROLE;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT non_lus = 1 AND ouverte FROM public.messagerie_resume_patient()), 'patient : pastille = 1');
SELECT public.messagerie_envoyer_patient('message neuf') AS pn \gset
SELECT essai.ctrl(public.messagerie_lu_patient() = 1, 'patient : lit la réponse (1 seul message du praticien)');
SELECT essai.ctrl((SELECT non_lus = 0 FROM public.messagerie_resume_patient()), 'patient : pastille = 0');
RESET ROLE;
SELECT essai.ctrl((SELECT lu_at IS NULL FROM public.messages_portail WHERE id = :'pn'), 'le patient ne marque pas LUI-MÊME ses messages comme lus');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl((SELECT lu_at IS NOT NULL FROM public.messagerie_lire_praticien(:'A1') WHERE id = :'r1'), 'praticien : « Lu » sous son message');
SELECT essai.ctrl(public.messagerie_modifier_praticien(:'r1', 'Réponse corrigée'), 'praticien : modifie son message');
RESET ROLE;
UPDATE public.messages_portail SET created_at = now() - interval '301 seconds' WHERE id = :'r1';
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.messagerie_modifier_praticien(''' || :'r1' || ''', ''trop tard'')', 'delai_depasse', 'praticien : après 5 min, modification refusée');
SELECT essai.ctrl((SELECT reste_s = 0 FROM public.messagerie_lire_praticien(:'A1') WHERE id = :'r1'), 'praticien : reste_s = 0 après 5 min');
RESET ROLE;
UPDATE public.messages_portail SET created_at = now() WHERE id = :'r1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse('SELECT public.messagerie_modifier_patient(''' || :'r1' || ''', ''pirate'')', 'le patient ne modifie pas un message du praticien');
RESET ROLE;
SET request.jwt.claims = :PRB; SET ROLE authenticated;
SELECT essai.refuse('SELECT * FROM public.messagerie_lire_praticien(''' || :'A1' || ''')', 'autre praticien : lecture refusée');
SELECT essai.refuse('SELECT public.messagerie_envoyer_praticien(''' || :'A1' || ''', ''intrus'')', 'autre praticien : écriture refusée');
SELECT essai.refuse('SELECT public.messagerie_lu_praticien(''' || :'A1' || ''')', 'autre praticien : « lu » refusé');
SELECT essai.refuse('SELECT public.messagerie_modifier_praticien(''' || :'r1' || ''', ''intrus'')', 'autre praticien : modification refusée');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_non_lus_praticien()), 'autre praticien : aucune pastille');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_a_notifier()), 'autre praticien : rien à notifier');
SELECT essai.ctrl(public.messagerie_notifie(:'q1') = false, 'autre praticien : ne peut pas marquer notifié');
RESET ROLE;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse('SELECT * FROM public.messagerie_lire_praticien(''' || :'A1' || ''')', 'patient : fonction praticien refusée');
SELECT essai.refuse('SELECT public.messagerie_envoyer_praticien(''' || :'A1' || ''', ''je suis le praticien'')', 'patient : ne peut pas écrire en praticien');
SELECT essai.refuse('SELECT public.messagerie_lu_praticien(''' || :'A1' || ''')', 'patient : ne marque pas lu côté praticien');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_non_lus_praticien()), 'patient : aucune liste praticien');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_a_notifier()), 'patient : rien à notifier');
SELECT essai.refuse('SELECT public.messagerie_notifie(''' || :'q1' || ''')', 'patient : ne marque pas notifié');
SELECT essai.refuse('SELECT * FROM public.messagerie_emails_a_envoyer() WHERE false UNION ALL SELECT public.messagerie_notifie(''' || :'q1' || '''), NULL', 'patient : notifie interdit (bis)');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_emails_a_envoyer()), 'patient : boîte d''essai vide');
RESET ROLE;
SET request.jwt.claims = :PB; SET ROLE authenticated;
SELECT essai.ctrl((SELECT count(*) = 0 FROM public.messagerie_lire_patient()), 'un autre patient ne voit pas ce fil');
RESET ROLE;

-- ═══ Notification du message, une seule fois ═══
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(EXISTS (SELECT 1 FROM public.messagerie_a_notifier() WHERE id = :'q1'), 'à notifier : le message du patient');
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_a_notifier() WHERE id = :'r1'), 'à notifier : jamais un message du praticien');
SELECT essai.ctrl(public.messagerie_notifie(:'q1'), 'notifié une première fois');
SELECT essai.ctrl(NOT public.messagerie_notifie(:'q1'), 'une seule notification (2e appel = faux)');
SELECT essai.ctrl(NOT public.messagerie_notifie(:'r1'), 'un message du praticien ne se « notifie » pas');
RESET ROLE;

-- ═══ Patient BLOQUÉ : écrit, aucune notification ; le praticien lui écrit quand même ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('avant blocage') AS av \gset
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
UPDATE public.patient_comptes SET notifications_bloquees_at = now() WHERE patient_id = :'A1';
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.messages_portail WHERE id = :'av'), 'au blocage : le message en attente est réduit au silence');
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('pendant blocage') AS pb \gset
SELECT essai.ctrl((SELECT count(*) FROM public.messagerie_lire_patient() WHERE texte = 'pendant blocage') = 1, 'bloqué : le patient écrit et relit son message');
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NOT NULL FROM public.messages_portail WHERE id = :'pb'), 'bloqué : message inscrit « déjà notifié »');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_a_notifier() WHERE id IN (:'av'::uuid, :'pb'::uuid)), 'bloqué : rien à notifier');
SELECT essai.ctrl((SELECT count(*) FROM public.messagerie_lire_praticien(:'A1') WHERE id = :'pb') = 1, 'bloqué : message lisible par le praticien');
SELECT essai.ctrl((SELECT n FROM public.messagerie_non_lus_praticien() WHERE patient_id = :'A1') >= 1, 'bloqué : pastille de non-lus conservée');
SELECT public.messagerie_envoyer_praticien(:'A1', 'Réponse à un patient bloqué') AS rb \gset
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NULL FROM public.messages_portail WHERE id = :'rb'), 'bloqué : l''e-mail au patient part quand même');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
UPDATE public.patient_comptes SET notifications_bloquees_at = NULL WHERE patient_id = :'A1';
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messagerie_a_notifier() WHERE id IN (:'av'::uuid, :'pb'::uuid)), 'déblocage : rien de rétroactif');
RESET ROLE;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT public.messagerie_envoyer_patient('après déblocage') AS ad \gset
RESET ROLE;
SELECT essai.ctrl((SELECT notifie_at IS NULL FROM public.messages_portail WHERE id = :'ad'), 'après déblocage : notification normale');

-- ═══ Messagerie désactivée / accès fermé ═══
SET request.jwt.claims = :PA; SET ROLE authenticated;
UPDATE public.patient_comptes SET messagerie_desactivee_at = now();
SELECT essai.ctrl((SELECT count(*) = 0 FROM public.patient_comptes), 'patient : ne voit aucune ligne de comptes (ni l''interrupteur)');
RESET ROLE;
SELECT essai.ctrl((SELECT count(*) = 0 FROM public.patient_comptes WHERE messagerie_desactivee_at IS NOT NULL), 'patient : ne désactive pas la messagerie');
SET request.jwt.claims = :PRB; SET ROLE authenticated;
UPDATE public.patient_comptes SET messagerie_desactivee_at = now() WHERE patient_id = :'A1';
RESET ROLE;
SELECT essai.ctrl((SELECT messagerie_desactivee_at IS NULL FROM public.patient_comptes WHERE patient_id = :'A1'), 'autre praticien : ne désactive pas');
SET request.jwt.claims = :PRA; SET ROLE authenticated;
UPDATE public.patient_comptes SET messagerie_desactivee_at = now() WHERE patient_id = :'A1';
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_praticien(''' || :'A1' || ''', ''x'')', 'messagerie_desactivee', 'désactivée : le praticien n''écrit plus');
SELECT essai.refuse_msg('SELECT public.messagerie_modifier_praticien(''' || :'r1' || ''', ''x'')', 'messagerie_desactivee', 'désactivée : le praticien ne modifie plus');
SELECT essai.ctrl((SELECT count(*) > 0 AND NOT bool_or(ouverte) FROM public.messagerie_lire_praticien(:'A1')), 'désactivée : le praticien relit l''historique');
RESET ROLE;
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_patient(''x'')', 'messagerie_desactivee', 'désactivée : le patient n''écrit plus');
SELECT essai.refuse_msg('SELECT public.messagerie_modifier_patient(''' || :'ad' || ''', ''x'')', 'messagerie_desactivee', 'désactivée : le patient ne modifie plus');
SELECT essai.ctrl((SELECT count(*) > 0 FROM public.messagerie_lire_patient()), 'désactivée : le patient relit l''historique');
SELECT essai.ctrl((SELECT NOT ouverte FROM public.messagerie_resume_patient()), 'désactivée : le résumé le dit');
SELECT essai.ctrl((SELECT bool_and(reste_s = 0) FROM public.messagerie_lire_patient()), 'désactivée : plus de modification proposée');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
UPDATE public.patient_comptes SET messagerie_desactivee_at = NULL WHERE patient_id = :'A1';
SELECT essai.ctrl(public.messagerie_envoyer_praticien(:'A1', 'réactivée') IS NOT NULL, 'réactivée : le praticien écrit');
RESET ROLE;
UPDATE public.patient_comptes SET statut = 'suspendu' WHERE patient_id = :'A1';
SET request.jwt.claims = :PA; SET ROLE authenticated;
SELECT essai.refuse('SELECT public.messagerie_envoyer_patient(''x'')', 'accès suspendu : refus');
SELECT essai.refuse('SELECT * FROM public.messagerie_lire_patient()', 'accès suspendu : lecture refusée');
RESET ROLE;
SET request.jwt.claims = :PRA; SET ROLE authenticated;
SELECT essai.refuse_msg('SELECT public.messagerie_envoyer_praticien(''' || :'A1' || ''', ''x'')', 'messagerie_desactivee', 'accès suspendu : le praticien n''écrit pas');
RESET ROLE;
UPDATE public.patient_comptes SET statut = 'actif' WHERE patient_id = :'A1';

-- ═══ Suppression de la fiche : les messages partent avec ═══
DELETE FROM public.patients WHERE id = :'A2';
SELECT essai.ctrl(NOT EXISTS (SELECT 1 FROM public.messages_portail WHERE patient_id = :'A2'), 'fiche supprimée : messages supprimés');
SELECT essai.ctrl(true, 'TOUT_OK');
