// Mannequin postural 3D — point d'entrée (import dynamique : rien n'est chargé avant l'ouverture de la section).
export { monter } from './ui.js?v=v328';
export { rendreVues } from './moteur.js?v=v328';
export {
  decrire,
  nettoyerValeurs,
  etatMannequinVide,
  CURSEURS,
  TABLEAUX,
} from './parametres.js?v=v328';
export { evaluer, htmlRapport, synthese, definirSeuils } from './mecanismes.js?v=v328';
export {
  evaluerProfil,
  htmlProfil,
  htmlProfilRapport,
  definirSeuilsProfil,
} from './chaines.js?v=v328';
export {
  proposerExercices,
  resoudre,
  planifier,
  LIBELLE_LIGNE,
  PATHOLOGIES,
  detecterPathologies,
} from './exercices-auto.js?v=v328';
