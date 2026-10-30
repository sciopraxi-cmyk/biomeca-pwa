// Mannequin postural 3D — point d'entrée (import dynamique : rien n'est chargé avant l'ouverture de la section).
export { monter } from './ui.js?v=v327';
export { rendreVues } from './moteur.js?v=v327';
export {
  decrire,
  nettoyerValeurs,
  etatMannequinVide,
  CURSEURS,
  TABLEAUX,
} from './parametres.js?v=v327';
export { evaluer, htmlRapport, synthese, definirSeuils } from './mecanismes.js?v=v327';
export {
  evaluerProfil,
  htmlProfil,
  htmlProfilRapport,
  definirSeuilsProfil,
} from './chaines.js?v=v327';
export {
  proposerExercices,
  resoudre,
  planifier,
  LIBELLE_LIGNE,
  PATHOLOGIES,
  detecterPathologies,
} from './exercices-auto.js?v=v327';
