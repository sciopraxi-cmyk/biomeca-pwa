# API partenaire v1 — contrat

Interface serveur-à-serveur exposée par Verticy et consommée par **PODAXIA** pour alimenter
l'encart « Mon activité bilan » de son portail praticien.

Statut : **contrat figé**. Ce document fait foi. L'implémentation est vérifiée contre les
exemples ci-dessous, comparés octet par octet par `tests/partenaire-v1.test.mjs`.

---

## 1. Frontière santé — non négociable

**Cette API n'expose que des agrégats de comptage. Elle ne transporte, sous aucune condition,
aucune donnée de santé et aucune donnée à caractère personnel de patient.**

Ne franchissent jamais cette frontière :

- aucune identité de patient — nom, prénom, date de naissance, sexe, coordonnées ;
- aucun identifiant de patient, de bilan ou de praticien, même opaque, même haché ;
- aucun contenu de bilan — mesure, observation, photo, schéma, texte libre, conclusion ;
- aucun libellé de bilan, aucune date de consultation individuelle ;
- aucune donnée permettant de réidentifier un patient par recoupement.

Les seules valeurs sortantes sont : **des compteurs entiers, une date de dernière activité, et
la liste des modules souscrits par le cabinet.**

Cette frontière n'est pas une préférence d'implémentation, c'est la raison d'être du découpage.
PODAXIA et Verticy sont deux sociétés distinctes, sous la même direction : la communauté de
direction ne crée aucun droit d'accès aux données de santé hébergées par Verticy. Toute
évolution qui ferait franchir cette ligne à une donnée n'est pas une v2 de cette API, c'est un
autre projet, avec sa propre base légale, sa propre analyse d'impact et son propre contrat de
sous-traitance.

Corollaire de conception : le champ `licenceId` est un identifiant **de lien commercial**, émis
pour ce partenariat. Ce n'est ni l'`user_id` Verticy du praticien, ni une clé de la base
clinique. Il ne permet de rien joindre côté Verticy en dehors de la table de liaison.

---

## 2. Portée, lecture seule, versionnement

- **Lecture seule.** Aucun verbe autre que `GET` et `HEAD` n'est accepté, sur aucune route.
- **Idempotente.** Deux appels identiques rapprochés renvoient le même corps, hors passage
  d'une borne de mois ou activité survenue entre les deux.
- **Sans effet de bord.** Un appel ne crée, ne modifie et ne supprime rien, hors incrément du
  compteur de débit.
- **Versionnée dans l'URL.** `v1` est un segment de chemin, pas un en-tête négocié.

Règle de versionnement, valable pour toute la durée de vie de l'interface :

> **Le contrat v1 ne change jamais.** Aucun champ n'est renommé, aucun type n'est modifié,
> aucune sémantique n'est redéfinie, aucun champ n'est retiré. Une évolution incompatible
> donne naissance à `/api/partenaire/v2/…`, servie **à côté** de la v1. La v1 reste en service
> tant qu'un client la consomme. Sa mise hors service ne peut être décidée qu'après
> confirmation écrite que plus aucun appel ne l'atteint.

Seule tolérance : l'**ajout** d'un champ optionnel en fin d'objet. Les clients doivent donc
ignorer les champs inconnus plutôt que d'échouer dessus. L'ordre des clés existantes, lui, est
figé (§ 8).

---

## 3. Transport, URL de base et authentification

### URL de base

Ce document décrit des **chemins logiques**, sous la forme `/api/partenaire/v1/…`. Ils ne sont
pas l'URL complète. L'URL réellement appelée se compose ainsi :

> **URL réelle** = `<URL_DE_BASE>` + le chemin logique **privé de son préfixe
> `/api/partenaire`**.

| Chemin logique (contractuel)              | URL réelle aujourd'hui                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `/api/partenaire/v1/sante`                | `https://<projet>.supabase.co/functions/v1/api-partenaire/v1/sante`                |
| `/api/partenaire/v1/activite/{licenceId}` | `https://<projet>.supabase.co/functions/v1/api-partenaire/v1/activite/{licenceId}` |

L'`<URL_DE_BASE>` en service est donc `https://<projet>.supabase.co/functions/v1/api-partenaire`.
Sa valeur exacte est transmise à PODAXIA avec la clé, par le même canal chiffré.

**Deux régimes, à ne pas confondre :**

- **Tout ce qui suit `/v1/` est contractuel.** Noms de routes, segments, casse, position du
  `licenceId` : figés par le § 2, pour toute la durée de vie de la v1.
- **L'`URL_DE_BASE` ne l'est pas.** C'est un détail d'hébergement, appelé à changer — une
  migration d'hébergeur est prévue. Elle ne constitue pas une rupture du contrat v1 : les
  chemins logiques, eux, seront identiques sur la nouvelle base.

**PODAXIA doit donc configurer l'`URL_DE_BASE` en variable d'environnement, jamais en dur.**
Une base écrite en dur dans le code impose un déploiement à chaque migration d'hébergeur, au
lieu d'un changement de valeur. Les chemins sous `/v1/`, eux, peuvent être écrits en dur : ils
sont garantis.

Un changement d'`URL_DE_BASE` sera annoncé à l'avance, avec une période de recouvrement pendant
laquelle **les deux bases servent la même v1** — même logique que la rotation de clé (§ 3,
« Révocation et rotation »). Aucune coupure n'est prévue.

⚠️ **Les deux `v1` de l'URL réelle ne désignent pas la même chose.** Celui de `/functions/v1/`
est le préfixe d'invocation de la plateforme Supabase, hors de notre contrôle et sans rapport
avec ce document ; celui de `/api-partenaire/v1/sante` est la version **de ce contrat**. Une
future `v2` de l'API partenaire vivrait sous `/functions/v1/api-partenaire/v2/…` : le premier
`v1` ne bougerait pas. Ne jamais dériver l'un de l'autre.

### Authentification

| Point            | Règle                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Transport        | **HTTPS exclusivement.** Tout appel en clair est refusé, pas redirigé.                        |
| Authentification | Jeton porteur : `Authorization: Bearer <clé>`                                                 |
| Portée de la clé | Une clé unique pour PODAXIA, valable sur toutes les licences liées                            |
| Nature de la clé | ≥ 48 octets aléatoires cryptographiques, encodés base64url                                    |
| Stockage         | Variable d'environnement des deux côtés — **jamais** en base, en dépôt, en ticket, en journal |
| Comparaison      | Temps constant, pour ne pas fuiter la clé octet par octet par la latence                      |

La clé n'est **jamais** acceptée en paramètre d'URL ni en cookie : une URL se retrouve dans les
journaux d'accès, les référents et les historiques de navigateur.

### Révocation et rotation

La clé vit dans le secret `PARTNER_API_KEY_PODAXIA`, côté Verticy.

- **Révocation** — effacer le secret (`supabase secrets unset PARTNER_API_KEY_PODAXIA`). Le
  secret est lu à chaque invocation : l'effet est immédiat, **sans redéploiement de code**, et
  tous les appels reçoivent aussitôt `401`.
- **Rotation** — le secret accepte **deux** valeurs séparées par une virgule, permettant une
  fenêtre de recouvrement : on pose `nouvelle,ancienne`, PODAXIA bascule sur la nouvelle, puis
  on repose `nouvelle` seule. Aucune coupure de service.
- La rotation est prévue **au moins une fois par an**, et **immédiatement** en cas de doute sur
  la confidentialité de la clé.

Une clé absente côté serveur ne rend pas l'API ouverte : sans secret configuré, la route
d'activité répond `503` (§ 7) — le défaut est fermé.

---

## 4. Routes

### 4.1 `GET /api/partenaire/v1/sante`

Vivacité. **Sans authentification** — c'est une sonde, elle doit répondre avant même qu'une clé
soit posée, et elle ne révèle rien.

Corps de réponse constant, sans horodatage ni numéro de version interne : une sonde qui varie
n'est plus comparable, et un numéro de build est un renseignement offert à un attaquant.

`200 OK`

<!-- golden: sante.json -->

```json
{ "statut": "ok", "service": "api-partenaire", "version": "v1" }
```

### 4.2 `GET /api/partenaire/v1/activite/{licenceId}`

Agrégats d'activité d'un cabinet.

`licenceId` — UUID v4, en minuscules, forme canonique à 36 caractères.

`200 OK` — licence connue, active, liée à PODAXIA :

<!-- golden: activite-nominal.json -->

```json
{
  "licenceId": "7f3a9c21-6b4e-4d18-9a05-2c8e1f0b47d3",
  "patientsActifs": 124,
  "bilansMoisCourant": 18,
  "bilansMoisPrecedent": 22,
  "dernierBilanLe": "2026-08-15",
  "modulesActifs": ["POSTURO", "PEDIATRIE", "PEDICURIE"]
}
```

Ce cabinet a souscrit une formule comprenant la posturologie et la podopédiatrie ; `PEDICURIE`
s'y ajoute du seul fait qu'une formule est active (§ 6).

`200 OK` — cabinet fraîchement activé, formule posée, aucun bilan encore saisi. Ce cas renvoie
des zéros et `null`, **jamais** un `404` : la licence existe et le partenariat est actif,
l'absence d'activité est une information légitime, pas une erreur.

<!-- golden: activite-vide.json -->

```json
{
  "licenceId": "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  "patientsActifs": 0,
  "bilansMoisCourant": 0,
  "bilansMoisPrecedent": 0,
  "dernierBilanLe": null,
  "modulesActifs": ["SPORT", "PEDICURIE"]
}
```

Les compteurs sont à zéro, mais `modulesActifs` ne l'est pas : les droits existent dès
l'activation, l'activité viendra ensuite. Un tableau `modulesActifs` **vide** sur une licence
liée serait, lui, le signe de l'état anormal décrit au § 6.

#### Types

| Champ                 | Type               | Nullable | Détail                                           |
| --------------------- | ------------------ | -------- | ------------------------------------------------ |
| `licenceId`           | `string`           | non      | Renvoi de l'UUID demandé, en minuscules          |
| `patientsActifs`      | `integer` ≥ 0      | non      | § 5.2                                            |
| `bilansMoisCourant`   | `integer` ≥ 0      | non      | § 5.3 — **mois partiel**                         |
| `bilansMoisPrecedent` | `integer` ≥ 0      | non      | § 5.3 — mois complet                             |
| `dernierBilanLe`      | `string` \| `null` | oui      | `YYYY-MM-DD`. `null` si aucun bilan, jamais `""` |
| `modulesActifs`       | `string[]`         | non      | § 6. Tableau vide possible, jamais `null`        |

---

## 5. Définitions exactes des agrégats

Cette section existe pour qu'aucun chiffre ne soit contestable. Un écart entre le compte
PODAXIA et le compte Verticy doit pouvoir être tranché ici, sans discussion d'intention.

### 5.1 Date de référence d'un bilan, et fuseau

Tout calcul ci-dessous s'appuie sur la **date de référence** d'un bilan, notée `dateRef` :

> `dateRef` = `bilans.bilan_date` si elle est renseignée ;
> sinon la date locale **Europe/Paris** de `bilans.created_at`.

Le repli existe parce que `bilan_date` est nullable en base : un bilan créé sans date de
consultation compterait pour zéro alors qu'il représente une activité réelle. Le repli ne
s'applique **jamais** quand `bilan_date` est renseignée, même si elle est incohérente avec
`created_at` — la date saisie par le praticien fait foi, c'est celle qu'il voit à l'écran.

Toutes les bornes de mois et de journée sont calculées en **Europe/Paris**, heure d'été
comprise, jamais en UTC. Un bilan du 1er août à 01:00 Paris appartient au mois d'août, alors
qu'il est encore le 31 juillet à Londres. Le fuseau du serveur n'entre pas dans le calcul.

`aujourdhui` désigne la date locale Europe/Paris **à l'instant de la requête**.

**Bilans à date future exclus.** Un bilan dont `dateRef > aujourdhui` (consultation pré-datée)
n'est compté nulle part et n'alimente pas `dernierBilanLe`. Sans cette règle, une saisie
anticipée ferait apparaître une activité qui n'a pas eu lieu.

### 5.2 `patientsActifs`

> Nombre de patients **distincts** du cabinet ayant **au moins un bilan** dont la `dateRef`
> tombe dans les **365 jours** s'achevant à `aujourdhui` inclus — soit
> `aujourdhui - 364 jours ≤ dateRef ≤ aujourdhui`.

Précisions qui tranchent les cas litigieux :

- **Fenêtre de 365 jours glissants, pas « 12 mois ».** « Douze mois » est ambigu aux fins de
  mois — le 31 mars moins douze mois n'a pas de réponse unique. Un décompte en jours n'a pas
  cette ambiguïté. Conséquence assumée : une année bissextile décale la borne d'un jour.
- **Comptage par patient, pas par bilan.** Un patient vu huit fois compte pour un.
- **Les deux statuts comptent** — `in_progress` (bilan en cours d'édition) et `archived`
  (bilan finalisé). Ouvrir un bilan est déjà un acte d'activité ; ne compter que les archives
  ferait apparaître à zéro un praticien qui n'archive pas systématiquement.
- **Un patient sans aucun bilan n'est pas actif**, même créé le matin même. « Actif » qualifie
  l'activité de bilan, pas le remplissage du répertoire.
- **Un patient supprimé disparaît du compte**, y compris rétroactivement : la suppression
  cascade sur ses bilans. Un compte passé peut donc baisser — ce n'est pas une anomalie,
  c'est le respect du droit à l'effacement.

### 5.3 `bilansMoisCourant` et `bilansMoisPrecedent`

> Nombre de **bilans** (et non de patients) dont la `dateRef` tombe dans le mois calendaire
> considéré, fuseau Europe/Paris.
>
> - `bilansMoisCourant` : du 1er du mois en cours à `aujourdhui` **inclus**.
> - `bilansMoisPrecedent` : mois calendaire précédent **entier**, du 1er au dernier jour.

- **`bilansMoisCourant` est un mois partiel.** Le 3 du mois, il porte sur trois jours. Il n'est
  **pas** comparable tel quel à `bilansMoisPrecedent`, qui porte sur un mois plein. L'encart
  PODAXIA ne doit pas en tirer un pourcentage d'évolution sans le proratiser ou le libeller
  « en cours ». C'est la source d'erreur la plus probable de cette intégration.
- **Un bilan compte une fois**, dans le mois de sa `dateRef`, quel que soit son statut, quel
  que soit son module, qu'il soit terminé ou non.
- **Un bilan abandonné compte quand même.** Ouvrir un bilan puis ne pas le remplir est une
  activité du point de vue de cet indicateur. Nous ne cherchons pas à distinguer un bilan
  « sérieux » d'un bilan vide : le seuil serait arbitraire et invérifiable côté PODAXIA.
- **Un bilan dont la `dateRef` est modifiée change de mois.** Corriger une date de
  consultation en juillet alors qu'on est en août décrémente le mois courant et incrémente le
  mois précédent. Les compteurs reflètent l'état de la base à l'instant de l'appel, ils ne
  sont pas un journal figé.
- **Les mois précédant le mois précédent ne sont pas exposés en v1.** Un historique complet
  serait une v2.

### 5.4 `dernierBilanLe`

> La **plus grande** `dateRef` parmi tous les bilans du cabinet, tous statuts et tous modules
> confondus, plafonnée à `aujourdhui` (§ 5.1), formatée `YYYY-MM-DD`.
> `null` si le cabinet n'a aucun bilan.

- **Sans limite d'ancienneté** : contrairement à `patientsActifs`, ce champ ne s'arrête pas à
  365 jours. Un cabinet dont le dernier bilan date de trois ans renvoie cette date de trois
  ans, avec `patientsActifs: 0`. La combinaison est cohérente, pas contradictoire.
- **Une date, jamais un horodatage.** Aucune heure n'est exposée : l'heure d'une consultation
  isolée s'approche d'une donnée de rendez-vous.
- `null` et `""` ne sont pas interchangeables. La valeur d'absence est `null`.

### 5.5 Fraîcheur

Les agrégats sont **recalculés à chaque requête** sur l'état courant de la base. Verticy ne
maintient aucun instantané et ne met rien en cache côté serveur : il n'existe donc pas de délai
de propagation. La seule latence possible est celle du cache de PODAXIA (§ 10).

---

## 6. Vocabulaire des modules — figé

`modulesActifs` emploie un vocabulaire **public et stable**, délibérément distinct des
identifiants internes de Verticy. Les identifiants internes peuvent être renommés lors d'un
remaniement ; les jetons publics ci-dessous ne le seront pas.

| Jeton public | Module                     | Origine                                         |
| ------------ | -------------------------- | ----------------------------------------------- |
| `POSTURO`    | Posturologie               | Module souscrit — interne `postural`            |
| `PEDIATRIE`  | Podopédiatrie              | Module souscrit — interne `podopedia`           |
| `SPORT`      | Bilan sportif / podo-sport | Module souscrit — interne `podo_sport`          |
| `PEDICURIE`  | Pédicurie                  | **Dérivé de la formule** — aucun module interne |

Règles :

- **Ordre figé**, celui du tableau : `POSTURO`, puis `PEDIATRIE`, puis `SPORT`, puis
  `PEDICURIE`. Ce n'est **pas** un tri alphabétique. Deux cabinets aux mêmes droits renvoient
  toujours la même chaîne, ce qui rend les réponses comparables octet par octet.
- **Pas de doublon**, même si la source interne en contient.
- **Tableau vide** possible — jamais `null`, jamais absent.
- **Un module interne inconnu de ce tableau est ignoré silencieusement** côté sortie, et
  journalisé côté serveur. Un module Verticy créé après ce contrat n'apparaîtra donc pas tant
  que le tableau n'aura pas été étendu — un ajout de jeton est rétrocompatible, l'invention
  d'un jeton à la volée ne le serait pas.

### Le cas `PEDICURIE`

La pédicurie est **incluse dans toutes les formules** Verticy : ce n'est pas un module
optionnel, et il n'existe aucun identifiant interne `pedicurie` à lire. Le jeton est donc
**dérivé de la formule du cabinet**, et non de la liste des modules souscrits :

> `PEDICURIE` est présent **pour tout cabinet disposant d'une formule active**, et absent
> **seulement** si le cabinet n'a aucune formule.

« Formule active » se lit sur `user_data.formule` — le même champ qui commande l'accès complet
à l'application (`computeAccessLevel`, `js/access.mjs`). Une formule renseignée vaut présence
du jeton, quelle que soit la formule.

**Un cabinet lié à PODAXIA a toujours une formule active.** Le parcours partenaire ne passe
jamais par la période d'essai : paiement sur le site PODAXIA, puis **activation manuelle** par
l'administrateur Verticy, qui pose `licence_payee` et `formule` **ensemble**, puis facturation
de Verticy à PODAXIA. Une licence partenaire n'est donc émise que pour un cabinet déjà activé,
formule comprise.

En régime nominal, `PEDICURIE` est par conséquent **toujours présent** dans les réponses servies
à PODAXIA. Un cabinet lié renvoyant un tableau **sans** `PEDICURIE` ne décrit pas un cas
métier : c'est un **état anormal** — licence émise avant l'activation, formule effacée, ou
souscription échue laissant des modules internes en place. Il appelle une correction côté
Verticy, et non une interprétation côté PODAXIA. La règle ci-dessus reste néanmoins appliquée
telle quelle : la réponse décrit l'état réel de la base, elle ne le corrige pas.

La période d'essai, qui n'attribue pas de formule, est sans objet ici : aucun cabinet en essai
ne dispose d'une licence partenaire.

`modulesActifs` reflète les **droits souscrits** du cabinet — modules optionnels souscrits, plus
la pédicurie dès lors qu'une formule est active — et non l'usage : un droit jamais exercé y
figure.

---

## 7. Erreurs

Toutes les erreurs partagent la même forme : un objet à clé unique `erreur`, portant un code
stable, en minuscules avec tirets bas. **Aucun message libre, aucun détail technique, aucune
trace** — un corps d'erreur ne renseigne pas un attaquant sur l'état interne.

| Statut | Corps                                   | Cas                                                |
| ------ | --------------------------------------- | -------------------------------------------------- |
| `400`  | `{"erreur":"licence_id_invalide"}`      | `licenceId` non conforme à la forme UUID           |
| `400`  | `{"erreur":"https_requis"}`             | Appel reçu en clair — voir ci-dessous              |
| `401`  | `{"erreur":"authentification_requise"}` | Jeton absent, malformé, inconnu ou révoqué         |
| `404`  | `{"erreur":"licence_introuvable"}`      | § 7.1                                              |
| `404`  | `{"erreur":"ressource_introuvable"}`    | Chemin inconnu sous `/api/partenaire/v1/`          |
| `405`  | `{"erreur":"methode_non_autorisee"}`    | Verbe autre que `GET` ou `HEAD`                    |
| `429`  | `{"erreur":"debit_depasse"}`            | § 9, accompagné de l'en-tête `Retry-After`         |
| `503`  | `{"erreur":"indisponible"}`             | Clé serveur non configurée, ou dépendance en échec |

Exemples figés :

<!-- golden: erreur-licence-introuvable.json -->

```json
{ "erreur": "licence_introuvable" }
```

<!-- golden: erreur-authentification-requise.json -->

```json
{ "erreur": "authentification_requise" }
```

<!-- golden: erreur-debit-depasse.json -->

```json
{ "erreur": "debit_depasse" }
```

Un `401` ne distingue **jamais** « clé absente » de « clé fausse » : la distinction dirait à un
attaquant que sa clé a la bonne forme.

`https_requis` est **inatteignable en pratique aujourd'hui** : la plateforme Supabase termine
le TLS, aucun appel en clair n'atteint la fonction. Le code figure néanmoins au contrat parce
que le garde-fou existe dans l'implémentation et qu'il prendra son sens lors de la migration
d'hébergeur annoncée au § 3. Un appel en clair est **refusé, jamais redirigé** : une
redirection ferait rejouer la requête — et donc la clé — sur le canal en clair.

### 7.1 Aucun oracle d'existence

**Ces trois situations produisent une réponse rigoureusement identique** — même statut `404`,
même corps octet pour octet, mêmes en-têtes :

1. le `licenceId` n'existe dans aucune table ;
2. le `licenceId` existe côté Verticy mais **n'est lié à aucun partenaire** ;
3. le `licenceId` existe, était lié à PODAXIA, mais le lien a été **révoqué**.

Sans cette règle, PODAXIA — ou quiconque détiendrait la clé — pourrait distinguer « ce cabinet
n'existe pas » de « ce cabinet existe mais ne vous concerne pas ». La seconde réponse est déjà
un renseignement commercial sur la clientèle de Verticy, et un début de cartographie.

Le `400` sur UUID malformé n'entame pas cette garantie : la validité d'une forme UUID se vérifie
hors ligne, sans nous interroger. Elle ne dit rien de l'existence.

### 7.2 Identifiants non énumérables

`licenceId` est un **UUID v4 aléatoire**, jamais un compteur, jamais une valeur dérivée d'une
donnée du cabinet (raison sociale, numéro d'ordre, date d'inscription, courriel).

C'est une exigence de sécurité, pas une préférence de format. La clé d'authentification est
**unique pour tout PODAXIA** : elle n'est pas cantonnée à un cabinet. Si `licenceId` valait
`1`, `2`, `3`, cette clé unique permettrait de parcourir l'activité de **tous** les cabinets
Verticy en incrémentant un entier. L'espace UUID v4 rend ce parcours irréalisable, et la
limitation de débit (§ 9) rend une recherche exhaustive détectable bien avant d'aboutir.

En conséquence : ne jamais exposer un `licenceId` dans une URL publique, un courriel non
chiffré ou un journal côté PODAXIA.

---

## 8. Sérialisation — octet pour octet

Le format de transport est figé, pour que les réponses soient comparables sans interprétation :

- **JSON compact**, encodé **UTF-8**, sans espace superflu, **sans saut de ligne final**.
- **`Content-Type: application/json; charset=utf-8`**.
- **Ordre des clés figé** — jamais alphabétique, jamais dépendant de l'ordre d'insertion :
  1. `licenceId`
  2. `patientsActifs`
  3. `bilansMoisCourant`
  4. `bilansMoisPrecedent`
  5. `dernierBilanLe`
  6. `modulesActifs`
- Les entiers sont des nombres JSON, **jamais des chaînes**. Pas de séparateur de milliers,
  pas de signe.
- Aucun champ n'est omis quand il vaut `0`, `null` ou `[]`.

Les blocs d'exemples de ce document sont indentés pour la lecture. Les **octets normatifs**
sont ceux des fichiers `tests/golden/partenaire-v1/*.json`, et `tests/partenaire-v1.test.mjs`
vérifie que les exemples de ce document et ces fichiers décrivent le même objet — le contrat ne
peut pas dériver de l'implémentation sans faire rougir la CI.

---

## 9. Limitation de débit

Dimensionnée pour l'usage annoncé : **une passe nocturne sur l'ensemble des cabinets, plus des
rafraîchissements à la demande adossés à un cache**.

| Paramètre   | Valeur                                                               |
| ----------- | -------------------------------------------------------------------- |
| Quota       | **300 requêtes par heure**, par clé partenaire                       |
| Fenêtre     | Fenêtre **fixe** alignée sur l'heure UTC, pas glissante              |
| Portée      | La clé entière — c'est un budget de flotte, pas un quota par licence |
| Dépassement | `429` + en-tête `Retry-After` en secondes jusqu'à la prochaine heure |

- La route `/sante` n'est **pas** décomptée : une sonde ne doit jamais consommer le budget
  qu'elle surveille.
- Le quota portant sur la clé entière, une passe nocturne sur plus de 300 cabinets doit être
  **étalée sur plusieurs heures**, ou fractionnée. Cette valeur sera relevée d'un commun accord
  si la flotte grandit — un relèvement de quota n'est pas une rupture de contrat.
- Conséquence de la fenêtre fixe, énoncée sans détour : jusqu'à 600 requêtes peuvent passer en
  quelques minutes de part et d'autre d'une bascule d'heure. C'est accepté — le quota protège
  d'une énumération, pas d'une microrafale.
- Les réponses `401` et `429` **sont** décomptées : sinon la limite ne protégerait de rien.

---

## 10. Cache côté client

- Réponse d'activité : `Cache-Control: private, max-age=900` (15 minutes).
- Réponse `/sante` : `Cache-Control: no-store` — une sonde en cache ne surveille rien.

`private` interdit toute mise en cache par un intermédiaire partagé. PODAXIA est invité à
servir son encart depuis son propre cache et à ne rafraîchir à la demande qu'au-delà de ces 15
minutes : les agrégats bougent à l'échelle de la journée, pas de la seconde.

Ni `ETag` ni `If-None-Match` en v1 : le corps est trop petit pour que la négociation soit
rentable.

---

## 11. Mise en service

**Ordre impératif.** La table de liaison doit exister avant que la fonction ne l'interroge :
déployée en premier, la fonction répondrait `503` à chaque appel PODAXIA, sur une table
absente. C'est la contrainte déjà rencontrée en `#223-A` et `#226-A`, transposée — non plus un
upsert PostgREST cassé par une colonne inconnue, mais une lecture sur une relation inexistante.

1. **Exécuter `supabase/migrations/partner-api-licences.sql` dans le SQL Editor Supabase.**
   La migration est **idempotente** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
   `DROP POLICY IF EXISTS` avant chaque `CREATE POLICY`) : la rejouer est sans effet et sans
   risque.
2. Poser le secret :
   `supabase secrets set PARTNER_API_KEY_PODAXIA=<48+ octets aléatoires base64url>`.
   La clé est transmise à PODAXIA par un canal chiffré, jamais par courriel en clair, jamais
   dans un ticket.
3. Déployer la fonction :
   `supabase functions deploy api-partenaire --no-verify-jwt`.
   Le drapeau `--no-verify-jwt` est **indispensable** : la plateforme exigerait sinon un JWT
   Supabase, ce qui rendrait `/sante` inaccessible sans authentification et empêcherait
   l'authentification par jeton partenaire, qui est vérifiée dans la fonction elle-même.
4. Vérifier la vivacité, sans clé :
   `curl -sS https://<projet>.supabase.co/functions/v1/api-partenaire/v1/sante`
5. Émettre une licence pour un cabinet :
   `INSERT INTO public.partner_licences (user_id, partner_code) VALUES ('<uuid praticien>', 'PODAXIA') RETURNING licence_id;`
6. Vérifier un appel authentifié de bout en bout, puis transmettre le `licence_id` à PODAXIA.

Révoquer une licence sans la détruire :
`UPDATE public.partner_licences SET active = false, revoked_at = now() WHERE licence_id = '…';`
La ligne est conservée pour la traçabilité, et la route répond dès lors le `404` indistinct
de § 7.1.

---

## 12. Ce que la v1 ne fait pas

Énoncé pour éviter que l'absence soit lue comme un oubli :

- Pas de pagination, pas de route « liste des licences ». PODAXIA connaît ses licences, il n'a
  pas à les découvrir chez nous — une telle route serait précisément l'énumération que § 7.2
  cherche à empêcher.
- Pas d'historique au-delà du mois précédent.
- Pas de ventilation par module des compteurs de bilans.
- Pas de webhook ni de notification sortante : le flux est tiré par PODAXIA, jamais poussé par
  Verticy.
- Pas de CORS. C'est une interface serveur-à-serveur : aucun navigateur ne doit porter la clé,
  donc aucun en-tête `Access-Control-Allow-Origin` n'est émis.

---

## 13. Journal des versions

| Version | Date       | Changement             |
| ------- | ---------- | ---------------------- |
| v1      | 2026-08-18 | Contrat initial, figé. |
