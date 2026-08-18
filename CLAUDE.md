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
les quatre filets, `node --check`, `gh run`, `gh pr`, `curl`, et `git show` /
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

## Filets avant toute PR

Une seule commande, chaque code de retour capturé juste après sa commande,
tableau récapitulatif à la fin :

    rtk proxy npx prettier --check <fichiers> > /tmp/f1.txt 2>&1; EX1=$?
    rtk proxy npm run lint       > /tmp/f2.txt 2>&1; EX2=$?
    rtk proxy npm test           > /tmp/f3.txt 2>&1; EX3=$?
    rtk proxy npm run typecheck  > /tmp/f4.txt 2>&1; EX4=$?
    rtk proxy node --check js/biomeca.js > /tmp/f5.txt 2>&1; EX5=$?

Attendu : 0 erreur ESLint (les avertissements sont une dette connue),
231 tests au vert, `tsc` muet.

**La CI GitHub est la référence, pas la sortie locale.** Elle exécute les mêmes
filets sur des runners neufs, hors de portée du proxy.

## Boucle de livraison

1. Branche dédiée — jamais de commit direct sur `main`
2. Modifications + filets verts
3. Bump `CACHE_VERSION` dans `service-worker.js` **dès que `index.html`, `js/`
   ou `css/` change** — la CI le refuse sinon
4. PR, CI verte
5. Vérifier la garde `CACHE_VERSION` sur le run **`pull_request`** — celui du
   push ne l'exécute pas (`if: github.event_name == 'pull_request'`)
6. Squash-merge, suppression de branche, retour sur `main`
7. Vérifier que le run Pages cible le SHA post-fusion — comparaison par `cmp`,
   pas à l'œil
8. `curl` sur la prod pour confirmer la version servie

## Interdits absolus

- **Ne jamais modifier une URL de Payment Link Stripe** sans validation explicite.
- **Générer un rapport ne doit JAMAIS déclencher une sauvegarde** (risque de
  saturation du localStorage — incident du 25/07/2026).
- **Ne jamais supprimer une clé `...Path`** sur le seul constat d'un canvas vide :
  la dataURL est retirée après upload vers Storage, un canvas vide ne prouve rien.
- **Aucune purge automatique** de données suspectes sur heuristique. Un fantôme
  persisté est indiscernable d'une saisie légitime. Prévention pour les nouveaux
  bilans, neutralité pour les anciens, nettoyage manuel.
- `contact@verticy.fr` est l'`ADMIN_EMAIL` fonctionnel (bascule #229-C validée
  le 10/08/2026, ex-`sciopraxi@gmail.com`) — ne jamais le remplacer. Il vit à
  DEUX endroits qui doivent rester alignés : `VERTICY_ADMIN_EMAIL`
  (js/biomeca.js) et `ADMIN_EMAIL` (supabase/functions/admin-users/index.ts,
  la vérification qui fait foi) — tout changement exige le redéploiement de
  la fonction Edge dans la même fenêtre.
- L'identifiant `imgjs-logo-sciopraxi` et le fichier `logo-sciopraxi.png` sont
  fonctionnels — ne jamais les renommer.

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

## Conventions de code

- Préfixe `_` pour tout symbole volontairement inutilisé — arguments, variables
  et variables de `catch` (les trois motifs sont configurés dans `eslint.config.js`).
- Commentaires en français, référencés au numéro de tâche.
