// Mannequin postural 3D — point d'entrée (import dynamique : rien n'est chargé avant l'ouverture de la section).
export { monter } from './ui.js?v=v307';
export { rendreVues } from './moteur.js?v=v307';
export { decrire, nettoyerValeurs, CURSEURS, TABLEAUX } from './parametres.js?v=v307';
export { evaluer, htmlRapport, synthese, definirSeuils } from './mecanismes.js?v=v307';
export {
  evaluerProfil,
  htmlProfil,
  htmlProfilRapport,
  definirSeuilsProfil,
} from './chaines.js?v=v307';
