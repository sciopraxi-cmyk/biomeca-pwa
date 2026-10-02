import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';

// ═══════════════════════════════════════════════════════════════════
// #272-A — borne de taille des blobs, et plancher de diamètre
// ═══════════════════════════════════════════════════════════════════
//
// L'HYPOTHÈSE QUE CE LOT ÉPROUVE
// La détection automatique échouait sur les vidéos réelles. Le relevé a
// établi que le compte de blob est un nombre d'ÉCHANTILLONS — le remplissage
// de proche en proche avance par pas de 2, donc chaque échantillon couvre
// 4 px² — et que le plancher sizeMin = 5 rejette tout disque de moins de
// 5,05 px de diamètre. Or en 1280×720, au cadrage de travail, une pastille
// réfléchissante de 5 mm ne fait que 4 à 6 px : elle tombait au seuil de
// taille avant tout autre filtre.
//
// Ce lot fait deux choses et rien d'autre : il demande 1920×1080 à la caméra,
// et il rend la borne HAUTE proportionnelle à la définition. sizeMin reste
// absolu — c'est un plancher de bruit, pas une mesure d'objet.
//
// CE QUE CE FICHIER GARDE, ET CE QU'IL NE GARDE PAS
// Il fixe le calcul de la borne haute et le plancher de diamètre. Il
// n'établit pas que la détection trouvera mieux sur une vidéo réelle : cela,
// seul l'essai du praticien à l'écran le dira. Si la détection ne change pas,
// l'hypothèse est réfutée — et ces tests resteront justes.

// js/biomeca.js est un script classique : les fonctions sont extraites par
// leur texte, comme pour tests/inv-ev-signe.test.mjs.
function chargerDepuisBiomeca(noms) {
  const src = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');
  const extraire = (marqueur) => {
    const i = src.indexOf(marqueur);
    if (i < 0) return null;
    const j = src.indexOf('\n}', i);
    return j < 0 ? null : src.slice(i, j + 2);
  };
  const morceaux = noms.map(extraire);
  if (morceaux.some((m) => !m)) {
    const manquants = noms.filter((_, i) => !morceaux[i]);
    throw new Error('extraction impossible : ' + manquants.join(', '));
  }
  return morceaux.join('\n');
}

const SRC_SIZEMAX = chargerDepuisBiomeca(['function _blobSizeMaxFor']);
const _blobSizeMaxFor = new Function(SRC_SIZEMAX + '\nreturn _blobSizeMaxFor;')();

describe('#272-A borne haute de taille', () => {
  it('0. Extraction — la fonction se charge', () => {
    // Si l'extraction ramenait autre chose, les assertions suivantes
    // porteraient sur du vide.
    expect(typeof _blobSizeMaxFor).toBe('function');
  });

  it('1. NON-RÉGRESSION — en 1280×720 elle rend exactement 200', () => {
    // C'est la garde : à la définition d'hier, le comportement ne change pas
    // d'un échantillon. Sans elle, ce lot changerait deux choses au lieu
    // d'une, et son résultat ne serait plus interprétable.
    expect(_blobSizeMaxFor(1280, 720)).toBe(200);
  });

  it('2. En 1920×1080 elle rend DAVANTAGE, dans le rapport des surfaces', () => {
    const v = _blobSizeMaxFor(1920, 1080);
    expect(v).toBeGreaterThan(200);
    // Le compte de blob est une surface : il croît comme le carré de la
    // définition. 1920×1080 / 1280×720 = 2,25.
    expect(v).toBe(Math.round(200 * 2.25));
  });

  it('3. La borne ne peut que CROÎTRE — le plancher protège le mode Zone', () => {
    // Cette fonction reçoit parfois les dimensions d'une ZONE de calage, pas
    // de l'image entière. Sans plancher, une petite zone rendrait une borne
    // minuscule et rejetterait les pastilles qu'elle isole.
    expect(_blobSizeMaxFor(300, 200)).toBe(200);
    expect(_blobSizeMaxFor(64, 48)).toBe(200);
    expect(_blobSizeMaxFor(1, 1)).toBe(200);
  });

  it('4. TÉMOIN — une implémentation qui rendrait 200 partout ÉCHOUE', () => {
    // Sans ce témoin, les cas 1 et 3 passeraient sur une fonction constante,
    // et le cas 2 serait le seul à mordre. On vérifie explicitement que la
    // constante est détectée comme insuffisante.
    const constante = () => 200;
    expect(constante(1280, 720)).toBe(200); // passerait le cas 1
    expect(constante(300, 200)).toBe(200); // passerait le cas 3
    expect(constante(1920, 1080)).not.toBeGreaterThan(200); // mais échoue le cas 2
    // Et la vraie fonction, elle, les distingue :
    expect(_blobSizeMaxFor(1920, 1080)).not.toBe(constante(1920, 1080));
  });
});

// ═══════════════════════════════════════════════════════════════════
// Le plancher de diamètre, mesuré et non déduit
// ═══════════════════════════════════════════════════════════════════
//
// Le chiffre de 5,05 px est écrit en commentaire dans js/biomeca.js. Ce bloc
// l'ÉTABLIT par exécution du détecteur réel sur des disques synthétiques,
// plutôt que de refaire le calcul à côté — un commentaire que rien n'exerce
// est exactement ce qui a laissé vivre les défauts de cette semaine.

const SRC_DETECT = chargerDepuisBiomeca([
  'function _blobSizeMaxFor',
  'function _detectReflectiveBlobs',
]);
// sensThr est une variable de module dans biomeca.js ; on la fournit au
// contexte d'évaluation avec sa valeur par défaut.
const _detectReflectiveBlobs = new Function(
  'let sensThr = 200;\n' + SRC_DETECT + '\nreturn _detectReflectiveBlobs;'
)();

// Image noire portant un unique disque blanc de diamètre d. Le centre est
// décalé de (ox, oy) : le compte d'un petit disque dépend de son CALAGE
// SOUS-PIXEL sur la grille d'échantillonnage, et c'est précisément ce que ce
// bloc établit.
function imageAvecDisque(W, H, d, ox = 0, oy = 0) {
  const data = new Uint8ClampedArray(W * H * 4);
  const cx = W / 2 + ox;
  const cy = H / 2 + oy;
  const r = d / 2;
  // On ne peint que la boîte du disque : en 1920×1080 un balayage complet
  // coûterait deux millions d'itérations par image, pour un disque qui en
  // occupe quelques centaines.
  const x0 = Math.max(0, Math.floor(cx - r - 2));
  const x1 = Math.min(W, Math.ceil(cx + r + 2));
  const y0 = Math.max(0, Math.floor(cy - r - 2));
  const y1 = Math.min(H, Math.ceil(cy + r + 2));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const i = (y * W + x) * 4;
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
  }
  // Alpha opaque partout : le détecteur ne le lit pas, mais une image à
  // alpha nul se lirait mal si quelqu'un l'inspectait.
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return data;
}

describe('#272-A plancher de diamètre', () => {
  it('5. TÉMOIN — le détecteur trouve un disque franchement gros', () => {
    // Sans cela, « 0 blob » sur les petits disques ne distinguerait pas
    // « trop petit » de « le détecteur ne fonctionne pas dans ce harnais ».
    const blobs = _detectReflectiveBlobs(imageAvecDisque(120, 120, 20), 120, 120);
    expect(blobs.length).toBeGreaterThan(0);
  });

  // Le balayage : pour chaque diamètre, neuf calages sous-pixel. C'est LE
  // tableau du diagnostic — il est gardé ici plutôt que dans la mémoire de
  // celui qui l'a écrit, et le commentaire de js/biomeca.js y renvoie.
  const CALAGES = [0, 0.5, 1];
  function calagesDetectes(d) {
    let n = 0;
    for (const ox of CALAGES) {
      for (const oy of CALAGES) {
        if (_detectReflectiveBlobs(imageAvecDisque(120, 120, d, ox, oy), 120, 120).length > 0) n++;
      }
    }
    return n;
  }

  it('6. Le balayage sous-pixel — la falaise est entre 4 et 7 px', () => {
    // Valeurs MESURÉES. Elles disent le mécanisme du défaut : entre 4 et
    // 6 px la détection est INTERMITTENTE selon le calage, et le calage
    // change à chaque image dès que le corps bouge.
    const attendu = { 2: 0, 3: 0, 4: 1, 5: 5, 6: 8, 7: 9, 8: 9 };
    const obtenu = {};
    for (const d of Object.keys(attendu).map(Number)) obtenu[d] = calagesDetectes(d);
    expect(obtenu).toEqual(attendu);
  });

  it('7. Un disque de 3 px n’est JAMAIS détecté, quel que soit le calage', () => {
    // Cas franc, volontairement pris LOIN de la falaise : à 4 px la détection
    // n'aboutit qu'une fois sur neuf, et un test posé sur un cas instable
    // rougirait un jour sans raison.
    expect(calagesDetectes(3)).toBe(0);
  });

  it('8. Un disque de 8 px est TOUJOURS détecté — l’autre borne franche', () => {
    // Sans ce cas, un « 0 » partout passerait les deux précédents : il faut
    // montrer que le balayage sait aussi rendre 9.
    expect(calagesDetectes(8)).toBe(CALAGES.length * CALAGES.length);
  });
});

// ═══════════════════════════════════════════════════════════════════
// La falaise HAUTE — l'autre côté de la borne
// ═══════════════════════════════════════════════════════════════════
//
// Le bloc précédent garde la borne BASSE. Ce lot vient de modifier la borne
// HAUTE : une borne gardée d'un seul côté n'est pas gardée. Ces cas
// établissent qu'un disque trop gros est rejeté, ET que la borne relative
// relève effectivement ce plafond en 1080p — sans quoi la formule serait
// jolie et sans effet.
//
// Les diamètres sont ceux MESURÉS, pas déduits de sizeMax : on ne teste pas
// une formule contre elle-même.

describe('#272-A falaise haute', () => {
  function detectesA(W, H, d) {
    let n = 0;
    for (const ox of [0, 0.5, 1]) {
      for (const oy of [0, 0.5, 1]) {
        if (_detectReflectiveBlobs(imageAvecDisque(W, H, d, ox, oy), W, H).length > 0) n++;
      }
    }
    return n;
  }

  it('9. CONTRÔLE POSITIF — 12 px est détecté 9/9 aux DEUX définitions', () => {
    // Un diamètre franchement entre les deux falaises. Sans lui, des zéros
    // aux extrémités ne se distingueraient pas d'un harnais cassé.
    expect(detectesA(1280, 720, 12)).toBe(9);
    expect(detectesA(1920, 1080, 12)).toBe(9);
  });

  it('10. En 1280×720 (sizeMax 200) — plafond mesuré entre 30 et 34 px', () => {
    expect(_blobSizeMaxFor(1280, 720)).toBe(200);
    expect(detectesA(1280, 720, 30), '30 px doit encore passer').toBe(9);
    expect(detectesA(1280, 720, 34), '34 px doit être rejeté').toBe(0);
  });

  it('11. En 1920×1080 (sizeMax 450) — le plafond est PLUS HAUT', () => {
    expect(_blobSizeMaxFor(1920, 1080)).toBe(450);
    // 34 px était rejeté en 720p ; ici il passe : c'est l'effet de la borne
    // relative, et c'est ce que ce cas démontre.
    expect(detectesA(1920, 1080, 34), '34 px, rejeté en 720p, doit passer ici').toBe(9);
    expect(detectesA(1920, 1080, 46), '46 px doit encore passer').toBe(9);
    expect(detectesA(1920, 1080, 50), '50 px doit être rejeté').toBe(0);
  });
});
