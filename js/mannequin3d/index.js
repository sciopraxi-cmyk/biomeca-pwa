// Mannequin postural 3D — point d'entrée (import dynamique : rien n'est chargé avant l'ouverture de la section).
export { monter } from './ui.js?v=v312';
export { rendreVues } from './moteur.js?v=v312';
export { decrire, nettoyerValeurs, CURSEURS, TABLEAUX } from './parametres.js?v=v312';
export { evaluer, htmlRapport, synthese, definirSeuils } from './mecanismes.js?v=v312';
export {
  evaluerProfil,
  htmlProfil,
  htmlProfilRapport,
  definirSeuilsProfil,
} from './chaines.js?v=v312';
