// ═══════════════════════════════════════════════════════════════════
// Contraste WCAG et résolution des fonds — outillage partagé (#132)
// ═══════════════════════════════════════════════════════════════════
//
// Écrit ici plutôt que dans le fichier de test pour une raison précise : ce
// calcul a existé un temps en DEUX exemplaires — un dans le test, un dans un
// script de mesure — et les deux ont divergé sur le traitement des dégradés.
// C'est la dette des cinq test-mirrors (#132), reproduite en miniature. Une
// seule implémentation, importée par qui en a besoin.
//
// CE QUE CET OUTIL REFUSE DE FAIRE
// Deviner. Un fond qu'il ne sait pas résoudre est INDÉTERMINÉ, jamais
// conforme. La règle vient d'un défaut observé : getComputedStyle rend
// rgba(0,0,0,0) pour un background-IMAGE, et une mesure qui remonte alors aux
// ancêtres lit un fond qui n'est pas celui qui est peint. En thème clair cela
// produit une fausse alerte, visible ; en thème sombre un faux conforme,
// invisible. Le second est le plus coûteux.

// ─── Contraste ───

const versRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const versHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const luminance = ([r, g, b]) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/** Rapport de contraste WCAG 2.1 entre deux couleurs hexadécimales. */
export function contraste(a, b) {
  const [l1, l2] = [luminance(versRgb(a)), luminance(versRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Compose une couleur translucide sur un fond opaque. */
export function composer(rgb, alpha, fondHex) {
  const base = versRgb(fondHex);
  return versHex(rgb.map((v, i) => v * alpha + base[i] * (1 - alpha)));
}

/**
 * Résout une notation rgb()/rgba() en hexadécimal, ou rend null.
 *
 * Les POURCENTAGES sont une forme légitime : rgb(100%, 0%, 0%) vaut #ff0000.
 * Un parseFloat nu y lirait 100 et rendrait #640000 — une couleur qui n'existe
 * pas, rangée parmi les valeurs « résolues ». C'était la seule ligne de ce
 * fichier qui contredisait son en-tête.
 * Les formes MIXTES (rgb(100%, 0, 0)) sont invalides en CSS : non résolues.
 * Une composante hors de [0,255] après conversion est une valeur que cette
 * fonction n'a pas comprise : non résolue plutôt que rabotée en silence.
 * Un alpha < 1 rend null : la couleur rendue dépend de ce qu'il y a derrière.
 */
export function resoudreRgb(texte) {
  const m = texte.match(/^rgba?\(([^)]*)\)$/i);
  if (!m) return null;
  const parts = m[1].split(/[,\s/]+/).filter(Boolean);
  if (parts.length < 3) return null;

  const pourcents = parts.slice(0, 3).filter((p) => p.includes('%')).length;
  if (pourcents !== 0 && pourcents !== 3) return null; // forme mixte

  const comp = [];
  for (const p of parts.slice(0, 3)) {
    const v = parseFloat(p);
    if (Number.isNaN(v)) return null;
    const n = p.includes('%') ? (v / 100) * 255 : v;
    if (n < 0 || n > 255) return null;
    comp.push(n);
  }

  if (parts.length > 3) {
    const a = parts[3];
    const v = parseFloat(a);
    if (Number.isNaN(v)) return null;
    const alpha = a.includes('%') ? v / 100 : v;
    if (alpha < 0 || alpha > 1) return null;
    if (alpha < 1) return null; // translucide : dépend du fond derrière
  }
  return versHex(comp);
}

// ─── Dégradés ───

// Noms de couleur CSS rencontrés dans ce dépôt. Tout nom absent de cette table
// est INDÉTERMINÉ — mieux vaut refuser que deviner.
const NOMS = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  gray: '#808080',
  grey: '#808080',
};

// Mots-clés de syntaxe d'un dégradé, à ne pas confondre avec des couleurs.
//
// SAUTER UN JETON, C'EST LE RETIRER DU DÉNOMINATEUR SANS LE DIRE. Cette table
// ne doit donc contenir QUE des mots qui ne peuvent en aucun cas désigner une
// couleur. Trois entrées en ont été retirées :
//   - `transparent` est une COULEUR, et translucide : son rendu dépend de ce
//     qu'il y a derrière. `linear-gradient(transparent, #000)` jugé sur #000
//     seul rendrait CONFORME — exactement ce qu'on refuse pour rgba(0,0,0,.2).
//   - `oklch` et `oklab` sont ambigus : mots-clés dans `gradient(in oklch, …)`,
//     fonctions de couleur dans `oklch(0.7 0.1 200)`.
//   - `from` introduit une couleur relative, dont l'arrêt suivant n'est pas
//     résoluble ici.
// L'ambiguïté se tranche sur ce qui SUIT le jeton, pas sur une liste.
// TROIS FAMILLES SÉPARÉES, et non une liste ordonnée — l'ordre seul ne suffit
// pas : le mot `gradient` est suivi d'une parenthèse PAR CONSTRUCTION, donc
// une règle « suivi d'une parenthèse = fonction de couleur » placée avant la
// syntaxe rendrait TOUT dégradé indéterminé.

// 1. Ce qui NOMME le dégradé. Jamais une couleur, quel que soit le contexte.
const MOTS_DEGRADE = /^(linear|radial|conic|repeating|gradient)$/;

// 2. Ce qui est AMBIGU : mot-clé d'interpolation dans `gradient(in oklch, …)`,
//    fonction de couleur dans `oklch(0.7 0.1 200)`. C'est la parenthèse qui
//    tranche, pas une liste.
const INTERPOLATION =
  /^(oklch|oklab|srgb|hsl|lab|lch|hwb|longer|shorter|increasing|decreasing|hue)$/;

// 3. Le reste de la syntaxe : position, angle, forme, unité.
const SYNTAXE =
  /^(to|top|bottom|left|right|center|deg|turn|rad|at|circle|ellipse|closest|farthest|side|corner|in|px|em|rem|vh|vw|none)$/;

// Mots qui DÉSIGNENT une couleur non résoluble ici, où qu'ils apparaissent.
const COULEURS_NON_RESOLUBLES = /^(transparent|currentcolor|from)$/;

/**
 * Arrêts de couleur d'une déclaration de dégradé.
 * Rend { resolus: string[] (hex), inconnus: string[] }.
 *
 * `resoudre` est le résolveur de variables de l'APPELANT, passé tel quel. Il
 * n'y a volontairement AUCUNE résolution de var() ici : le test en possède
 * déjà une (resoudreFond, avec sa table de valeurs en portée claire), et en
 * écrire une seconde recréerait la divergence que ce fichier existe pour
 * éviter. Sans résolveur, un arrêt var() reste inconnu — donc INDÉTERMINÉ,
 * jamais conforme.
 *
 * L'appelant décide aussi de ce qu'il REFUSE de résoudre. Une variable
 * redéfinie selon le thème n'a pas de valeur unique : le même dégradé peut
 * être rendu sur une page claire et sur une page sombre (c'est le cas du
 * bouton de synthèse, dont le jumeau est injecté par getBilanPosturoHTML dans
 * une page restée sombre). Son résolveur rend null, et l'arrêt devient inconnu.
 */
export function arretsDeDegrade(decl, { resoudre = null } = {}) {
  const resolus = [];
  const inconnus = [];
  // var(...) est placé AVANT le mot nu : sans cela `var` serait capturé comme
  // un simple mot, puis « suivi d'une parenthèse » le rangerait en inconnu
  // sans jamais tenter de le résoudre. Un niveau d'imbrication est toléré,
  // pour var(--a, var(--b)).
  const jeton =
    /var\((?:[^()]|\([^()]*\))*\)|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-z]{3,20}\b/gi;
  let m;
  while ((m = jeton.exec(decl)) !== null) {
    const t = m[0];
    if (/^var\(/i.test(t)) {
      const r = resoudre ? resoudre(t) : null;
      if (r && /^#[0-9a-fA-F]{6}$/.test(r)) resolus.push(r.toLowerCase());
      else inconnus.push(t);
      continue;
    }
    if (/^#[0-9a-fA-F]{6}$/.test(t)) {
      resolus.push(t.toLowerCase());
      continue;
    }
    if (/^#[0-9a-fA-F]{3}$/.test(t)) {
      resolus.push(('#' + [...t.slice(1)].map((c) => c + c).join('')).toLowerCase());
      continue;
    }
    if (/^rgba?\(/i.test(t)) {
      const r = resoudreRgb(t);
      if (r) resolus.push(r);
      else inconnus.push(t);
      continue;
    }
    if (/^hsla?\(/i.test(t)) {
      inconnus.push(t);
      continue;
    }
    const bas = t.toLowerCase();
    const suivi = /^\s*\(/.test(decl.slice(m.index + t.length));

    // Une couleur non résoluble pèse, où qu'elle apparaisse.
    if (COULEURS_NON_RESOLUBLES.test(bas)) {
      inconnus.push(t);
      continue;
    }
    // Ce qui nomme le dégradé : structure, jamais un arrêt.
    if (MOTS_DEGRADE.test(bas)) continue;
    // Ambiguïté tranchée par la parenthèse, pas par une liste.
    if (INTERPOLATION.test(bas)) {
      if (suivi) inconnus.push(t + '(…)');
      continue;
    }
    // Tout autre jeton suivi d'une parenthèse est une fonction qu'on ne sait
    // pas lire : elle compte comme arrêt inconnu, elle ne s'évapore pas.
    if (suivi) {
      inconnus.push(t + '(…)');
      continue;
    }
    if (SYNTAXE.test(bas)) continue;
    if (bas in NOMS) resolus.push(NOMS[bas]);
    else inconnus.push(t);
  }
  return { resolus, inconnus };
}

/**
 * Verdict sur un texte posé sur un dégradé. LE PIRE ARRÊT DÉCIDE.
 * Rend { etat: 'CONFORME' | 'SOUS SEUIL' | 'INDÉTERMINÉ', pire?, pireArret?, raison? }.
 *
 * `texte` est OBLIGATOIRE et sans valeur par défaut. Un défaut à '#ffffff'
 * réintroduirait, pour tout appelant qui l'oublie, l'hypothèse « le texte est
 * blanc » — celle qui avait produit 104 faux « sous seuil » sur des dégradés
 * pâles portant du texte sombre. Qui ne sait pas quelle couleur de texte il
 * mesure ne doit pas pouvoir poser la question.
 *
 * `pire` s'initialise à null et jamais à une valeur qui satisfait le seuil :
 * un dégradé dont aucun arrêt n'est mesurable rendrait sinon « conforme »
 * sans avoir rien mesuré — la réussite vide, en une ligne.
 */
export function verdictDegrade(
  decl,
  texte,
  { seuil = 4.5, tronquee = false, resoudre = null } = {}
) {
  if (typeof texte !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(texte)) {
    throw new Error('verdictDegrade : la couleur de texte est obligatoire, en #rrggbb');
  }
  if (tronquee) {
    return { etat: 'INDÉTERMINÉ', raison: 'déclaration tronquée (parenthèses déséquilibrées)' };
  }
  // TRANSMISSION du résolveur. C'est ici que passe le chemin réel : un
  // arretsDeDegrade(decl) sans options rendrait tout var() inconnu, et l'ajout
  // du paramètre en amont ne changerait rien. Vérifié par témoin, pas relu.
  const { resolus, inconnus } = arretsDeDegrade(decl, { resoudre });
  if (inconnus.length) {
    return {
      etat: 'INDÉTERMINÉ',
      raison: `arrêt(s) non résolu(s) : ${inconnus.join(', ')}`,
      resolus,
    };
  }
  if (resolus.length === 0) {
    return { etat: 'INDÉTERMINÉ', raison: 'aucun arrêt de couleur extrait' };
  }
  let pire = null;
  let pireArret = null;
  for (const a of resolus) {
    const k = contraste(texte, a);
    if (pire === null || k < pire) {
      pire = k;
      pireArret = a;
    }
  }
  if (pire === null) return { etat: 'INDÉTERMINÉ', raison: 'aucun contraste calculé' };
  return {
    etat: pire >= seuil ? 'CONFORME' : 'SOUS SEUIL',
    pire: +pire.toFixed(2),
    pireArret,
    resolus,
  };
}

/**
 * Extrait les déclarations de fond d'une source.
 * Rend { degrades: [{decl, tronquee}], sansDegrade: number }.
 *
 * PARENTHÈSES ÉQUILIBRÉES : un `[^)]*\)` s'arrêterait à la parenthèse de
 * `rgba(...)` imbriqué et perdrait la fin de la déclaration en silence —
 * « un arrêt extrait » aurait alors l'air d'un résultat normal.
 *
 * ON NE COUPE PAS SUR LE SAUT DE LIGNE. Une déclaration écrite
 *     background:
 *       linear-gradient(90deg, #fff, #000);
 * serait sinon coupée au retour à la ligne, rendrait une chaîne vide, ne
 * contiendrait pas « gradient( », et disparaîtrait sans un mot. Les
 * terminateurs sont ceux du langage : ; " } — pas la mise en forme.
 *
 * Et les déclarations `background:` SANS dégradé sont comptées, pas évaporées :
 * un appelant peut ainsi vérifier que le total correspond à ce qu'il attend.
 */
export function fondsDegrades(source) {
  const degrades = [];
  let sansDegrade = 0;
  const re = /background(?:-image)?\s*:\s*/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const debut = m.index + m[0].length;
    let i = debut;
    let prof = 0;
    let fin = -1;
    while (i < source.length) {
      const c = source[i];
      if (c === '(') prof++;
      else if (c === ')') {
        prof--;
        if (prof < 0) {
          fin = i;
          break;
        }
      } else if ((c === ';' || c === '"' || c === '}') && prof === 0) {
        fin = i;
        break;
      }
      i++;
    }
    if (fin === -1) fin = source.length;
    const decl = source.slice(debut, fin).trim();
    if (!/gradient\s*\(/i.test(decl)) {
      sansDegrade++;
      continue;
    }
    const o = (decl.match(/\(/g) || []).length;
    const f = (decl.match(/\)/g) || []).length;
    degrades.push({ decl, tronquee: o !== f });
  }
  return { degrades, sansDegrade };
}
