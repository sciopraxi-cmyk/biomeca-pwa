// ═══════════════════════════════════════════════════════════════════
// Harnais du DESSIN des points (drawOverlay) — #279 étape 3
// ═══════════════════════════════════════════════════════════════════
//
// drawOverlay et TOUTE sa fermeture de dépendances sont extraits de
// js/biomeca.js : la liste n'est pas écrite à la main, elle est CALCULÉE en
// suivant les appels de fonctions de premier niveau et les constantes
// utilisées. Une dépendance ajoutée un jour est donc prise automatiquement ;
// une dépendance introuvable fait échouer le chargement, bruyamment.
//
// Le contexte de canevas est un ENREGISTREUR : chaque appel de méthode et
// chaque affectation de propriété (globalAlpha, font, fillStyle…) est noté.
// Deux dessins sont identiques si et seulement si leurs journaux le sont.

import { SRC_BIOMECA, fonction, objet } from './extraire-biomeca.mjs';

// Définitions de premier niveau : fonctions et constantes d'une ligne.
function definitions() {
  const fonctions = new Set();
  for (const m of SRC_BIOMECA.matchAll(/\n(?:async )?function ([A-Za-z_$][\w$]*)\(/g)) {
    fonctions.add(m[1]);
  }
  const constantes = new Map();
  for (const m of SRC_BIOMECA.matchAll(/\nconst ([A-Za-z_$][\w$]*) = ([^\n]*)(?=\n)/g)) {
    // Constantes d'UNE ligne seulement : une ligne qui s'ouvre sur « { », « [ »
    // ou « ( » continue plus bas (TESTS, MARKER_TEMPLATES…), fournie à part.
    if (/[{[(]\s*$/.test(m[2])) continue;
    // Fin de ligne en ANTICIPATION : consommer le saut de ligne ferait sauter
    // une constante définie à la ligne suivante (MKR_TRAIT_MIN / MKR_HALO_PART).
    constantes.set(m[1], m[0].slice(1));
  }
  return { fonctions, constantes };
}

// Fermeture des dépendances à partir d'une fonction racine.
export function fermeture(racine) {
  const { fonctions, constantes } = definitions();
  const vues = new Set();
  const csts = new Set();
  const pile = [racine];
  while (pile.length) {
    const nom = pile.pop();
    if (vues.has(nom)) continue;
    vues.add(nom);
    const corps = fonction(nom).replace(/\/\/[^\n]*/g, '');
    // TOUTE référence compte, pas seulement un appel : une fonction passée en
    // argument (« .map(_normPt) ») est une dépendance au même titre.
    for (const m of corps.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
      if (fonctions.has(m[1]) && !vues.has(m[1])) pile.push(m[1]);
      else if (constantes.has(m[1]) && !fonctions.has(m[1])) csts.add(m[1]);
    }
  }
  return {
    fonctions: [...vues].sort(),
    constantes: [...csts].sort().map((c) => constantes.get(c)),
  };
}

// Contexte enregistreur.
export function contexteEnregistreur() {
  const journal = [];
  const ctx = new Proxy(
    {},
    {
      get(_c, prop) {
        if (prop === 'journal') return journal;
        if (prop === 'measureText') return (t) => ({ width: String(t).length * 7 });
        if (prop === 'canvas') return undefined;
        return (...args) => journal.push([String(prop), ...args]);
      },
      set(_c, prop, valeur) {
        journal.push(['=' + String(prop), valeur]);
        return true;
      },
    }
  );
  return ctx;
}

// Globaux lus par le dessin (réglages et test courant), exclus de la
// fermeture puisqu'ils sont des `let` : ils sont fournis ici, modifiables.
export function chargerDessin() {
  const { fonctions, constantes } = fermeture('drawOverlay');
  const code = `
    let markerSizeFactor = 0.55;
    let markerOpacity = 0.5;
    let currentTestId = null;
    let vidSnapZone = null;
    ${objet('TESTS')}
    ${constantes.join('\n')}
    ${fonctions.map(fonction).join('\n')}
    return {
      drawOverlay,
      TESTS,
      reglages(o) {
        if ('taille' in o) markerSizeFactor = o.taille;
        if ('opacite' in o) markerOpacity = o.opacite;
        if ('test' in o) currentTestId = o.test;
      },
    };
  `;
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt, jamais d'entrée externe
  return new Function(code)();
}

// Dessine et rend le journal des opérations.
export function journalDessin(env, marqueurs, view, opts) {
  const ctx = contexteEnregistreur();
  const canvas = { width: 1920, height: 1080 };
  if (opts === undefined) env.drawOverlay(ctx, canvas, marqueurs, -1, view);
  else env.drawOverlay(ctx, canvas, marqueurs, -1, view, opts);
  return JSON.parse(JSON.stringify(ctx.journal));
}

// Jeux de marqueurs SYNTHÉTIQUES (coordonnées inventées), un par gabarit.
const P = (x, y, side, name, color = '#4a9eff') => ({ x, y, side, name, color });
export const JEUX = {
  'kfppa-marche': {
    view: 'face',
    marqueurs: [
      P(700, 150, 'D', 'EIAS D'),
      P(735, 400, 'D', 'Rotule D'),
      P(705, 650, 'D', 'Tarse D'),
      P(1000, 150, 'G', 'EIAS G', '#3ecf72'),
      P(970, 400, 'G', 'Rotule G', '#3ecf72'),
      P(990, 650, 'G', 'Tarse G', '#3ecf72'),
    ],
  },
  verrou: {
    view: 'dos',
    marqueurs: [
      P(600, 200, 'D', 'Mollet D'),
      P(610, 450, 'D', 'Jonction D'),
      P(620, 700, 'D', 'Calca sup D'),
      P(640, 850, 'D', 'Calca inf D'),
      P(1100, 200, 'G', 'Mollet G', '#3ecf72'),
      P(1090, 450, 'G', 'Jonction G', '#3ecf72'),
      P(1070, 700, 'G', 'Calca sup G', '#3ecf72'),
      P(1060, 850, 'G', 'Calca inf G', '#3ecf72'),
    ],
  },
  'mla-marche': {
    view: 'profil',
    marqueurs: [
      P(500, 800, '', 'Calca'),
      P(800, 700, '', 'Naviculaire'),
      P(1100, 820, '', 'Tête M1'),
    ],
  },
};
