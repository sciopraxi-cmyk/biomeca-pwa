# Verticy — conventions de travail

PWA clinique (kinésiologie, ostéopathie, podologie) manipulant des **données de santé**.
Toute erreur silencieuse peut produire un rapport faux remis à un patient.

## Dépôt PUBLIC

`sciopraxi-cmyk/biomeca-pwa` est public. Code, historique et fichiers trackés
sont lisibles sans authentification.

- Ne jamais commiter de secret, de jeton, de clé.
- Ne jamais commiter de donnée patient, même de test.
- Les documents stratégiques locaux (roadmap, dossiers HDS, specs commerciales)
  sont exclus via `.git/info/exclude` — jamais via `.gitignore`, qui est tracké
  et divulguerait leurs noms.

### Données de test

- Patient, praticien et bilans **fictifs** uniquement : `praticien@exemple.invalid`,
  téléphone `00 00 00 00 00`, adresse « 1 rue Fictive ».
- **Jamais de donnée réelle dans un test, y compris dans un contrôle d'absence.**
  Un test « le rapport ne doit pas contenir <nom|ville|rue> » publie ces données
  (incident évité le 12/10/2026). Contrôler de façon générique (seules les
  valeurs fictives sont présentes) ; un contrôle nominatif reste hors dépôt.
- Toute fonction réseau, Supabase ou Storage est neutralisée dans les outils de
  test : aucun test n'écrit en production.
- Avant chaque commit : balayage du diff (secrets avec témoins, Stripe/paiement,
  adresses e-mail ajoutées, données réelles du praticien).

## Le proxy RTK réécrit les commandes

Un hook `PreToolUse` déclaré dans `~/.claude/settings.json` fait passer chaque
commande Bash par `rtk hook claude`, qui la **réécrit** :
`npm run lint` devient `rtk lint`, `npx prettier` devient `rtk prettier`.
Ce ne sont pas des emballages transparents mais des substitutions par les
sous-commandes de RTK, avec leur propre formulation de sortie.

**Incident fondateur (27/07/2026)** : un `prettier --check` en échec, code de
retour 2, s'est affiché « Prettier: All files formatted correctly ».
L'erreur avait disparu, le code de retour seul trahissait l'anomalie.

### Règle

Toute commande dont la **sortie ou le code de retour fait preuve** doit être
préfixée par `rtk proxy`, qui exécute la commande réelle sans filtrage :
les filets, `node --check`, `gh run`, `gh pr`, `curl`, et `git show` /
`git diff` / `git log` quand ils servent à vérifier un SHA ou un message.

`rtk git` n'est PAS équivalent à `rtk proxy git`.

Le proxy reste utile et sans risque sur les commandes d'orientation
(`ls`, `git status`, survol de `git log`).

### Jamais de pipe avant la lecture du code de sortie

`cmd | tail -3; echo "exit=$?"` affiche le code de `tail`, pas celui de `cmd`.
C'est le mécanisme exact qui a masqué l'échec ci-dessus.

Forme correcte :

    rtk proxy npm test > /tmp/test.txt 2>&1; EX=$?
    tail -5 /tmp/test.txt

Même piège avec `cut`, `grep` ou tout autre filtre placé après le `|`.

### Un fichier vide ne prouve rien — un motif non éprouvé non plus

**Incident du 10/10/2026** : `rtk proxy git diff main...HEAD -- index.html js css > fichier`
a produit un fichier VIDE alors que le diff existait (479 lignes avec
`/usr/bin/git`). Le diff complet passé par le proxy, lui, était correct.
Un contrôle Stripe a failli conclure « 0 occurrence » sur ce fichier vide.

Pour tout diff ou extraction qui fait preuve et qui est redirigé vers un
fichier : `/usr/bin/git`, taille vérifiée (`/usr/bin/wc -c`), et un **témoin** —
un motif qu'on sait présent dans le même fichier. Un « 0 » sur un fichier vide
ne prouve rien.

    /usr/bin/git diff main...HEAD -- index.html > /tmp/d.txt; EX=$?
    /usr/bin/wc -c < /tmp/d.txt
    /usr/bin/grep -c 'motif-temoin' /tmp/d.txt

Un contrôle d'**absence** exige aussi un **témoin du motif** : appliquer le motif
exact à une ligne qu'on sait le contenir (il doit la trouver). Un motif mal
écrit (parenthèse attendue, `\b` non géré…) rend « 0 occurrence » partout.
`grep` qui rend **2** signale une erreur (fichier absent, nom accentué mal lu) :
ce n'est ni « trouvé » ni « absent ».

Sous zsh, une variable qui contient plusieurs chemins n'est pas découpée :
`prettier --check $F` reçoit UN seul argument. Écrire `${=F}`.
Même chose pour `set -- $n` : écrire `set -- ${=n}`.

Sous macOS, `cat` est `/bin/cat` (pas `/usr/bin/cat`, qui n'existe pas) :
un témoin à 0 l'a révélé, le fichier assemblé n'avait inclus que le diff.

Suppression sur variable : `rm -rf "${S:?}/${d:?}"` — la commande échoue au lieu
de viser la racine si la variable est vide.

## Méthode de preuve (toute modification de l'application)

1. **Lecture seule d'abord** : inventaire, cause, mesure ; arrêt pour arbitrage.
2. **Simulation sur copie** (`git archive`) avant toute écriture dans le dépôt ;
   le dépôt modifié doit être identique à la simulation (`cmp`).
3. **Remplacements par position**, comptes exacts avant et après — jamais de
   recherche-remplacement globale.
4. **Tests rouges sur `main`** (copie exacte vérifiée par `cmp`), uniquement par
   `AssertionError`. Les tests de gel et de structure passent sur `main`.
5. **Références figées générées depuis `main`**, une seule fois, jamais
   régénérées pour faire passer un test.
6. **Sabotages hors dépôt** (`verticy-sauvegardes-locales/sabotages`), rejoués
   avec le rapporteur JSON : seuls les tests de la cible tombent, toutes leurs
   erreurs sont des `AssertionError`, sources restaurées et vérifiées par `cmp`.
   Un sabotage sans effet réel est écarté et remplacé, jamais compté. Toutes
   les listes antérieures sont rejouées à chaque lot.
7. **ESLint comparé à `main` message par message** (aucun avertissement nouveau).
8. Si un test déjà livré change de verdict, ou si une référence existante
   devrait être régénérée : **arrêt et signalement**, jamais d'ajustement
   silencieux.
9. **Un « 0 » d'exécution exige un témoin de fin de chemin** : un scénario « aucune
   écriture » doit aussi prouver qu'il est allé jusqu'au bout (fonction appelée
   en dernier, `print()` de l'iframe, clic du lien). Un chemin interrompu tôt
   (contrôle d'accès, alerte, élément absent) rend « 0 écriture » sans rien
   prouver. Le harnais `tests/helpers/harnais-sauvegardes.mjs` note chaque
   bouchon appelé par son nom pour cela.
10. **L'exécution ne voit pas derrière un bouchon** : la compléter par la lecture
    statique `tests/helpers/fermeture-appels.mjs` (analyseur de `typescript`,
    déjà déclaré), qui suit tous les appels atteignables depuis un point
    d'entrée. C'est elle qui a trouvé l'écriture cachée du rapport Posturo
    (`_doBuildRapport` → `nav('pg-rapport-posturo')` → `savePosturoBilan`).
    L'outil lui-même se prouve par témoins injectés sur une copie hors dépôt
    (`BIOMECA_SRC`) : écriture directe, `supa.from(…).upsert`, `window.supa`,
    `localStorage.setItem`, appel indirect par une fonction intermédiaire.
11. **Un rouge sur `main` doit venir du comportement, pas du harnais** : si un
    espion remplace la fonction qui, sur `main`, faisait le travail mesuré, le
    test échoue pour une mauvaise raison (#277 : `saveBilanSilent` espionnée ne
    balayait plus le DOM). Rendre la chaîne réelle, puis justifier chaque rouge
    sur `main` par la différence de comportement qu'il prouve.

## Filets avant toute PR

Une seule commande, chaque code de retour capturé juste après sa commande,
tableau récapitulatif à la fin :

    rtk proxy npx prettier --check ${=F}      > /tmp/f1.txt 2>&1; EX1=$?
    rtk proxy npm run lint                    > /tmp/f2.txt 2>&1; EX2=$?
    rtk proxy npm test                        > /tmp/f3.txt 2>&1; EX3=$?
    rtk proxy npm run typecheck               > /tmp/f4.txt 2>&1; EX4=$?
    rtk proxy node --check js/biomeca.js      > /tmp/f5.txt 2>&1; EX5=$?
    rtk proxy npm run format:check            > /tmp/f6.txt 2>&1; EX6=$?
    rtk proxy node --check eslint.config.js   > /tmp/f7.txt 2>&1; EX7=$?
    rtk proxy node --check service-worker.js  > /tmp/f8.txt 2>&1; EX8=$?
    rtk proxy node --check js/landing.js      > /tmp/f9.txt 2>&1; EX9=$?
    /usr/bin/git diff --quiet HEAD -- tests/golden/resultats-279.json;      EX10=$?
    /usr/bin/git diff --quiet HEAD -- tests/golden/non-regression-1b.json;  EX11=$?

Attendu : GLOBAL=0, 0 erreur ESLint (les avertissements sont une dette connue),
1007 tests au vert, `tsc` muet.

**La CI GitHub est la référence, pas la sortie locale.** Elle exécute les mêmes
filets sur des runners neufs, hors de portée du proxy.

## Boucle de livraison

1. Branche dédiée — jamais de commit direct sur `main`
2. Modifications + filets verts
3. Bump `CACHE_VERSION` dans `service-worker.js` **dès que `index.html`, `js/`
   ou `css/` change** — la CI le refuse sinon
4. Commit local, **captures du praticien sur localhost** (patient fictif), puis
   seulement push et PR, CI verte. Aucune capture ni donnée réelle dans la PR.
5. Vérifier la garde `CACHE_VERSION` sur le run **`pull_request`** — celui du
   push ne l'exécute pas (`if: github.event_name == 'pull_request'`). La preuve
   est la **vraie ligne de sortie** (« ✓ CACHE_VERSION bump detected »), pas le
   texte du script qui apparaît aussi dans le journal.
6. Squash-merge verrouillé (`gh pr merge --squash --match-head-commit <SHA>`),
   suppression de branche, retour sur `main`, `pull --ff-only`
7. Vérifier que le run Pages cible le SHA post-fusion — comparaison par `cmp`,
   pas à l'œil
8. `curl` sur la prod pour confirmer la version servie, fichiers servis
   identiques à `main` par `cmp`

## Thème clair et couleurs

- Une page porte `page-claire` ⇒ `_appliquerTheme()` pose `body.theme-clair` :
  elle s'affiche **toujours** en clair. Il n'existe aucun réglage de thème.
  Depuis v167, toutes les pages `class="page"` d'`index.html` sont claires.
- **Aucune valeur de couleur nouvelle** : réutiliser les variables existantes
  (`--txt`, `--mut`, `--bord`, `--red`, `--verticy-bleu`, `--pedicurie-encre`,
  `--pedicurie-btn`, `--podo-encre`, `--posturo-encre`…), dont l'existence est
  prouvée par `grep` avant usage.
- Contraste ≥ 4,5:1, mesuré par `tests/helpers/fenetres-claires.mjs` (cascade,
  règles à identifiant et d'attribut, `!important`, variables locales).
- **Une couleur qui porte un sens clinique** (grade de risque, norme / hors
  norme, « rechargement échoué ») ne se modifie **jamais** dans un lot
  d'apparence : lot clinique dédié, validé par le praticien ; ses valeurs sont
  figées par test en attendant.
- Une classe partagée entre bilans (ex. `.sport-block-title.c-orange`, utilisée
  par Sport et Pédicurie) se surcharge par une **règle limitée à la page**
  (`#pg-pedicurie …`), jamais en modifiant la règle globale.

## Interdits absolus

- **Ne jamais modifier une URL de Payment Link Stripe** sans validation explicite.
- **Générer un rapport ne doit JAMAIS déclencher une sauvegarde** (risque de
  saturation du localStorage — incident du 25/07/2026).
  - Tenu depuis #277 : un rapport, une impression ou une synthèse lit l'état
    courant par une **capture EN MÉMOIRE** (`_capturerBilanSportEnMemoire` /
    `_capturerBilanPosturoEnMemoire`), sans migration, sans `savePatients`, sans
    remettre `_userDirty` à faux. Il attend la fin d'une sauvegarde en cours,
    dans la limite de 15 s, puis affiche la mention rouge « Images en cours
    d'envoi ». `nav` vers `pg-rapport` ou `pg-rapport-posturo` capture
    seulement ; toute autre destination garde capture + sauvegarde (#116).
    Garanti par `tests/sauvegardes-rapport-277.test.mjs`.
- **Ne jamais supprimer une clé `...Path`** sur le seul constat d'un canvas vide :
  la dataURL est retirée après upload vers Storage, un canvas vide ne prouve rien.
- **Aucune purge automatique** de données suspectes sur heuristique. Un fantôme
  persisté est indiscernable d'une saisie légitime. Prévention pour les nouveaux
  bilans, neutralité pour les anciens, nettoyage manuel.
- `contact@verticy.fr` est l'`ADMIN_EMAIL` fonctionnel (bascule #229-C validée
  le 10/08/2026) — ne jamais le remplacer. Il vit à DEUX endroits qui doivent
  rester alignés : `VERTICY_ADMIN_EMAIL` (js/biomeca.js) et `ADMIN_EMAIL`
  (supabase/functions/admin-users/index.ts, la vérification qui fait foi) —
  tout changement exige le redéploiement de la fonction Edge dans la même
  fenêtre.
- L'identifiant `imgjs-logo-sciopraxi` et le fichier `logo-sciopraxi.png` sont
  fonctionnels — ne jamais les renommer.
- **Ne jamais ajouter de dépendance** (`npm install`) sans accord explicite :
  elle modifie `package.json` et `package-lock.json` d'un dépôt public.

## Pièges connus

- **Profils inversés** : `assets/morpho-profil-gauche.png` est en réalité un
  profil DROIT. Corriger par les **libellés**, jamais par les images ni les clés.
- **Service worker tenace** : désinscrire un SW ne prend effet qu'une fois tous
  les onglets contrôlés fermés. Utiliser « Contourner pour le réseau » dans les
  outils de développement. **Ne jamais toucher à « Effacer les données du site »**,
  qui viderait le localStorage — donc tous les patients.
- **Remplacements globaux** : jamais de recherche-remplacement sur un identifiant
  court. Un `155` → `150` a failli transformer la couleur `#155724` en `#150724`.
  Supprimer par position, vérifier les comptes avant et après.
- **Distinction clinique** dans les rapports : « jamais dessiné » (silencieux) et
  « existe mais rechargement échoué » (mention rouge visible) ne doivent jamais se
  ressembler. Un rapport amputé ne doit pas avoir l'air normal.
- **Fenêtre de migration** : pendant une sauvegarde, `migratePhotoEntry` retire
  de l'objet en mémoire chaque dataURL déjà envoyée (Path posé) jusqu'à la
  restauration qui suit `savePatients`. Une lecture faite dans cette fenêtre
  voit un bilan amputé de ses images. Les sauvegardes ouvrent une fenêtre
  (`_ouvrirFenetreSauvegarde`, fermée dans un `finally`) ; la capture d'un
  rapport l'attend, **au plus 15 s** (aucun envoi Storage n'a de délai
  d'expiration), puis construit le rapport sous une mention ROUGE « Images en
  cours d'envoi ». Le rapport Posturo lit une **copie** prise au départ, jamais
  l'objet vivant.
- **Aucun appel réseau n'a de délai d'expiration** (`fetch` sans
  `AbortController` dans `authFetch` et `uploadPhotoBase64`) : toute attente
  d'un envoi doit être bornée.
- **Rapports Pédicurie et Podopédiatrie** : rendus dans un iframe `srcdoc` avec
  leur propre feuille ; le thème de l'application ne les atteint pas. Leur HTML
  est gelé (`tests/golden/rapports-pedicurie-podo-268.json`, données fictives,
  horloge fixe).
- **Fonctions de bascule d'onglets** (`showPedicurieSection`,
  `showPodopediatrieSection`) : elles repeignent les onglets en dur à chaque clic ;
  toute couleur d'onglet se change aussi dans le script, pas seulement dans le
  balisage.

## Conventions de code

- Préfixe `_` pour tout symbole volontairement inutilisé — arguments, variables
  et variables de `catch` (les trois motifs sont configurés dans `eslint.config.js`).
  Pas de code mort masqué (`void x;`) : on le retire.
- Commentaires en français, référencés au numéro de tâche. Pas de nom de
  personne dans les commentaires (dépôt public) : « praticien ».
