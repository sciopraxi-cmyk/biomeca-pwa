# Génération des mannequins 3D (adultes et enfants)

Les fichiers `assets/mannequin/{homme,femme}.glb.gz` (adultes) et `{garcon,fille}_p{II,III,IV}.glb.gz` (enfants, un par période de la
podopédiatrie) sont produits par ces scripts Python
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
- Relief géométrique : `relief.py` creuse les sillons entre muscles et bombe les ventres (distance à la frontière
  de chaque territoire, le long de la surface) ; tendons, fascias et os affleurants restent plats.
- Déformations locales (blend shapes) : `build_morph.py` (cyphose, lordose, fessiers, genoux).
- Lancement : `python3 build_skin.py` (écrit `out_homme.glb` et `out_femme.glb`, ~1 min), puis `gzip -9`.
  Variables : `SEXES=homme`, `BAKE_RES=1024`, `ECORCHE_DEBUG=1` (couleur distincte par muscle).
  Les chemins absolus de `body.py` / `build_skin.py` sont à adapter.
- Repère : x = gauche du patient, y = haut, z = devant. Os orientés selon les axes du monde au repos.

## Mannequins d'enfant (podopédiatrie)

- `ENFANTS=II,III,IV python3 build_skin.py` écrit `out_garcon_pII.glb` … `out_fille_pIV.glb` (6 fichiers, ~8 min), puis `gzip -9`.
- Âge macro MPFB choisi pour obtenir une taille représentative (`AGES` dans `build_skin.py`) : II ≈ 100 cm (≈ 4 ans),
  III ≈ 122 cm (≈ 7-8 ans), IV ≈ 143 cm garçon / 140 cm fille (≈ 11 ans). Pas de poitrine ni de pectoraux ajoutés.
- Écorché : les polygones de `ecorche.py` sont définis sur l'adulte. Pour l'enfant, `build_skin.py` calcule des repères (sol,
  cheville, genou, hanche, taille, épaule, cou, tête) et `ecorche.ENFANT` ramène les coordonnées dans l'espace adulte
  (correspondance par morceaux en hauteur, échelle de largeur propre à la tête et au bassin).
- Le moteur cadre l'enfant à l'échelle de sa taille (`etat.k` = taille / 1,75 m) ; les repères cliniques suivent la même échelle.
