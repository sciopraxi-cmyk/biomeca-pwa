// ═══════════════════════════════════════════════════════════════════
// #268 — fenêtres en thème clair : outillage de mesure partagé
// ═══════════════════════════════════════════════════════════════════
//
// POURQUOI UN PARCOURS D'ARBRE
// La garde de palette-bilans mesure le blanc ÉCRIT en dur. Les trois familles
// de défauts consignées au terme de la bascule claire lui échappent :
//   1. texte coloré trop pâle sur fond clair ;
//   2. texte sombre (variable redéfinie par le thème) sur un fond fixe sombre ;
//   3. texte HÉRITÉ : un fond posé sans couleur, le texte suit l'ancêtre.
// La troisième exige de suivre l'héritage de la couleur dans l'arbre : c'est
// ce que fait mesurerFenetre(), élément par élément.
//
// CE QUE L'OUTIL REFUSE DE FAIRE
// Deviner. Une couleur qu'il ne sait pas résoudre rend l'élément INDÉTERMINÉ,
// compté comme défaut — jamais comme conforme.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contraste, composer, verdictDegrade, arretsDeDegrade } from './contraste.mjs';
import { fonction, tableau, objet, ligneConst, SRC_BIOMECA } from './extraire-biomeca.mjs';
import { RACINE } from './mirror-diff.mjs';

export const CSS_ENTIER = readFileSync(join(RACINE, 'css/biomeca.css'), 'utf8');
export const HTML_ENTIER = readFileSync(join(RACINE, 'index.html'), 'utf8');

// ─── Analyse HTML minimale (balisage de l'application, sans dépendance) ───

const VIDES = new Set(['input', 'br', 'hr', 'img', 'meta', 'link', 'source', 'wbr', 'col', 'area']);

/** Arbre { tag, attrs, enfants, texte } d'un fragment HTML. */
export function analyser(html) {
  const racine = { tag: '#racine', attrs: {}, enfants: [], texte: '' };
  const pile = [racine];
  const re =
    /<!--[\s\S]*?-->|<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const haut = pile[pile.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) {
      const i = pile.map((n) => n.tag).lastIndexOf(m[1].toLowerCase());
      if (i > 0) pile.length = i;
      continue;
    }
    if (m[2]) {
      const attrs = {};
      for (const a of (m[3] || '').matchAll(
        /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
      ))
        attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
      const n = { tag: m[2].toLowerCase(), attrs, enfants: [], texte: '' };
      haut.enfants.push(n);
      if (!VIDES.has(n.tag) && !m[4]) pile.push(n);
      continue;
    }
    if (m[5]) haut.texte += m[5];
  }
  return racine;
}

/** Sous-arbre (élément entier) portant cet identifiant dans le HTML. */
export function sousArbreParId(arbre, id) {
  const pile = [arbre];
  while (pile.length) {
    const n = pile.pop();
    if (n.attrs && n.attrs.id === id) return n;
    pile.push(...(n.enfants || []));
  }
  return null;
}

// ─── Valeurs du thème ───

/**
 * Règles de PREMIER NIVEAU de la feuille, dans l'ordre : [{ selecteurs, decl, pos }].
 * Commentaires retirés d'abord — ceux de la portée claire contiennent des
 * accolades (« body{color:var(--txt)} ») qu'une lecture naïve prendrait pour
 * une règle. Les règles imbriquées (@media) sont écartées : celles de la
 * feuille ne règlent que des tailles, jamais une couleur.
 */
export function regles(css = CSS_ENTIER) {
  const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let prof = 0;
  let debut = 0;
  let selecteur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') {
      if (prof === 0) {
        selecteur = s.slice(debut, i).trim();
        debut = i + 1;
      }
      prof++;
    } else if (s[i] === '}') {
      prof--;
      if (prof === 0) {
        if (!selecteur.startsWith('@'))
          out.push({
            selecteurs: selecteur.split(',').map((x) => x.trim().replace(/\s+/g, ' ')),
            decl: declarations(s.slice(debut, i)),
            pos: out.length,
          });
        debut = i + 1;
      }
    }
  }
  return out;
}
const REGLES = regles();

const variablesDe = (decl) =>
  Object.fromEntries(Object.entries(decl).filter(([k]) => k.startsWith('--')));

/** Variables de :root (thème sombre de base). */
export function valeursRacine(liste = REGLES) {
  const vals = {};
  for (const r of liste)
    if (r.selecteurs.includes(':root')) Object.assign(vals, variablesDe(r.decl));
  return vals;
}

/** Variables en portée CLAIRE : :root, puis toutes les règles « body.theme-clair .page-claire ». */
export function valeursClaires(liste = REGLES) {
  const vals = valeursRacine(liste);
  for (const r of liste)
    if (r.selecteurs.includes('body.theme-clair .page-claire'))
      Object.assign(vals, variablesDe(r.decl));
  return vals;
}

/**
 * Déclarations applicables à un élément de ces classes, cascade comprise :
 * sélecteurs « .a », « .a.b » (toutes classes portées) et, en portée claire,
 * « body.theme-clair .a » ; tri par spécificité puis ordre de la feuille.
 * Les autres sélecteurs (descendants, pseudo-classes) sont ignorés : aucun ne
 * vise les éléments des trois fenêtres — test F9 le vérifie.
 */
//
// #268 boutons — troisième forme, « body.theme-clair .page-claire .a » : ne
// s'applique qu'aux éléments DANS une portée claire (dansPage). Un élément
// sous body.theme-clair mais hors de toute .page-claire (fenêtre du groupe
// B) ne la reçoit pas : dansPage = false avec claire = true.
export function declarationsDeClasses(classes, claire, liste = REGLES, dansPage = claire) {
  const retenues = [];
  for (const r of liste)
    for (const sel of r.selecteurs) {
      const m = sel.match(/^(body\.theme-clair )?(\.page-claire )?((?:\.[a-zA-Z0-9_-]+)+)$/);
      if (!m || (m[1] && !claire) || (m[2] && !(m[1] && dansPage))) continue;
      const cl = m[3].slice(1).split('.');
      if (!cl.every((c) => classes.includes(c))) continue;
      retenues.push({
        spec: cl.length + (m[1] ? 1.01 : 0) + (m[2] ? 1 : 0),
        pos: r.pos,
        decl: r.decl,
      });
    }
  retenues.sort((a, b) => a.spec - b.spec || a.pos - b.pos);
  return Object.assign({}, ...retenues.map((r) => r.decl));
}

export function declarations(texte) {
  const d = {};
  for (const p of (texte || '').split(';')) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    d[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim();
  }
  return d;
}

const versHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Couleur opaque résolue, 'translucide', 'aucune', ou null (indéterminée). */
export function resoudre(expr, vals, prof = 0) {
  if (prof > 8 || expr == null) return null;
  let e = String(expr)
    .trim()
    .replace(/\s*!important$/, '');
  if (e === 'none' || e === 'transparent') return 'aucune';
  const mv = e.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/);
  if (mv) {
    if (vals[mv[1]] !== undefined) return resoudre(vals[mv[1]], vals, prof + 1);
    if (mv[2]) return resoudre(mv[2], vals, prof + 1);
    return null; // variable non déclarée
  }
  if (/^#[0-9a-f]{6}$/i.test(e)) return e.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(e))
    return ('#' + [...e.slice(1)].map((c) => c + c).join('')).toLowerCase();
  if (e === 'white') return '#ffffff';
  if (e === 'black') return '#000000';
  const mr = e.match(/^rgba?\(([^)]+)\)$/i);
  if (mr) {
    const p = mr[1].split(',').map((s) => parseFloat(s));
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    if (p.length > 3 && p[3] < 1) return 'translucide';
    return versHex(p.slice(0, 3));
  }
  return null;
}

/** [r, g, b, alpha] d'une couleur translucide (variables suivies), sinon null. */
export function translucide(expr, vals, prof = 0) {
  if (prof > 8 || expr == null) return null;
  const e = String(expr).trim();
  const mv = e.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/);
  if (mv) return translucide(vals[mv[1]] ?? mv[2], vals, prof + 1);
  const mr = e.match(/^rgba\(([^)]+)\)$/i);
  if (!mr) return null;
  const p = mr[1].split(',').map((s) => parseFloat(s));
  return p.length === 4 && !p.some(Number.isNaN) ? p : null;
}

// ─── Mesure d'une fenêtre ───

// ─── #268 bilan Posturo — quatre règles CIBLÉES, sans moteur de sélecteurs ───
//
// La mesure ne lit que les sélecteurs de classe simples. Quatre règles à
// sélecteur composé visent la page du bilan Posturo ; chacune est décrite
// ici par un PRÉDICAT écrit à la main (testé, avec témoins), et ses
// déclarations sont LUES dans la feuille par le texte exact du sélecteur —
// une règle modifiée ou retirée dans la feuille change donc la mesure.
// La troisième est en !important : elle écrase les fonds EN LIGNE des
// en-têtes de section (dégradé vert d'eau).
const aClasse = (n, c) => (n.attrs.class || '').split(/\s+/).includes(c);
const dansPosturo = (anc) => anc.some((a) => a.attrs.id === 'pg-bilan-posturo');
export const REGLES_CIBLEES = [
  {
    selecteur: '#pg-bilan-posturo .posturo-tab',
    predicat: (n, anc) => aClasse(n, 'posturo-tab') && dansPosturo(anc),
  },
  {
    selecteur: '#pg-bilan-posturo .posturo-tab.act',
    predicat: (n, anc) => aClasse(n, 'posturo-tab') && aClasse(n, 'act') && dansPosturo(anc),
  },
  {
    selecteur: '#pg-bilan-posturo .posturo-section div[style*="border-left:4px solid"]',
    predicat: (n, anc) =>
      n.tag === 'div' &&
      (n.attrs.style || '').includes('border-left:4px solid') &&
      anc.some((a) => aClasse(a, 'posturo-section')) &&
      dansPosturo(anc),
  },
  {
    selecteur: '.posturo-draw-toolbar .btn:not(.btn-red):not(.btn-blue):not(.btn-green)',
    predicat: (n, anc) =>
      aClasse(n, 'btn') &&
      !['btn-red', 'btn-blue', 'btn-green'].some((c) => aClasse(n, c)) &&
      anc.some((a) => aClasse(a, 'posturo-draw-toolbar')),
  },
  // #268 L3 — cartes colorées des bilans Pédicurie (et Sport) : sélecteur
  // d'ATTRIBUT, avec texte et VARIABLES LOCALES (--txt, --mut, --surf, --bord).
  {
    selecteur: '.card[class*="sport-card-"]',
    predicat: (n) => aClasse(n, 'card') && /(^|\s)sport-card-/.test(n.attrs.class || ''),
  },
  // #268 L3 — cartes roses de Podopédiatrie : fond en !important, texte et
  // --mut LOCAL.
  {
    selecteur: '#pg-podopediatrie .card',
    predicat: (n, anc) => aClasse(n, 'card') && anc.some((a) => a.attrs.id === 'pg-podopediatrie'),
  }, // #268 L3 — titres de bloc : la règle de Sport (!important) et la règle
  // limitée à la page Pédicurie. La classe c-orange est partagée par les deux
  // pages ; seule la seconde règle touche Pédicurie.
  {
    selecteur: '#pg-bilan .sport-block-title[class*="c-"]',
    predicat: (n, anc) =>
      aClasse(n, 'sport-block-title') &&
      /(^|\s)c-/.test(n.attrs.class || '') &&
      anc.some((a) => a.attrs.id === 'pg-bilan'),
  },
  {
    selecteur: '#pg-pedicurie .sport-block-title.c-orange',
    predicat: (n, anc) =>
      aClasse(n, 'sport-block-title') &&
      aClasse(n, 'c-orange') &&
      anc.some((a) => a.attrs.id === 'pg-pedicurie'),
  },
];

/** Déclarations de la règle de la feuille portant EXACTEMENT ce sélecteur ({} si absente). */
export function declarationsCiblees(selecteur, liste = REGLES) {
  const r = liste.find((x) => x.selecteurs.includes(selecteur));
  return r ? r.decl : {};
}

// Propriétés de fond et de texte d'un élément. Ordre de la cascade :
// règles de classe, règles ciblées normales, style en ligne, puis règles
// ciblées en !important (qui battent le style en ligne).
function proprietes(n, claire, ancetres = []) {
  const classes = (n.attrs.class || '').split(/\s+/).filter(Boolean);
  const normales = {};
  const importantes = {};
  for (const r of REGLES_CIBLEES) {
    if (!r.predicat(n, ancetres)) continue;
    for (const [k, v] of Object.entries(declarationsCiblees(r.selecteur))) {
      if (/!important\s*$/.test(v)) importantes[k] = v.replace(/\s*!important\s*$/, '');
      else normales[k] = v;
    }
  }
  const d = {
    ...declarationsDeClasses(classes, claire),
    ...normales,
    ...declarations(n.attrs.style),
    ...importantes,
  };
  const fond = d['background-color'] ?? d.background;
  // #268 L3 — variables déclarées SUR l'élément (règles et style) : elles
  // valent pour lui et toute sa descendance.
  const vars = Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('--')));
  return { fond: fond === undefined ? undefined : premiereCouleur(fond), couleur: d.color, vars };
}

// Couleur portée par un raccourci « background » : var(...) ou rgb(...)
// entier, sinon le premier mot. Un dégradé rend null (indéterminé).
function premiereCouleur(v) {
  const t = v.trim();
  // #268 bilan Posturo — un dégradé n'est plus « indéterminé » d'office :
  // il est rendu tel quel et mesuré arrêt par arrêt (verdictDegrade, pire
  // arrêt retenu). Un arrêt illisible le rend indéterminé, jamais conforme.
  if (/gradient\(/.test(t)) return t;
  const m = t.match(/^(var|rgba?)\(/);
  if (!m) return t.split(/\s+/)[0];
  let prof = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '(') prof++;
    else if (t[i] === ')' && --prof === 0) return t.slice(0, i + 1);
  }
  return null;
}

// Les contrôles de formulaire n'héritent NI la couleur NI le fond : sans
// déclaration, le navigateur pose les siens (texte noir, fond gris de bouton
// ou blanc de champ). La feuille ne contient aucune remise à « inherit ».
const CONTROLES = { button: '#efefef', input: '#ffffff', select: '#ffffff', textarea: '#ffffff' };

// Éléments dont le texte est posé par le script (balisage vide) : leur
// couleur compte comme celle d'un texte.
// mc-licence-status et mc-pwd-msg n'y sont pas : le script y pose AUSSI la
// couleur, vérifiée sur le texte des fonctions (tests L1-JS).
// bilan-header-posturo : texte posé par _updateBilanHeaders (#268 bilan Posturo).
const PORTEURS_JS =
  /^(mc-(avatar|nom|email|titre|formule|formule-desc|engagement|renouvellement|cabinet|resilier-msg)|podopediatrie-age-info|bilan-header-posturo)$/;

/**
 * Mesure chaque élément porteur de texte de la fenêtre. La portée claire
 * s'applique si la RACINE porte la classe page-claire (body.theme-clair
 * étant posé par la page active claire) ; sinon, valeurs sombres de :root et
 * texte hérité du body (--txt sombre, #ffffff).
 * Rend { claire, mesures:[{chemin, texte, couleur, fond, ratio}], defauts }.
 */
export function mesurerFenetre(racine, seuil = 4.5) {
  const claire = (racine.attrs.class || '').split(/\s+/).includes('page-claire');
  const vals = claire ? valeursClaires() : valeursRacine();
  const couleurDefaut = claire ? 'var(--txt)' : valeursRacine()['--txt'];
  const mesures = [];
  // #268 L3 — en CSS, un enfant hérite de la couleur CALCULÉE chez son
  // parent, pas de l'expression var(...) : la couleur est donc capturée avec
  // les variables de l'élément qui la DÉCLARE ({ expr, vals }).
  const parcourir = (n, couleurHeritee, fondHerite, chemin, ancetres = [], valsParent = vals) => {
    const p = proprietes(n, claire, ancetres);
    const valsLocal = Object.keys(p.vars).length ? { ...valsParent, ...p.vars } : valsParent;
    const controle = CONTROLES[n.tag];
    let couleur = controle ? { expr: '#000000', vals: valsLocal } : couleurHeritee;
    if (p.couleur !== undefined) couleur = { expr: p.couleur, vals: valsLocal };
    let fond = controle || fondHerite;
    if (p.fond !== undefined) {
      const r =
        p.fond === null
          ? null
          : /gradient\(/.test(p.fond)
            ? 'degrade'
            : resoudre(p.fond, valsLocal);
      if (r === 'degrade') {
        fond = { degrade: p.fond, vals: valsLocal };
      } else if (r === 'translucide') {
        // Voile ou teinte : composé sur le fond de l'ANCÊTRE (celui qu'on
        // voit au travers), jamais ignoré — l'ignorer mesurait le rouge
        // d'erreur sur du blanc pur au lieu de sa teinte rosée.
        const c = translucide(p.fond, valsLocal);
        if (c && fondHerite && fondHerite.degrade) {
          // #268 bilan Posturo — teinte posée sur un DÉGRADÉ : composée sur
          // chacun de ses arrêts ; un arrêt illisible rend le fond indéterminé.
          const { resolus, inconnus } = arretsDeDegrade(fondHerite.degrade, {
            resoudre: (x) => {
              const y = resoudre(x, fondHerite.vals || vals);
              return typeof y === 'string' && y.startsWith('#') ? y : null;
            },
          });
          fond =
            inconnus.length || !resolus.length
              ? null
              : {
                  degrade: `linear-gradient(${resolus.map((a) => composer(c.slice(0, 3), c[3], a)).join(',')})`,
                  vals: valsLocal,
                };
        } else
          fond =
            c && /^#[0-9a-f]{6}$/.test(fondHerite || '')
              ? composer(c.slice(0, 3), c[3], fondHerite)
              : null;
      } else if (r === 'aucune') {
        fond = fondHerite; // transparent : on voit l'ancêtre
      } else fond = r; // couleur résolue, ou null = indéterminé
    }
    const texte = (n.texte || '').replace(/\s+/g, ' ').trim();
    // #268 bilan Posturo — une case à cocher, un bouton radio ou un curseur ne
    // porte aucun texte : les compter noierait la mesure (458 champs dans le
    // bilan, presque tous de ce type).
    const sansTexte =
      n.tag === 'input' && /^(checkbox|radio|range|color|file|hidden)$/i.test(n.attrs.type || '');
    const porteur =
      texte ||
      (['input', 'textarea', 'select', 'button', 'a'].includes(n.tag) && !sansTexte) ||
      PORTEURS_JS.test(n.attrs.id || '');
    if (porteur && n.tag !== 'option') {
      let cr = resoudre(couleur.expr, couleur.vals);
      // #268 comparaison — un TEXTE translucide (blanc à 0,85 du thème sombre)
      // se lit composé sur son fond : sur blanc, il disparaît. On rend sa
      // couleur effective au lieu de « indéterminé ».
      if (cr === 'translucide' && /^#[0-9a-f]{6}$/.test(fond || '')) {
        const c = translucide(couleur.expr, couleur.vals);
        if (c) cr = composer(c.slice(0, 3), c[3], fond);
      }
      const ok = cr && cr !== 'aucune' && cr !== 'translucide' && fond && fond !== 'aucune';
      let ratio = null;
      let fondLu = fond;
      if (ok && fond.degrade) {
        const v = verdictDegrade(fond.degrade, cr, {
          resoudre: (x) => {
            const y = resoudre(x, fond.vals || vals);
            return typeof y === 'string' && y.startsWith('#') ? y : null;
          },
        });
        ratio = v.etat === 'INDÉTERMINÉ' ? null : v.pire;
        fondLu = `dégradé (pire arrêt ${v.pireArret || '?'})`;
      } else if (ok) ratio = contraste(cr, fond);
      mesures.push({
        chemin: chemin + '/' + n.tag + (n.attrs.id ? '#' + n.attrs.id : ''),
        texte: texte.slice(0, 40) || n.attrs.id || n.tag,
        couleur: cr,
        fond: fondLu,
        degrade: fond && fond.degrade ? fond.degrade : null,
        ratio,
        noeud: n, // #268 comparaison — l'élément mesuré, pour les tests ciblés
      });
    }
    for (const e of n.enfants)
      parcourir(e, couleur, fond, chemin + '/' + n.tag, [...ancetres, n], valsLocal);
  };
  // Fond de départ : celui de la page claire, ou du body sombre.
  parcourir(racine, { expr: couleurDefaut, vals }, resoudre(vals['--bg'], vals), '');
  const defauts = mesures.filter((m) => m.ratio === null || m.ratio < seuil);
  return { claire, mesures, defauts };
}

// ─── Structure, hors style et classes de thème ───

// #268 comparaison — cmp-alerte et cmp-attenue portent la COULEUR selon le
// thème (règles de la feuille) : classes de thème, ignorées comme page-claire.
const CLASSES_THEME = new Set(['page-claire', 'cmp-alerte', 'cmp-attenue']);

/** Liste à plat [balise, attributs triés hors style/thème, texte] pour comparer. */
export function structure(racine) {
  const out = [];
  const visiter = (n, prof) => {
    const attrs = Object.entries(n.attrs)
      .filter(([k]) => k !== 'style')
      .map(([k, v]) =>
        k === 'class'
          ? [
              k,
              v
                .split(/\s+/)
                .filter((c) => c && !CLASSES_THEME.has(c))
                .join(' '),
            ]
          : [k, v]
      )
      .filter(([k, v]) => !(k === 'class' && v === ''))
      .sort(([a], [b]) => a.localeCompare(b));
    out.push([prof, n.tag, attrs, (n.texte || '').replace(/\s+/g, ' ').trim()]);
    for (const e of n.enfants) visiter(e, prof + 1);
  };
  visiter(racine, 0);
  return out;
}

// ─── Exécution des fenêtres construites par le script ───
//
// Un DOM MINIMAL : createElement, body.appendChild, style (cssText compris),
// className, innerHTML. Tout identifiant que la fonction lit sans qu'on l'ait
// fourni rend un « bouchon » neutre (appelable, vide à l'affichage) : la
// fenêtre se construit sans réseau ni stockage. Ce que le bouchon pourrait
// masquer, la référence de structure le révèle — une fenêtre amputée n'a plus
// la même structure.

function elementFactice(tag) {
  const style = {};
  Object.defineProperty(style, 'cssText', {
    set(v) {
      style._css = v;
    },
    get() {
      return style._css || '';
    },
    enumerable: false,
  });
  const e = {
    tag,
    id: '',
    className: '',
    style,
    enfants: [],
    innerHTML: '',
    textContent: '',
    appendChild: (c) => (e.enfants.push(c), c),
    remove() {},
    addEventListener() {},
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    focus() {},
  };
  e.classList = {
    add: (c) => (e.className = (e.className + ' ' + c).trim()),
    remove() {},
    contains: () => false,
    toggle() {},
  };
  return e;
}

const cssDe = (e) =>
  (e.style._css || '') +
  Object.entries(e.style)
    .filter(([k]) => k !== '_css')
    .map(([k, v]) => `;${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`)
    .join('');
const htmlDe = (e) =>
  `<${e.tag}${e.id ? ` id="${e.id}"` : ''}${e.className ? ` class="${e.className}"` : ''} style="${cssDe(e)}">` +
  `${e.innerHTML || e.textContent || ''}${e.enfants.map(htmlDe).join('')}</${e.tag}>`;

const BOUCHON = new Proxy(function () {}, {
  get: (_t, k) =>
    k === Symbol.toPrimitive ? () => '' : k === 'then' ? undefined : k === 'length' ? 0 : BOUCHON,
  apply: () => BOUCHON,
});

/**
 * Exécute la fonction `nom` de js/biomeca.js (ou de BIOMECA_SRC) avec ces
 * arguments (texte JS) et ce prélude, et rend l'arbre de la PREMIÈRE racine
 * attachée au body. null si rien n'est attaché.
 */
export function executerFenetre(nom, args = '', prelude = '') {
  const attaches = [];
  // #268 bilan Posturo — une PAGE créée à l'exécution s'attache à .main, pas
  // au body : le même recueil capte les deux.
  const main = { appendChild: (e) => (attaches.push(e), e) };
  const document = {
    getElementById: () => null,
    createElement: elementFactice,
    body: { appendChild: (e) => (attaches.push(e), e) },
    querySelector: (sel) => (sel === '.main' ? main : null),
    querySelectorAll: () => [],
  };
  const connus = {
    document,
    Math,
    JSON,
    Date,
    String,
    Number,
    Array,
    Object,
    Promise,
    console,
    setTimeout: () => 0,
    alert() {},
  };
  const env = new Proxy(connus, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : BOUCHON),
  });
  // with : seul moyen de répondre « bouchon » à tout identifiant libre sans
  // en dresser la liste — le code exécuté est celui du dépôt, jamais une
  // entrée extérieure.
  // eslint-disable-next-line no-new-func
  const f = new Function('env', `with (env) { ${prelude}\n${fonction(nom)}\n${nom}(${args}); }`);
  f(env);
  return attaches.length ? analyser(htmlDe(attaches[0])).enfants[0] : null;
}

// Données SYNTHÉTIQUES — aucune donnée patient, même de test.
const PATIENTS = `var patients = [{ id: 'patient-synthetique', nom: 'Fictif', prenom: 'Prénom', civilite: 'M.', ddn: '1990-01-01', pratId: 'prat-synthetique' }];
var praticiens = [{ id: 'prat-synthetique', nom: 'Praticien', prenom: 'Fictif', titre: 'Podologue' }];`;
const echapper = () => fonction('_escHtml');

/**
 * Les dix fenêtres du groupe A de #268-L1 (arbitrage du 10/10/2026).
 * html : identifiant dans index.html ; sinon fonction du script à exécuter.
 */
export const FENETRES_A = [
  { cle: 'mon-compte', nom: 'Mon compte', html: 'modal-mon-compte' },
  { cle: 'essai-termine', nom: 'Essai gratuit terminé', html: 'trial-expired-overlay' },
  { cle: 'podo-age', nom: 'Bilan Podopédiatrie — âge', html: 'modal-podopediatrie-age' },
  {
    cle: 'agenda-nouvel',
    nom: 'Nouvel événement (agenda)',
    fn: 'openAgendaEventModal',
    args: 'null, "2026-10-10"',
    prelude: () => `var agCal = { events: [], googleConnections: [] };\n${echapper()}`,
  },
  {
    cle: 'agenda-modifier',
    nom: 'Modifier l’événement (agenda)',
    fn: 'openAgendaEventModal',
    args: '"ev-g"',
    prelude: () =>
      `var agCal = { events: [{ id: 'ev-g', source: 'google', summary: 'Rendez-vous fictif', description: 'Note fictive' }], googleConnections: [] };\n${echapper()}`,
  },
  {
    cle: 'agenda-apple',
    nom: 'Événement Apple (lecture seule)',
    fn: 'openAgendaEventModal',
    args: '"ev-a"',
    prelude: () =>
      `var agCal = { events: [{ id: 'ev-a', source: 'apple', summary: 'Rendez-vous fictif', description: 'Note fictive' }], googleConnections: [] };\n${echapper()}`,
  },
  {
    cle: 'acces-reserve',
    nom: 'Fonctionnalité réservée aux abonnés',
    fn: 'showAccessRestrictedModal',
    args: '"create_patient"',
    prelude: () => '',
  },
  {
    cle: 'nouveau-patient',
    nom: 'Nouveau patient',
    fn: 'openNewPatientModal',
    args: '',
    prelude: () => `${PATIENTS}\n${echapper()}`,
  },
  {
    cle: 'modifier-patient',
    nom: 'Modifier le patient',
    fn: 'editPatient',
    args: '0',
    prelude: () => `${PATIENTS}\n${echapper()}`,
  },
  {
    cle: 'aide',
    nom: 'Aide Verticy',
    fn: 'showHelp',
    args: '',
    // La VRAIE liste d'aide (données et rendu du dépôt), pas un substitut.
    prelude: () =>
      `function closeHelp() {}\n${tableau('_FAQ_DATA')}\n${fonction('_importNormName')}\n${fonction('_renderHelpList')}`,
  },
  {
    cle: 'admin-utilisateur',
    nom: 'Modifier l’utilisateur (admin)',
    fn: 'openEditUserModal',
    args: '0',
    prelude: () =>
      `var _adminUsersCache = [{ email: 'utilisateur@exemple.invalid', licence_payee: true, formule: 'formule_1', engagement: 'mensuel' }];\n${echapper()}`,
  },
];

// #268 bilan Posturo — la page du bilan est RECRÉÉE à chaque ouverture par
// injectBilanPosturoPage (nav('pg-bilan-posturo')) : absente d'index.html,
// elle échappe aux gardes du balisage. On l'exécute avec le gabarit et les
// constantes réels du dépôt ; le gabarit ne lit aucune donnée patient.
export const PAGE_BILAN_POSTURO = {
  cle: 'bilan-posturo',
  nom: 'Bilan Posturo (pg-bilan-posturo)',
  fn: 'injectBilanPosturoPage',
  args: '',
  prelude: () =>
    [
      objet('FICHES_SYSTEMES'),
      ligneConst('POSTURE_CAPTURE_ASPECT'),
      tableau('POSTURE_VIEWS'),
      'var _exoBib = null;',
      fonction('_escHtml'),
      fonction('_exoBibCats'),
      fonction('_genSysOptionsHTML'),
      fonction('_buildPostureCaptureBlockHTML'),
      fonction('getBilanPosturoHTML'),
    ].join('\n'),
};

/**
 * #268 bilan Posturo — inventaire des couleurs LITTÉRALES des styles en
 * ligne d'un arbre : { valeur (minuscules, sans espaces) : occurrences }.
 * Propriétés de texte, fond, trait, ombre et contour.
 */
export function inventaireCouleurs(racine) {
  const LIT = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
  const inv = {};
  const pile = [racine];
  while (pile.length) {
    const n = pile.pop();
    pile.push(...n.enfants);
    for (const [p, v] of Object.entries(declarations(n.attrs.style))) {
      if (!/color|background|border|shadow|outline/.test(p)) continue;
      for (const c of v.match(LIT) || []) {
        const k = c.toLowerCase().replace(/\s+/g, '');
        inv[k] = (inv[k] || 0) + 1;
      }
    }
  }
  return inv;
}

// ─── #268 comparaison de bilans (pg-compare) ───
//
// La page est dans index.html (page-claire depuis #263) ; son contenu est
// écrit par renderCompare puis, de façon asynchrone, par
// _renderCompareVisuals. On exécute les VRAIES fonctions de rendu et de
// résolution sur un patient FICTIF ; seules l'extraction des sections et la
// collecte des images sont remplacées par des données synthétiques, qui
// fixent les cas à mesurer : ligne identique, ligne différente (avec
// delta), ligne absente d'un côté, image des deux côtés, image d'un seul
// côté, image non rechargée.
const SECTIONS_FICTIVES = {
  sport: {
    a: [
      {
        titre: 'Morphostatique',
        items: ['Crête iliaque : G (plus bas)', 'Valgus genou : 4°', 'Hallux valgus : présent'],
      },
    ],
    b: [{ titre: 'Morphostatique', items: ['Crête iliaque : G (plus bas)', 'Valgus genou : 7°'] }],
  },
  posturo: {
    a: [
      {
        titre: '— Vestibulaire',
        items: [
          ['Romberg', 'latéralisé droite'],
          ['Fukuda', 'rotation 30°'],
        ],
      },
      {
        titre: 'Buccal',
        items: [
          ['ATM', 'claquement'],
          ['Serrage de dent', 'oui'],
        ],
      },
    ],
    b: [
      {
        titre: '— Vestibulaire',
        items: [
          ['Romberg', 'latéralisé droite'],
          ['Fukuda', 'rotation 45°'],
        ],
      },
      { titre: 'Buccal', items: [['ATM', 'claquement']] },
    ],
  },
};
const IMG = 'data:image/png;base64,AAAA';
const VISUELS_FICTIFS = {
  a: [
    { title: 'Silhouettes morphostatiques', imgs: [IMG], ko: 0 },
    { title: 'Empreinte plantaire', imgs: [IMG], ko: 0 },
    { title: 'Plan de semelles', imgs: [], ko: 1 },
  ],
  b: [{ title: 'Silhouettes morphostatiques', imgs: [IMG], ko: 0 }],
};

/** Arbre de pg-compare rempli par renderCompare et _renderCompareVisuals (type 'sport' ou 'posturo'). */
export async function rendreComparaison(type, html = HTML_ENTIER) {
  const els = {};
  const parId = (id) =>
    els[id] || (els[id] = Object.assign(elementFactice('div'), { id, value: '' }));
  parId('compare-sel-a').value = 'archive:0';
  parId('compare-sel-b').value = 'current';
  const document = {
    getElementById: parId,
    createElement: elementFactice,
    body: { appendChild: (e) => e },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const connus = {
    document,
    Math,
    JSON,
    Date,
    String,
    Number,
    Array,
    Object,
    Promise,
    console,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout: () => 0,
  };
  const env = new Proxy(connus, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : BOUCHON),
  });
  const cle =
    type === 'posturo'
      ? { arr: 'bilansPosturo', key: 'bilanDataPosturo' }
      : { arr: 'bilansSport', key: 'bilanData' };
  const donnees = (cote) => ({
    __sections: SECTIONS_FICTIVES[type][cote],
    __visuels: VISUELS_FICTIFS[cote],
  });
  const patient = {
    nom: 'Fictif',
    prenom: 'Prénom',
    [cle.key]: donnees('b'),
    [cle.arr]: [{ label: 'Bilan initial', date: '2026-01-01', [cle.key]: donnees('a') }],
  };
  const code = `
    var currentPatient = ${JSON.stringify(patient)};
    let _compareType = ${JSON.stringify(type)};
    let _compareVisualsToken = 0;
    function _extractSportSections(bd) { return bd.__sections; }
    function _extractPosturoSections(bd) { return bd.__sections; }
    async function _collectCompareVisuals(_t, bd) { return bd.__visuels; }
    ${fonction('_resolveCompareBilan')}
    ${fonction('_renderCompareVisuals')}
    ${fonction('renderCompare')}
    renderCompare();`;
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'env',
    'tick',
    `return (async () => { with (env) { ${code} } for (let i = 0; i < 6; i++) await tick(); })();`
  );
  await f(env, () => new Promise((r) => setImmediate(r)));
  const visuels = els['compare-visuals'] ? els['compare-visuals'].innerHTML : '';
  const contenu = els['compare-content'].innerHTML.replace(
    /<div id="compare-visuals">[\s\S]*$/,
    `<div id="compare-visuals">${visuels}</div>`
  );
  const page = sousArbreParId(analyser(html), 'pg-compare');
  const hote = sousArbreParId(page, 'compare-content');
  hote.enfants = analyser(contenu).enfants;
  return page;
}

// ─── #268 L3 — documents de RAPPORT Pédicurie et Podopédiatrie ───
//
// Le document est construit par buildPedicurieRapportHTML /
// buildPodopediatrieRapportHTML et rendu dans un iframe srcdoc : le thème de
// l'application ne l'atteint pas. On fige son HTML (référence générée depuis
// main) pour prouver qu'un lot de thème ne le modifie pas.
// Données FICTIVES (patient et praticien) ; HORLOGE FIXE (date du jour et âge
// lus par les constructeurs) ; aucune sauvegarde — les constructeurs n'en
// appellent pas, et toute fonction absente du prélude est un bouchon neutre.
const INSTANT_FIXE = Date.parse('2026-01-15T10:00:00Z');
class DateFixe extends Date {
  constructor(...a) {
    super(...(a.length ? a : [INSTANT_FIXE]));
  }
  static now() {
    return INSTANT_FIXE;
  }
}
const PRATICIEN_FICTIF = {
  id: 'prat-fictif',
  nom: 'Praticien',
  prenom: 'Fictif',
  titre: 'Pédicure-podologue',
  cabinet: 'Cabinet fictif',
  adresse: '1 rue Fictive',
  tel: '00 00 00 00 00',
  email: 'praticien@exemple.invalid',
};
const patientFictif = (cle, donnees) => ({
  nom: 'Fictif',
  prenom: 'Prénom',
  ddn: '2016-05-10',
  pratId: 'prat-fictif',
  sport: 'Football',
  metier: 'Écolier',
  lat: 'Droitier',
  [cle]: donnees,
});
// Visuels synthétiques couvrant les trois états : 'ok', 'ko' (rechargement
// échoué, mention rouge), 'nu' (jamais dessiné, silencieux).
const IMG_FICTIVE = 'data:image/png;base64,AAAA';
const VISUELS_PODO_FICTIFS = {
  morpho: [
    { key: 'face', label: 'Face', status: 'ok', dataUrl: IMG_FICTIVE },
    { key: 'profilG', label: 'Profil G', status: 'ko', dataUrl: IMG_FICTIVE },
    { key: 'profilD', label: 'Profil D', status: 'nu', dataUrl: IMG_FICTIVE },
  ],
  pieds: { status: 'ko', dataUrl: IMG_FICTIVE },
  annotatedViews: [],
};

// Sections FICTIVES au format exact des collecteurs (seule la COLLECTE est
// simulée) : vrais titres, plusieurs items, au moins une alerte.
//   Pédicurie : kv() « <strong>Libellé</strong> : valeur », alerte sous la
//   forme de chk(), grade retenu sous la forme du collecteur.
//   Podopédiatrie : mêmes clés, drapeaux isAlerts / isMarche / isMorpho /
//   isTraitement, alertes en <span> rouge du collecteur.
const kvF = (l, v) => `<strong>${l}</strong> : ${v}`;
const alertePed = (t) => `<span style="color:#c0392b;font-weight:600;">${t}</span>`;
const alertePodo = (t) => `<span style="color:#b91c1c;font-weight:600;">${t}</span>`;
export const SECTIONS_PEDICURIE_FICTIVES = [
  {
    titre: '📋 Anamnèse',
    items: [
      kvF('Motif', 'Douleur plantaire fictive'),
      kvF('Profession', 'Profession fictive'),
      alertePed('Diabète ⚠'),
    ],
  },
  {
    titre: '🔬 Examen dermatologique',
    items: [kvF('Peau', 'Sèche'), kvF('Hyperkératose', 'Talon droit')],
  },
  {
    titre: '🦶 Examen unguéal',
    items: [kvF('Ongles', 'Épaissis'), kvF('Orteil', 'Hallux gauche')],
  },
  {
    titre: '🩸 Dépistage vasculaire',
    items: [
      kvF('Pouls pédieux D', 'Perçu'),
      kvF('Pouls pédieux G', 'Aboli'),
      alertePed('Pouls aboli ⚠'),
    ],
  },
  {
    titre: '🧠 Dépistage neurologique',
    items: [kvF('Monofilament D', 'Perçu'), kvF('Monofilament G', 'Non perçu')],
  },
  {
    titre: '📊 Gradation du risque (HAS)',
    items: [
      alertePed('Neuropathie ⚠'),
      '<span style="display:inline-block;background:rgba(217,119,6,0.12);border-left:4px solid #d97706;border-radius:4px;padding:3px 8px;font-weight:700;color:#1f2937;">Grade retenu : 2 — Grade fictif</span>',
    ],
  },
  {
    titre: '🦴 Morphostatique & chaussage',
    items: [kvF('Déformations', 'Hallux valgus'), kvF('Chaussage', 'Inadapté')],
  },
  {
    titre: '💊 Soins & projet thérapeutique',
    items: [kvF('Soins réalisés', 'Soin fictif'), kvF('Conseils', 'Conseil fictif')],
  },
];
export const SECTIONS_PODO_FICTIVES = [
  {
    titre: '📋 Interrogatoire',
    items: [kvF('Motif', 'Motif fictif'), kvF('Douleur (EVA)', '4 — Légère')],
  },
  {
    titre: '🧠 Réflexes archaïques',
    items: [kvF('Réflexe de Babinski', 'Présent'), kvF('Grasping', 'Absent')],
  },
  { titre: '🚶 Marche', items: [kvF('Marche', 'Fluide'), kvF('Pas', 'Réguliers')], isMarche: true },
  {
    titre: '🦴 Morphostatique',
    items: [kvF('Genu', 'Valgum'), kvF('Lombaire', 'Hyperlordose')],
    isMorpho: true,
  },
  { titre: '👣 FPI', items: [kvF('FPI droit', '+6'), kvF('FPI gauche', '+4')] },
  {
    titre: '⚖️ Charge / Stabilité',
    items: [kvF('Appui unipodal', 'Instable'), kvF('Trendelenburg', 'Négatif')],
  },
  {
    titre: '🛌 Décharge',
    items: [kvF('Antétorsion fémorale', '20°'), kvF('Torsion tibiale', '15°')],
  },
  { titre: '👟 Chaussure', items: [kvF('Chaussure', 'Adaptée'), kvF('Usure', 'Talon externe')] },
  {
    titre: '💊 Traitement',
    items: [kvF('Semelles', 'Prescrites'), kvF('Conseils', 'Conseil fictif')],
    isTraitement: true,
  },
  {
    titre: '⚠️ Éléments à signaler',
    items: [alertePodo('FPI hors norme'), alertePodo('Genu valgum marqué')],
    isAlerts: true,
  },
  { titre: '📄 Conclusion', items: [kvF('Conclusion', 'Conclusion fictive')] },
];

async function executerRapport(code) {
  const synthese = { innerHTML: '' };
  const document = {
    getElementById: (id) =>
      id === 'pedicurie-synthese-result' ? synthese : id === 'pg-pedicurie' ? { id } : null,
    createElement: elementFactice,
    body: { appendChild: (e) => e },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const connus = {
    document,
    Math,
    JSON,
    Date: DateFixe,
    String,
    Number,
    Array,
    Object,
    Promise,
    console,
    isNaN,
    parseInt,
    parseFloat,
    setTimeout: () => 0,
  };
  const env = new Proxy(connus, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : BOUCHON),
  });
  // eslint-disable-next-line no-new-func
  const f = new Function('env', `return (async () => { with (env) { ${code} } })();`);
  return f(env);
}

/** HTML du document de rapport Pédicurie (données fictives, horloge fixe). */
export async function rapportPedicurie() {
  return executerRapport(`
    var currentPatient = ${JSON.stringify(patientFictif('bilanDataPedicurie', {}))};
    var praticiens = [${JSON.stringify(PRATICIEN_FICTIF)}];
    function _collectPedicurieSections() { return ${JSON.stringify(SECTIONS_PEDICURIE_FICTIVES)}; }
    ${fonction('_pedEscapeHtml')}
    ${fonction('genererSynthesePedicurie')}
    ${fonction('_pedInjectGalleryBlocks')}
    ${fonction('_pratLogoBlockHTML')}
    ${fonction('buildPedicurieRapportHTML')}
    genererSynthesePedicurie();
    return buildPedicurieRapportHTML();`);
}

/** HTML du document de rapport Podopédiatrie (données fictives, horloge fixe). */
export async function rapportPodopediatrie() {
  const donnees = { periode: 'III' };
  return executerRapport(`
    var currentPatient = ${JSON.stringify(patientFictif('bilanDataPodopediatrie', donnees))};
    var praticiens = [${JSON.stringify(PRATICIEN_FICTIF)}];
    ${fonction('_escHtml')}
    ${fonction('_pratLogoBlockHTML')}
    ${fonction('_formatAgeFromMonths')}
    function _collectPodopediatrieSyntheseSections() { return ${JSON.stringify(SECTIONS_PODO_FICTIVES)}; }
    ${fonction('_buildGalleryReportHTML')}
    ${fonction('_renderPodoMorphoBlock')}
    ${fonction('_renderPodoPostureBlock')}
    ${fonction('_renderPodoPiedsBlock')}
    async function _resolvePodoRapportImages() { return ${JSON.stringify(VISUELS_PODO_FICTIFS)}; }
    ${fonction('buildPodopediatrieRapportHTML')}
    return await buildPodopediatrieRapportHTML();`);
}

// ─── #268 L2 — vignette de capture posturale (_renderPostureSlot) ───
// Une seule ligne source sert trois bilans : préfixes 'sp' (Sport), 'pp'
// (Podopédiatrie), 'po' (Posturo). Rendu réel, image fictive.
export function rendreSlotPosture(prefixe, vue = 'face') {
  const slot = elementFactice('div');
  slot.id = `${prefixe}-pc-slot-${vue}`;
  const document = {
    getElementById: (id) => (id === slot.id ? slot : null),
    createElement: elementFactice,
    body: { appendChild: (e) => e },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const connus = {
    document,
    Math,
    JSON,
    Date,
    String,
    Number,
    Array,
    Object,
    Promise,
    console,
    setTimeout: () => 0,
  };
  const env = new Proxy(connus, {
    has: () => true,
    get: (t, k) => (k in t ? t[k] : k === Symbol.unscopables ? undefined : BOUCHON),
  });
  const cle = '_posture' + vue.charAt(0).toUpperCase() + vue.slice(1);
  // eslint-disable-next-line no-new-func
  const f = new Function(
    'env',
    `with (env) {
      ${tableau('POSTURE_VIEWS')}
      function _getPostureBilanData() { return { ${JSON.stringify(cle)}: 'data:image/png;base64,AAAA' }; }
      function _posturePointsTotal() { return 14; }
      function _countPostureMarkers() { return 0; }
      ${fonction('_renderPostureSlot')}
      _renderPostureSlot(${JSON.stringify(prefixe)}, ${JSON.stringify(vue)});
    }`
  );
  f(env);
  return analyser(`<div class="pc-slot" id="${slot.id}">${slot.innerHTML}</div>`).enfants[0];
}

/** Racine (arbre) d'une fenêtre du registre, depuis le code courant. */
export function racineFenetre(f, html = HTML_ENTIER) {
  if (f.html) return sousArbreParId(analyser(html), f.html);
  return executerFenetre(f.fn, f.args, f.prelude());
}

export { SRC_BIOMECA };
