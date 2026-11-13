// Constantes du module Semelle 3D (lot 0).
// Toutes les valeurs ci-dessous sont des valeurs de DÉMONSTRATION techniques,
// pas des normes cliniques : elles seront revues avec le praticien.
export const PAS_GRILLE_MM = 0.5; // pas de la grille (décision fondatrice du script)
export const EPSILON_HAUTEUR_MM = 0.01; // sous cette hauteur, une cellule est refusée (triangles dégénérés)
export const SEUIL_TRIANGLE_DEGENERE_MM2 = 1e-9;

// Dôme synthétique (aucune donnée réelle) : contour en ellipse + bosse gaussienne.
export const DOME_DEFAUT = Object.freeze({
  largeur_mm: 100, // étendue de la grille en X
  longueur_mm: 260, // étendue de la grille en Y (origine au talon)
  demi_axe_x_mm: 45,
  demi_axe_y_mm: 125,
  epaisseur_mm: 3,
  hauteur_dome_mm: 8,
  sigma_mm: 25,
  centre_dome: Object.freeze({ x_mm: 45, y_mm: 90 }),
});

// --- Lot 1 : mode A (import du scan du pied) ---
export const ECART_ECHELLE_CONFIRMATION = 0.15; // script §5.1 : écart avec 1,0 > 15 % -> confirmation explicite
// PROVISOIRE, à fixer par le praticien (question ouverte du script §5.1) : bornes de sanité technique
// de la longueur saisie, PAS une norme clinique.
export const LONGUEUR_PIED_PLAUSIBLE_MM = Object.freeze({ min: 100, max: 400 });
// Unités reconnues pour l'aide au diagnostic de l'échelle (information seulement).
export const UNITES_CONNUES = Object.freeze([
  { nom: 'mm', facteur: 1 }, { nom: 'cm', facteur: 10 }, { nom: 'pouce', facteur: 25.4 }, { nom: 'm', facteur: 1000 },
]);
export const TOLERANCE_UNITE = 0.05;
// Boîte creusée : le contour de l'empreinte (pied + bords gardés) est lissé comme celui de la base (dents de la mousse effacées). Valeur technique, à juger sur vrai scan.
export const CONTOUR_EMPREINTE_SIGMA_MM = 3;
// Recalage : paramètres techniques (pas des valeurs cliniques), signalés dans le rapport.
export const RECALAGE = Object.freeze({
  ransac_tolerance_mm: 0.5, // distance au plan d'appui comptée « sur le plan »
  ransac_iterations: 400,
  ransac_graine: 20261031, // générateur déterministe : même scan -> même résultat
  ransac_points_max: 20000,
  ransac_fraction_basse: 0.25, // les 3 points du plan viennent des 25 % les plus bas
  ransac_max_sous_plan: 0.02, // un plan d'appui ne laisse pas plus de 2 % des points en dessous
  ransac_angle_max_deg: 25, // écart max entre la normale du plan et l'axe de plus faible variance
  ransac_ecart_min_mm: 20, // les 3 points tirés doivent être distants d'au moins 20 mm
  bande_avant_pied: 0.25, // largeurs mesurées à 25 % de la longueur depuis chaque extrémité
  bande_demi_largeur: 0.03,
  seuil_confiance_vertical: 1.5, // rapport de scores en dessous duquel « à confirmer » est mis en avant
  seuil_confiance_longitudinal: 1.05,
  seuil_confiance_contour: 0.01, // courbure de la ligne médiane / largeur max
  seuil_confiance_voute: 0.05, // différence de hauteur médial-latéral / relief max
  seuil_ratio_acp: 1.2,
});

// --- Lot 2 : base (moulage, épaisseur, lissage, contour) ---
export const TYPES_BASE = Object.freeze(['plate', 'thermoformee', 'pleine_dessous']);
// Réglages par défaut = DÉCISIONS DE JOËL du 31/10/2026 (type thermoformée, taux 50 %, épaisseur 1,5 mm, lissage 3 mm depuis le 31/10 soir, biseau 45°).
export const BASE_DEFAUTS = Object.freeze({ type: 'thermoformee', taux: 0.5, epaisseur_mm: 1.5, lissage_mm: 3, biseau_deg: 45, contour_lisse: true,
  // Lot 3 bis : matériau de la base (tableau PODAXIA), étendue entière ou demi-semelle, 2e matériau devant.
  forme_semelle: false, moulage_tetes: true, materiau_id: null, etendue: 'entiere', limite_pct: 60, devant: 'materiau2', materiau_devant_id: null, epaisseur_devant_mm: null, raccord_devant_mm: 20, arrondi_mm: 8 });
// Décision de Joël (31/10) : les résines Flex et Flux font de 0,9 à 1,8 mm -> une base est acceptée à partir de 0,9 mm
// (le script §6 disait 1,5 mm : remplacé pour la base). Borne haute PROVISOIRE (technique), à valider.
export const EPAISSEUR_BASE_MIN_MM = 0.9;
export const EPAISSEUR_BASE_MAX_MM = 10;
export const LISSAGE_SIGMA_MM = Object.freeze({ min: 2, max: 6 }); // script §5.5
export const EPAISSEUR_TOTALE_AVERTISSEMENT_MM = 12; // script §6 : avertissement « chaussant »
// Biseau médial de la base intermédiaire (demande de Joël 31/10). Valeurs PROVISOIRES, à valider cliniquement.
export const BISEAU_MEDIAL = Object.freeze({
  angle_min_deg: 15, // angle de la face biseautée avec l'horizontale
  angle_max_deg: 75,
  ouverture_deg: 60, // le contour est « médial » si sa normale sortante est à moins de 60° de la direction médiale
});
// Contour lissé (fin des marches de 0,5 mm, dette du lot 0). Paramètres techniques.
export const CONTOUR_LISSAGE = Object.freeze({
  sigma_mm: 1.0, // flou du masque pour retrouver la position sous-cellule du contour (lisserContour seul)
  deplacement_max_pas: 0.7, // un nœud du contour ne bouge jamais de plus de 0,7 pas (jamais de triangle retourné)
  // Retour de Joël (31/10) : « pas lissé, des vagues à l'avant ». Le masque est flouté (sigma) puis seuillé à 0,5 :
  // les dents et vagues plus petites que sigma disparaissent ; les nœuds du bord sont ensuite posés SUR l'isoligne.
  sigma_masque_mm: 3, // valeur technique, à juger sur vrai scan
  deplacement_max_regularise_pas: 1.2,
});

// --- Lot 3 : matériaux (tableau PODAXIA), éléments paramétriques, outil de coupe ---
// Valeurs PROVISOIRES (techniques, pas des normes cliniques), à valider par Joël.
export const ELEMENTS = Object.freeze({
  raccord_min_mm: 5, // script §5.6 / §6 : un raccord sous 5 mm donne un avertissement de confort ; jamais nul
  raccord_defaut_mm: 8,
  cumul_max_mm: 10, // somme des couches superposées au-delà de laquelle on avertit (script §6 « hauteur max »)
  depassement_contour_avertissement_pct: 0.5, // part de l'emprise qui sort du contour du pied avant avertissement
  tolerance_angle_deg: 0.2, // script §5.8 / §7 : l'outil de coupe retrouve l'angle saisi à ± 0,2°
  fenetre_min_mm: 10, // largeur minimale de la zone plane servant à mesurer un angle
  reperage_talon_mm: 30, // le centre du talon est le milieu du contour à 30 mm du point le plus postérieur
});
export const COIN_POSTERIEUR = Object.freeze({
  largeur_mm: Object.freeze({ min: 20, max: 80 }),
  longueur_mm: Object.freeze({ min: 20, max: 120 }),
  angle_deg: Object.freeze({ min: 0.1, max: 15 }),
  decroissance_debut: 0.55, // fraction de la longueur où le coin commence à diminuer vers l'avant (formule PODAXIA)
});
export const POINT_CURSEUR = Object.freeze({ rayon_mm: Object.freeze({ min: 2, max: 60 }), hauteur_mm: Object.freeze({ min: -8, max: 8 }), pas_mm: 0.1 }); // lot 4b
export const ROTATION_PLAN = Object.freeze({ min: -180, max: 180 }); // rotation d'un élément dans le plan (°), lot 4b
export const SOUTIEN_VOUTE = Object.freeze({
  largeur_mm: Object.freeze({ min: 20, max: 60 }), // étendue depuis le bord médial vers le milieu de la semelle
  longueur_mm: Object.freeze({ min: 30, max: 120 }),
  hauteur_mm: Object.freeze({ min: 0.5, max: 15 }),
});
export const SHORE_PLAGE = Object.freeze({ min: 1, max: 100 }); // valeur saisie ; le sens (A/D) du tableau n'est pas connu

// --- Lot 3 bis : demi-semelle, éléments de bord (voûte), suggestion du milieu de voûte ---
// DÉCISIONS DE JOËL (31/10/2026) : limite par défaut 60 % de la longueur (choix 3 sur image), 2e matériau devant de même épaisseur
// par défaut, biseau de 45° réglable par élément. Les bornes ci-dessous sont PROVISOIRES (techniques) à valider.
export const DEMI_SEMELLE = Object.freeze({
  limite_defaut_pct: 60,
  limite_min_pct: 40,
  limite_max_pct: 90,
  raccord_min_mm: 1, // largeur de la transition d'épaisseur entre les deux matériaux ; jamais nulle
  raccord_max_mm: 40,
  arrondi_min_mm: 0, // rayon des angles avant de la demi-semelle (0 = pointes vives) ; défaut 8 mm = choix 1 de Joël (31/10)
  arrondi_max_mm: 40,
});
export const BISEAU_ELEMENT = Object.freeze({ defaut_deg: 45, min_deg: 15, max_deg: 75 }); // même plage que le biseau de la base intermédiaire
// Suggestion bleue du milieu de la voûte : rangée la plus étroite de l'empreinte entre 15 % et 55 % de la longueur (choix « 3a » de Joël).
export const ISTHME = Object.freeze({
  debut: 0.15, fin: 0.55,
  tolerance_mm: 1.5, // une rangée compte dans la zone étroite si sa largeur est à moins de 1,5 mm du minimum
  contraste_min_mm: 3, // sous cet écart largeur max − min, l'isthme est « mal défini » : suggestion marquée à confirmer
});

// Ligne d'appui estimée en charge (lot 4c, règle de Joël 01/11) : seuil = hauteur de la face plantaire au-dessus du sol sous laquelle la cellule « touche » ;
// part_externe = fraction (côté externe) de la zone sans appui comptée comme appui en charge. PROVISOIRES : à valider sur de vrais scans.
export const APPUI = Object.freeze({ seuil_mm: 1, part_externe: 0.3, appui_min_mm: 2, largeur_min_mm: 4, lissage_mm: 2.5 });

// Éléments de bord (lot 3 bis) : bornes PROVISOIRES (techniques). Hauteurs/largeurs/longueurs par défaut = ordres de grandeur PODAXIA.
export const ELEMENT_BORD = Object.freeze({
  hauteur_mm: Object.freeze({ min: 0.5, max: 15 }),
  largeur_mm: Object.freeze({ min: 5, max: 60 }), // étendue depuis le bord vers le milieu de la semelle
  longueur_mm: Object.freeze({ min: 20, max: 120 }),
});

// Lot 4a (retours de Joël 31/10) : recouvrement de toute la semelle ; percement par une décharge. Bornes PROVISOIRES (techniques).
export const RECOUVREMENT = Object.freeze({ epaisseur_mm: Object.freeze({ min: 0.2, max: 5 }) });
export const PERCAGE = Object.freeze({ seuil_mm: 0.3 }); // sous cette épaisseur restante, le creux est traversant (trou, ou comblé)

// Lot 4d : pinceau (lissage / remplissage local). Rayon 5-30 mm ; force d'un passage (0-1) ; 400 passages au plus par geste (limite de calcul et de taille du plan).
export const PINCEAU = Object.freeze({ rayon_mm: Object.freeze({ min: 5, max: 30 }), rayon_defaut_mm: 10, force_defaut: 0.5, max_coups: 400, modes: Object.freeze(['lisser', 'remplir']), espacement_rayon: 0.35 });

// Lot 4 bis : axe de Henke (réponses du praticien, 03/11/2026 : valeurs de DÉPART, révisables). Repère de l'axe : X+ = médial, y depuis le talon.
export const HENKE = Object.freeze({
  inclinaison_defaut_deg: 42, inclinaison_plage_deg: Object.freeze({ min: 20, max: 70 }), // λ (Manter 1941, Inman 1976)
  deviation_plage_deg: Object.freeze({ min: 4, max: 47 }), // alerte si la déviation calculée sort de cette plage
  p0_lateral_mm: 7, p0_longueur_frac: 0.05, // point plantaire du talon : 7 mm LATÉRAL à la bissectrice du talon, à 5 % de la longueur
  // têtes métatarsiennes : positions de départ SYNTHÉTIQUES (« à confirmer ») tant que le praticien n'a pas posé M1/M2/M3
  tetes_y_frac: 0.70, tete_rayon_mm: 8, ecart_tetes_mm: 17, tete_m1_depuis_bord_mm: 8,
  epaisseur_min_alerte_mm: 1.5, // alerte si l'épaisseur minimale de la semelle après torsion est inférieure (l'alerte de 12 mm est EPAISSEUR_TOTALE_AVERTISSEMENT_MM)
  limite_mm: 2, // « limite » si le croisement est à MOINS de 2 mm d'un seuil de catégorie (la catégorie ne bascule pas)
  categories: Object.freeze(['tres_medialise', 'medialise', 'normal', 'lateralise', 'tres_lateralise']),
  phi: Object.freeze({ pas_deg: 0.5, defaut_deg: 0, orange_deg: 6, rouge_deg: 10, blocage_deg: 15 }), // alerte orange > 6, rouge + confirmation > 10, blocage > 15
  skive: Object.freeze({
    angle_defaut_deg: 15, angle_plage_deg: Object.freeze({ min: 10, max: 25 }), profondeur_plage_mm: Object.freeze({ min: 2, max: 6 }),
    profondeur_mm: Object.freeze({ medialise: Object.freeze({ adulte: 2, enfant: 4 }), tres_medialise: Object.freeze({ adulte: 4, enfant: 6 }), lateralise: Object.freeze({ adulte: 2, enfant: 4 }), tres_lateralise: Object.freeze({ adulte: 4, enfant: 6 }) }),
    longueur_defaut_mm: 50, longueur_plage_mm: Object.freeze({ min: 20, max: 120 }), transition_fin_mm: 15, // géométrie de l'élément « skive » (arrière-pied, depuis le bord du talon) : provisoire, à régler avec le praticien
    age_enfant_ans: 12, // enfant = âge STRICTEMENT inférieur à 12 ans (fiche patient) ; âge inconnu = adulte, signalé
  }),
});

// Lot 4 bis, étape 5 : pied mannequin ANATOMIQUE (vue 3D du pied qui tourne autour de l'axe de Henke). Proportions MOYENNES de DÉPART (non mesurées sur un patient), pour un pied de 265 mm ; tout est proportionnel à la longueur.
export const MANNEQUIN = Object.freeze({
  // La forme du pied (proportions, orteils, jambe, couleurs) est dans calcul/pied_sculpte.js (PIED_SCULPTE). Ici : ce qui sert à la pose et à l'éclairage du pied sur la semelle.
  socle_mm: 0.5, // plante posée à 0,5 mm au-dessus de la semelle
  lissage_bord_cellules: (pas) => Math.round(2 / pas), // adoucit la distance au contour de l'empreinte (image binaire en escalier)
  ao_rayons_mm: Object.freeze([3, 7, 14]), ao_poids: Object.freeze([0.45, 0.35, 0.2]), // occlusion ambiante : rayons et poids
  appui: Object.freeze({ max_mm: 12, inclinaison_max_deg: 12 }), // bornes du relèvement et de l'inclinaison du pied posé sur la semelle corrigée
});

// Forme de semelle classique (devant arrondi, sans orteils) : proportions de DÉPART à juger sur de vrais scans.
export const FORME_SEMELLE = Object.freeze({
  u_depart: 0.7, u_depart_min: 0.62, u_depart_max: 0.8, // le contour de l'empreinte est suivi jusqu'à la rangée la plus large entre u_depart_min et u_depart_max (têtes métatarsiennes), puis le devant se referme
  exposant: 2.3, // 2 = ellipse ; plus grand = devant plus carré
  pointe_min: 0.3, pointe_max: 0.7, // la pointe reste dans cette part de la largeur (depuis un bord)
  u_fondu_de: 0.76, u_fondu_a: 0.86, // le relief des orteils s'estompe entre ces deux positions
  // Case « Moulage des têtes métatarsiennes » : décochée, le relief du devant de l'empreinte (têtes, espaces entre les têtes) est remplacé par un plateau ; la VOÛTE (jusqu'à tetes_de) est gardée.
  tetes_de: 0.68, tetes_fondu: 0.06, tetes_fin: 0.84, tetes_fin_fondu: 0.06, // début de l'aplatissement (fraction de la longueur), longueur du raccord, fin (les orteils gardent leur relief si la forme classique est décochée)
});

// Axe de Henke « corrigé » (pied posé sur la semelle corrigée par la torsion) : MODÈLE INDICATIF à valider cliniquement par le praticien.
// La composante transversale du couplage triplan (phi · sin λ) fait tourner l'axe dans le plan transversal par rapport à la semelle : supination (phi > 0) → la déviation diminue (le croisement avec la ligne des têtes
// revient vers le latéral : pied médialisé qui se normalise) ; pronation (phi < 0) → la déviation augmente (pied latéralisé qui se normalise). facteur = 1 : la totalité de la composante transversale.
export const AXE_CORRIGE = Object.freeze({ facteur: 1 });

// B3 : image du rapport (vue de dessus + vue 3/4 médiale, orthographiques, même échelle). Valeurs de DÉPART à juger sur capture.
export const IMAGE_RAPPORT = Object.freeze({
  px_par_mm: 3, // échelle commune aux deux vues (une semelle de 270 mm = 810 px de long)
  marge_mm: 12, // marge autour de la semelle et des repères TALON / AVANT-PIED
  elevation_deg: 35, // vue 3/4 : caméra assez basse
  azimut_deg: 40, // vue 3/4 : décalage de la caméra vers l'arrière (talon plus proche de l'œil)
  barre_echelle_mm: 50,
});
