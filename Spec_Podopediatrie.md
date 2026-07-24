# Spécification clinique — Bilan Podopédiatrie BioMéca

**Source de vérité** pour l'implémentation des sections cliniques (Phases 2 à 4).
Tri par section/onglet. Les valeurs de référence pilotent les interprétations
automatiques (tendances dans/hors normes) qui remontent dans la **Synthèse**.

Périodes : **II** = 14 mois–6 ans · **III** = 6–9 ans · **IV** = 9 ans–fin de puberté.

---

## 1. Valeurs de référence (constantes cliniques)

### Foot Posture Index (FPI) — total des 6 items (chaque item −2 à +2)
- Normal : **0 à +5**
- En pronation : **+6 à +9**
- Hautement en pronation : **> 9**
- En supination : **−1 à −4**
- Hautement en supination : **−5 à −12**

### ⚠️ TTE et AF — LA MÉTHODE DE MESURE CONDITIONNE LE RÉFÉRENTIEL

**Règle absolue : on ne compare jamais une valeur à une table issue d'une autre méthode.**
Pour un même enfant du même âge, l'écart entre méthodes atteint **25°**.

Exemple, TTE à ~6 ans selon la méthode :

| Méthode | TTE à ~6 ans | Source |
|---|---|---|
| Angle cuisse-pied (clinique) | 11° | Wong 2025 (n=501, Danemark) |
| **Axe bi-malléolaire / axe fémoral, procubitus (clinique)** | **16°** | **Mudge 2014 (n=53, Australie)** |
| EOS 3D | 27° | Gaumétou 2014 (n=114, France) |
| Scanner | 28–31° | Kristiansen 2001 ; Reikerås 2001 |
| Axe transmalléolaire, assis (clinique) | 34° | Jacquemier 2008 (n=1319, France) |
| Échographie | 40° | Krishna 1991 |

Les mesures **cliniques sous-estiment la torsion osseuse d'environ 15°** par rapport à
l'imagerie (Borish 2017). Appliquer une norme d'imagerie à une mesure au goniomètre
conduit à classer « anormaux » des enfants sains, de façon systématique.

**Méthodes retenues dans Verticy (décidées le 24/07/2026) :**
- **TTE** = angle entre l'**axe bi-malléolaire** et la perpendiculaire à l'**axe fémoral**,
  enfant en **procubitus, genou fléchi à 90°**.
- **AF** = **test de Craig** (trochanteric prominence angle test), enfant en procubitus.

---

### Torsion Tibiale Externe (TTE) — axe bi-malléolaire / axe fémoral, procubitus

**Source : Mudge AJ et al., 2014, *J Pediatr Orthop B* 23(1):15-25** — 53 enfants au
développement typique, 4 à 16 ans, Sydney. Méthode strictement identique à la nôtre.

| Tranche d'âge | n | Moyenne (ET) | Bande normale (± 2 ET) |
|---|---|---|---|
| 4–7 ans | 20 | 15,8° (6,2) | **3,4 – 28,2°** |
| 8–11 ans | 17 | 14,3° (5,0) | **4,3 – 24,3°** |
| 12–16 ans | 16 | 17,9° (6,1) | **5,7 – 30,1°** |
| Ensemble 4–16 ans | 53 | 16,0° (5,9) | 4,2 – 27,8° (étendue observée 3–32°) |

**Point clinique majeur : aucune évolution significative avec l'âge entre 4 et 16 ans.**
Une table année par année n'a pas de sens pour cette méthode — on raisonne par bande.
En dessous de 4 ans : **pas de référence disponible**, ne rien afficher.

*Limite : n=53, population australienne. C'est la seule série publiée dont la méthode
correspond littéralement à la nôtre. Wong 2025 (n=501) donne 21–24° mais en décubitus
dorsal et sans définition d'axe explicite → non transposable.*

---

### Antétorsion Fémorale (AF) — test de Craig

Le test de Craig estime l'**antétorsion osseuse vraie** : validé à 4° près contre la mesure
peropératoire chez l'enfant (Ruwe PA et al., 1992, *JBJS Am* 74:820-30, 91 hanches).
Le référentiel légitime est donc la courbe d'antéversion vraie.

**Source : Shands AR & Steel MK, 1958, *JBJS Am* 40-A:803-816** — 238 enfants sains,
3 mois à 16 ans, radiographie biplane. Valeurs publiées (ancres) : 39° à 3–12 mois ;
31° à la fin de la 2ᵉ année ; décroissance de 1 à 2°/an de 3 à 10 ans jusqu'à 24° ;
21° à 14 ans ; 16° à 16 ans.

Table interpolée linéairement entre ces ancres (les valeurs non grasses sont interpolées) :

| Âge | AF moyenne | | Âge | AF moyenne |
|---|---|---|---|---|
| 1 an | **39°** | | 9 ans | 25° |
| 2 ans | **31°** | | 10 ans | **24°** |
| 3 ans | 30° | | 11 ans | 23° |
| 4 ans | 29° | | 12 ans | 22,5° |
| 5 ans | 28° | | 13 ans | 22° |
| 6 ans | 27,5° | | 14 ans | **21°** |
| 7 ans | 26,5° | | 15 ans | 18,5° |
| 8 ans | 26° | | 16 ans | **16°** |

**Tolérance retenue : ± 15°.** Justification : ET ≈ 5–7° selon Fabry 1973 (qui situe la
limite supérieure de normalité, moy + 2 ET, à 38° à 7 ans, 34° à 10 ans, 31° à 16 ans),
soit ± 2 ET ≈ ± 12° ; à quoi s'ajoute l'incertitude propre du test de Craig (± 10 à 12°
hors mains très entraînées — Maier 2012, Souza & Powers 2009) et une fiabilité
test-retest médiocre de l'AF clinique (ICC 0,53 — Wong 2025).

**→ Conséquence d'affichage : privilégier « attendu ~X° à N ans » plutôt qu'un verdict
binaire normal/anormal.**

---

### ❌ Tables ABANDONNÉES (ne pas réintroduire)

Les deux tables ci-dessous figuraient dans la V1 de cette spec et ont été **retirées
le 24/07/2026** après recherche documentaire : leur source primaire n'a pas pu être
identifiée, et leurs valeurs sont incompatibles avec toutes les séries publiées vérifiées.

- *TTE : 3,47° à 2 ans → 21,3° à 6 ans.* Aucune source publiée correspondante trouvée.
- *AF : 45,22° à 2 ans → 33,9° à 6 ans.* La moyenne réelle à 2 ans est de 31°, et Fabry
  situe le **seuil pathologique** à 38° à 7 ans : ces valeurs sont donc au-dessus du seuil
  pathologique. Il s'agit très probablement de **bornes normal/pathologique** (type
  Tönnis & Heinecke, radio biplane) réinterprétées à tort comme une fourchette de normalité.

### Genu valgum / varum
- Genu **valgum** → condyles fémoraux internes se touchent → on mesure l'**espace inter-malléolaire**.
- Genu **varum** → malléoles se touchent → on mesure l'**espace inter-condylien**.
- Physiologique : entre **3 cm inter-malléolaire** et **7 cm inter-condylien**.

### Courbures rachidiennes (flèches, cm) — périodes III et IV
- Flèche cervicale : **6 à 8 cm**
- Flèche lombaire : **4 à 6 cm**
- (6–9 ans : méthode fil à plomb + goniomètre sur l'enfant ; > 9 ans : idem, tableau.)

### Axe calcanéen
- < 2° de déviation = **physiologique** ; ≥ 2° = tendance arrière-pied valgus/varus significative.

### Hauteur naviculaire (navicular drop)
- Écart |charge − décharge| **< 1 cm** = normal ; **≥ 1 cm** = défaut de maintien de l'arche médiale en charge.

### Réductibilité de la cyphose dorsale
- Distance manubrium sternal ↔ table (procubitus, hyperextension) doit être **> 10 cm** (physiologique).

### Stabilité monopodale
- À partir de **8 ans** : tenir **≥ 30 s** en appui monopodal.
- Genou **tendu** → dépiste l'instabilité de **cheville**.
- Genou **semi-fléchi** → dépiste l'instabilité de **genou**.

### Trendelenburg postural (chaîne stabilisatrice) — gradation
- Grade 1 : bassin horizontal, pas d'élévation EIPS opposé (normal).
- Grade 2 : chute EIPS controlatéral sans modif obliquité scapulaire.
- Grade 3 : pas de modif EIPS opposé + inclinaison scapulaire côté jambe portante.
- Grade 4 : chute EIPS + ceinture scapulaire côté opposé à la jambe portante.

---

## 2. Cartographie par onglet

### Interrogatoire (fait — Phase 1)
### Réflexes archaïques (fait — Phase 1, 15 items)

### Morphostatique (Phase 2)
**2a — champs cliniques :**
- Commun II/III/IV : Test de Jack, giration bassin, **axe calcanéen G/D** (dir + °), **hauteur naviculaire G/D** (charge/décharge cm), morphologie plantaire G/D (normal/plat/creux/valgus/varus), test d'accroupissement.
- **III/IV** : courbures rachidiennes (flèche cervicale + lombaire), Test d'Adam (gibbosité oui/non + localisation lombaire/dorso-lombaire/dorsale).
- Interprétations directes : axe calcanéen (seuil 2°), navicular drop (seuil 1 cm).

**2b — modules visuels (dos/face/profil G/profil D) :**
- Silhouettes dessinables (repris du module **sport**).
- Photos + placement de points manuel (repris du module **posturo**).
- **Verticale de Barré** = calculée automatiquement à partir des points (période IV).

### FPI (Phase 3) — période II/III/IV
- Tableau 6 items × G/D (arrière-pied : palpation tête talus, courbure malléole latérale, inversion/éversion calcanéus ; avant-pied : congruence talo-naviculaire, hauteur arche médiale, abd/adduction avant-pied), chaque item −2..+2.
- Total auto + tendance (voir barème §1).

### Examen en charge (Phase 3) — reprise posturo/sport + ajouts
- Stabilité monopodale : cases G/D + instabilité **cheville** (genou tendu) et/ou **genou** (semi-fléchi).
- Test des chaînes stabilisatrices / **Trendelenburg postural** : grade 1–4, G/D.
- **III/IV** : rotation nucale (bilatéral + modificateurs : tapis mousse, yeux fermés, serrant dents, ouvrant bouche, assis sans contact plantaire), Romberg (reprise posturo/sport), mobilité de l'axe corporel (reprise posturo/sport : cervical/thoracique/lombaire/arc inférieur, X = absence de mobilité, / = raideur).
- **IV — bloc oculaire** (sujet debout ou assis, donc EN CHARGE) :
  - **Maddox & test du masquage (cover-test)** : par œil (G/D) → orthophorie / exophorie / ésophorie / hyperphorie / hypophorie.
  - **Test de Lang** : vision stéréoscopique oui/non.
  - **MCO** (manœuvre de convergence oculaire) : défaut de convergence oui/non ; si oui → apparition Gauche et/ou Droite.

### Examen en décharge (Phase 3) — reprise posturo/sport + ajouts
- **Manœuvre d'Ortolani / ressaut de hanche : oui/non.**
- Torsion tibiale externe (TTE) : ° G/D + tendance par âge (§1).
- Antétorsion fémorale (AF) : ° G/D + tendance par âge (§1).
- Espace inter-malléolaire / inter-condylien (genu valgum/varum, §1).
- Mobilisation ostéo-articulaire coxo/genou/cheville/pied.
- **III/IV** : test de réductibilité de la cyphose dorsale (> 10 cm), inégalité de longueur des MI (TFD/TFA, repères osseux EIAS/EIPS/crête iliaque, Downing, longueurs DD et PC).

> ⚠️ **Correction du 24/07/2026** : le bloc oculaire (Maddox, cover-test, Lang, MCO) figurait
> initialement ici, en décharge. Il est **rattaché à l'examen EN CHARGE** — ces tests se
> pratiquent le sujet debout ou assis, pas allongé. Voir la section « Examen en charge » ci-dessus.

### Traitement (Phase 4) — plan d'appareillage, SANS les circuits
### Synthèse (Phase 4) — auto-générée
### Conclusion (fait — Phase 1) + bloc « Orientations / suspicions » à ajouter

---

## 3. Règles d'interprétation automatique (→ Synthèse)

- **Axe calcanéen** : ≥ 2° → tendance valgus/varus significative (par pied).
- **Navicular drop** : |charge − décharge| ≥ 1 cm → défaut de maintien arche médiale.
- **Achille court (suspicion)** : marche sur talons **impossible** ET incapacité à s'accroupir → suspicion d'Achille court.
- **FPI** : total → classe (normal / pronation / hautement pronation / supination / hautement supination).
- **TTE** (axe bi-malléolaire, procubitus) : valeur comparée à la **bande ± 2 ET de la
  tranche d'âge** (4–7 / 8–11 / 12–16 ans, cf. §1). < 4 ans → pas de référence.
- **AF** (test de Craig) : valeur comparée à la **moyenne de l'âge ± 15°** (cf. §1).
- **Genu** : inter-malléolaire > 3 cm ou inter-condylien > 7 cm → hors physiologie.
- **Courbures** : flèche cervicale hors 6–8 cm ou lombaire hors 4–6 cm → hors normes.
- **Cyphose** : distance manubrium-table < 10 cm → cyphose peu réductible.
- **Stabilité monopodale** : < 30 s après 8 ans → instabilité (cheville si genou tendu, genou si semi-fléchi).

## 4. Bloc « Orientations / suspicions » (à placer en Conclusion)
Chacune : oui/non + champ de précision si oui.
- Pathologie neurologique
- Boiterie d'esquive
- Pathologie de la hanche
- Pathologie posturale
- Pathologie du genou
- Pathologie du pied

## 5. Réutilisations depuis les bilans existants
- Silhouettes dessinables ← module **sport** (morpho).
- Photos + points ← module **posturo**.
- Romberg, mobilité axe corporel, examen en charge/décharge ← **posturo/sport** (à mirrorer, puis compléter).
