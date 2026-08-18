# API partenaire — activation v1 — contrat

Route d'**écriture** serveur-à-serveur exposée par Verticy et appelée par **PODAXIA** pour
activer automatiquement un cabinet après paiement sur son site.

Complète l'API de lecture décrite dans `docs/api-partenaire-v1.md`, sans s'y substituer : les
deux contrats sont indépendants, versionnés séparément, et protégés par des clés distinctes.

Statut : **contrat figé**. Ce document fait foi. L'implémentation est vérifiée contre les
exemples ci-dessous, comparés octet par octet.

---

## 1. Frontière santé — non négociable

**Ce flux ne transporte que des données de compte praticien. Aucune donnée de santé, aucune
donnée de patient, sous aucune condition.**

Circulent uniquement : une référence commerciale PODAXIA, l'identité professionnelle du
praticien (courriel, nom, prénom) et la formule souscrite. Rien d'autre n'entre, rien d'autre
ne sort.

La frontière est identique à celle de l'API de lecture (§ 1 du contrat v1), et pour la même
raison : PODAXIA et Verticy sont deux sociétés distinctes sous une même direction, et cette
communauté de direction ne crée aucun droit d'accès aux données de santé hébergées par Verticy.

Corollaire : l'activation crée un compte praticien, elle ne donne à PODAXIA **aucun accès** à
ce compte ni à son contenu. PODAXIA n'obtient en retour qu'un `licenceId`, qui ne permet que
d'interroger des agrégats de comptage via l'API de lecture.

---

## 2. Portée

- **Écriture, non idempotente par nature, rendue idempotente par contrat** (§ 8).
- **`POST` exclusivement.** Tout autre verbe est refusé.
- **Un seul acte** : activer un cabinet. La route ne modifie pas une formule existante, ne
  change pas de modules, ne résilie pas.

### Hors contrat en v1

- **Résiliation, remboursement, changement de formule.** Ils relèveront d'une v2. En attendant,
  la désactivation est **manuelle** côté Verticy :
  `UPDATE public.partner_licences SET active = false, revoked_at = now() WHERE licence_id = '…';`
  puis retrait des droits via l'écran d'administration.
- **Limitation connue, énoncée sans détour** : un praticien activé par PODAXIA voit dans
  « Mon compte » les écrans de résiliation Verticy, alors que son contrat commercial est chez
  PODAXIA. La v1 ne les masque pas. À traiter avec la v2.

---

## 3. URL de base et chemin

Même régime qu'au § 3 du contrat de lecture : **le chemin logique est contractuel, l'URL de
base ne l'est pas.**

| Chemin logique (contractuel)         | URL réelle aujourd'hui                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `POST /api/partenaire/v1/activation` | `https://<projet>.supabase.co/functions/v1/partner-activation/v1/activation` |

L'`URL_DE_BASE` d'activation est `https://<projet>.supabase.co/functions/v1/partner-activation`.
Elle est **distincte** de celle de l'API de lecture : ce sont deux fonctions séparées.
PODAXIA la configure en variable d'environnement, jamais en dur.

Le `v1` du chemin logique est la version **de ce contrat**, indépendante de celle du contrat de
lecture. Les deux peuvent évoluer séparément.

---

## 4. Authentification — clé d'écriture distincte

| Point            | Règle                                                      |
| ---------------- | ---------------------------------------------------------- |
| Transport        | **HTTPS exclusivement.** Refusé en clair, jamais redirigé. |
| Authentification | `Authorization: Bearer <clé>`                              |
| Secret           | `PARTNER_PROVISION_KEY_PODAXIA`                            |
| Nature           | ≥ 48 octets aléatoires cryptographiques, base64url         |
| Comparaison      | Temps constant                                             |

**La clé d'écriture est distincte de la clé de lecture `PARTNER_API_KEY_PODAXIA`, et cette
séparation est le cœur du dispositif.** Une clé de lecture divulguée permet, au pire, de
consulter des compteurs d'activité. Elle ne doit **jamais** permettre de créer des comptes, de
poser des droits payants ou de provoquer l'envoi de courriels au nom de Verticy. Les deux clés
ne partagent aucune valeur, ne sont pas dérivées l'une de l'autre, et sont transmises par des
canaux distincts.

Ni l'une ni l'autre n'ouvre l'accès aux données cliniques.

**Défaut fermé** : sans `PARTNER_PROVISION_KEY_PODAXIA` configurée, la route répond `503`. Elle
n'est jamais ouverte par défaut, jamais ouverte en cas de panne.

Révocation et rotation : identiques au § 3 du contrat de lecture — effacement du secret pour
révoquer (effet immédiat, sans redéploiement), deux valeurs séparées par une virgule pour
tourner sans coupure.

---

## 5. Requête

`POST /api/partenaire/v1/activation`
`Content-Type: application/json`

```json
{
  "partner_ref": "PDX-2026-004178",
  "email": "praticienne@cabinet-exemple.fr",
  "nom": "Dupont",
  "prenom": "Camille",
  "formule": "DUO_SPORT_PEDIATRIE"
}
```

| Champ         | Type     | Obligatoire | Détail                                                        |
| ------------- | -------- | ----------- | ------------------------------------------------------------- |
| `partner_ref` | `string` | **oui**     | Référence client PODAXIA. **Clé d'idempotence** (§ 8)         |
| `email`       | `string` | **oui**     | Courriel professionnel. Normalisé en minuscules, sans espaces |
| `nom`         | `string` | non         | Nom de famille                                                |
| `prenom`      | `string` | non         | Prénom                                                        |
| `formule`     | `string` | **oui**     | Vocabulaire figé du § 6                                       |

- Tout champ inconnu est **ignoré silencieusement** — PODAXIA peut enrichir son appel sans
  rupture.
- `nom` et `prenom` sont facultatifs : leur absence n'empêche pas l'activation, elle appauvrit
  seulement la fiche. Ils ne sont **jamais** exigés pour ouvrir les droits.
- `partner_ref` est stockée en base pour la traçabilité et **n'est jamais réexposée** par
  l'API de lecture.

---

## 6. Vocabulaire des formules — figé, 7 valeurs

Vocabulaire **public et stable**, distinct des identifiants internes Verticy
(`formule_1`…`formule_5`) et des identifiants de modules (`postural`, `podopedia`,
`podo_sport`).

Chaque jeton se résout **sans ambiguïté** en un couple (formule interne, modules) :

| Jeton public          | Formule interne | Modules posés                         | Plan Verticy |
| --------------------- | --------------- | ------------------------------------- | ------------ |
| `ESSENTIEL_POSTURO`   | `formule_1`     | `postural`                            | Essentiel    |
| `ESSENTIEL_PEDIATRIE` | `formule_1`     | `podopedia`                           | Essentiel    |
| `SPORT`               | `formule_2`     | `podo_sport`                          | Sport        |
| `DUO`                 | `formule_3`     | `postural`, `podopedia`               | Duo          |
| `DUO_SPORT_POSTURO`   | `formule_4`     | `podo_sport`, `postural`              | Duo Sport    |
| `DUO_SPORT_PEDIATRIE` | `formule_4`     | `podo_sport`, `podopedia`             | Duo Sport    |
| `INTEGRAL`            | `formule_5`     | `postural`, `podopedia`, `podo_sport` | Intégral     |

- **Toute autre valeur** — casse différente, jeton retiré, faute de frappe — donne `400`
  `formule_inconnue`. Aucune tentative de rattrapage, aucune correspondance approximative :
  activer la mauvaise formule est pire que refuser l'appel.
- `PEDIATRIE` désigne la podopédiatrie, **cohérent avec le vocabulaire du contrat de lecture**
  (§ 6 de `api-partenaire-v1.md`).
- Chaque couple du tableau est validé à l'exécution contre `isValidModulesForPlan`
  (`js/subscription.mjs`), qui reste la source de vérité du canon Verticy. Une divergence entre
  ce tableau et le canon fait échouer les tests, pas la production.

### Pourquoi sept jetons et non cinq

Deux plans Verticy comportent un **choix** que le canon ne résout pas seul : `Essentiel`
(1 module parmi posturologie et podopédiatrie) et `Duo Sport` (idem, en plus du sport). Le
client tranche ce choix **sur le site PODAXIA au moment de l'achat** ; l'information existe donc
sur leur portail prestataire et peut être portée par le jeton.

Deux options ont été écartées :

- **N'exposer que les formules déterministes** (`SPORT`, `DUO`, `INTEGRAL`) et refuser les deux
  autres. Rejetée : elle ampute l'offre commerciale de PODAXIA de deux formules sur cinq.
- **Ajouter un champ `modules` à la requête**, validé contre `isValidModulesForPlan`. Rejetée :
  elle déporte chez PODAXIA une contrainte métier Verticy — combien de modules choisir, parmi
  lesquels — que PODAXIA devrait alors suivre à chacune de nos évolutions.

L'éclatement en jetons garde le payload minimal, le résultat déterministe, et la règle métier
entièrement du côté Verticy.

---

## 7. Comportement

L'activation pose les **mêmes droits** que l'activation manuelle par l'administrateur Verticy —
même champs, mêmes valeurs, même effet.

### 7.1 Compte existant (courriel déjà connu)

1. `licence_payee` ← `true`
2. `formule` ← la formule interne du § 6
3. `date_debut_abonnement` ← instant de l'activation, **seulement si le champ est vide**
4. `app_metadata.modules` ← les modules du § 6
5. Création de la ligne `partner_licences` (§ 8)

Réponse `200` avec `"statut": "existant"`.

Le point 3 mérite son exception : un praticien déjà client de Verticy qui bascule chez PODAXIA
ne doit pas voir son ancienneté d'abonnement réinitialisée.

### 7.2 Compte inexistant

1. **Invitation Supabase** — le praticien reçoit un courriel et **définit lui-même son mot de
   passe**. Verticy ne génère, ne connaît et ne transmet aucun mot de passe. PODAXIA non plus.
2. `nom` et `prenom`, s'ils sont fournis, sont posés sur le compte créé.
3. Puis les mêmes points 1 à 5 qu'au § 7.1.

Réponse `201` avec `"statut": "cree"`.

### 7.3 Jamais d'essai

Un cabinet activé par PODAXIA **ne passe jamais par la période d'essai**. `trial_start` n'est
pas posé. `licence_payee` et `formule` étant écrits ensemble, l'accès est complet dès la
première connexion — c'est l'hypothèse sur laquelle repose le § 6 du contrat de lecture, qui
garantit la présence du jeton `PEDICURIE` pour tout cabinet lié.

### 7.4 Ordre des écritures, et ce qui se passe si l'une échoue

Ces écritures touchent trois emplacements — `user_data`, `app_metadata`, `partner_licences` —
sans transaction commune : Supabase Auth et PostgREST ne partagent pas de transaction.

**L'ordre est donc choisi pour que toute défaillance laisse un état sûr** : les droits sont
posés **avant** la création de la ligne `partner_licences`.

- Échec après les droits, avant la licence → le praticien a ses droits et peut travailler ;
  PODAXIA reçoit une erreur et rejoue (§ 8), ce qui crée la licence manquante.
- L'ordre inverse produirait une licence pointant vers un compte sans droits : l'API de lecture
  répondrait alors des agrégats sans jeton `PEDICURIE`, c'est-à-dire l'**état anormal**
  explicitement décrit au § 6 du contrat de lecture. On l'évite par construction.

Aucune étape n'est destructrice : toutes réécrivent les mêmes valeurs à l'identique en cas de
rejeu.

---

## 8. Idempotence par `partner_ref`

> **Un même `partner_ref` désigne une et une seule licence, pour toujours. Un ré-appel
> **portant le même payload** renvoie exactement la même réponse, octet pour octet, et ne
> recrée rien. Un ré-appel portant un payload divergent est refusé (§ 8.1), jamais absorbé.**

Un réseau instable côté PODAXIA rend les appels en double **certains**, pas hypothétiques : une
réponse perdue en route est indiscernable d'un appel jamais parvenu, et le seul comportement
correct pour l'appelant est de rejouer.

- L'unicité est garantie par la **base**, pas par un test applicatif sujet aux courses :
  l'index partiel `partner_licences_partner_ref_uniq` sur `(partner_code, partner_ref)`, posé
  par la migration de l'API de lecture.
- Le `statut` d'origine (`cree` ou `existant`) est **mémorisé** et rejoué à l'identique. Sans
  cela, un rejeu répondrait `existant` là où le premier appel avait répondu `cree`, et la
  réponse ne serait pas réellement idempotente.
- Le **jeton de formule d'origine** est mémorisé lui aussi. `user_data.formule` ne suffit pas à
  le reconstituer : `ESSENTIEL_POSTURO` et `ESSENTIEL_PEDIATRIE` valent tous deux `formule_1`,
  et `DUO_SPORT_POSTURO` et `DUO_SPORT_PEDIATRIE` tous deux `formule_4`. Sans cette colonne, le
  contrôle de concordance du § 8.1 laisserait passer une divergence entre les deux variantes
  d'un même plan — exactement le cas qu'il existe pour attraper.

  Ces deux mémoires demandent deux colonnes :

  ```sql
  ALTER TABLE public.partner_licences
    ADD COLUMN IF NOT EXISTS compte_cree boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS formule_partenaire text;
  ```

  Livrées par `supabase/migrations/partner-activation.sql`, idempotente, à exécuter dans le SQL
  Editor **avant** le déploiement de la fonction.

  Le `email` de comparaison, lui, n'a pas besoin d'être dupliqué : il se lit sur le compte
  désigné par `user_id`, qui est la source de vérité.

- ⚠️ **`compte_cree` et `formule_partenaire` sont STRICTEMENT INTERNES.** Elles servent au seul
  contrôle d'idempotence et ne sont **jamais exposées** : ni par l'API de lecture, ni par une
  réponse de cette route, ni par aucune autre. Même régime que `partner_ref` — les objets de
  réponse des deux contrats sont **clos**, et ces colonnes n'en font pas partie. La migration
  répète cette règle en commentaire, à côté de chaque colonne, pour qu'elle reste sous les yeux
  de qui modifiera la table plus tard.

- Le code HTTP d'un rejeu est `200`, y compris lorsque le premier appel avait répondu `201` :
  `201` affirme une création, et un rejeu ne crée rien. Le corps, lui, est identique.

### 8.1 Un rejeu n'est un rejeu que si le payload concorde

Recevoir deux fois la même `partner_ref` ne suffit pas à conclure au rejeu. Encore faut-il que
l'appel décrive **la même chose**.

> Un rappel portant une `partner_ref` déjà connue n'est traité en rejeu idempotent que si
> **`email` (normalisé) et `formule` correspondent** à la licence existante. En cas de
> divergence sur l'un ou l'autre, la route répond `409` `reference_incoherente` et **n'écrit
> rien**.

Ce n'est pas un rejeu, c'est une **contradiction** : soit une erreur de saisie côté PODAXIA,
soit la réutilisation d'une référence commerciale déjà consommée. Les deux méritent d'être
signalées, pas absorbées.

Traiter ces appels comme des rejeux serait le pire des comportements : la route renverrait
l'ancienne licence en **ignorant silencieusement** le nouveau courriel ou la nouvelle formule.
PODAXIA recevrait un `200` et croirait avoir activé ce qu'il a demandé, alors que Verticy
n'aurait rien changé — un praticien resterait sans accès, ou avec la mauvaise formule, sans que
personne ne s'en aperçoive avant sa réclamation.

Même esprit qu'au § 8.3 : réconcilier automatiquement reviendrait à choisir seul quelle version
croire, l'ancienne ou la nouvelle. Verticy refuse et rend la main.

**`nom` et `prenom` divergents ne bloquent pas.** Ils sont descriptifs, n'ouvrent aucun droit,
et une correction d'orthographe ou un nom d'usage qui change ne doit pas faire échouer une
activation. La valeur d'origine fait foi ; la nouvelle est ignorée.

Pour modifier réellement le courriel ou la formule d'un cabinet déjà activé, la voie est
manuelle côté Verticy — le changement de formule est hors contrat en v1 (§ 2).

### 8.2 Ré-activation après révocation

Un `partner_ref` dont la licence a été révoquée puis rappelé **réactive la ligne existante** :
`active` repasse à `true`, `revoked_at` est effacé, les droits sont reposés, et le **même
`licenceId`** est renvoyé. Aucune nouvelle licence n'est émise — l'historique reste attaché à un
identifiant unique.

### 8.3 Cabinet déjà lié sous une autre référence

Si le courriel correspond à un cabinet disposant déjà d'une licence **active** sous un
`partner_ref` **différent**, la route répond `409` `licence_active_existante` et **n'écrit
rien**.

C'est la garantie posée par l'index `partner_licences_active_uniq` — une seule licence active
par cabinet et par partenaire. Deux références commerciales pour un même cabinet traduisent un
double achat ou une erreur de saisie côté PODAXIA : les réconcilier automatiquement reviendrait
à choisir seul laquelle facturer.

---

## 9. Réponses

Sérialisation identique au § 8 du contrat de lecture : JSON compact, UTF-8, sans saut de ligne
final, `Content-Type: application/json; charset=utf-8`.

**Ordre des clés figé** : `licenceId`, puis `statut`.

`201 Created` — compte créé et invité :

<!-- golden: activation-cree.json -->

```json
{ "licenceId": "3f2504e0-4f89-41d3-9a0c-0305e82c3301", "statut": "cree" }
```

`200 OK` — compte existant activé, ou rejeu idempotent :

<!-- golden: activation-existant.json -->

```json
{ "licenceId": "9c5b94b1-35ad-49bb-b118-8e8fc24abf80", "statut": "existant" }
```

`statut` ne prend que ces deux valeurs. Il décrit ce qu'il est advenu du **compte praticien**,
jamais de la licence.

---

## 10. Erreurs

Même forme qu'au contrat de lecture : objet à clé unique `erreur`, code stable, aucun message
libre, aucune trace technique.

| Statut | Corps                                   | Cas                                                        |
| ------ | --------------------------------------- | ---------------------------------------------------------- |
| `400`  | `{"erreur":"partner_ref_manquant"}`     | `partner_ref` absente, vide ou non textuelle               |
| `400`  | `{"erreur":"email_invalide"}`           | `email` absent ou non conforme                             |
| `400`  | `{"erreur":"formule_inconnue"}`         | `formule` hors des 7 jetons du § 6                         |
| `400`  | `{"erreur":"corps_invalide"}`           | Corps absent ou JSON illisible                             |
| `400`  | `{"erreur":"https_requis"}`             | Appel reçu en clair                                        |
| `401`  | `{"erreur":"authentification_requise"}` | Jeton absent, malformé, inconnu ou révoqué                 |
| `405`  | `{"erreur":"methode_non_autorisee"}`    | Verbe autre que `POST`                                     |
| `409`  | `{"erreur":"reference_incoherente"}`    | § 8.1 — `partner_ref` connue, `email`/`formule` divergents |
| `409`  | `{"erreur":"licence_active_existante"}` | § 8.3                                                      |
| `429`  | `{"erreur":"debit_depasse"}`            | § 11, avec en-tête `Retry-After`                           |
| `503`  | `{"erreur":"indisponible"}`             | Clé serveur non configurée, ou dépendance en échec         |
| `503`  | `{"erreur":"invitation_indisponible"}`  | § 11 — plafond d'envoi de courriels atteint                |

Exemples figés :

<!-- golden: erreur-formule-inconnue.json -->

```json
{ "erreur": "formule_inconnue" }
```

<!-- golden: erreur-email-invalide.json -->

```json
{ "erreur": "email_invalide" }
```

<!-- golden: erreur-licence-active-existante.json -->

```json
{ "erreur": "licence_active_existante" }
```

<!-- golden: erreur-reference-incoherente.json -->

```json
{ "erreur": "reference_incoherente" }
```

**Aucune erreur ne laisse d'écriture partielle intentionnelle.** Les validations de forme
(`partner_ref`, `email`, `formule`, corps) sont toutes effectuées **avant la première
écriture** : un appel malformé ne touche jamais la base.

### 10.1 Validation du courriel

Contrôle de forme volontairement simple : présence d'un `@`, d'un domaine avec un point, pas
d'espace, longueur bornée. Verticy **ne vérifie pas la délivrabilité** — c'est l'invitation
elle-même qui fait foi. Un courriel bien formé mais inexistant produit une activation
techniquement réussie dont le courriel n'arrivera jamais : ce cas se règle entre PODAXIA et son
client, pas ici.

Le courriel est normalisé avant tout traitement : espaces retirés, minuscules. `Camille@X.FR`
et `camille@x.fr` désignent le même compte.

---

## 11. Limites connues

### 11.1 Plafond d'envoi de courriels

**Le service SMTP intégré de Supabase est fortement limité — de l'ordre de 2 courriels par
heure.** C'est une limite de la plateforme, pas un choix de conception.

Conséquences, énoncées pour qu'elles ne surprennent pas le jour d'une campagne :

- Au-delà du plafond, l'invitation échoue. La route répond alors `503`
  `invitation_indisponible` **sans rien écrire** — ni compte, ni droits, ni licence. PODAXIA
  rejoue plus tard avec le **même `partner_ref`**, et l'activation aboutit sans doublon.
- Un échec d'invitation n'est **jamais** silencieux et ne produit **jamais** une activation
  partielle. Un praticien ne peut pas se retrouver avec des droits et sans moyen de se
  connecter.
- **Avant tout volume**, un SMTP dédié doit être configuré côté Verticy. Sans cela, une
  vingtaine d'activations le même jour s'étalerait sur une dizaine d'heures.
- Les activations de comptes **existants** (§ 7.1) n'envoient aucun courriel et ne sont donc
  pas concernées.

### 11.2 Limitation de débit

| Paramètre   | Valeur                                                       |
| ----------- | ------------------------------------------------------------ |
| Quota       | **60 requêtes par heure**, pour la clé d'écriture            |
| Fenêtre     | Fenêtre fixe alignée sur l'heure UTC                         |
| Dépassement | `429` + `Retry-After` en secondes jusqu'à la prochaine heure |

Compteur en base, même mécanique et même table que l'API de lecture
(`partner_api_usage`), sous un code de partenaire distinct : les deux budgets ne se
consomment pas l'un l'autre. Le quota est bien plus bas qu'en lecture — une activation est un
acte rare, et un débit élevé sur une route d'écriture est un signal, pas un usage.

Les `401` et les `429` sont décomptés.

### 11.3 Champ `engagement`

L'activation manuelle pose `engagement = 'admin_gratuit'`. Cette valeur serait **factuellement
fausse** ici : une activation PODAXIA n'est pas gratuite, elle est facturée par Verticy à
PODAXIA. La route pose donc `engagement = 'partenaire_podaxia'`, valeur nouvelle, qui distingue
ces activations des paiements Stripe (`sans`, `1_an`) et des gestes commerciaux
(`admin_gratuit`).

Ce champ est purement descriptif : il s'affiche dans l'écran d'administration et dans « Mon
compte », et ne conditionne aucun droit d'accès.

---

## 12. Mise en service

**Ordre impératif**, même contrainte qu'au § 11 du contrat de lecture :

1. Exécuter `supabase/migrations/partner-activation.sql` dans le **SQL Editor** (colonne
   `compte_cree`). Idempotente.
2. `supabase secrets set PARTNER_PROVISION_KEY_PODAXIA=<48+ octets aléatoires base64url>` —
   valeur **différente** de la clé de lecture, transmise par un canal chiffré distinct.
3. `supabase functions deploy partner-activation --no-verify-jwt`
4. Vérifier qu'un appel sans clé répond `401`, et qu'un appel `GET` répond `405`.
5. Activer un **cabinet de test** de bout en bout, puis vérifier que l'API de lecture répond
   sur le `licenceId` obtenu — c'est le seul contrôle qui prouve que les deux contrats
   s'articulent.

---

## 13. Journal des versions

| Version | Date       | Changement             |
| ------- | ---------- | ---------------------- |
| v1      | 2026-08-19 | Contrat initial, figé. |
