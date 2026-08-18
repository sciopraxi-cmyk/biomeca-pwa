-- API partenaire v1 — table de liaison des licences + compteur de débit.
-- Contrat : docs/api-partenaire-v1.md
--
-- ⚠️ À exécuter dans le SQL Editor Supabase AVANT de déployer l'Edge Function
-- api-partenaire. Déployée en premier, la fonction interrogerait des relations
-- inexistantes et répondrait 503 à CHAQUE appel PODAXIA. Même contrainte
-- d'ordre que #223-A / #226-A, transposée : là-bas une colonne inconnue
-- cassait l'upsert PostgREST, ici c'est une lecture sur relation absente.
--
-- Idempotent : CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Rejouable sans risque et sans effet.
--
-- Frontière santé (contrat § 1) : aucune donnée de santé, aucune donnée de
-- patient ici. Liaison commerciale uniquement.

-- ═══════════════════════════════════════════════════════════════════
-- partner_licences — un licence_id par cabinet et par partenaire
-- ═══════════════════════════════════════════════════════════════════
-- licence_id est l'identifiant EXPOSÉ à PODAXIA. uuid aléatoire
-- (gen_random_uuid), jamais séquentiel : la clé d'authentification étant
-- unique pour tout PODAXIA, un identifiant devinable permettrait d'énumérer
-- l'activité de tous les cabinets en incrémentant un entier (contrat § 7.2).
--
-- Ce n'est PAS l'user_id du praticien : un identifiant dédié au partenariat,
-- qui ne joint rien de la base clinique hors de cette table.
CREATE TABLE IF NOT EXISTS public.partner_licences (
  licence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Code du partenaire ('PODAXIA'). Prévu au pluriel dès maintenant : un
  -- second partenaire n'exigera pas de migration, seulement une seconde clé.
  partner_code text NOT NULL,
  -- Référence client côté PODAXIA : courriel ou n° de commande transmis lors
  -- de la demande d'activation.
  --
  -- Usage STRICTEMENT INTERNE — traçabilité et rapprochement. Elle adosse
  -- noir sur blanc chaque licence_id émis à un client PODAXIA précis : deux
  -- activations qui se croisent ne peuvent pas se voir attribuer le mauvais
  -- licence_id.
  --
  -- ⚠️ JAMAIS exposée par l'API. Elle ne figure dans AUCUNE réponse — l'objet
  -- de réponse du contrat § 4.2 est clos, cette colonne n'en fait pas partie
  -- et ne doit jamais y être ajoutée.
  --
  -- Nullable : les licences émises à la main avant l'automatisation n'en ont
  -- pas. Le webhook d'activation (#240-quater) la rendra obligatoire côté
  -- appelant.
  partner_ref text,
  -- Révocation : on désactive, on ne supprime pas — la ligne reste pour la
  -- traçabilité. Une licence inactive répond le 404 indistinct du § 7.1.
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Idempotence de l'activation automatique (#240-quater) : partner_ref est la
-- clé d'idempotence du webhook. Sans cette contrainte, deux appels en double
-- — garantis par un réseau instable côté PODAXIA — créeraient deux licences
-- pour un même client. L'unicité doit être garantie par la BASE, pas par un
-- test applicatif sujet aux courses.
--
-- Index PARTIEL : partner_ref est nullable, et plusieurs licences manuelles
-- sans référence doivent rester possibles (NULL n'entre pas dans l'index).
CREATE UNIQUE INDEX IF NOT EXISTS partner_licences_partner_ref_uniq
  ON public.partner_licences (partner_code, partner_ref)
  WHERE partner_ref IS NOT NULL;

-- Une seule licence ACTIVE par (partenaire, cabinet). La double émission
-- devient impossible PAR CONSTRUCTION, quelle que soit la voie empruntée —
-- activation manuelle, webhook, ou les deux en même temps. Une garantie de
-- base couvre les chemins que le code applicatif ne connaît pas encore.
--
-- Index PARTIEL sur `active` : les lignes révoquées restent illimitées, ce
-- qui préserve la traçabilité des ré-activations successives d'un même
-- cabinet. Seule la simultanéité de deux licences actives est interdite.
CREATE UNIQUE INDEX IF NOT EXISTS partner_licences_active_uniq
  ON public.partner_licences (partner_code, user_id)
  WHERE active;

-- Rapprochement administratif (« quelles licences pour ce cabinet, révoquées
-- comprises ? »). Non couvert par l'index partiel ci-dessus, qui ignore les
-- lignes révoquées. La route d'activité, elle, tape sur la clé primaire.
CREATE INDEX IF NOT EXISTS partner_licences_partner_user_idx
  ON public.partner_licences (partner_code, user_id);

-- RLS activée SANS aucune policy : ni anon ni authenticated n'atteignent
-- cette table. Seul service_role, qui contourne RLS, y accède — c'est-à-dire
-- l'Edge Function et le SQL Editor. Même motif que help_chat_usage.
-- Un praticien ne doit pas pouvoir lire son propre licence_id : il n'en a pas
-- l'usage, et le diffuser affaiblirait le § 7.2.
ALTER TABLE public.partner_licences ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- partner_api_usage — compteur de débit (contrat § 9)
-- ═══════════════════════════════════════════════════════════════════
-- Les Edge Functions sont SANS ÉTAT : un compteur en mémoire serait remis à
-- zéro à chaque démarrage à froid et ne serait pas partagé entre instances
-- concurrentes — il ne limiterait donc rien. Le compteur vit en base, même
-- mécanique que help_chat_usage.
--
-- Une ligne par (partenaire, fenêtre horaire). bucket est l'heure UTC au
-- format 'YYYY-MM-DDTHH' : fenêtre FIXE, pas glissante (conséquence assumée
-- et documentée au § 9 — jusqu'à 600 requêtes de part et d'autre d'une
-- bascule d'heure).
--
-- Quota : 300 requêtes/heure pour la clé PODAXIA entière. C'est un budget de
-- flotte, pas un quota par licence.
CREATE TABLE IF NOT EXISTS public.partner_api_usage (
  partner_code text NOT NULL,
  bucket text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (partner_code, bucket)
);

ALTER TABLE public.partner_api_usage ENABLE ROW LEVEL SECURITY;

-- Purge des fenêtres révolues. Non planifiée : la table reste minuscule
-- (24 lignes/jour/partenaire). À passer à la main si elle venait à gonfler.
--   DELETE FROM public.partner_api_usage
--    WHERE bucket < to_char(now() AT TIME ZONE 'UTC' - interval '7 days', 'YYYY-MM-DD"T"HH24');
