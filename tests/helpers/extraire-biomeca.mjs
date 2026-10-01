// ═══════════════════════════════════════════════════════════════════
// Extraction de déclarations de premier niveau de js/biomeca.js (#275)
// ═══════════════════════════════════════════════════════════════════
//
// Usage « RENDRE TESTABLE » (cf. mirror-diff.mjs) : js/biomeca.js n'est pas un
// module ES, et c'est SA copie qui s'exécute dans le navigateur. On en sort
// des fonctions par leur NOM, sans marqueurs à poser dans le fichier.
//
// Chaque extracteur échoue BRUYAMMENT si le nom n'apparaît pas exactement une
// fois : une homonyme ou une absence ne doit jamais produire un test vert sur
// le mauvais code.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './mirror-diff.mjs';

// BIOMECA_SRC (outillage, #279) : lire une AUTRE version du fichier — par
// exemple celle de HEAD, écrite dans un fichier temporaire — pour produire
// une référence avec le code d'avant une modification, sans déplacer le
// travail en cours. Jamais défini dans la suite de tests normale.
export const SRC_BIOMECA = readFileSync(
  process.env.BIOMECA_SRC || join(RACINE, 'js/biomeca.js'),
  'utf8'
);

// #279 étape 3f — bloc entre deux marqueurs, lu dans LA MÊME source que les
// fonctions (BIOMECA_SRC compris). Mêmes bornes qu'extraireBloc : de la ligne
// qui suit le marqueur de début au début de la ligne du marqueur de fin.
// Sans cela, une référence « sur HEAD » mélangeait les fonctions de HEAD et
// les blocs du fichier de travail — mesure fausse, constatée sur K6.
export function bloc(marqueurDebut, marqueurFin) {
  for (const m of [marqueurDebut, marqueurFin]) {
    const n = SRC_BIOMECA.split(m).length - 1;
    if (n !== 1) throw new Error(`marqueur « ${m} » : ${n} occurrences, 1 attendue`);
  }
  const debut = SRC_BIOMECA.indexOf('\n', SRC_BIOMECA.indexOf(marqueurDebut)) + 1;
  const fin = SRC_BIOMECA.lastIndexOf('\n', SRC_BIOMECA.indexOf(marqueurFin)) + 1;
  if (debut <= 0 || fin <= debut) throw new Error('marqueurs de bloc mal ordonnés');
  return SRC_BIOMECA.slice(debut, fin);
}

function unique(tete, nom) {
  const n = SRC_BIOMECA.split(tete).length - 1;
  if (n !== 1) throw new Error(`${nom} : ${n} définitions trouvées, 1 attendue`);
  return SRC_BIOMECA.indexOf(tete) + 1;
}

// Fonction de premier niveau : de `\nfunction nom(` jusqu'au premier `\n}\n`.
// Une fonction écrite sur une seule ligne s'arrête à la fin de cette ligne.
export function fonction(nom) {
  // #279 — les fonctions ASYNCHRONES (validateAndSave) sont aussi acceptées.
  // L'unicité porte sur les deux formes réunies : une homonyme synchrone et
  // une asynchrone ne doivent pas coexister.
  const sync = `\nfunction ${nom}(`;
  const async_ = `\nasync function ${nom}(`;
  const n = SRC_BIOMECA.split(sync).length - 1 + SRC_BIOMECA.split(async_).length - 1;
  if (n !== 1) throw new Error(`${nom} : ${n} définitions trouvées, 1 attendue`);
  const i = SRC_BIOMECA.includes(async_) ? unique(async_, nom) : unique(sync, nom);
  const ligne = SRC_BIOMECA.slice(i, SRC_BIOMECA.indexOf('\n', i));
  if (ligne.trimEnd().endsWith('}') && ligne.split('{').length === ligne.split('}').length) {
    return ligne;
  }
  const j = SRC_BIOMECA.indexOf('\n}\n', i);
  if (j < 0) throw new Error(`${nom} : fin introuvable`);
  return SRC_BIOMECA.slice(i, j + 2);
}

// Bloc `const NOM = {` … `\n};` — TESTS, MEASURE_COMPUTERS.
export function objet(nom) {
  const i = unique(`\nconst ${nom} = {`, nom);
  const j = SRC_BIOMECA.indexOf('\n};', i);
  if (j < 0) throw new Error(`${nom} : fin introuvable`);
  return SRC_BIOMECA.slice(i, j + 3);
}

// Constante tenant sur une ligne.
export function ligneConst(nom) {
  const m = SRC_BIOMECA.match(new RegExp(`\\nconst ${nom} = [^\\n]*\\n`, 'g'));
  if (!m || m.length !== 1) throw new Error(`${nom} : constante introuvable ou multiple`);
  return m[0];
}

// Tableau de premier niveau sur plusieurs lignes : `const NOM = [` … `\n];`
// (#279 étape 3e — clés de photos lues par le filtre de persistance).
export function tableau(nom) {
  const i = unique(`\nconst ${nom} = [`, nom);
  const j = SRC_BIOMECA.indexOf('\n];', i);
  if (j < 0) throw new Error(`${nom} : fin introuvable`);
  return SRC_BIOMECA.slice(i, j + 3);
}
