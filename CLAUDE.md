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

- **Comptes de `var()` de `palette-bilans.test.mjs`** : changer la couleur d'un
  bouton de la zone `#257 ZONE` déplace des `var()` entre familles et fait
  tomber le test 3. Si le déplacement est voulu, ajuster `COMPTES_ATTENDUS`
  en commentant le lot (total inchangé), jamais le contourner.
- **Miroirs de la synchro et du hit-test** : `_retirerCollisionsId` (bloc
  `#245 GARDE`) et `findMarkerAt` (bloc `#244 HITTEST`) de `js/biomeca.js` ont un
  miroir dans `js/bilan-sync-guard.mjs` / `js/calc.mjs`, comparé par test
  différentiel. Modifier `js/biomeca.js` d'abord.
- **Comptes sans abonnement Stripe** : `admin_gratuit` et `partenaire_podaxia`
  n'ont ni résiliation ni renouvellement (`_engagementHorsStripe`) ; ne jamais
  leur ouvrir le portail de facturation.
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

## Mannequin postural 3D — acquis (PR #351) et module 3D à venir (plan de semelle)

Le **mannequin postural 3D** (curseurs cliniques au lieu des silhouettes dessinées) est livré dans le bilan postural,
onglet Morphostatique, en 1re position de la section. Le **plan de semelle 3D** avec export STL reste à faire ; sa
spécification est **locale**, exclue via `.git/info/exclude` : ne jamais la commiter, la déplacer ni la citer dans un fichier tracké.

**Mannequin — ce qui existe**

- **Code** : `js/mannequin3d/` (`parametres.js` curseurs + pose + tableaux types ; `moteur.js` Three.js, squelette, repères ;
  `ui.js` interface ; `dictee.js` dictée libre ; `mecanismes.js` + `mecanismes-data.js` règles de mécanismes lésionnels).
  Intégration dans `js/biomeca.js` : bloc `#m3d-posturo` (fonction `_m3dPosturoInit`), section « Mannequin 3D » du rapport
  (4 vues avec repères, écarts, hypothèses cochées). Données enregistrées dans `bilanDataPosturo.mannequin3d`
  (`{sexe, peau, valeurs, retenues}`, une centaine d'octets). Les anciennes silhouettes sont conservées masquées et réapparaissent si un dessin existe.
- **Assets** : `assets/vendor/three/` (Three.js MIT, auto-hébergé), `assets/mannequin/{homme,femme}.glb.gz` (≈ 4,5 Mo chacun,
  chargés à la demande, jamais précachés) ; 6 modèles d'enfant du même poids (seul celui qui sert est téléchargé). Générés par `scripts/mannequin/` (Blender + MPFB hors dépôt, `/root/outils/mannequin`) ;
  `scripts/mannequin/gen_meca.py` produit `mecanismes-data.js` depuis le document de règles (à régénérer, ne pas éditer à la main).
- **Sport et podopédiatrie** (PR en cours) : même module, blocs `#m3d-sport` (ssec-1) et `#m3d-podo` (onglet Morphostatique,
  `pdpsec-3`), insérés en tête de la carte par `_m3dMonterBloc` (biomeca.js) ; valeurs dans `bilanData.mannequin3d` et
  `bilanDataPodopediatrie.mannequin3d`. Podopédiatrie : mannequin ENFANT par période (II, III, IV ; `{garcon,fille}_pII…IV.glb.gz`,
  génération dans `scripts/mannequin/README.md`). Mécanismes lésionnels pour l'adulte, le sport et la période IV seulement
  (règles de l'adulte ; genu valgum physiologique avant 6 ans). Rapports : `_m3dRapportHTML` (section Mannequin 3D en tête de la
  Morphostatique ; podo : `_resolvePodoRapportImages` → `visuals.m3d`).
- **Mécanismes lésionnels** : 51 règles (R01–R51), références vérifiées une à une ; R49–R51 = expertise SCIOPRAXI, sans source.
  Hypothèses jamais un diagnostic ; le praticien coche celles à inclure au rapport. Les seuils d'activation lisent les seuils du
  cabinet (`POSTURE_THRESHOLDS`, Paramètres) quand un équivalent existe (champ `s` des conditions), sinon les défauts du logiciel.
- **Dictée** : propositions à valider, jamais appliquées d'office ; transcription = celle du navigateur (Whisper local ou IA
  hébergée HDS : décision en attente, aucune donnée de santé hors hébergeur certifié).

**Pièges appris**

- **Versions** : un bump = `CACHE_VERSION` (service-worker.js) + `BUILD` (parametres.js) + `APP_BUILD` (biomeca.js) + suffixes
  `?v=` de TOUS les imports relatifs de `js/mannequin3d/*.js` et du `.glb.gz` + `tests/portail-apercu-praticien.test.mjs` + libellé
  de `tests/e2e/mannequin3d.spec.ts`. Sans `?v=`, un navigateur mélange d'anciens et de nouveaux modules (« does not provide an export »).
  Un test impose l'accord des numéros ; « Mon compte » affiche la version du code chargé ; un bandeau propose d'actualiser.
- **CSP** : GLTFLoader lit les textures par `fetch(blob:)`, bloqué par `connect-src` ; le moteur masque `createImageBitmap` pendant
  `parse()` pour passer par TextureLoader. Toujours tester dans l'application réelle (E2E Playwright), pas sur un banc sans CSP.
- **Service worker** : les `.js`/`.css` passent en network-first avec `cache:'no-cache'` (le cache HTTP servait d'anciens modules).
  Aperçu : `/root/projets/VERTICY/apercu_serveur.py` (Cache-Control no-cache, port 8080, `background=true`).
- **E2E** : `patients` et `ouvrirBilanPosturo` sont des variables de script, pas des propriétés de `window` (`eval('patients')`).
  Toute spec qui crée un patient fictif le supprime (✕ de la liste) ; relire la liste après coup.
- **Prettier** réécrit les tableaux/imports sur plusieurs lignes : un `str.replace` Python sur du code déjà formaté échoue en silence.
  `assert old in s` avant d'écrire, puis relancer l'E2E.
- **Convention** : côtés = côtés du PATIENT ; x = gauche du patient, y = haut, z = devant ; bascule + = côté droit plus haut.

Règles communes à tout module 3D :

- **Isolement** : un dossier par module (`js/semelle3d/`, `js/mannequin3d/`), modules séparés, **import dynamique** à l'ouverture
  (une petite intégration dans `js/biomeca.js`, rien dans `index.html`). Le chargement des autres bilans ne doit pas changer.
- **Dépendances** (`three`, `OrbitControls`, `STLExporter`, `GLTFLoader`, `three-mesh-bvh`,
  `meshoptimizer`, `manifold-3d`…) : chacune est un ajout soumis à **accord explicite**
  (version exacte, licence, taille). Auto-hébergées sous `assets/vendor/` comme pdf.js
  (CSP : aucun CDN), chargées à la demande, **jamais** dans `PRECACHE_URLS` par défaut.
- **Calcul lourd en Web Worker** (carte de hauteur, maillage, rasterisation) : le fil
  principal ne bloque jamais, même sur un scan dense.
- **Fonctions de calcul pures et testées** ; un STL produit est **relu par un test**
  (maillage fermé, aucune arête libre, normales cohérentes), pas jugé à l'œil.
- **Reprise des bilans existants** : les anciens dessins (silhouettes, plans de semelle)
  restent lisibles et affichés tels quels. Aucune conversion ni purge automatique.
- **Côtés** : convention déclarée une seule fois — la droite du patient est à gauche de
  l'écran en vue de face. Piège des profils inversés : corriger par les libellés.
- **Rendus pour les rapports et les comparateurs** : vues figées en **projection
  orthographique**, même échelle pour toutes les vues (la perspective fabrique de fausses
  asymétries). Les valeurs des curseurs sont enregistrées comme **données**, pas comme image.
- **Valeurs proposées, jamais imposées** : compensations automatiques et réglages issus de
  la dictée s'affichent en suggestion et exigent la validation du praticien. Rien n'entre
  silencieusement dans un bilan.
- **Fichiers de modélisation** (`.mhm`, `.blend`, scans bruts) : hors du dépôt. Seul l'asset
  exporté (glTF) entre dans `assets/`, avec sa licence vérifiée (CC0 pour les corps
  MakeHuman/MPFB). **Ne jamais copier de code MPFB (GPL)** dans Verticy.
- **Scans importés** : formats ouverts (STL, OBJ, PLY), lecture indépendante de la marque du
  scanner ; **contrôle d'échelle obligatoire** à l'import (un scanner grand public n'est pas
  un dispositif médical). Un scan pèse 20 à 80 Mo : rétention et compression décidées avant
  le stockage, chiffrement HDS compris.
- **PDF** : Verticy n'a pas de génération PDF côté serveur ; les sorties passent par
  l'impression navigateur comme les autres rapports.
- **Exception volontaire de `pg-capture`** (décision #279 étape 4) : quitter `pg-capture`
  écrit le brouillon du test cinématique en cours (`_ecrireBrouillonMaintenant`) **y compris
  vers le rapport écrit**, alors que `nav` vers `pg-rapport` / `pg-rapport-posturo` ne fait
  sinon qu'une capture sans écriture (A1). C'est voulu : le déclencheur est la navigation, et
  le brouillon ne doit pas se perdre. **Ne pas la « corriger »** pour aligner `nav` sur A1.
- **Marqueur « non synchronisé » (A2)** : au démarrage la mémoire vient du **cloud** ; le
  stockage local n'est relu qu'en repli. Une écriture locale seule serait donc perdue. Chaque
  écriture locale pose `bm4-nonsync:<uid>` = `{ seq, t, base }` (`base` = `updated_at` du
  dernier état cloud connu). Posé par `savePatients`, `_ecrireLocalAvantEnvoi` et
  `_marquerNonSynchronise` ; effacé par `_confirmerSyncCloud` seulement si aucune écriture
  plus récente (`seq`) n'attend. Règle de reprise (`_recupererSaisieNonSynchronisee`) : la
  saisie locale est reprise **uniquement si** le cloud est resté à `base` et que le local n'est
  pas plus pauvre ; sinon elle est gardée dans `bm4-recuperation:<uid>:<t>`, **jamais
  appliquée, jamais supprimée** (ne pas ajouter de nettoyage automatique).
- **Indicateur d'état de sauvegarde (A2)** : 5 états globaux — `dirty`, `saving`, `saved`,
  `pending` (écrit ici, serveur non confirmé), `failed`. Alimenté par `_etatApresLocal`
  (résultat de `savePatients`) et `_etatApresCloud` (résultat de `saveToSupabase`) via
  `_etatSauvegarde`. Le `<span class="etat-sauv">` est **inséré par le script**
  (`_installerIndicateursEtat`) avant chaque bouton « Sauvegarder », **jamais écrit dans le
  HTML ni dans le gabarit Posturo** : les tests de structure #268 figent ces pages. Posturo
  étant généré après coup, l'insertion est rappelée à chaque rendu.
- **Bandeaux et alerte de stockage (A2)** : `#stockage-banner` (stockage local plein, reste
  affiché tant que les écritures échouent) et `#photo-envoi-banner` (échec d'envoi d'une
  photo, appelé par `uploadPhotoBase64`) ; l'alerte de stockage est **unique par incident**
  (`_stockageIncident`, levé par le premier enregistrement réussi). Les galeries affichent
  « photo non rechargée » + Réessayer au lieu d'un « chargement… » infini.
- **Harnais de test qui extraient des fonctions par leur nom** : les tests de `savePatients` /
  `saveToSupabase` (`synchro-dataurl-269`, `nb-tests-mesures-279`, `a2-*`) construisent leur
  code en extrayant des fonctions de `js/biomeca.js` **par nom**. Une fonction nouvelle
  appelée par une fonction extraite doit être **ajoutée à la liste du harnais** (sinon
  `ReferenceError` dans le test, pas dans l'application). Pour un appel optionnel, la forme
  `typeof f === 'function'` protège les autres harnais ; ne jamais retirer une assertion pour
  faire passer un test.

## Mode domicile et hors connexion — acquis (PR #287)

- **Deux niveaux** : la case « Mode domicile » (réglage par appareil et par compte,
  `bm4-mode-domicile:<uid>`, activable avec du réseau seulement) et le **passage automatique**
  hors connexion (`_reseauPerdu`, événement `offline`, exception de requête, sonde de 15 s).
  `_modeSansVerrou()` = l'un ou l'autre : plus de verrouillage par inactivité, bandeaux **bleus**
  (`_horsConnexion()`), jamais rouges. Le rouge reste réservé à une vraie panne avec réseau.
- **Un échec de requête n'est reconnu comme perte de réseau que s'il est une exception**
  (`_estErreurReseau`), jamais sur un statut HTTP.
- **Session et abonnement gardés 7 jours** : `bm4-session-hc` (jeton) et `bm4-acces-cache:<uid>`.
  La copie de session n'existe que si le mode domicile est coché ou pendant une coupure ; effacée
  à la déconnexion (`clearPwaSession`) et à 7 jours. Ne jamais appliquer le cache d'un autre compte.
- **Photos en attente** : `_jsonPatientsLocal` remplace toute image `data:image` de plus de 20 Ko par
  une référence `idb:<empreinte>` dans la copie locale (mémoire inchangée), rangée dans IndexedDB
  (`verticy-photos`, v2 : `p` en attente, `v` consultées, `m` métadonnées). Toute écriture de
  `bm4-patients:<uid>` doit passer par `_jsonPatientsLocal` puis `_ecrirePhotosIdb`, **sauf à la
  fermeture d'onglet** (écriture directe, une écriture asynchrone serait coupée). Au chargement,
  `_rehydraterPhotosIdb` remet les images ; si le coffre est injoignable, les références sont
  **conservées**, jamais supprimées.
- **Ouverture d'IndexedDB : toujours bornée** (2 s, pas d'insistance pendant 30 s,
  `onversionchange` libère). Un autre onglet resté sur une ancienne version bloque sinon la mise à
  jour de la base et fige l'ouverture d'un bilan hors connexion.
- **Renvoi au retour du réseau** (`_renvoyerApresReconnexion`) : relit l'abonnement, envoie les
  photos de **tous** les patients (`_envoyerPhotosEnAttente`, pas seulement la page ouverte), puis
  `saveToSupabase`. Une photo n'est retirée que quand son chemin Storage est posé.
- **Photos déjà envoyées consultables hors connexion** : mode domicile seulement, 200 Mo,
  éviction des moins récemment lues, **purge à la déconnexion et à la désactivation du mode**
  (poste partagé : aucune photo de patient ne doit rester). Lecture bornée à 5 s.
- **Service worker** : les requêtes `/rest/v1/` et `/auth/v1/` de Supabase ne passent **jamais** par le
  cache (une réponse périmée hors connexion serait prise pour l'état du serveur et pourrait être
  réécrite par-dessus des données plus récentes). Le **précache en échec fait échouer
  l'installation** (pas de `.catch`), sinon une version à cache vide reste « en attente » et
  l'ancien code continue de tourner. `staleWhileRevalidate` rend `Response.error()`, jamais
  `undefined`. « Mon compte » affiche la version exécutée (`_afficherVersionApp`).
- **Méthode de test** : sur un localhost passant par un tunnel, couper le wifi coupe aussi le tunnel.
  Simuler avec F12 → Réseau → Hors connexion, **F5 et non Ctrl+Maj+R**, case « Contourner pour le
  réseau » décochée. Ne jamais lancer de test automatique sur le compte du praticien ; les essais
  automatisés créent un patient fictif qu'il faut supprimer (et vérifier : 0 patient).
- **Onglet « Mode domicile »** (`#domicile-onglet`) : créé par le script, en bas à gauche, jamais
  écrit dans le HTML (les structures de « Mon compte » sont figées par les tests #268).

## Ordonnances du podologue — acquis (PR #289)

- **Stockage dans le blob existant** : `patient.ordonnances` (copie figée du praticien, sans
  SIRET ni IBAN, et du patient) et `praticien.modelesOrdonnance`. Aucune table, aucun réseau,
  aucun envoi (HDS non migré). Écriture uniquement par `savePatients` / `savePraticiens`,
  jamais en `localStorage` direct.
- **Signature et tampon** : `praticien.signature` (`data:image` PNG/JPEG/WebP, 400×200 max),
  relue à l'affichage, **jamais copiée dans l'ordonnance**. Seule une valeur `data:image` est
  acceptée (sinon ignorée).
- **Les alertes sont des avertissements, jamais des blocages** : la liste réglementaire des
  prescriptions du podologue (art. R4322-1 CSP, arrêté du 30/07/2008) n'a pas été lue en texte
  intégral. Seul un RPPS/ADELI absent bloque l'enregistrement.
- **Menu « Ajouter à l'ordonnance »** : `ORDO_CATEGORIES[type].produits` est une liste fournie
  par le praticien, à ne pas modifier sans son accord. Modèles de départ non intégrés : une
  liste de 6 à 8 est à lui soumettre avant ajout.
- **Piège** : `palette-bilans.test.mjs` (`COMPTES_ATTENDUS` var() et `PAGES_CLAIRES`) bouge
  quand on ajoute un bouton ou une page.

## Traçabilité de stérilisation — acquis (PR #291)

- **Stockage dans le blob existant** : `praticien.sterilisation` (`{appareils, sets, cycles,
maintenance, dernierNumero}`) et `patient.soinsSterilisation` (`{id, date, sachets[],
registrePratId, note}`). Aucune table, aucun réseau, aucun envoi (HDS non migré).
  Écriture uniquement par `savePraticiens` / `savePatients`.
- **Numérotation** des cycles continue (`dernierNumero`), sachets `C0001-01`. Un sachet lié
  à un soin ne peut pas être retiré de son cycle.
- **Les alertes sont des avertissements (`confirm`), jamais des blocages** ; seuls la date
  et l'appareil manquants bloquent. Délais de rappel (Bowie-Dick 7 j, contrôle 365 j, état
  stérile 60 j) = valeurs par défaut modifiables, à confirmer avec la notice du fabricant.
  Les textes officiels (R5211-5 et R5212-25 CSP, circulaire DGS/DHOS 138 du 14/03/2001)
  n'ont pas été lus en intégral ; source consultée : onpp.fr (traçabilité de la
  stérilisation et de la maintenance).
- **Export CSV** : toute cellule commençant par `=`, `+`, `-` ou `@` est neutralisée par une
  apostrophe. **Impression** : aucune garde d'abonnement, aucun nom de patient dans le registre.
- **Abonnement terminé / compte non conforme** : création bloquée (`create_sterilisation`),
  consultation, impression et export restent libres.
- **Harnais** : `tests/sterilisation.test.mjs` extrait de `js/biomeca.js` la section
  « Traçabilité de stérilisation » (début et fin par repères) ; toute fonction ajoutée dans
  la section est reprise automatiquement. Ne pas déplacer les repères.
- **Piège** : `palette-bilans.test.mjs` (`COMPTES_ATTENDUS` : `--mut` 15, `--card` 10,
  `--bord` 9 ; `PAGES_CLAIRES` contient `pg-sterilisation`) bouge quand on ajoute un
  bouton ou une page.
- **Test navigateur sur le VPS** : Chromium de `/opt/playwright` (`--no-sandbox`) avec
  playwright du dépôt et `python3 -m http.server 8080` ; session simulée (`pwaUser`,
  `praticiens`, `patients`, `_dataLoaded`, masquer `#pwa-login`, afficher `#biomeca-app`).

## Agenda, Doctolib et marque — acquis (PR #293)

- **Doctolib : import manuel seulement.** Pas d'extension (les CGU soumettent toute
  extraction automatisée à accord). On importe l'export officiel « Historique de RDV »
  (CSV), en **lecture seule** (`praticien.agendaDoctolib`). Si un partenariat est accordé,
  une API pourra être étudiée ; pas avant.
- **Confidentialité de l'agenda** : la grille affiche des **initiales partout** (Doctolib,
  Google, événements liés) ; nom complet et téléphone **seulement dans la fenêtre de
  détail**. Un événement lié à un patient (`praticien.agendaLiens`) n'envoie à Google que
  les **initiales + le motif**, jamais le nom complet.
- **Couleurs par compte** : `praticien.agendaCouleurs` (Google, Apple, Doctolib).
  Le téléphone est cliquable (`tel:`), y compris pour Doctolib.
- **Échec Google** : bandeau avec la raison et un bouton « Reconnecter ». Cause probable
  des échecs répétés : application OAuth en mode « Testing » (autorisation de 7 jours),
  à publier ; la vérification Google sera nécessaire avant ouverture à tous (scope
  sensible `calendar.events`).
- **Marque** : logo « by Sciopraxi » (`assets/by-sciopraxi.png`), nettement plus petit que
  Verticy, sous le logo Verticy sur les écrans de connexion, l'en-tête de l'app,
  l'en-tête de rapport et les 4 rapports.
- **Tests** : fichiers d'export Doctolib **fictifs** uniquement, dates calées sur la
  semaine de test ; aucun envoi vers Google dans les tests (faux serveur).

## Notifications et synchronisation — acquis (PR #296)

- **Centre de notifications** : onglet « 🔔 Notifications » (pastille de non-lus), historique
  dans le blob praticien `praticien.notifications` ({ liste, dernierId }), **aucune table**,
  **aucune purge automatique et aucun bouton de suppression**. Export CSV (lecture seule,
  sans nom de patient, protégé contre les formules de tableur).
- **Contenu d'une notification** : type, date, identifiants (patient, ordonnance, document),
  jamais un nom ni le contenu d'un message. Le détail (nom du patient, rendez-vous importés,
  ordonnance, devis ou facture) est **relu à l'affichage** dans les données du dossier ou
  dans `documents_facturation` (lecture seule) ; si la source a disparu, un message le dit.
- **Émetteurs** : import Doctolib (rendez-vous réellement nouveaux), coupure et retour de
  connexion (une seule ligne par coupure), devis ou facture émis, ordonnance créée. Les types
  du portail patient (message, devis signé, questionnaire, séquence d'exercices, protocole
  terminé) sont déclarés ; leurs émetteurs viendront avec le portail.
- **Écriture différée** : `notifierEvenement` inscrit en mémoire tout de suite et enregistre
  ~1,5 s plus tard (une seule écriture, immédiate si la page se masque).
- **Piège de synchronisation (22/10/2026)** : `saveToSupabase` renvoie tout le dossier. Un
  dossier de 11 Mo (photos « data: » déjà envoyées dans Storage et restées en mémoire) dépassait le délai
  de 8 s du rôle `authenticated` (erreur PostgreSQL 57014, HTTP 500) : bandeau rouge,
  modification perdue au rechargement. Règle : **l'envoi au cloud filtre lui-même les photos qui
  ont un chemin Storage jumeau**, quel que soit l'appelant (`savePatients`, `savePraticiens`),
  sans jamais retirer une photo sans chemin ; la mémoire est restaurée aussitôt.
- **Bandeau de synchronisation** : il affiche un **détail technique** (statuts et codes SQL
  seulement, jamais de donnée) pour diagnostiquer sans console.
- **Diagnostic d'un dossier lourd** : requêtes de lecture seule sur `pg_column_size` (par bloc
  de `user_data.data`, puis par patient). Ne jamais afficher d'identité dans ces requêtes.

## Portail patient, lot (b) — acquis (PR #298)

- **Architecture** : page séparée `patient/` (CSP sans script ni style en ligne, service worker de
  portée `/patient/` avec son propre préfixe de cache `verticy-patient-`, jamais `biomeca-`, que
  l'autre service worker purge). Compte patient = compte Supabase Auth marqué
  `app_metadata.role = 'patient'` (non modifiable par le client), lié à UNE fiche de `patients`.
- **Connexion** : le mot de passe Supabase initial est **aléatoire et inconnu** ; la date de
  naissance (AAAAMMJJ) est vérifiée par l'Edge Function `patient-connexion` (déployée sans
  jeton), une seule fois, puis un billet signé (HMAC, 10 min) à nonce consommé par UPDATE
  conditionnel permet de choisir le mot de passe. Jamais la date comme vrai mot de passe :
  une limite d'essais côté interface seule serait contournable en appelant Supabase directement.
- **Essais limités côté base** : `portail_reserver_tentative` compte l'essai AVANT de le
  vérifier (5 essais, blocage 15 min), réservée au `service_role` ; limite par adresse IP en
  plus (douce : peut dépasser de quelques requêtes simultanées). Supabase ignore une adresse
  IP falsifiée dans `x-forwarded-for`.
- **Politique de mot de passe du projet** : minuscule + majuscule + chiffre + symbole. Tout mot de
  passe fabriqué par le code doit la respecter ; si Supabase refuse le mot de passe choisi, le
  billet doit être **rendu** (sinon le patient est bloqué).
- **RLS** : politiques `RESTRICTIVE` `pas_patient` sur les tables praticien et sur le stockage
  `patient-media` ; les tables des lots suivants doivent s'appuyer sur `portail_patient_actuel()`
  (compte actif seulement). Le client n'écrit jamais dans `patient_comptes` (GRANT de colonnes
  limité au représentant légal) : création, réinitialisation et fermeture passent par
  `patient-compte` (clé d'administration serveur, qui ignore la RLS : contrôler explicitement que la
  fiche appartient au praticien).
- **Fonctions praticien** : `start-trial`, `help-chat` et `prepare-module-change` refusent un
  compte patient (sinon un patient obtiendrait un essai gratuit). Dette : les fonctions du
  calendrier acceptent encore tout compte connecté.
- **Aucune donnée lourde ni de santé dans le blob praticien** pour le portail : tables dédiées.
  Les futurs documents du portail seront copiés au moment où le praticien les partage.
- **Preuve** : `supabase/tests/portail-patient-base.test.sql` (banc d'attaques sur base jetable,
  finit par `TOUT_OK`) et `tests/portail-patient-base.test.mjs` (parcours complet des deux fonctions sur
  base simulée ; la base simulée doit rendre un tour de boucle d'événements par requête, sinon
  les appels simultanés ne s'entrelacent pas). Les attaques réelles se jouent avec des patients
  FICTIFS puis se nettoient (aucun compte `@patients.verticy.invalid` ne doit rester).
- **Pièges** : le motif `service_role` est interdit même en commentaire dans `js/`,
  `index.html` et `service-worker.js` (garde de la CI) ; ajouter un bouton à la carte patient déplace
  les `var()` de `palette-bilans.test.mjs` ; les fonctions appelées par `onclick` passent par
  `Object.assign(window, …)` pour ne pas ajouter d'avertissement ESLint.

## Portail patient, lot (b2) — acquis (PR #300)

- **Modèle** : table `documents_partages` (copies figées, jamais le blob) + bucket privé `patient-documents`
  (HTML seulement, 20 Mo). Chaque document partagé est UN fichier HTML autonome
  `<id de la fiche>/<uuid>.html` (même rendu que l'impression ; scripts, liens et attributs `on*`
  retirés, images réduites à 800 px). Devis, factures et ordonnances gardent en plus un `contenu`
  jsonb (devis/factures construits côté serveur depuis le document émis) pour la signature à venir.
- **Partage** : automatique à l'émission d'un devis ou d'une facture et à l'enregistrement d'une
  ordonnance (si le patient a un compte portail ; jamais un brouillon ; silencieux, ne bloque jamais).
  Les rapports de bilan passent par le bouton « Publier au patient » (générer un rapport ne sauvegarde
  jamais). Le praticien retire ou remet un document dans la fenêtre 🔑 ; rien n'est supprimé ni purgé.
  Un document retiré reste retiré si l'application le repartage.
- **Droits** : le client n'a aucun droit d'écriture sur `documents_partages` ni de modification ou
  suppression de fichier ; tout passe par des fonctions `SECURITY DEFINER` qui contrôlent la fiche du
  praticien, le chemin du fichier (dossier de CE patient, fichier déjà déposé) et le compte actif.
  Le patient lit seulement ses documents non retirés (`portail_patient_actuel()`) et le fichier
  correspondant (`portail_peut_lire_fichier`) ; sa seule écriture est `portail_document_lu`.
- **Piège du CDN** : le réseau de diffusion de Supabase garde une réponse 200 par adresse et jeton
  sans revérifier les droits. L'application patient ajoute donc un paramètre aléatoire `?v=` à chaque
  ouverture ; sans lui, un document déjà lu restait ouvrable après retrait. Tout futur fichier du
  portail suit la même règle.
- **Affichage patient** : cadre `iframe` avec `sandbox="allow-same-origin allow-modals"` (jamais
  `allow-scripts`) ; la CSP de `/patient/` admet le style en ligne (rendu des documents) mais aucun
  script en ligne ni `eval`.
- **Preuve** : `supabase/tests/portail-documents-partages.test.sql` (base jetable, finit par `TOUT_OK`,
  rejoué avec des règles volontairement cassées) et `tests/portail-documents-partages.test.mjs`. Les
  attaques réelles se jouent avec des patients FICTIFS puis se nettoient. Supabase interdit de
  supprimer des lignes de `storage.objects` en SQL : nettoyer par l'API Storage, avec une politique
  temporaire limitée au préfixe fictif, retirée aussitôt.
- **Pièges** : un nouveau bouton dans une page de bilan change le golden
  `tests/golden/structure-pedicurie-podo-268.json` (le régénérer pour les seules lignes ajoutées) ;
  une fiche toute neuve n'a pas d'identifiant cloud avant sa première synchronisation ; un hook ajouté
  dans `enregistrerOrdonnance` ou `emettreDocumentCourant` doit être protégé par `typeof` (harnais de
  tests).

## Portail patient, lot (B) aperçu praticien — acquis (PR #303)

- **Choix** : aperçu en lecture seule avec le jeton du PRATICIEN, jamais une session patient
  usurpée (aucun marquage « lu », aucune trace côté patient). Aucun SQL : les politiques
  `pd_praticien_select` (Storage) et la lecture praticien de `documents_partages` suffisent ;
  les vérifier dans les migrations avant de redemander un jeton Supabase.
- **Mécanisme** : `portailApercu(idx)` ouvre `window.open('about:blank')` DANS le geste du clic
  (sinon le bloqueur de fenêtres), puis fiche → compte (création automatique) →
  `patient/?apercu=<uuid>`. La page patient demande le jeton à `window.opener` par
  `postMessage` ; les deux côtés filtrent `e.origin === location.origin` ET `e.source`. La page
  filtre ses requêtes `retire=eq.false&patient_id=eq.<uuid>` (la RLS praticien renverrait sinon
  tous ses patients) et saute `portail_document_lu`.
- **Fiche neuve** : `_portailAssurerFiche(p)` l'enregistre avant 🔑, 👁 et « Publier ».
  `_syncPatientToNormalizedTables` avale ses erreurs et pose `_cloudId` avant l'écriture : après
  la synchro, VÉRIFIER la ligne en base et `delete p._cloudId` en cas d'échec, sinon un faux
  identifiant fait croire la fiche enregistrée. Contrôle hors connexion AVANT l'enregistrement.
- **Pièges** : un attribut `hidden` est écrasé par la classe `.bouton` (masquer par
  `style.display='none'`) ; chaînes JS à apostrophes sans `\"` (no-useless-escape = erreur CI) ;
  chaque bouton ajouté à la carte patient ajoute +1 `--mut`/`--card`/`--bord` à
  `palette-bilans.test.mjs` ; bumper `verticy-patient-vN` casse l'assertion CSP/SW de b2 (la
  mettre à jour).
- **Preuve** : `tests/portail-apercu-praticien.test.mjs` ; parcours réel rejouable avec des
  patients fictifs, puis nettoyage.

## Facturation, lot C1 — catégories d'actes et prise en charge par défaut (PR #305)

- **Catalogue** : les actes s'affichent en catégories repliables (`CATEGORIES_ACTES`, `_categorieActe` :
  préfixe du code du référentiel ; « Mes actes personnalisés » ouverte, `autre` par défaut).
- **Acte personnalisé** : deux menus (catégorie puis acte exact de référence) qui reprennent cotation,
  base remboursable et franchise ; colonnes `acte_reference`, `regime_defaut` (standard, ald, c2s) et
  `sync_doctolib` (migration `facturation-actes-categories.sql`, appliquée à la main, idempotente,
  rejouée sur base jetable). La liste des régimes de `documents_facturation` accepte aussi `c2s`
  (100 % de la base), dans `REGIMES_REMBOURSEMENT`.
- **Devis / facture** : le PREMIER acte coché dans un document vide reprend sa prise en charge par
  défaut ; s'il a une base remboursable, la case « tiers payant » se coche (net réellement payé par le
  patient). Le praticien peut tout changer ensuite ; ensuite son choix prime. Un devis émis reste figé.
- **Pas encore fait** : envoi automatique du devis 3 jours avant le RDV (case « Synchronisation
  Doctolib » sans effet pour l'instant) et exclusion permanente de « remise semelles ».
- **Pièges** : un test qui extrait une fonction de `biomeca.js` doit lister les nouvelles fonctions
  (`NOMS`) et les constantes utilisées ; `renderActesPage` délègue la ligne à `_htmlLigneActe`.

## Exercices — jours des circuits et bibliothèque (PR #307, #308)

- **Jours des circuits** : bloc de cases Lun-Dim juste au-dessus de « Tests Avant / Après » (bilans sport et
  posturo) : une ligne pour Express 1 et 2 (même jour, matin et après-midi), une pour l'Échauffement ;
  enregistré dans `ttt.jours` (sport) et `joursCircuits` (posturo), repris dans le rapport. Modifier la page
  du bilan posturo oblige à régénérer les goldens `structure-bilan-posturo-268.json` et
  `inventaire-couleurs-posturo-268.json` (lignes ajoutées seulement, à vérifier).
- **Bibliothèque** : base SCIOPRAXI (`exercices_base*`) modifiable par contact@verticy.fr seul
  (`est_admin_verticy()` : e-mail du JWT ET rôle différent de patient) ; les praticiens la lisent par
  `exercices_base_liste()` (noms, pastilles, chemin du PDF, jamais liens ni texte) ; exercices et catégories
  personnels (`exercices_perso*`) propres à chaque praticien ; bucket privé `exercices-pdf`
  (`<uid>/…` praticien, `base/<uuid>.pdf` admin). Plusieurs vidéos : `liens_youtube text[]` (20 au plus,
  `exo_liens_ok`). Un UPDATE ou DELETE refusé par la RLS ne lève pas d'erreur (0 ligne) : tester le nombre
  de lignes, jamais l'absence d'erreur.
- **Fiches PDF** : `pdf_fichier` = fichier livré (`assets/fiches/…`) ou fichier déposé (`base/<uuid>.pdf`),
  chemin contrôlé par une contrainte SQL et par `_exoPdfValide`. Le portail patient devra lire ce champ à
  l'affichage (jamais de copie) pour que remplacement et suppression s'y appliquent aussitôt.
- **Preuve** : `supabase/tests/bibliotheque-exercices.test.sql` (trois migrations rejouées deux fois, finit
  par `TOUT_OK`, vérifié avec règles cassées), `tests/bibliotheque-exercices.test.mjs`,
  `tests/jours-circuits.test.mjs`, parcours réel `documents/e2e-bibliotheque-exercices.mjs`.
- **Piège** : une nouvelle page s'ajoute à `PAGES_CLAIRES` (`palette-bilans.test.mjs`) ; la fonction SQL
  `exercices_base_liste` change de type de retour : `DROP FUNCTION` avant `CREATE`.

## Exercices de la bibliothèque dans les bilans (lot e2, sport et posturo)

- Les listes « catégorie → exercice » des circuits lisent la bibliothèque (`exoBibRafraichir`, `_exoBib*`) :
  base SCIOPRAXI filtrée par bilan + catégories et exercices perso du praticien ; liste de secours
  `FICHES_SYSTEMES` hors ligne. Valeurs enregistrées compatibles avec les anciens bilans : catégorie de la
  base = son code (ancien slug), exercice de la base = code privé de `<catégorie>|`, exercice perso =
  `perso:<id>`, catégorie perso = `pcat:<id>`. Les libellés choisis sont conservés (`sysLib`/`subLib`,
  `circ_*_sysLib/_subLib` en posturo) : un exercice perso supprimé reste lisible dans un bilan enregistré.
- Posturo : `circ_*_sub` est désormais aligné sur `circ_*_sys` (une case vide si pas d'exercice).
- **Plus aucune annexe PDF/QR en fin de rapport** (décision du 23/10/2026, tout sera sur le portail patient) :
  code pdf.js, collecteurs et bannière « Annexes incomplètes » supprimés, `assets/vendor/pdfjs` retiré.
  Le rapport garde le texte « Catégorie → Exercice » dans « Plan de Traitement ».
- Les listes des bilans se remettent à jour à l'ouverture d'un bilan (`nav`) ET aussitôt après toute création,
  modification ou suppression dans la page Exercices (`renderExercicesPage`).
- Bouton « Modifier » d'un exercice perso : nom, catégorie (base ou perso, l'autre colonne remise à NULL), liens,
  texte, remplacement ou retrait du PDF ; PATCH en `return=representation`, 0 ligne = erreur ; nouveau PDF retiré
  si le PATCH échoue, ancien PDF supprimé seulement après succès.
- Petit dessin devant chaque titre de catégorie (listes des 3 bilans et page Bibliothèque) : `_EXO_PICTOS` par code
  de catégorie, `_exoAvecPicto(code, libelle)` ; ⭐ pour une catégorie personnelle, 🏋️ pour une catégorie de la base
  inconnue de la liste. Ajouté à l'affichage seulement : le libellé en base ne change pas. Un nouveau code de
  catégorie de la base = ajouter son dessin dans `_EXO_PICTOS`.
- Preuve : `tests/exercices-bilans-e2.test.mjs`, parcours réel `documents/e2e-exercices-bilans.mjs`.

## Programme du patient dans les bilans (lot e3a : sport `sp`, posturo `po`, podopédiatrie `pd`)

- Bloc « 🏋️ Programme du patient » (`_progHTML`, `_progMonter`, `_progLire/_progEcrire`, `_progMaj`) : case
  « Programme de renforcement des muscles profonds des pieds » et case « Circuits d'exercices » (Express 1 et 2
  ensemble, Échauffement : une période chacun). Dates par défaut : début = lendemain du bilan (date de
  consultation, sinon aujourd'hui), fin = début + 27 jours ; modifiables (fin qui suit le début tant qu'elle
  n'a pas été touchée). Programme du pied : jours 1 à 28 dans l'ordre, puis retour en sens inverse (jour 29 =
  exercices du jour 27, jour 30 = jour 26…, `_progJourPied(n)`), 55 jours au plus (le jour 55 = exercices du jour 1 ; fin plafonnée).
- Séances par jour (`_progSeances`, tronçons de dates) : ordre Échauffement, Express 1, programme du pied du
  jour, Express 2 ; Express + pied = 3, Échauffement + pied = 2, les trois = 4. Texte dans le bilan et le rapport.
- Données : `bilanData.ttt.programmes` (sport), `bilanDataPosturo.programmes`, `bilanDataPodopediatrie.programmes`
  `{ pied, circuits, express, chauffe }` (chacun `{ actif, debut, fin }`). Podopédiatrie : tableaux Express 1,
  Express 2 (4 exercices) et Échauffement (8, ratio 30/30 ou 45/15) dans `circuitsPodo = { c1, c2, ch }`,
  catégorie → exercice de la bibliothèque (même lecture que sport via `_readSportTttExo`). L'Échauffement se
  remplit tout seul = Express 1 (ex.1-4) + Express 2 (ex.5-8), verrouillé (`_podoSyncChauffe`) ; un seul choix
  30/30 ou 45/15 à côté du titre (`pd-ch-ratio`, `circuitsPodo.ratio`) s'applique à tous les exercices.
- Posturo : `po-programmes-wrap` est un simple conteneur dans le gabarit, rempli par `_progMonter('po')` après
  injection (goldens : lignes ajoutées seulement). Reste à faire (e3b) : tableau de 28 jours du programme du pied
  (EMOM 45/15) puis portail patient.
- Séances par jour : calculées jour de la semaine par jour de la semaine (`_progSeances(p, jours)`) d'après
  « Jours des circuits » (Express et Échauffement seulement les jours cochés ; aucun jour coché pour un circuit =
  tous les jours ; programme du pied tous les jours) ; un changement de case se répercute aussitôt (écouteur
  `change` global sur `*-jours-*`). Podopédiatrie a maintenant son bloc « Jours des circuits » (`pd-jours-*`,
  `joursCircuits`).
- Posturo : « Programme du patient » et « Jours des circuits » AU-DESSUS des tableaux Express ; tableau
  Échauffement (`po-circ-ch`, ajouté par `_progMonter`) visible quand la case est cochée, rempli automatiquement
  par Express 1 + 2 (`_circChauffeSync`, lecteur `_lireLigneCircuit`), rythme `circ_ch_ratio`. Rapport : section
  « Traitements » puis circuits « Express 1 (20/10) », « Express 2 (20/10) », « Échauffement EMOM (8 min) — 30/30
  ou 45/15 », puis plan de semelles.
- Sport : un seul sélecteur 30/30 ou 45/15 (`sp-ch-ratio`) à côté du titre de l'Échauffement, appliqué aux 8
  exercices (les sélecteurs par exercice sont masqués, la donnée `ttt.ch[i].ratio` est inchangée) ; le rapport
  l'affiche à côté du titre du circuit.
- Piège : le service worker sert les .js en cache d'abord ; changer le code sans changer `CACHE_VERSION` laisse
  Joël voir l'ancienne version sur son localhost (pousser un correctif = incrémenter la version).
- Preuve : `tests/programmes-bilans-e3a.test.mjs`, parcours réel `documents/e2e-programmes-bilans.mjs`.

## Fiches PDF découpées : une fiche par exercice (PR « fiches-pdf-une-par-exercice »)

- Les fiches qui contenaient plusieurs exercices (plusieurs QR codes) sont découpées en 63 fiches d'un seul exercice,
  chacune avec SON QR code : `assets/fiches/<catégorie>/<n°>.<k> <exercice>.pdf` (en-tête de la fiche d'origine +
  bloc de l'exercice). Les fiches d'origine ne sont ni modifiées ni supprimées. Générées hors dépôt par
  `documents/extraction-qr/build_pdf.py` (pymupdf, `show_pdf_page` + QR régénéré par zxing-cpp quand le QR d'origine
  était faux), vérifiées par `verif_pdf.py` (1 page, 1 QR, lien attendu).
- Dans la base, l'exercice découpé a le code `<code de la fiche d'origine>|<clé>` et son `pdf_fichier` propre ; la fiche
  entière est désactivée (`actif=false`) mais gardée (les anciens bilans la retrouvent par le préfixe). Le SQL est
  `documents/sql-decoupage-exercices.sql` : à coller APRÈS la fusion de cette PR (sinon `pdf_fichier` pointe vers un
  fichier pas encore livré).
- Non découpées : Landau (1 exercice « superman » en 2 variantes), saccules (1 exercice rebond / corde à sauter,
  nouvelle vidéo), utricules, mâchoire, proprioception, avant / après rééducation oculaire, respiration,
  pathologies. Fiche RVO : 2 exercices (la 2e fiche n'a que le titre et le QR, la fiche d'origine n'a pas de texte).

## Exercice « Rééducation du pied » retiré de la bibliothèque

- La fiche « 1. Rééducation du pied » (28 jours) n'est plus un exercice de la catégorie « Rééducation du pied » : c'est
  le programme de renforcement des muscles profonds des pieds (case du bloc « Programme du patient »). Retirée de
  `FICHES_SYSTEMES` (liste de secours et import de la base) ; en base, `reeduc-pied|1. Rééducation du pied` est
  désactivée par SQL (jamais supprimée). La catégorie garde les 12 exercices du pied (`reeduc-pied|pied-enfant|…`,
  liste de secours = `_exoSubsSecours`). Le fichier PDF reste livré : il sert de source au tableau des 28 jours (e3b).

## Réorganisation des catégories d'exercices (PR « categories-exercices-reorganisation »)

- « Rééducation terrain moteur » est remplacée par `terrain-terrien` et `terrain-aerien` ; « Rééducation chaînes
  musculaires » par `chaine-flexion`, `chaine-extension`, `chaine-fermeture`, `chaine-ouverture`,
  `chaine-statique-expiration`, `chaine-statique-inspiration`. Les exercices changent de `categorie_id` par SQL (leur
  `code` ne change pas, donc la valeur `sub` stockée dans les bilans est le code complet). Les anciennes catégories sont
  masquées (`actif=false`), pas supprimées, seulement si elles sont vides. Dessins : `_EXO_PICTOS` ; podopédiatrie :
  `_EXO_PODO_EXCLUES` (toutes les nouvelles catégories y sont exclues).
- Réflexes archaïques : libellé « Exercice … (réflexe …) » ; « Exercice Palming oculaire » (ancienne faute
  « palping » corrigée dans la base et dans la fiche PDF). Posturale : titres « Étirement patient antériorisé /
  postériorisé / latéralisé - … ». Chaque UPDATE de libellé a la garde `libelle = ancien` : un libellé retouché à la
  main n'est jamais écrasé.
- 12 fiches PDF (titre + QR) pour les 12 exercices du pied : `assets/fiches/reeduc-pied/1.<k> <exercice>.pdf`,
  rattachées par SQL (`pdf_fichier IS NULL` seulement). La fiche 28 jours d'origine reste le programme.
- Les fiches « Stimulation réflexe » dont la 1re photo commençait au-dessus du 1er exercice (RPP, Moro, RTAC, agrippement
  palmaire, traction des mains, Babkin, RTL) ont été régénérées : une bande grise de l'en-tête était visible.
- Scripts : `documents/extraction-qr/` (`libelles.py`, `build_pdf.py`, `build_pdf2.py`, `gen_sql2.py`) ; SQL :
  `documents/sql-reorganisation-categories-exercices.sql` (à coller APRÈS la fusion de cette PR).

## Programme du pied jour par jour (lot e3b-1, PR « programme-pied-tableau-e3b »)

- Quand « programme du pied » est coché (sport `sp`, posturo `po`, podopédiatrie `pd`), le bloc affiche un tableau repliable
  « 📋 Exercices du pied jour par jour » (`_progPiedTableauHTML`, conteneur `<pref>-prog-pied-tab`, rendu par `_progMaj`).
  Source : `_PIED_JOURS` (28 jours de la fiche « Rééducation du pied », en dur dans `js/biomeca.js` ; 4 exercices par jour,
  1 seul aux jours 7, 14, 21, 28). AUCUNE dose (séries, répétitions) : elles restent sur la fiche PDF et le portail (chrono EMOM 45/15).
- Dates réelles du patient quand elles sont connues ; au-delà du jour 28, lignes en lecture seule « = exercices du jour k (retour en
  sens inverse) » jusqu'à 55 jours. Seuls les jours 1-28 sont éditables (4 menus, « — » retire un exercice).
- Modifications du praticien : `programmes.pied.modifs = { '3': ['cle', …] }` (seuls les jours différents de la fiche, nettoyés par
  `_progModifsNettoyer`) ; état en mémoire `_progModifs[pref]`, lu/écrit par `_progLire`/`_progEcrire`. Les menus sont recréés à chaque
  changement : `_progPiedRafraichir` appelle `_scheduleBilanAutosave` (l'événement `input` d'un menu détaché n'est plus capté).
- Exercices d'un jour du programme (pour le portail, e3b-2) : `_progExosProgramme(programmes, n)` (n = 1-55, gère le sens inverse et les modifs).
- Rapport (choix de Joël : bilan allégé) : une seule ligne « Programme de renforcement … : du JJ/MM/AAAA au JJ/MM/AAAA [— programme
  personnalisé] — exercices détaillés sur le portail patient » ; pas de tableau, pas de QR, pas de PDF.
- Tests : `tests/programme-pied-e3b.test.mjs` ; e2e `documents/e2e-programme-pied-e3b.mjs` (vider `_progEcrire(pref, null)` au début : le compte test garde les dates d'un run précédent).

## Largeur commune des 4 bilans (PR « largeur-bilans-1100 »)

- Sport, posturo, pédicurie et podopédiatrie avaient 980 / 860 / 900 / 900 px. Décision de Joël (24/10/2026) : 1100 px au plus, centrés,
  pleine largeur en dessous (tablette). Une seule règle CSS dans `css/biomeca.css` (juste après `.page.active`) sur le premier `div`
  de `#pg-bilan`, `#pg-bilan-posturo`, `#pg-pedicurie`, `#pg-podopediatrie` (`!important` : les largeurs sont en style en ligne ; le
  gabarit posturo, construit par script, reçoit 20 px de marge latérale). Aucun HTML modifié (tests de structure intacts). Les rapports
  (860 px) ne sont pas concernés : ils sont faits pour l'impression. Nouvelle page de bilan = ajouter son id à cette règle.
- Contrôle : mêmes largeurs à 1440 / 1280 / 1024 / 768 px, pas de défilement horizontal (script ad hoc Playwright).

## Programme d'exercices sur le portail patient (lot e3b-2a, PR « portail-programme-e3b2a »)

- **Copie figée par patient** : table `programmes_patient` (une ligne par patient, le nouveau programme remplace l'ancien), écrite
  uniquement par la fonction `programme_patient_deposer` (SECURITY DEFINER : praticien propriétaire de la fiche, patient avec compte
  portail, sinon rien n'est copié). L'application envoie des CODES d'exercices ; le serveur ajoute noms, liens vidéo, fiche PDF et
  texte d'après la bibliothèque. Le praticien ne lit jamais les liens (RLS inchangée) et aucun lien n'est envoyé par le client.
- Le patient lit sa copie seulement (RLS `portail_patient_actuel()`) et une fiche PDF du bucket privé `exercices-pdf` seulement si elle
  figure dans SA copie (`portail_peut_lire_pdf_programme`). Aucun accès à `exercices_base`. Le praticien lit les copies de ses patients
  (aperçu 🔑, vidéos comprises, pour les montrer en consultation).
- Construction pure côté application : `_progPortailConstruire(flavor, bilanData)` (`flavor` = sport / posturo / podopediatrie ; 3 formats
  de circuits ramenés à une forme unique par `_progCircuitsDe`). Séance = `{id, titre, chrono, exos:[[code,…]]}` (1 à 3 sous-exercices
  simultanés, exercice libre = `libre:<hachage>` sans vidéo) ; ordre Échauffement, Express 1, pied du jour, Express 2 ; jours cochés pris en
  compte. Une séance sans exercice choisi n'est PAS publiée : `_progPortailManques` alimente l'avertissement de la fenêtre 🔑.
- Publication : à chaque sauvegarde de bilan (`_lancerSauvegardeAutomatique` → `_portailProgrammeAuto`, différée 2,5 s, jamais bloquante,
  sans nouveau dépôt si le contenu est identique). La fenêtre 🔑 ne publie QUE s'il n'y a aucun programme (jamais d'écrasement) ; le
  bouton « Republier » force la publication du bilan qui a le plus de séances. Un vieux bilan sport avec le seul programme du pied ne doit
  jamais masquer un bilan podopédiatrie complet.
- Page patient `/patient/` : écran « Mes exercices » (jour d'aujourd'hui, flèches, choix de la séance de départ, vidéos par le lecteur
  `youtube-nocookie` seulement, fiche PDF sur la même page, séances absentes du jour expliquées avec leur prochaine date). CSP : ajout
  de `frame-src 'self' blob: https://www.youtube-nocookie.com` seulement. Tout lien ou chemin est validé dans `patient-logique.mjs`
  (`urlLecteurVideo`, `pdfPublic`, `pdfPrive`) ; un lien non reconnu est ignoré. Service worker du portail : `verticy-patient-v6`.
- Pièges : « je ne vois que le pied » = Express/Échauffement non cochés ce jour de la semaine (jours des circuits) ; tester aussi les
  autres jours avec les flèches. Le service worker garde l'ancienne version tant qu'un autre onglet Verticy est ouvert.
- Preuve : `supabase/tests/portail-programme-patient.test.sql` (banc jetable, prélude `prelude-programme-patient.sql`, finit `TOUT_OK`),
  `tests/programme-portail-e3b2a.test.mjs`. (Chrono, validation, « Bravo », notification : lot e3b-2b ci-dessous.)

## Chrono, séances validées et notification de fin (lot e3b-2b, PR « portail-chrono-validation-e3b2b »)

- **Chrono (page patient)** : logique pure dans `patient/patient-logique.mjs` (`planChrono`, `etatChrono`, `exerciceSuivantMs`,
  `debutExerciceMs`) ; le temps écoulé est la seule donnée d'état (`base` + `Date.now() - depart`), la PAUSE gèle `base`. Plan = « Prêt ? »
  5 s puis, par exercice, effort + repos (Express 20/10, échauffement 30/30 ou 45/15, pied EMOM 45/15) ; « Passer » = effort de l'exercice
  suivant, « Recommencer l'exercice », « Arrêter ». Bips générés par Web Audio (aucun fichier), triple bip à la fin, case « Son » mémorisée
  (`verticy-patient-son`), écran gardé allumé (Wake Lock) quand le navigateur le permet. Le bloc chrono est DÉPLACÉ dans la carte de l'exercice en cours (compact, `position: sticky; top: 0`, `rangerChrono()` le remet en haut à l'arrêt/fin/changement de séance) : on garde chrono et boutons sous les yeux pendant la vidéo. **Validation par exercice (décidée 24/10 soir, remplace « validation par séance au clic »)** : un exercice est validé tout seul quand son temps d'effort va jusqu'au bout (`exosTermines`) — table `programme_exos_valides` + fonction `programme_exo_valider`, badge « ✓ Validé » + carte verte, conservés après rafraîchissement (relus à l'ouverture) ; « Passer » pendant l'effort ne valide pas l'exercice sauté ; envois ratés (réseau) refaits au prochain exercice. À la fin du chrono la SÉANCE se valide seule (`validerSeanceAuto`, commentaire facultatif de la zone du bas envoyé avec) ; le bouton manuel ne sert plus que sans chrono ou si l'envoi automatique a échoué. Aperçu praticien : rien n'est écrit. **Règles ajoutées (24/10 soir)** : (1) chaque carte a un bouton « ✋ J'ai fait cet exercice sans chrono » (`validerExoSansChrono`) ; (2) la séance ne se valide QUE si tous ses exercices sont validés (`seanceComplete`) — un exercice passé bloque la validation, le message nomme l'exercice manquant, et le bouton « sans chrono » sur le dernier manquant valide la séance tout seul ; le bouton « Valider la séance » du bas n'apparaît que si tout est validé mais que l'envoi a échoué ; (3) **jour d'essai** : un jour qui n'est pas aujourd'hui (programme qui commence lundi, testé samedi) laisse tourner le chrono mais n'enregistre RIEN : badge orange « ✓ Fait (essai) », message « Essai… », perdu au rafraîchissement. **Notification du ressenti (24/10 soir)** : quand le patient écrit, corrige ou ajoute son mot, le praticien reçoit `patient_ressenti` (💬, « Ressenti d'un patient après une séance »). Côté serveur (`portail-programme-mots.sql`) : un déclencheur sur `programme_validations` renseigne `mot_at` à chaque mot nouveau ou modifié (un mot identique ou effacé ne notifie pas) et remet `mot_notifie_at` à zéro ; `programme_mot_notifie(patient, jour, séance)` renvoie `true` UNE seule fois ; les anciens mots sont marqués « déjà notifiés » à la pose. Côté application (`_portailVerifierMots`, au plus 1/min, via `nav()` et toutes les 5 min) : liste des mots non notifiés, marque puis crée la notification avec identifiants seuls (`cible.patientId` + `seance {jour, id}`), le mot n'est JAMAIS copié. Détail de la notification : le mot est relu en base (`_notifChargerMot`, texte seulement, réponse tardive ignorée) + rappel « pour adapter le programme : bilan → traitement, puis 🔑 Republier ». Service worker praticien `biomeca-v242`.
  **Blocage des notifications d'un patient + rythme (24/10 soir)** : colonne `patient_comptes.notifications_bloquees_at` (droit UPDATE du praticien propriétaire sur CETTE colonne seulement ; le patient ne la lit ni ne l'écrit) ; interrupteur « Notifications de ce patient » dans la fenêtre 🔑 (`_portailHtmlBlocage`, `portailBasculerNotifications`, confirmation avant blocage). Le SERVEUR décide : les triggers `programme_validations_mot` et `programme_fins_bloquees` inscrivent mots et fins « déjà notifiés » tant que le patient est bloqué (enregistrés, lisibles dans « Suivi des séances », aucune notification) ; au blocage, ce qui attendait est aussi réduit au silence (`portail_blocage_purge`) ; au déblocage rien de rétroactif. Même colonne pour la future messagerie. Si le SQL n'est pas posé, `_portailLireCompte` retombe sur la lecture sans la colonne (la fenêtre reste utilisable, section masquée). Rythme : `_portailVerifierNotifications` toutes les 30 s onglet visible (jamais masqué) + au retour sur l'onglet ; sur Clever Cloud ce polling pourra être remplacé par du temps réel. Messagerie (carte « Bientôt disponible » dans l'accueil patient en attendant) : le praticien verra « Lu » sous son message quand le patient l'a lu ; le patient n'aura JAMAIS cette information sur ses propres messages. Preuve : `portail-notifications-blocage.test.sql` (19 contrôles, 7 mutations), `tests/portail-blocage-notifications.test.mjs`, E2E `e2e-portail-blocage-praticien-e3b2b.mjs`, `e2e-portail-delai-notifications-e3b2b.mjs`, `e2e-portail-accueil-messagerie-e3b2b.mjs`. Service workers `biomeca-v243`, `verticy-patient-v17`.
  **Messagerie patient ↔ praticien (24/10 nuit, branche feat/portail-messagerie)** : fil unique par patient, texte seul, 1000 car. ; patient limité à 5 messages/10 min et 30/24 h (serveur, verrou par patient) ; modification par l'auteur dans les 5 min (anciennes versions conservées dans `messages_portail_versions`), jamais de suppression ; « Lu » (`lu_at`) visible du praticien seulement (le patient lit via `messagerie_lire_patient`, qui ne renvoie pas `lu_at`). Aucun droit direct sur les tables : fonctions SECURITY DEFINER `messagerie_*` (SQL en 5 blocs < 4000 car. : a-tables, b1, b2, c, d). Patient bloqué : écrit, message inscrit « déjà notifié » (triggers + purge au blocage), le praticien lui répond quand même. Messagerie désactivable par patient (`patient_comptes.messagerie_desactivee_at`, fenêtre 🔑) : historique relisible, plus d'écriture. Praticien : notification `patient_message` (identifiants seuls) par polling 30 s (`_portailVerifierMessages`), pastille 💬 sur la fiche, détail → « Ouvrir la conversation » = aperçu `?apercu=<fiche>&ecran=messagerie` où il écrit au nom du cabinet ; chaque message du praticien consigne une notification `email_essai` (e-mail sans contenu, boîte d'essai, non envoyé). Preuves : `supabase/tests/portail-messagerie.test.sql` (100 contrôles, 28 mutations dont 1 équivalente), `tests/portail-messagerie.test.mjs`, E2E `e2e-portail-messagerie.mjs` (39) et `e2e-portail-messagerie-praticien.mjs` (21). Service workers `biomeca-v255`, `verticy-patient-v19`.
  **Mot du patient (24/10 soir)** : la zone « Un mot pour votre praticien » est visible dès le départ le jour même ; le mot part avec la validation, et APRÈS la validation le patient peut l'écrire ou le corriger jusqu'à minuit (fonction `programme_seance_commenter` : patient seulement, jour même, séance déjà validée, 500 car., mot vide = effacé ; migration `portail-programme-commenter.sql`, test `portail-programme-commenter.test.sql`). Piège CSS : `.bouton { display: block }` écrasait l'attribut `hidden` → règle `.bouton[hidden]`. Le praticien lit le mot dans « Suivi des séances ». PIÈGES : « je ne vois pas Validé » = jour affiché ≠ aujourd'hui OU page ouverte dans l'APERÇU PRATICIEN (bandeau jaune) : dans l'aperçu, rien n'est jamais enregistré ; le chrono montre seulement « ✓ Fait (aperçu) » à l'écran (orange), sans envoi (test `e2e-portail-chrono-apercu-e3b2b.mjs`). Case « Son » : la règle générale `input` du portail (largeur 100 %) doit être neutralisée (`.case-son input`). **Écran d'ordinateur (≥ 700 px)** : la carte de l'exercice en cours tient dans la hauteur de l'écran (vidéo réduite : largeur = `(100vh − 340px) × 16/9`, texte limité à 4,6 em avec défilement, chrono en deux lignes compact) ; à la fin du chrono il RESTE dans la dernière carte pour que « Validé » et le message restent visibles. Mesure rejouable : `documents/e2e-portail-chrono-ecran-e3b2b.mjs` (1280×720, 1366×768, 1920×1080, 1/2/3 vidéos).
  **Sous-exercices simultanés (2 ou 3)** : côte à côte dans la carte (`.sous-exercices[data-nb]`), UN seul chrono ; la fiche PDF s'ouvre en pleine largeur sous la grille (`.fiches-carte`).
  Quitter l'écran arrête tout (`montrer`).
- **Validation** : table `programme_validations` (patient, jour, séance, commentaire ≤ 500, une ligne par jour et séance, jamais modifiée) et
  fonction `programme_seance_valider(p_jour, p_seance, p_commentaire)` (patient seulement, jour d'aujourd'hui à l'heure de Paris
  — `portail_aujourdhui()` —, séance présente dans SA copie). Aucun droit d'écriture direct. « Bravo, vous êtes à jour » = toutes les
  séances du jour validées ; jours passés non validés : « non faite » sans bouton ni reproche ; aperçu praticien en lecture seule.
- **Fin de programme** : quand toutes les séances du DERNIER jour du programme publié sont validées, le serveur crée une ligne
  `programme_fins` (une par programme publié ; un nouveau programme donne une nouvelle fin). L'application praticien la lit
  (`_portailVerifierFins`, au plus 1/min, via `nav()` et toutes les 5 min), appelle `programme_fin_notifiee` (renvoie `true` UNE seule
  fois) puis crée `patient_protocole_termine` (identifiant de fiche seulement). Une fiche inconnue sur l'appareil n'est ni marquée ni notifiée.
  Un jour du programme manqué n'empêche pas la fin : c'est la validation du dernier jour qui la déclenche.
- **Suivi côté praticien** : fenêtre 🔑 → « Suivi des séances » (`_portailChargerSuivi`, `_suiviSeances`) : validées/prévues sur 7 jours
  glissants + liste datée avec commentaires (texte seulement, jamais en HTML).
- Preuve : `supabase/tests/portail-programme-validations.test.sql` (banc jetable : prélude, `portail-programme-patient.sql`,
  `portail-programme-validations.sql`, `portail-programme-exos-valides.sql`, puis les deux tests ; finissent `TOUT_OK` ; mutations toutes détectées),
  `tests/portail-chrono-e3b2b.test.mjs`, `tests/portail-suivi-praticien-e3b2b.test.mjs`, E2E `documents/e2e-portail-chrono-e3b2b.mjs`
  (horloge simulée) et `e2e-portail-suivi-praticien-e3b2b.mjs`. Service workers : `biomeca-v241`, `verticy-patient-v17`.

## Devis automatique, catalogue par praticien, carte Ostéopathie, état de publication — acquis (PR #326 à #329)

- **Devis automatique à l'import Doctolib (PR #329)** : `_devisAutoApresImport`, appelé par `_lancerImportDoctolib`. Tout RDV À VENIR dont
  le motif est égal (accents et casse ignorés) au titre d'un acte du catalogue coché « Devis automatique à l'import Doctolib »
  (`sync_doctolib`, actif) crée ET émet un devis, après un récapitulatif avec confirmation. Le devis reprend l'acte TEL QUEL (prix,
  cotation, base remboursable, prise en charge par défaut) : il n'y a ni mode « semelles » ni paramètres de calcul (retirés, l'acte
  personnalisé contient déjà bilan + part Sécurité sociale déduite + complément). Anti-doublon : `documents_facturation.source_rdv`
  (index unique par praticien, le 409 est absorbé). Intitulé ou patient inconnu, ou échec : notification `devis_auto_ignores`
  (RDV nouveaux seulement). Le devis émis est partagé tout seul au portail (`documents_partages`) ; le filet en cas d'erreur est
  le retrait via 🔑, puis un devis manuel. La table `devis_auto_parametres` et la colonne `actes_catalogue.devis_mode` existent en base
  mais sont vides et inutilisées.
- **Piège trigger** : toute migration qui redéfinit `documents_facturation_garde` doit partir de sa DERNIÈRE version (tiers payant,
  `part_secu_cents`, `source_rdv`), sinon les gardes précédentes sautent. Banc de test = faux serveur en mémoire (409 sur doublon) +
  sabotages (`tests/devis-automatique.test.mjs`, `supabase/tests/devis-automatique.test.sql`).
- **Bouton « Supprimer » des actes personnalisés** : policy DELETE `delete_own_perso` limitée à `perso = true` ; les actes du
  référentiel ne se suppriment pas ; les devis et factures gardent une copie de leurs lignes.
- **Catalogue PAR PRATICIEN** (décision) : actes et tarifs rangés par compte (RLS `user_id`), chacun les siens. Les sous-comptes
  titulaire / assistant / remplaçant ne sont PAS construits. L'import range aujourd'hui tout sous `praticiens[0]` : il faudra
  rapprocher chaque agenda Doctolib (colonne « agenda » du CSV) du bon praticien.
- **Carte Ostéopathie (PR #327)** : cinquième carte de l'écran des bilans, « Bientôt disponible » (bouton désactivé, aucun bilan
  associé). Grille de 5 colonnes (2 sous 900 px). Variables `--osteo-vif` / `--osteo-encre` réservées à ce thème turquoise ; le
  posturo passe en vert foncé (`--posturo-encre`), rapport posturo compris. Tests figés à connaître : `fenetres-claires-268` (structure
  des fenêtres), `palette-bilans` (comptes de `var()` par famille, aucune couleur hexadécimale dans la zone des bilans),
  `bilan-posturo-clair-268` (inventaire des couleurs en dur).
- **État de publication des rapports (PR #328)** : à côté de « Publier au patient », `_portailMajEtatRapports` affiche « Publié le … ✓ à
  jour » ou « Publié le … · mis à jour depuis ». La fiche garde seulement date + empreinte (`rapportsPublies[module] = { date, emp }`),
  jamais le contenu ; `_portailEmpreinteRapport` ignore la ligne « Généré le … » qui change chaque jour. Rafraîchi toutes les 3 s sur
  la page active seulement.
- **Fenêtres larges (PR #326)** : la fenêtre 🔑 « Accès au portail » (`#portail-patient-modal`) est élargie (`max-width: min(960px, 96vw)`).
- **Service workers** : praticien `biomeca-v255`, patient `verticy-patient-v19`.
- **Prochain lot** : signature du devis par le patient dans `/patient/` (tracé, IP serveur, horodatage, empreinte SHA-256 de la copie
  figée, code e-mail pour les mineurs) ; la notification `patient_devis_signe` est déjà déclarée.

## Signature du devis par le patient — acquis (PR #331)

- **Parcours patient** : dans « Mes documents », un devis valide porte « ✍️ À signer » (puis « ✓ Signé », ou « Expiré »). Le patient lit le
  devis, coche « J'ai lu ce devis et je l'accepte », trace sa signature au doigt (canvas, PNG) et signe. Jamais d'e-mail du devis ; aucune
  signature dans l'aperçu praticien (lecture seule).
- **Mineur** (moins de 18 ans d'après la date de naissance de la fiche, ou date inconnue) : code à 6 chiffres, valable 10 minutes, 3 codes
  par 15 minutes, 5 essais puis code invalidé ; un nouveau code invalide le précédent. Le code part à l'adresse du COMPTE patient (le parent
  qui prend le rendez-vous). Mode essai (aucun e-mail réel avant l'hébergement HDS) : le serveur rend le code et l'écran l'affiche dans un
  bandeau « Mode essai » ; réglage `portail_reglages.signature_code_essai` à '0' quand l'envoi réel existera.
- **Serveur** (6 blocs SQL `portail-devis-signature-*.sql`, chacun < 4000 caractères) : fonctions `devis_etats_patient`,
  `devis_signature_code_demander`, `devis_signer` (SECURITY DEFINER, aucun droit direct sur les tables). IP et date sont lues côté serveur
  (`request.headers`), jamais envoyées par le client. L'empreinte SHA-256 porte sur `documents_partages.contenu` (copie figée) ; elle est
  recalculée à la signature et comparée à celle que le patient a vue (`devis_modifie` sinon). Signature unique et non modifiable ;
  un devis signé est figé (contenu, fichier, titre) et `documents_partager_facturation` ne l'écrase plus. Devis expiré
  (`valide_jusqu_au`) ou retiré via 🔑 : non signable (la preuve d'un devis signé reste lisible du praticien).
- **Piège** : un RAISE annulerait le décompte des essais d'un mauvais code ; `devis_signer` RENVOIE `{ok:false, restants}` pour ce cas
  seulement. Le patient et le praticien partagent le rôle `authenticated` : la table des signatures est lisible par sa politique
  `praticien_id = auth.uid()` (le patient voit 0 ligne). Toute migration qui redéfinit `documents_partager_facturation` doit partir de la
  version du bloc D.
- **Praticien** : « ✍️ signé le … » dans la liste 🧾, la fenêtre du devis et la fenêtre 🔑 ; bloc de preuve (date, IP, empreinte, tracé) dans
  la fenêtre et sur l'impression ; notification `patient_devis_signe` (identifiants seuls, polling 30 s via `_portailVerifierSignatures`,
  jamais pour un patient bloqué). Les harnais qui extraient `chargerDocuments` / `_htmlDocumentEmis` doivent lister
  `_chargerSignaturesDevis`, `_notifDateHeure`, `_htmlBlocSignature` et la variable `_docSignatures`.
- **Preuve** : `supabase/tests/portail-devis-signature.test.sql` (83 contrôles, 31 sabotages), `tests/portail-devis-signature.test.mjs`,
  E2E navigateur `e2e-portail-devis-signature.mjs` (39 contrôles). Service workers `biomeca-v255`, `verticy-patient-v19`.
- **À faire avant le réel** : faire valider la valeur légale de la signature ; décider de la conservation légale (la suppression d'une
  fiche patient supprime en cascade ses signatures) ; envoi réel du code par e-mail après HDS.

## Questionnaire patient et arrivée d'un RDV — acquis (PR #333, #334)

- **Questionnaire** (PR #333) : table `questionnaires_patient` (un seul questionnaire ouvert par patient, RLS), adulte (20 questions, 5 blocs)
  ou enfant (11) d'après l'âge ; le parent remplit avec son compte (pas de code). Le patient modifie jusqu'au RDV, la fiche reste en lecture
  seule pour lui. Fonctions SECURITY DEFINER `questionnaire_demander / _lire_praticien / _retirer / _integrer / _a_notifier / _notifie` ;
  validation par liste blanche de clés et bornes (`questionnaire_valider`). Jamais de contenu médical dans une notification ou un e-mail.
- **Intégration au bilan** (`_qstFaits`, `_qstPlan`, `_qstEcrireBilan`, `_qstInjecterBouton`, bouton dans la 1re section du bilan) avec aperçu
  puis validation du praticien : antécédents, examens, traitements, appareillage = ajout daté « (déclaré le …) » sans doublon ; poids,
  taille, sport, métier = remplacement dans la fiche ; motif, douleur, EVA = bilan seulement ; jamais d'écrasement d'une saisie du
  praticien. Intégré une seule fois ; relecture des réponses pendant 30 jours (`_qstListe`). Tout ce qui n'a pas de case va dans
  « Notes complémentaires » (`po-notes`, `ped_notes_generales`, `podo_notes_generales`, `notes_generales` en sport).
- **Arrivée d'un RDV** (PR #334, saisie manuelle de l'agenda ; l'import CSV Doctolib reste à faire) : moteur unique `_rdvOrganiser`
  (fiche sans doublon nom+prénom+naissance, accès portail idempotent, devis immédiat si le motif est un acte, e-mail d'essai, questionnaire
  programmé). Obligatoires : nom, prénom, e-mail ; la date de naissance est facultative (valide si saisie). Il manque quelque chose, ou
  l'accès est impossible : RIEN n'est envoyé et la notification `rdv_sans_envoi` le dit. RDV passé : dispositif non lancé. Déplacé :
  `questionnaire_replanifier` ; supprimé : `questionnaire_retirer_source`. Source du RDV = `ag:<id de l'événement>`.
- **Programmation** (SQL `portail-questionnaire-e1..e4`) : `visible_des` = RDV − 3 jours (vide = visible tout de suite), `source_rdv`
  (index unique praticien+source), `envoi_signale_at`. Le patient ne voit ni n'écrit avant `visible_des` (règle côté serveur, indépendante
  de l'ouverture de Verticy). E-mails d'essai « questionnaire disponible » (J-3) et « rappel » (J-1, non rempli, au moins 12 h après l'envoi)
  signalés par `_portailVerifierQuestionnairesProgrammes` (30 s, Verticy ouvert) ; le serveur marque chaque envoi une seule fois.
  **Limite** : sans planificateur serveur, ces deux e-mails n'apparaissent que Verticy ouvert (à lever après l'hébergeur HDS).
- **E-mails d'essai** : notification `email_essai` avec champ `mail` (`acces`, `acces_devis`, `devis`, `questionnaire`, `rappel`) ; le texte est
  reconstitué à l'affichage (`_rdvTexteMail`, `_notifChargerMail`), jamais stocké. Identifiants une seule fois par compte
  (`patient.accesEnvoyeLe`, compte jamais connecté).
- **Code provisoire** (fiche sans date de naissance) : `patient_comptes.code_provisoire` (XXXX-XXXX, aucun droit de colonne, effacé par un
  trigger dès que le statut n'est plus « initial »), généré par `patient-compte` (creer, reinitialiser), accepté par `patient-connexion` à la
  place de la date tant que le compte est « initial », effacé au choix du mot de passe. Le praticien le lit par `portail_code_provisoire`
  (clé 🔑 de la fiche et texte de l'e-mail d'essai) ; jamais renvoyé dans une réponse de fonction. Déployer `patient-connexion` AVANT
  `patient-compte` (verify_jwt : connexion false, compte true).
- **Fenêtre « Nouvel événement »** : 3 choix (RDV patient existant / nouveau patient / texte libre), 2 colonnes (980 px), motifs = usuels +
  actes personnalisés + actes « Synchronisation Doctolib » (`_rdvMotifsPropose`). **Vues de l'agenda** : Jour / Semaine / Mois partagent
  `_agRenderTimeGrid` ; les événements de journée entière ou de 20 h et plus (« bandeaux ») vont dans une rangée du haut (`_agEstBandeau`) ;
  au-delà de 2 RDV simultanés (4 en vue Jour) ils se mettent en cascade (`_agGeomEvenement`) ; l'en-tête compense la barre de défilement du corps.
- **Pièges** : le golden `tests/golden/structure-fenetres-268.json` se régénère SEULEMENT pour les clés touchées (`JSON.stringify(…, null, 1)`),
  sinon diff de milliers de lignes ; un nouveau libellé « _ » dans « Nouveau patient » le modifie aussi. Les harnais qui extraient les
  fonctions `\_rdv_`doivent lister les dépendances (voir`tests/rdv-organiser.test.mjs`). La suite vitest complète dure ~5 min : ne rien lancer
  en parallèle (délais de 5 s dépassés sinon).
- **Preuve** : `supabase/tests/portail-questionnaire*.test.sql` (79 + 57 contrôles) et `portail-code-provisoire.test.sql` (14), mutations SQL et
  JS (aucun survivant utile), `tests/rdv-organiser.test.mjs`, `tests/agenda-vues.test.mjs`, E2E navigateur (`e2e-portail-questionnaire*.mjs`,
  `e2e-agenda-rdv-organiser.mjs` 43, `e2e-agenda-vues.mjs` 19), banc réel `attaques-code-provisoire.py` (21 contrôles, patients fictifs).
  Service workers `biomeca-v261`, `verticy-patient-v20`.
- **À faire** : import CSV Doctolib qui crée les fiches inconnues (format de l'export à confirmer), e-mail d'accès réel et envoi planifié
  après l'hébergeur HDS, landing.

## Landing page — acquis (PR #336)

- **Structure** : `js/landing-fonctions.js` (données RUBRIQUES + icônes SVG + menu + pages), vue `lpVue('accueil'|'praticien'|'fonction')` dans `js/landing.js`.
- **Vue praticien** (connecté) : titre en tête, formulaires de connexion/inscription/réinitialisation à portée, 5 prix (liens Stripe intacts, 10 au total).
- **Vue patient** (avant connexion) : pas de tarif, pas de sujet praticien.
- **Pages de fonctionnalités** : 5 rubriques validées, photos des bilans `assets/bilans/illus-*.jpg` (ratio 0,834, jamais recadrées), fonctions futures marquées `avenir:true`.
- **Confort** : case « Se souvenir de moi » (e-mail seul en localStorage, jamais le mot de passe), œil du mot de passe sur les 3 formulaires.
- **Logo** : version transparente `verticy-logo-simple-transparent.png` sur les 3 cartes de la landing, préchargée par le service worker. Pictogramme (50 px) plus grand que le wordmark (15 px).
- **Service workers** : `biomeca-v262`. Pages « Mannequin 3D du patient » et « Mécanismes lésionnels » livrées (captures `assets/landing/visualisation-3d.png`, `mecanismes-lesionnels.png`, 1280×800, patiente fictive, précachées).

## Refonte du design intérieur (logiciel praticien) — acquis (PR #342 à #347)

Refonte CSS seulement, par lots, chaque bloc ajouté en fin de `css/biomeca.css` sous `/* Refonte « premium » — lot N */`, tout borné à `body.theme-clair`. Aucun HTML ni JS modifié, aucune couleur d'identité des bilans (`--posturo-*`, `--sport-*`, etc.) redéfinie.

- **Lot 1 — socle** (#342) : barre du haut (onglets flexibles, boutons de droite fixes), fond de page, cartes, boutons, champs, titres.
- **Lot 2 — liste et fiche patient** (#342) : cartes patients, fiche détaillée, photos non recadrées, barre du haut (Déconnexion en bouton rouge visible).
- **Lot 3 — agenda** (#343) : calendrier en premier, 3 encadrés de connexion en colonnes, jour sélectionné lisible (blanc sur bleu), couleurs par compte (`--ev-bg`/`--ev-fg`) non redéfinies.
- **Lot 4 — pages des bilans** (#344) : titres agrandis (y compris bilan postural construit par JS), onglets en pastilles, accueil sport en grille 4 colonnes (≥ 1100 px), étiquettes compactes, bandeau patient vide masqué.
- **Lot 5 — pages de gestion** (#345, #346) : devis/factures, ordonnances, stérilisation, catalogue d'actes, rapports (sport et postural). Barre de titre séparée, cartes, boutons, libellés à 11,5 px. Fenêtre « Accès au portail patient » en cartes distinctes, 2 colonnes dès 900 px, en-tête fixe.
- **Lot 6 — paramètres, notifications, praticiens, exercices, Assistant** (#347) : cartes uniformes, titres bleus distinctifs, notifications en lignes aérées avec ombre au survol, FAQ en fond clair avec recherche, Assistant (chat) stylé.

**Piège** : `/tmp` est un tmpfs de 512 Mo — le remplir (profils Chromium, captures) fait planter Chrome (« Target crashed »). `df -h /tmp` avant chaque session de captures.

**Piège** : `palette-bilans.test.mjs` analyse toutes les règles CSS contenant `border:` — utiliser `border:0; box-shadow:0 0 0 1px <couleur>` pour les contours de cartes dans un nouveau bloc. Les tests de bornage doivent ancrer sur `/* Refonte « premium » — lot N` et borner la fin du bloc au début du lot suivant.

**Piège** : ne jamais `pkill -f chrome` (exit 143). Chrome headless : `args:['--no-sandbox','--disable-gpu']`.

## Profil du patient et chaînes musculaires — acquis (PR #354, #355)

Le mannequin 3D déduit de ses valeurs un **profil du patient** et la **chaîne musculaire** correspondante : une HYPOTHÈSE à confirmer
par le praticien, jamais un diagnostic (même cadre que les mécanismes lésionnels). Le contenu des chaînes vient du cours de
l'organisme : ne rien ajouter qui n'en vienne pas, chaque rappel affiché porte son numéro de diapo.

- **Code** : `js/mannequin3d/chaines.js` (fonctions pures, testées : `tests/mannequin3d-chaines.test.mjs`). `evaluerProfil(valeurs, {yeux})`
  renvoie zones notées 0–4, score de chaque chaîne, chaînes exprimées et dominante, compensations locales, profils
  (`postural` = Mézières / Myers, `chainiste` = Busquet / GDS, `biomecanique`, ou combinaisons) et entrée haute / basse / mixte.
  HTML : `htmlProfil` (encadré sous les mécanismes) et `htmlProfilRapport` (rapport, seulement si la case « Inclure au rapport »
  est cochée ; stockée dans `mannequin3d.profilRetenu`). Profil proposé pour l'adulte, le sport et TOUTES les périodes de l'enfant.
- **Chaînes** : posturales (grande postérieure, grande antérieure, ligne latérale D/G, ligne spiralée D/G ; les deux dernières n'existent que
  chez Myers) et chaînistes (extension = PM, flexion = AM, AP, PA, fermeture = AL, ouverture = PL ; AL et PL peuvent être unilatérales).
  Les signes de chaque chaîne sont la liste validée par le praticien ; un test impose que chaque valeur d'un tableau type de chaîne soit un
  signe de sa chaîne, dans le bon sens.
- **Seuils réglables** (`definirSeuilsProfil`, pas d'écran de réglage) : chaîne exprimée dès 40 %, dominante avec 15 points d'écart,
  compensation locale = niveau ≥ 3, ou niveau ≥ 2 d'un seul côté hors signes d'une chaîne exprimée, « plusieurs » zones = 3.
  Niveaux 0–4 = amplitudes `qual` du curseur ; le seuil du niveau 1 est celui du cabinet quand il existe.
- **Curseurs ajoutés** : avancement / recul du bassin (`bassin_avance`, bassin seul : thorax et pieds fixes), mandibule (`mandi_transl`,
  `mandi_antep`, blend shapes créés au chargement par `ajouterMorphMandibule`), « Flexion / extension du coude » (−20 à 140, 0 = coude
  neutre à 20° de flexion, `COUDE_NEUTRE` mesuré par modèle). Le repère vert de la tête est au niveau des YEUX (`angles.yeux`).
- **Tableaux types** : 16 tableaux de chaînes + flessum / récurvatum D/G ; menu à 8 catégories dépliables (`CATEGORIES_TABLEAUX`,
  `TABLEAUX[k].categorie`) ; E2E : `tests/e2e/fixtures/tableau.ts` (`choisirTableau`).

**Pièges appris**

- Ne JAMAIS appeler `updateMorphTargets()` pour ajouter des blend shapes : la table des déformations du modèle (cyphose, lordose,
  genoux) est réécrite et ces curseurs cessent de fonctionner. Compléter le dictionnaire existant.
- Les os de l'avant-bras n'ont pas la même orientation d'un modèle à l'autre : toute pose « neutre » d'une articulation se mesure
  par modèle (angle réel entre os), pas à l'œil sur un seul.
- Un `<summary>` du menu des tableaux et ceux des groupes de curseurs coexistent : cibler `details.m3d-grp > summary` dans les E2E.
- **Stockage local** : la ligne `user_data` contient `data` (TOUS les patients). La copie d'abonnement du mode hors connexion
  (`bm4-acces-cache:<uid>`) ne doit garder que les colonnes d'abonnement, sinon elle double le stockage (alerte « 10 Mo ») et conserve des
  bilans supprimés jusqu'à la connexion suivante. Les copies `bm4-recuperation:<uid>:<t>` ne sont jamais supprimées par conception.

## Fin de tâche : mise à jour de la documentation

À **chaque fin de tâche** (ou lot de tâches), mettre à jour **CLAUDE.md** (règles et
pièges appris) **et la roadmap locale** (§0 : fait, en cours, à faire, dettes). Consigne
du praticien. CLAUDE.md passe par une PR dédiée, sans donnée personnelle ni citation des
documents locaux ; la roadmap reste locale (`.git/info/exclude`).

## Supabase — acquis de l'audit du 19/10/2026

- **Jamais `auth.admin.listUsers()` sans pagination** : une seule page de 50 comptes. Utiliser
  `lireToutesLesPages` (`supabase/functions/_shared/pagination.ts`), qui lève une erreur au
  lieu de rendre une liste tronquée. Même règle pour toute lecture PostgREST (plafond 1000).
- **Champs d'abonnement de `user_data`** (`licence_payee`, `formule`, `engagement`,
  `date_debut_abonnement`, `stripe_customer_id`) : protégés par un trigger UPDATE **et** un
  trigger INSERT ; le praticien n'a pas de policy DELETE sur sa ligne. Un trigger qui ne
  couvre qu'une opération laisse la porte ouverte par les autres (DELETE puis INSERT).
  Toute fonction `SECURITY DEFINER` fixe son `search_path`.
- **Supprimer un patient** supprime aussi sa ligne cloud `patients` (par `_cloudId`, les
  bilans suivent en cascade). Aucune purge automatique des lignes déjà orphelines.
- **Fonctions Edge** : `stripe-webhook` est en `verify_jwt = false` (Stripe n'envoie aucun
  jeton Supabase ; la signature est vérifiée dans la fonction). Conserver le `verify_jwt`
  existant des autres fonctions au redéploiement. Le plafond du chat d'aide est un
  incrément SQL atomique (`help_chat_incrementer`), jamais lecture puis écriture.
- **Migrations SQL** : un fichier de `supabase/migrations/` n'agit pas à la fusion ; il est
  appliqué à la main sur la base, puis **revérifié par un test réel** (tentative de
  l'attaque, pas seulement la lecture du fichier).
- **Validation de la fiche patient** : `validerFichePatient` (date de naissance non future,
  poids 1–400 kg, taille 20–260 cm, e-mail) à la création **et** à la modification.

## Chantiers produit à venir (hors modules 3D)

Aucun n'est commencé ; chacun exige un plan en lecture seule et l'accord du praticien.

- **Portail client / patient** : devis, factures, rapports ; accès par code envoyé par
  e-mail ; exercices vidéo avec chronomètre et validation quotidienne ; retour d'évolution
  au praticien ; messagerie patient ↔ praticien. L'hébergement HDS est acquis (accord
  avec l'hébergeur) : le portail se construit avec des **patients fictifs** ; aucune donnée
  réelle avant la bascule HDS effective. RLS côté patient (un patient ne voit que son
  dossier), consentement et journal d'accès d'abord.
- **Facturation des actes** de pédicurie et de podologie : prestations remboursées (lettre-clé
  POD, AMP, orthèses plantaires) avec leurs modes de remboursement, **actes personnalisés**
  (titre et montant choisis), **sans TVA** (exonération, mention à valider). Les tarifs et
  cotations sont des **données datées, sourcées et modifiables** (ils changent par avenant à
  la convention), **jamais codés en dur ni devinés** : source officielle citée.
  Numérotation continue sans trou.
- **Accès cabinet** (tâche #120, spec validée) : un abonnement = un cabinet = une patientèle
  partagée ; un seul titulaire ; un siège assistant (permanent) et un siège remplaçant
  (quota de 12 semaines par an, année glissante) ; accès ouvert/fermé par interrupteur, sans
  supprimer de compte ; message d'accès fermé distinct de « mot de passe incorrect » ;
  l'existence d'une adresse sur un autre cabinet n'est jamais révélée au titulaire. Prérequis :
  chargement cloud (#102), journal des accès (#136), hébergement HDS. Aujourd'hui tout est
  filtré par `user_id` (pas de notion de cabinet en base).
- **Mannequin 3D** (coches de dysfonction qui déforment le mannequin ; rapport avec les
  4 vues face, dos, profil D, profil G) et **scan 3D du pied au téléphone + conception de
  semelles** (types, éléments STL avec matériau, épaisseur, dureté Shore, export STL unique,
  axe de Henke) : règles techniques dans « Modules 3D à venir ». Le scan au téléphone est
  faisable (autres acteurs le proposent) mais sa technique est à valider par un essai ; il
  n'est pas un dispositif médical : contrôle d'échelle obligatoire.

## Conventions de code

- Préfixe `_` pour tout symbole volontairement inutilisé — arguments, variables
  et variables de `catch` (les trois motifs sont configurés dans `eslint.config.js`).
  Pas de code mort masqué (`void x;`) : on le retire.
- Commentaires en français, référencés au numéro de tâche. Pas de nom de
  personne dans les commentaires (dépôt public) : « praticien ».
