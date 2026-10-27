# Génération des mannequins 3D (homme / femme)

Les fichiers `assets/mannequin/homme.glb.gz` et `femme.glb.gz` sont produits par ces scripts Python
(numpy uniquement). **Aucun code tiers n'est copié** : seules des **données CC0** sont lues.

- Entrées : maillage de base, cibles morphologiques (« targets »), squelette et poids de peau du
  projet MakeHuman, publiés en CC0 dans le dépôt `makehumancommunity/mpfb2` (dossier `src/mpfb/data`,
  version 2.0.18). Le code de ce dépôt (GPL) n'est ni utilisé ni copié.
- Chemin des données attendu : `D` en tête de `body.py` (à adapter).
- Couche musculaire : générée par `muscles.py` / `build_muscle.py` à partir de la peau (régions
  pondérées par muscle). Aucun modèle anatomique tiers.
- Lancement : `python3 build_skin.py` (écrit `out_homme.glb` et `out_femme.glb`), puis `gzip -9`.
- Repère : x = gauche du patient, y = haut, z = devant. Os orientés selon les axes du monde au repos.
