import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { computeCorrectedAngle, calcAngleSign } from '../js/calc.mjs';

// ═══════════════════════════════════════════════════════════════════
// Signe Inv/Év en vue dos — le défaut que rien ne gardait
// ═══════════════════════════════════════════════════════════════════
//
// CE QUI S'EST PASSÉ
// Les quatre tests en vue dos — verrouillage AP, mobilité arrière-pied,
// amorti/propulsion marche et course — annonçaient l'inverse de la réalité
// clinique : une éversion était libellée « Inv (+) », une inversion « Év (−) ».
// Les deux pieds, les quatre tests, le panneau comme le rapport imprimé.
//
// Le défaut ne venait NI de la qualification — quinze copies d'une même
// lambda, toutes conformes au bandeau « Inversion=+ Éversion=− » — NI du
// calcul de l'angle, dont les magnitudes étaient justes. Il venait du SIGNE
// posé par computeCorrectedAngle dans sa branche `view === 'dos'`.
//
// POURQUOI IL A VÉCU SI LONGTEMPS
// Aucun test ne couvrait computeCorrectedAngle ni calcAngleSign. Le
// comportement n'était fixé par rien, et les commentaires du fichier se
// contredisaient entre eux sur le sens du produit vectoriel. Ce fichier est
// la garde qui manquait.
//
// CE QUE CE FICHIER ANCRE, ET CE QU'IL N'ANCRE PAS — à lire avant de s'y fier.
//
// Les MAGNITUDES viennent d'une capture réelle : test « Verrouillage AP »,
// vue dos, relevé à l'écran par le praticien.
//   pied droit  — statique 11,6°  pointe 2,8°
//   pied gauche — statique 4,9°   pointe 10,1°
// Cliniquement, établi par le praticien : la STATIQUE est une ÉVERSION (−),
// la POINTE une INVERSION (+). Le code rendait exactement l'opposé.
//
// La GÉOMÉTRIE, elle, est SYNTHÉTIQUE. Les points ci-dessous sont construits
// pour reproduire le sens de bascule que le code d'origine devait lire ; ils
// ne sont pas les marqueurs de la capture. Les coordonnées réelles relevées
// sur cet écran ont été essayées : aucun de leurs triplets ordonnés ne
// reproduit une des quatre magnitudes, à 0,06° près. La correspondance
// photo ↔ mesure n'étant pas établissable, les employer aurait produit une
// fixture réelle MAL ATTRIBUÉE — pire qu'une fixture synthétique assumée.
//
// CONSÉQUENCE, à ne pas perdre de vue : ce fichier fixe la RELATION entre le
// sens de bascule et le signe rendu. Il ne démontre pas que cette relation est
// la bonne cliniquement — cela, seule la vérification à l'écran par le
// praticien l'établit, et c'est elle qui a fourni la référence ci-dessus.
// Le test garde donc contre une RÉGRESSION du signe, pas contre une erreur
// d'interprétation clinique initiale.

const VUE = 'dos';
const TYPE = 'ap';

// Géométrie minimale ne servant qu'à fixer le SENS lu par calcAngleSign.
// Repère écran : x vers la droite, y vers le bas.
const P = (x, y) => ({ x, y, name: 'p' });
const CENTRAL_DROITE = [P(0, 0), P(5, 5), P(0, 10)];
const CENTRAL_GAUCHE = [P(0, 0), P(-5, 5), P(0, 10)];

// rawAng = 180 − inclinaison : c'est ainsi que computeCorrectedAngle la dérive.
const brutPour = (incl) => 180 - incl;

// Les quatre mesures de la capture réelle. `pts` est déduit du sens que le
// code d'origine devait lire pour produire la valeur affichée ce jour-là.
const CAS_REELS = [
  { libelle: 'droit / statique', side: 'D', incl: 11.6, pts: CENTRAL_GAUCHE, attendu: -11.6 },
  { libelle: 'droit / pointe', side: 'D', incl: 2.8, pts: CENTRAL_DROITE, attendu: 2.8 },
  { libelle: 'gauche / statique', side: 'G', incl: 4.9, pts: CENTRAL_DROITE, attendu: -4.9 },
  { libelle: 'gauche / pointe', side: 'G', incl: 10.1, pts: CENTRAL_GAUCHE, attendu: 10.1 },
];

describe('signe Inv/Év — vue dos', () => {
  it('0. TÉMOIN — calcAngleSign discrimine les deux sens', () => {
    // Sans cela, les assertions suivantes pourraient passer sur une fonction
    // qui rendrait toujours la même chose.
    const d = calcAngleSign(CENTRAL_DROITE);
    const g = calcAngleSign(CENTRAL_GAUCHE);
    expect(d, 'les deux sens doivent donner des signes OPPOSÉS').toBe(-g);
    // ET LEQUEL vaut +1. Sans ces deux lignes, le témoin n'exerce que
    // l'opposition : un code qui rendrait −1 à droite et +1 à gauche le
    // passerait, et le commentaire de calc.mjs qui affirme « +1 = à DROITE »
    // renverrait à une garde qui ne le couvre pas. C'est le mécanisme même
    // qui a produit ce défaut : une affirmation écrite que rien n'exerce.
    expect(d, '+1 doit correspondre au point central à DROITE en repère écran').toBe(1);
    expect(g, '−1 doit correspondre au point central à GAUCHE en repère écran').toBe(-1);
  });

  it('1. Les quatre mesures de la capture réelle portent le bon signe', () => {
    let executes = 0;
    for (const c of CAS_REELS) {
      const v = computeCorrectedAngle(brutPour(c.incl), c.side, VUE, TYPE, c.pts);
      expect(v, `${c.libelle} : attendu ${c.attendu}`).toBeCloseTo(c.attendu, 6);
      executes++;
    }
    // Garde anti-succès-vacant : une table vide passerait la boucle.
    expect(executes).toBe(CAS_REELS.length);
    expect(executes).toBeGreaterThan(0);
  });

  it('2. La magnitude ne change jamais, seul le signe est en cause', () => {
    for (const c of CAS_REELS) {
      const v = computeCorrectedAngle(brutPour(c.incl), c.side, VUE, TYPE, c.pts);
      expect(Math.abs(v), `${c.libelle} : magnitude`).toBeCloseTo(c.incl, 6);
    }
  });

  it('3. Les deux pieds suivent la MÊME règle — le défaut n’était pas latéralisé', () => {
    // Même sens de bascule ⇒ signes opposés entre D et G, puisque la
    // latéralité s'inverse en vue dos. C'est la propriété, pas un littéral.
    for (const pts of [CENTRAL_DROITE, CENTRAL_GAUCHE]) {
      const d = computeCorrectedAngle(brutPour(10), 'D', VUE, TYPE, pts);
      const g = computeCorrectedAngle(brutPour(10), 'G', VUE, TYPE, pts);
      expect(d).toBe(-g);
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // La branche 'face' ne doit PAS bouger
  // ═══════════════════════════════════════════════════════════════════
  //
  // Les trois tests KFPPA produisent valgus/varus par un autre chemin. Ce
  // cas est là pour attraper un débordement de la correction : si quelqu'un
  // inverse le signe trop haut dans la fonction, il rougit.
  //
  // PROVENANCE DES QUATRE VALEURS : écrites en LISANT le code de la branche
  // face, puis confirmées par l'exécution — et non mesurées d'abord. Elles
  // décrivent donc le comportement actuel, dont rien n'établit par ailleurs
  // qu'il soit cliniquement juste. Leur rôle ici est de détecter un
  // CHANGEMENT, pas de valider valgus/varus.

  it('4. GARDE — la branche face est inchangée (valgus/varus)', () => {
    expect(computeCorrectedAngle(brutPour(12), 'D', 'face', 'kfppa-x', CENTRAL_DROITE)).toBeCloseTo(
      12,
      6
    );
    expect(computeCorrectedAngle(brutPour(12), 'G', 'face', 'kfppa-x', CENTRAL_DROITE)).toBeCloseTo(
      -12,
      6
    );
    expect(computeCorrectedAngle(brutPour(12), 'D', 'face', 'kfppa-x', CENTRAL_GAUCHE)).toBeCloseTo(
      -12,
      6
    );
    expect(computeCorrectedAngle(brutPour(12), 'G', 'face', 'kfppa-x', CENTRAL_GAUCHE)).toBeCloseTo(
      12,
      6
    );
  });

  it('4b. GEL — le repli sans points, dont la valeur est ARBITRAIRE', () => {
    // CE TEST NE JUSTIFIE RIEN, IL FIGE. Quand `pts` est absent, aucune
    // géométrie n'est disponible : le signe est posé sur le seul côté et ne
    // mesure rien. Il n'a pas été inversé par la correction du 19/09/2026 —
    // remplacer une valeur arbitraire par une autre n'aurait eu aucun appui.
    //
    // Les valeurs ci-dessous sont donc le comportement ACTUEL, gelé pour qu'il
    // ne dérive pas en silence, et non un comportement démontré. Si cette
    // branche est un jour tranchée — rendre null plutôt qu'un signe inventé
    // serait plus honnête — ce test doit changer AVEC la décision, jamais pour
    // faire passer autre chose.
    expect(computeCorrectedAngle(brutPour(10), 'D', VUE, TYPE)).toBeCloseTo(10, 6);
    expect(computeCorrectedAngle(brutPour(10), 'G', VUE, TYPE)).toBeCloseTo(-10, 6);
  });

  it('5. GARDE — mla et kfppa ne passent pas par la correction de signe', () => {
    expect(computeCorrectedAngle(160, 'D', VUE, 'mla', CENTRAL_DROITE)).toBe(160);
    expect(computeCorrectedAngle(160, 'D', VUE, 'kfppa', CENTRAL_DROITE)).toBe(20);
    expect(computeCorrectedAngle(null, 'D', VUE, TYPE, CENTRAL_DROITE)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Les DEUX copies doivent rester d'accord
// ═══════════════════════════════════════════════════════════════════
//
// computeCorrectedAngle existe en deux exemplaires : exporté par js/calc.mjs,
// et redéfini dans js/biomeca.js. C'EST LA COPIE DE biomeca.js QUI S'EXÉCUTE
// dans le navigateur — js/calc.mjs n'est jamais chargé par index.html. Les
// tests, eux, importent calc.mjs.
//
// Sans ce bloc, corriger une seule des deux donnerait des tests verts sur du
// code que le navigateur n'exécute pas. La comparaison se fait par EXÉCUTION
// des deux implémentations sur les mêmes entrées, jamais par comparaison de
// texte : une divergence d'arrondi ou de seuil vivrait dans les auxiliaires,
// que la comparaison textuelle du corps principal ne regarde pas.

function chargerCopieBiomeca() {
  const src = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');
  const extraire = (marqueur) => {
    const i = src.indexOf(marqueur);
    if (i < 0) return null;
    const j = src.indexOf('\n}', i);
    return j < 0 ? null : src.slice(i, j + 2);
  };
  const noms = [
    'function _coord',
    'function _isPlacedPt',
    'function _normPt',
    'function calcAngleSign',
    'function computeCorrectedAngle(rawAng, side, view, testType, pts) {',
  ];
  const morceaux = noms.map(extraire);
  if (morceaux.some((m) => !m)) {
    throw new Error('extraction incomplète des fonctions de js/biomeca.js');
  }
  return new Function(morceaux.join('\n') + '\nreturn computeCorrectedAngle;')();
}

describe('les deux copies de computeCorrectedAngle', () => {
  it('6. Extraction — la copie de biomeca.js se charge', () => {
    // Assertion sur le FAIT qu'on obtient une fonction : si l'extraction
    // ramenait autre chose, la comparaison suivante serait creuse.
    const f = chargerCopieBiomeca();
    expect(typeof f).toBe('function');
  });

  it('7. Les deux copies rendent EXACTEMENT les mêmes nombres', () => {
    const bio = chargerCopieBiomeca();
    const jeux = [
      ['droite', CENTRAL_DROITE],
      ['gauche', CENTRAL_GAUCHE],
      ['très à droite', [P(0, 0), P(40, 5), P(0, 10)]],
      ['quasi aligné', [P(0, 0), P(0.01, 5), P(0, 10)]],
    ];
    let compares = 0;
    let pire = 0;
    for (const [, pts] of jeux) {
      for (const side of ['D', 'G', '']) {
        for (const view of ['dos', 'face']) {
          for (const tt of ['ap', 'mla', 'kfppa', '']) {
            const a = computeCorrectedAngle(160, side, view, tt, pts);
            const b = bio(160, side, view, tt, pts);
            const ecart = a === null && b === null ? 0 : Math.abs((a ?? 0) - (b ?? 0));
            if (ecart > pire) pire = ecart;
            compares++;
          }
        }
      }
    }
    expect(compares, 'aucune combinaison comparée — le test serait creux').toBeGreaterThan(0);
    expect(pire, `${compares} combinaisons comparées`).toBe(0);
  });

  it('8. TÉMOIN — la comparaison sait détecter une divergence', () => {
    // Sans ce témoin, « écart 0 » pourrait signifier « la comparaison ne
    // compare rien ». On décale volontairement une entrée d'un degré.
    const bio = chargerCopieBiomeca();
    const a = computeCorrectedAngle(161, 'D', 'dos', 'ap', CENTRAL_DROITE);
    const b = bio(160, 'D', 'dos', 'ap', CENTRAL_DROITE);
    expect(Math.abs(a - b), 'un degré d’écart doit se voir').toBeCloseTo(1, 6);
  });
});
