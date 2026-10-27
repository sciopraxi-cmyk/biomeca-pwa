# Génération des mannequins 3D (homme / femme)

Les fichiers `assets/mannequin/homme.glb.gz` et `femme.glb.gz` sont produits par ces scripts Python
(numpy uniquement). **Aucun code tiers n'est copié** : seules des **données CC0** sont lues.

- Entrées : maillage de base, cibles morphologiques (« targets »), squelette et poids de peau du
  projet MakeHuman, publiés en CC0 dans le dépôt `makehumancommunity/mpfb2` (dossier `src/mpfb/data`,
  version 2.0.18). Le code de ce dépôt (GPL) n'est ni utilisé ni copié.
- Chemin des données attendu : `D` en tête de `body.py` (à adapter).
- Couche musculaire (écorché) : `ecorche.py` définit ~130 territoires musculaires, tendineux et fasciaux
  (polygones en projection pour le tronc et la tête, cartes « déroulées » s/θ pour les membres), tracés
  d'après les repères de la peau du modèle et les planches de Gray's Anatomy (1918, domaine public, usage
  comme référence visuelle seulement). `bake.py` cuit ces territoires en texture (couleur par muscle, fibres,
  tendons, coutures) et en carte de normales (volume des ventres, rainures). Aucun modèle anatomique tiers.
- Déformations locales (blend shapes) : `build_morph.py` (cyphose, lordose, fessiers, genoux).
- Lancement : `python3 build_skin.py` (écrit `out_homme.glb` et `out_femme.glb`, ~1 min), puis `gzip -9`.
  Variables : `SEXES=homme`, `BAKE_RES=1024`, `ECORCHE_DEBUG=1` (couleur distincte par muscle).
  Les chemins absolus de `body.py` / `build_skin.py` sont à adapter.
- Repère : x = gauche du patient, y = haut, z = devant. Os orientés selon les axes du monde au repos.
