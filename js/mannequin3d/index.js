// Mannequin postural 3D — point d'entrée (import dynamique : rien n'est chargé avant l'ouverture de la section).
export { monter } from './ui.js?v=v316';
export { rendreVues } from './moteur.js?v=v316';
export {
  decrire,
  nettoyerValeurs,
  etatMannequinVide,
  CURSEURS,
  TABLEAUX,
} from './parametres.js?v=v316';
export { evaluer, htmlRapport, synthese, definirSeuils } from './mecanismes.js?v=v316';
export {
  evaluerProfil,
  htmlProfil,
  htmlProfilRapport,
  definirSeuilsProfil,
} from './chaines.js?v=v316';
