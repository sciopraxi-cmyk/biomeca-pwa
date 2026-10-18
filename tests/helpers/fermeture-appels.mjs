// ═══════════════════════════════════════════════════════════════════
// #277 — Fermeture STATIQUE des appels depuis un point d'entrée
// ═══════════════════════════════════════════════════════════════════
//
// Complète les espions : à l'exécution, une fonction non extraite est un
// bouchon, et une écriture cachée derrière elle serait invisible. C'est cette
// lecture qui a trouvé le chemin Posturo buildRapportPosturo → _buildRapportBody
// → _doBuildRapport → nav('pg-rapport-posturo') → savePosturoBilan.
//
// Analyse syntaxique par le module `typescript` (dépendance déjà déclarée du
// projet) : un nom écrit dans une chaîne ou un gabarit HTML (onclick="…")
// n'est PAS un appel. Règles :
//   - un appel direct `nom(…)` vers une fonction déclarée dans js/biomeca.js
//     est suivi, à toute profondeur (rappels compris : setTimeout, then, forEach,
//     onload — exécutés en conséquence de l'action) ;
//   - un écouteur d'événement UTILISATEUR (addEventListener('mouseup', …),
//     .onclick = …) n'est pas suivi : il n'est pas exécuté par l'action ;
//   - `nav('<page de rapport>')` n'est pas suivi : il est noté, et son
//     comportement vers ces pages est prouvé par exécution ;
//   - une écriture est un appel à une fonction d'ÉCRITURE connue, ou
//     localStorage.setItem / removeItem / clear, ou supa.<écriture>.

import ts from 'typescript';
import { SRC_BIOMECA } from './extraire-biomeca.mjs';

export const ECRITURES = [
  'saveBilan',
  'saveBilanSilent',
  'savePosturoBilan',
  'savePedicurieBilan',
  'savePodopediatrieBilan',
  'savePatients',
  'saveToSupabase',
  '_syncPatientToNormalizedTables',
  'migrateSportBilanDataPhotos',
  'migratePosturoPhotos',
  'migratePedicuriePhotos',
  'migratePodopediatriePhotos',
  'migrateSportPhotos',
  'migratePhotoEntry',
  'uploadPhotoBase64',
  'deletePhotos',
  '_ecrireBrouillonMaintenant',
  '_planifierBrouillon',
  '_scheduleBilanAutosave',
  '_pedicurieGallerySave',
];
const ECRITURES_SUPA = ['saveData', 'insert', 'upsert', 'update', 'delete', 'upload', 'remove'];
const EVENEMENTS_UTILISATEUR =
  /^(mouse|touch|pointer|key)|^(click|dblclick|input|change|wheel|contextmenu|drag|drop)/;
export const PAGES_RAPPORT = ['pg-rapport', 'pg-rapport-posturo'];

const SOURCE = ts.createSourceFile('biomeca.js', SRC_BIOMECA, ts.ScriptTarget.Latest, true);
const ligne = (n) => SOURCE.getLineAndCharacterOfPosition(n.getStart(SOURCE)).line + 1;

// Index : nom → corps (déclarations, `const f = function/flèche`, `window.f = …`).
const CORPS = new Map();
const indexer = (nom, corps) => {
  if (!corps) return;
  if (!CORPS.has(nom)) CORPS.set(nom, []);
  CORPS.get(nom).push(corps);
};
const estFonction = (n) => n && (ts.isFunctionExpression(n) || ts.isArrowFunction(n));
(function parcourir(n) {
  if (ts.isFunctionDeclaration(n) && n.name) indexer(n.name.text, n.body);
  else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && estFonction(n.initializer))
    indexer(n.name.text, n.initializer.body);
  else if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(n.left) &&
    n.left.expression.getText(SOURCE) === 'window' &&
    estFonction(n.right)
  )
    indexer(n.left.name.text, n.right.body);
  ts.forEachChild(n, parcourir);
})(SOURCE);

// Racine d'une chaîne a.b(…).c[…].d : l'identifiant de tête, ou null.
// `window.x` a pour racine `x` : window.supa.from('t').upsert(…) est une
// écriture Supabase comme supa.from('t').upsert(…).
function racine(e) {
  while (e) {
    if (ts.isIdentifier(e)) return e.text;
    if (
      ts.isPropertyAccessExpression(e) &&
      ts.isIdentifier(e.expression) &&
      e.expression.text === 'window'
    )
      return e.name.text;
    if (
      ts.isPropertyAccessExpression(e) ||
      ts.isElementAccessExpression(e) ||
      ts.isCallExpression(e) ||
      ts.isNonNullExpression(e) ||
      ts.isParenthesizedExpression(e)
    )
      e = e.expression;
    else return null;
  }
  return null;
}

// Appels contenus dans un corps, sans entrer dans les écouteurs utilisateur.
function appels(corps) {
  const out = [];
  (function voir(n) {
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      if (ts.isPropertyAccessExpression(c)) {
        const meth = c.name.text;
        const obj = c.expression.getText(SOURCE);
        const evt = n.arguments[0];
        if (meth === 'addEventListener' && evt && ts.isStringLiteralLike(evt)) {
          if (EVENEMENTS_UTILISATEUR.test(evt.text)) return; // écouteur non exécuté
        }
        if (/(^|\.)localStorage$/.test(obj) && ['setItem', 'removeItem', 'clear'].includes(meth))
          out.push({ type: 'ecriture', nom: 'localStorage.' + meth, ligne: ligne(n) });
        // Chaîne d'appels Supabase : supa.from('t').upsert(…),
        // supa.storage.from('b').upload(…) — on remonte la chaîne jusqu'à sa
        // racine, à toute profondeur ; écriture si la racine est `supa`.
        if (ECRITURES_SUPA.includes(meth) && racine(c.expression) === 'supa')
          out.push({ type: 'ecriture', nom: 'supa…' + meth, ligne: ligne(n) });
      } else if (ts.isIdentifier(c)) {
        const nom = c.text;
        const a0 = n.arguments[0];
        if (nom === 'nav' && a0 && ts.isStringLiteralLike(a0) && PAGES_RAPPORT.includes(a0.text)) {
          out.push({ type: 'nav', nom: 'nav:' + a0.text, ligne: ligne(n) });
          return;
        }
        out.push({ type: ECRITURES.includes(nom) ? 'ecriture' : 'appel', nom, ligne: ligne(n) });
      }
    }
    // `.onclick = function…` (écouteur utilisateur posé par propriété) : non suivi.
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.left) &&
      /^on/.test(n.left.name.text) &&
      EVENEMENTS_UTILISATEUR.test(n.left.name.text.slice(2))
    )
      return;
    ts.forEachChild(n, voir);
  })(corps);
  return out;
}

/**
 * Tout ce qu'un point d'entrée peut atteindre : écritures (avec le chemin qui
 * y mène), passages par nav vers une page de rapport, nombre de fonctions vues.
 */
export function fermeture(entree) {
  if (!CORPS.has(entree)) throw new Error(`${entree} : fonction introuvable`);
  const vues = new Set([entree]);
  const pile = [[entree, [entree]]];
  const ecritures = [];
  const navs = [];
  while (pile.length) {
    const [f, chemin] = pile.pop();
    for (const corps of CORPS.get(f) || [])
      for (const a of appels(corps)) {
        if (a.type === 'ecriture')
          ecritures.push(`${chemin.join(' > ')} > ${a.nom} (js:${a.ligne})`);
        else if (a.type === 'nav') navs.push(`${chemin.join(' > ')} > ${a.nom}`);
        else if (CORPS.has(a.nom) && !vues.has(a.nom)) {
          vues.add(a.nom);
          pile.push([a.nom, [...chemin, a.nom]]);
        }
      }
  }
  return {
    ecritures: [...new Set(ecritures)].sort(),
    navs: [...new Set(navs)].sort(),
    n: vues.size,
  };
}
