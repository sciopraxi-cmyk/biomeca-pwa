// ═══════════════════════════════════════════════════════════════════
// Extraction de blocs délimités par marqueurs — outillage partagé (#132)
// ═══════════════════════════════════════════════════════════════════
//
// Extrait de tests/sentry-scrub.test.mjs (#47), où ces fonctions ont été
// écrites et éprouvées. Mises en commun ici parce que #243 en a besoin à son
// tour : les recopier aurait été résoudre un problème de duplication en en
// créant un autre.
//
// DEUX USAGES, à ne pas confondre :
//
//   1. TEST DIFFÉRENTIEL (#47, #132) — le bloc extrait est la COPIE runtime
//      d'un miroir testé. On l'exécute et on exige des sorties identiques à
//      celles du miroir sur une table de cas commune. La promesse
//      « répercuter dans les deux fichiers » devient une vérification.
//
//   2. RENDRE TESTABLE (#243) — le bloc extrait n'a PAS de miroir. Les
//      marqueurs servent uniquement à sortir des fonctions d'un fichier qui
//      n'est pas un module ES, pour pouvoir les éprouver.
//
// Le commentaire de chaque marqueur doit dire lequel des deux il est, sans
// quoi quelqu'un cherchera un jour la copie qui n'existe pas.
//
// ─── GARDES ANTI-SUCCÈS-VACANT ───
// Un test vert qui n'a rien comparé est le mécanisme de l'incident fondateur
// du dépôt, transposé dans la suite de tests. Trois gardes vivent ici :
//   - marqueurs présents EXACTEMENT une fois dans le fichier ;
//   - bloc extrait au-dessus d'une taille plancher ;
//   - extraction qui échoue bruyamment plutôt que de rendre une chaîne vide.
// La quatrième — compteur d'exécutions non nul — appartient à chaque test,
// puisqu'elle porte sur sa table de cas.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE = join(ICI, '..', '..');

// Taille minimale d'un bloc extrait. Sans ce plancher, une extraction qui
// échoue rendrait '' et la comparaison serait VERTE sans avoir rien comparé.
export const TAILLE_PLANCHER = 400;

/**
 * Extrait le texte situé entre deux marqueurs de commentaire.
 *
 * L'extraction se fait par MARQUEURS, jamais par appariement d'accolades :
 * celui-ci casse dès qu'une accolade apparaît dans une chaîne, une regex ou
 * un commentaire.
 *
 * Coupe à la fin de la LIGNE portant le marqueur DÉBUT et au début de celle
 * portant le marqueur FIN — couper au texte du marqueur laisserait la fin de
 * sa ligne en tête du bloc, amputée de son `//`, donc invalide.
 *
 * @param {string} cheminRelatif  Chemin depuis la racine du dépôt.
 * @param {string} marqueurDebut  Texte du marqueur d'ouverture.
 * @param {string} marqueurFin    Texte du marqueur de fermeture.
 * @returns {string}  Le bloc extrait.
 */
export function extraireBloc(cheminRelatif, marqueurDebut, marqueurFin) {
  const source = readFileSync(join(RACINE, cheminRelatif), 'utf8');

  const nbDebut = source.split(marqueurDebut).length - 1;
  const nbFin = source.split(marqueurFin).length - 1;
  if (nbDebut !== 1 || nbFin !== 1) {
    throw new Error(
      `${cheminRelatif} : marqueurs attendus une seule fois (début=${nbDebut}, fin=${nbFin})`
    );
  }

  const posDebut = source.indexOf(marqueurDebut);
  const sautApres = source.indexOf('\n', posDebut);
  if (sautApres === -1) throw new Error(`${cheminRelatif} : marqueur DÉBUT en fin de fichier`);
  const debut = sautApres + 1;

  const posFin = source.indexOf(marqueurFin);
  const fin = source.lastIndexOf('\n', posFin) + 1;
  if (fin <= debut) throw new Error(`${cheminRelatif} : marqueur FIN avant marqueur DÉBUT`);

  const bloc = source.slice(debut, fin);
  if (bloc.length < TAILLE_PLANCHER) {
    throw new Error(
      `${cheminRelatif} : bloc extrait de ${bloc.length} caractères, plancher ${TAILLE_PLANCHER}`
    );
  }
  return bloc;
}

/**
 * Évalue un bloc de déclarations et rend les fonctions demandées.
 *
 * @param {string} bloc  Déclarations extraites par extraireBloc.
 * @param {string[]} noms  Noms à récupérer depuis la portée du bloc.
 * @returns {Record<string, Function>}
 */
// eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
export const fabriquer = (bloc, noms) => new Function(`${bloc}\nreturn {${noms.join(',')}};`)();

/**
 * Évalue PLUSIEURS blocs concaténés et rend les fonctions demandées.
 *
 * Un bloc extrait référence souvent des helpers définis dans un autre bloc du
 * même fichier — par exemple #243 POSTURE et #243 CLASSIFY appellent _coord,
 * qui vit dans #243 COORD. Les évaluer séparément produirait des références
 * non définies.
 *
 * GARDE : si un nom demandé n'apparaît pas dans le résultat, on échoue en
 * NOMMANT le nom manquant. Sans elle, une concaténation incomplète rendrait
 * un objet troué, et les tests suivants lèveraient des erreurs obscures
 * (« undefined is not a function ») au lieu de dire ce qui n'a pas été
 * extrait — un échec illisible est presque aussi mauvais qu'un faux succès.
 *
 * @param {string[]} blocs  Blocs extraits, dans l'ordre de dépendance.
 * @param {string[]} noms   Noms à récupérer.
 * @returns {Record<string, Function>}
 */
export function fabriquerAvecDependances(blocs, noms) {
  if (!Array.isArray(blocs) || blocs.length === 0) {
    throw new Error('fabriquerAvecDependances : aucun bloc fourni');
  }
  // `new Function` évalue les noms DANS son return : un nom absent y lève une
  // ReferenceError avant qu'aucune vérification a posteriori puisse agir.
  // On l'intercepte pour rendre le message explicite — « absent du code
  // extrait » dit où chercher, « x is not defined » ne le dit pas.
  let obtenu;
  try {
    obtenu = fabriquer(blocs.join('\n'), noms);
  } catch (e) {
    // Le diagnostic reste OUVERT : ce catch attrape aussi bien une référence
    // absente qu'une SyntaxError, cas réel si un marqueur coupe au mauvais
    // endroit. Annoncer « nom absent » enverrait alors sur une fausse piste.
    throw new Error(
      'fabriquerAvecDependances : échec d’évaluation du code extrait ' +
        `(référence absente ou syntaxe invalide) — ${e && e.message ? e.message : String(e)}`
    );
  }
  // Cette vérification est largement inatteignable depuis l'ajout du try
  // ci-dessus : un nom absent y lève avant d'arriver ici. Elle garde un sens
  // pour un nom qui EXISTE sans être une fonction — une constante extraite
  // par erreur, par exemple. Ne pas la supprimer comme code mort.
  const manquants = noms.filter((n) => typeof obtenu[n] !== 'function');
  if (manquants.length > 0) {
    throw new Error(
      `fabriquerAvecDependances : extrait mais non-fonction — ${manquants.join(', ')}`
    );
  }
  return obtenu;
}
