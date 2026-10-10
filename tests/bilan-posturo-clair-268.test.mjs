// ═══════════════════════════════════════════════════════════════════
// #268 — bilan Posturo en clair, phase 1 (arbitrage du 10/10/2026)
// ═══════════════════════════════════════════════════════════════════
//
// Anomalie existante sur main : nav('pg-bilan-posturo') appelle
// injectBilanPosturoPage, qui RECRÉE la page avec la seule classe « page ».
// _appliquerTheme, dernier geste de nav, lit cette page active sans
// page-claire et retire body.theme-clair : le bilan entier, barre du haut
// comprise, s'affiche en sombre. pg-posturo (index.html), claire, n'est que
// la page d'accueil Posturo.
//
// Phase 1 : page-claire posée à la création, en-tête, onglets, textes des
// en-têtes de section lisibles sur le dégradé vert d'eau, défauts mesurés.
// Le codage clinique (violets, pastels, tableau neuro) n'est PAS repris :
// l'inventaire figé des couleurs en dur garantit qu'aucune valeur n'apparaît
// ni n'augmente.
//
// La page est absente d'index.html : elle est construite en exécutant
// injectBilanPosturoPage et getBilanPosturoHTML du dépôt (le gabarit ne lit
// aucune donnée patient).
//
// DETTES (inscrites dans la PR) — l'échelle EVA (dégradé clinique vert →
// rouge) reste inchangée : témoin documentaire EVA ci-dessous ; les ambres
// cliniques passent sur --encours-encre, qu'un alias sémantique de même
// valeur pourra remplacer en phase 2.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { contraste } from './helpers/contraste.mjs';
import {
  analyser,
  declarations,
  mesurerFenetre,
  structure,
  valeursClaires,
  PAGE_BILAN_POSTURO,
  REGLES_CIBLEES,
  declarationsCiblees,
  racineFenetre,
  inventaireCouleurs,
} from './helpers/fenetres-claires.mjs';

const SEUIL = 4.5;
const CLAIR = valeursClaires();
const lire = (rel) => JSON.parse(readFileSync(join(RACINE, rel), 'utf8'));
const STRUCTURE = lire('tests/golden/structure-bilan-posturo-268.json');
const INVENTAIRE = lire('tests/golden/inventaire-couleurs-posturo-268.json');
const PAGE = racineFenetre(PAGE_BILAN_POSTURO);
const aClasse = (n, c) => (n.attrs.class || '').split(/\s+/).includes(c);

const tous = (racine) => {
  const out = [];
  const visiter = (n, anc) => {
    out.push({ n, anc });
    n.enfants.forEach((e) => visiter(e, [...anc, n]));
  };
  visiter(racine, []);
  return out;
};
const trouver = (pred) => tous(PAGE).find(({ n }) => pred(n))?.n || null;

// L'échelle visuelle analogique : dégradé clinique, hors phase 1.
const EST_EVA = (m) => !!m.degrade && /#4caf50[\s\S]*#f44336/i.test(m.degrade);

describe('#268 bilan Posturo — la page est créée claire', () => {
  it('P0. injectBilanPosturoPage crée pg-bilan-posturo avec « page » ET « page-claire »', () => {
    expect(PAGE, 'page non construite').not.toBeNull();
    expect(PAGE.attrs.id).toBe('pg-bilan-posturo');
    expect(aClasse(PAGE, 'page')).toBe(true);
    expect(
      aClasse(PAGE, 'page-claire'),
      'sans page-claire, _appliquerTheme retire body.theme-clair'
    ).toBe(true);
  });
});

describe('#268 bilan Posturo — contraste ≥ 4,5:1 sur toute la page', () => {
  const r = mesurerFenetre(PAGE);
  const horsEva = r.mesures.filter((m) => !EST_EVA(m));

  it('C. Chaque texte mesuré, hors échelle EVA', () => {
    expect(r.claire, 'page mesurée hors portée claire').toBe(true);
    // La mesure doit avoir trouvé la page entière : un zéro défaut sur une
    // page vide ne prouverait rien.
    expect(horsEva.length).toBeGreaterThan(600);
    const defauts = horsEva
      .filter((m) => m.ratio === null || m.ratio < SEUIL)
      .map(
        (m) =>
          `${m.ratio ? m.ratio.toFixed(2) : 'indéterminé'} — ${m.couleur} sur ${m.fond} — « ${m.texte} »`
      );
    expect(defauts).toEqual([]);
  });

  // Témoin DOCUMENTAIRE : calculé à la collecte, affiché dans le titre,
  // jamais exigé (dette « échelle EVA », phase 2).
  const eva = r.mesures.filter(EST_EVA);
  const pire = eva.length ? Math.min(...eva.map((m) => m.ratio ?? Infinity)) : null;
  const lu = pire && isFinite(pire) ? pire.toFixed(2).replace('.', ',') : 'non mesuré';
  it(`EVA. Échelle visuelle analogique : pire ${lu}:1 — dette connue, non exigée`, () => {
    expect(eva.length, 'libellés EVA non trouvés').toBeGreaterThan(0);
    expect(typeof pire).toBe('number');
  });
});

describe('#268 bilan Posturo — les quatre règles ciblées de la feuille', () => {
  // Chaque prédicat doit viser ce que vise le sélecteur de la feuille, et
  // rien d'autre : un témoin positif dans la page, un témoin négatif.
  const elements = tous(PAGE);
  const vise = (r) => elements.filter(({ n, anc }) => r.predicat(n, anc)).length;
  const [ONGLET, ONGLET_ACTIF, ENTETE_SECTION, OUTIL] = REGLES_CIBLEES;

  it('Q0. Les quatre règles existent dans la feuille, sélecteur exact', () => {
    for (const r of REGLES_CIBLEES)
      expect(Object.keys(declarationsCiblees(r.selecteur)).length, r.selecteur).toBeGreaterThan(0);
  });

  it('Q1. Onglets : les neuf, et pas un onglet hors du bilan', () => {
    expect(vise(ONGLET)).toBe(9);
    const dehors = analyser('<div id="pg-posturo"><button class="posturo-tab">x</button></div>')
      .enfants[0];
    expect(ONGLET.predicat(dehors.enfants[0], [dehors])).toBe(false);
  });

  it('Q2. Onglet actif : un seul, et pas un onglet inactif', () => {
    expect(vise(ONGLET_ACTIF)).toBe(1);
    const inactif = elements.find(({ n }) => aClasse(n, 'posturo-tab') && !aClasse(n, 'act'));
    expect(ONGLET_ACTIF.predicat(inactif.n, inactif.anc)).toBe(false);
  });

  it('Q3. En-têtes de section : trouvés, et pas un bord gauche hors section', () => {
    expect(vise(ENTETE_SECTION)).toBeGreaterThan(20);
    const hors = elements.find(
      ({ n, anc }) =>
        (n.attrs.style || '').includes('border-left:4px solid') &&
        !anc.some((a) => aClasse(a, 'posturo-section'))
    );
    if (hors) expect(ENTETE_SECTION.predicat(hors.n, hors.anc)).toBe(false);
    const temoin = analyser(
      '<div id="pg-bilan-posturo"><div style="border-left:4px solid #ccc">x</div></div>'
    ).enfants[0];
    expect(ENTETE_SECTION.predicat(temoin.enfants[0], [temoin])).toBe(false);
    // Le dégradé est en !important : il écrase les fonds en ligne.
    expect(declarationsCiblees(ENTETE_SECTION.selecteur).background).toMatch(/!important$/);
  });

  it('Q4. Barres d’outils de dessin : boutons visés, pas un .btn-red', () => {
    expect(vise(OUTIL)).toBeGreaterThan(0);
    const rouge = elements.find(
      ({ n, anc }) => aClasse(n, 'btn-red') && anc.some((a) => aClasse(a, 'posturo-draw-toolbar'))
    );
    expect(rouge, 'témoin .btn-red introuvable').toBeDefined();
    expect(OUTIL.predicat(rouge.n, rouge.anc)).toBe(false);
  });
});

describe('#268 bilan Posturo — choix arbitrés', () => {
  it('O. Onglets à l’encre posturo, lisibles sur le fond de page', () => {
    const d = declarationsCiblees('#pg-bilan-posturo .posturo-tab');
    expect(d.color).toBe('var(--posturo-encre)');
    expect(contraste(CLAIR['--posturo-encre'], CLAIR['--bg'])).toBeGreaterThanOrEqual(SEUIL);
  });

  it('H. En-tête du bilan : encre, fond et trait de la famille posturo', () => {
    const s = declarations(trouver((n) => n.attrs.id === 'bilan-header-posturo').attrs.style);
    expect(s.color).toBe('var(--posturo-encre)');
    expect(s.background).toBe('var(--posturo-fond)');
    expect(s.border).toBe('1px solid var(--posturo-trait)');
  });

  it('V. PROPRIOCEPTION : --green sur --posturo-fond (fond éclairci, pas le vert)', () => {
    const s = declarations(
      trouver((n) => n.tag === 'td' && n.texte.trim() === 'PROPRIOCEPTION').attrs.style
    );
    expect(s.background).toBe('var(--posturo-fond)');
    expect(s.color).toBe('var(--green)');
    expect(contraste(CLAIR['--green'], CLAIR['--posturo-fond'])).toBeGreaterThanOrEqual(SEUIL);
  });
});

// Une valeur en dur ne peut que DIMINUER : jamais apparaître, jamais croître.
function ecartsInventaire(actuel, reference) {
  const ecarts = [];
  for (const [v, k] of Object.entries(actuel)) {
    if (!(v in reference)) ecarts.push(`${v} : nouvelle valeur (×${k})`);
    else if (k > reference[v]) ecarts.push(`${v} : ${reference[v]} → ${k}`);
  }
  return ecarts;
}

describe('#268 bilan Posturo — inventaire figé des couleurs en dur', () => {
  it('I. Aucune valeur nouvelle, aucune valeur en hausse', () => {
    expect(Object.keys(INVENTAIRE)).toHaveLength(70);
    expect(ecartsInventaire(inventaireCouleurs(PAGE), INVENTAIRE)).toEqual([]);
  });

  it('It. Témoin : une valeur ajoutée et une valeur augmentée sont relevées', () => {
    const faux = { ...INVENTAIRE, '#123456': 1, '#222': INVENTAIRE['#222'] + 1 };
    expect(ecartsInventaire(faux, INVENTAIRE)).toHaveLength(2);
  });
});

describe('#268 bilan Posturo — structure inchangée hors style et classe de thème', () => {
  // Référence FIGÉE, générée une seule fois depuis le code de main (432780d).
  it('S. Structure de la page identique à la référence', () => {
    expect(structure(PAGE)).toEqual(STRUCTURE);
  });

  it('St. Témoin : un enfant retiré change la structure', () => {
    const a = racineFenetre(PAGE_BILAN_POSTURO);
    a.enfants[0].enfants.pop();
    expect(structure(a)).not.toEqual(STRUCTURE);
  });
});
