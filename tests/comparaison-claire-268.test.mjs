// ═══════════════════════════════════════════════════════════════════
// #268 — comparaison de bilans lisible en clair ET en sombre
// ═══════════════════════════════════════════════════════════════════
//
// Régression signalée par le praticien : depuis #263 (c913111), pg-compare
// porte page-claire, mais renderCompare et _renderCompareVisuals écrivent
// pour le thème sombre (blanc à 0,85, 0,6, 0,5, 0,4) : en clair, les lignes
// IDENTIQUES, l'en-tête, les titres des visuels et le « — » d'image absente
// devenaient blanc sur blanc (1,00:1). Le code de rendu n'a pas changé
// depuis (identique caractère pour caractère de c913111^ à 547d458).
//
// pg-compare n'est claire que sous body.theme-clair : chaque texte doit
// rester lisible dans LES DEUX thèmes. Deux textes ont une couleur qui
// dépend du thème, portée par une classe et ses deux règles de feuille
// (.cmp-alerte, .cmp-attenue) — sans valeur nouvelle.
//
// Exigences cliniques :
//   - une ligne identique est lisible, et distincte d'une ligne différente
//     (fond orangé ET trait gauche : l'écart de fond seul vaut 1,06:1) ;
//   - « — » (image absente de ce bilan) se distingue d'un simple vide, et de
//     la mention rouge « image non rechargée » (existe mais rechargement
//     échoué — CLAUDE.md, distinction clinique).
//
// Le rendu exécuté est celui du dépôt (renderCompare, _resolveCompareBilan,
// _renderCompareVisuals) ; seules l'extraction des sections et la collecte
// des images sont remplacées par des données FICTIVES (outil
// rendreComparaison).
//
// DETTE (hors périmètre) : en sombre, « ← Patients » (en-tête d'index.html,
// --mut sombre) est à 3,72:1 — inchangé depuis main ; dette « --mut sombre ».

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import {
  rendreComparaison,
  mesurerFenetre,
  structure,
  declarations,
  declarationsCiblees,
} from './helpers/fenetres-claires.mjs';

const SEUIL = 4.5;
const TYPES = ['sport', 'posturo'];
const THEMES = ['clair', 'sombre'];
const REFERENCE = JSON.parse(
  readFileSync(join(RACINE, 'tests/golden/structure-comparaison-268.json'), 'utf8')
);
const aClasse = (n, c) => (n.attrs.class || '').split(/\s+/).includes(c);

async function rendre(type, theme) {
  const p = await rendreComparaison(type);
  // Sombre : pas de body.theme-clair, la page rend les valeurs de :root.
  if (theme === 'sombre') p.attrs.class = p.attrs.class.replace(/\bpage-claire\b/, '').trim();
  return p;
}
const tous = (racine) => {
  const out = [];
  const pile = [racine];
  while (pile.length) {
    const n = pile.pop();
    out.push(n);
    pile.push(...n.enfants);
  }
  return out;
};
const texteDe = (n) => [n.texte, ...n.enfants.map(texteDe)].join(' ').replace(/\s+/g, ' ').trim();
const ligne = (page, libelle) =>
  tous(page).find((n) => n.tag === 'tr' && n.enfants[0] && n.enfants[0].texte.trim() === libelle);
const visuels = (page) => tous(page).find((n) => n.attrs.id === 'compare-visuals');

// Dette documentée : seul texte exclu, et seulement en sombre.
const DETTE_SOMBRE = (m) => m.texte === '← Patients';

const CAS = {};
for (const type of TYPES)
  for (const theme of THEMES) {
    const page = await rendre(type, theme);
    CAS[`${type}/${theme}`] = { page, r: mesurerFenetre(page) };
  }

describe('#268 comparaison — contraste ≥ 4,5:1 sur tout le rendu, dans les deux thèmes', () => {
  for (const type of TYPES)
    for (const theme of THEMES) {
      it(`C. ${type}, ${theme} : en-tête, tableau et visuels`, () => {
        const { r } = CAS[`${type}/${theme}`];
        expect(r.claire).toBe(theme === 'clair');
        // Un « 0 défaut » sur un rendu vide ne prouverait rien.
        expect(r.mesures.length).toBeGreaterThanOrEqual(25);
        expect(r.mesures.filter((m) => m.ratio === null).map((m) => m.texte)).toEqual([]);
        const defauts = r.defauts
          .filter((m) => !(theme === 'sombre' && DETTE_SOMBRE(m)))
          .map((m) => `${m.ratio.toFixed(2)} — ${m.couleur} sur ${m.fond} — « ${m.texte} »`);
        expect(defauts).toEqual([]);
      });
    }

  const dette = CAS['sport/sombre'].r.mesures.find(DETTE_SOMBRE);
  const lu = dette ? dette.ratio.toFixed(2).replace('.', ',') : 'non mesuré';
  it(`Cd. Dette « --mut sombre » : « ← Patients » à ${lu}:1 en sombre — non exigé`, () => {
    expect(dette, 'bouton de retour non mesuré').toBeDefined();
  });
});

describe('#268 comparaison — exigences cliniques', () => {
  const IDENTIQUE = { sport: 'Crête iliaque', posturo: 'Romberg' };
  const DIFF_DELTA = { sport: 'Valgus genou', posturo: 'Fukuda' };
  const DIFF_TEXTE = { sport: 'Hallux valgus', posturo: 'Serrage de dent' };

  for (const type of TYPES) {
    it(`L1. ${type} : une ligne IDENTIQUE est en --txt, sans fond, lisible dans les deux thèmes`, () => {
      for (const theme of THEMES) {
        const { page, r } = CAS[`${type}/${theme}`];
        const tr = ligne(page, IDENTIQUE[type]);
        expect(tr, `ligne « ${IDENTIQUE[type]} » introuvable`).toBeDefined();
        const s = declarations(tr.attrs.style);
        expect(s.color).toBe('var(--txt)');
        expect(s.background).toBeUndefined();
        // Pas de trait gauche : s'il s'étendait à toutes les lignes, la
        // distinction identique / différente disparaîtrait.
        expect(s['border-left']).toBeUndefined();
        const cellules = r.mesures.filter((m) => tr.enfants.includes(m.noeud));
        expect(cellules).toHaveLength(3);
        for (const m of cellules)
          expect(m.ratio, `${theme} « ${m.texte} »`).toBeGreaterThanOrEqual(SEUIL);
      }
    });

    it(`L2. ${type} : une ligne DIFFÉRENTE (avec delta) est surlignée ET porte le trait gauche`, () => {
      const tr = ligne(CAS[`${type}/clair`].page, DIFF_DELTA[type]);
      expect(tr).toBeDefined();
      expect(texteDe(tr)).toMatch(/\(Δ [+-]?\d/);
      const s = declarations(tr.attrs.style);
      expect(s.background).toBe('#fff7ed');
      expect(s.color).toBe('#1f2937');
      expect(s['border-left']).toBe('3px solid #9a3412');
    });

    it(`L3. ${type} : une différence TEXTUELLE sans delta est distinguée par le trait gauche`, () => {
      // L'écart de fond blanc / #fff7ed vaut 1,06:1 : sans delta, le trait
      // gauche est ce qui signale la différence.
      const tr = ligne(CAS[`${type}/clair`].page, DIFF_TEXTE[type]);
      expect(tr).toBeDefined();
      expect(texteDe(tr)).not.toMatch(/Δ/);
      expect(declarations(tr.attrs.style)['border-left']).toBe('3px solid #9a3412');
    });
  }

  // Couleurs attendues : --mut et --red en clair ; valeurs de base des
  // règles de classe en sombre (blanc à 0,6 composé sur la carte, #fca5a5).
  const ATTENDU = {
    clair: { absent: '#5e6b7f', alerte: '#b91c1c' },
    sombre: { absent: '#9faaba', alerte: '#fca5a5' },
  };

  for (const type of TYPES)
    for (const theme of THEMES) {
      it(`L4. ${type}, ${theme} : « — » d'image absente atténué, italique, lisible`, () => {
        const { page, r } = CAS[`${type}/${theme}`];
        const absents = r.mesures.filter((m) => m.texte === '—' && aClasse(m.noeud, 'cmp-attenue'));
        expect(absents.length, 'marqueurs d’absence non trouvés').toBeGreaterThanOrEqual(2);
        for (const m of absents) {
          expect(declarations(m.noeud.attrs.style)['font-style']).toBe('italic');
          expect(m.couleur).toBe(ATTENDU[theme].absent);
          expect(m.ratio).toBeGreaterThanOrEqual(SEUIL);
        }
        expect(
          tous(visuels(page)).filter((n) => n.texte.trim() === '—' && !aClasse(n, 'cmp-attenue'))
        ).toEqual([]);
      });

      it(`L5. ${type}, ${theme} : « image non rechargée » rouge, lisible, distincte du « — »`, () => {
        const { r } = CAS[`${type}/${theme}`];
        const alerte = r.mesures.find((m) => /non rechargée/.test(m.texte));
        expect(alerte, 'mention non trouvée').toBeDefined();
        expect(aClasse(alerte.noeud, 'cmp-alerte')).toBe(true);
        expect(alerte.couleur).toBe(ATTENDU[theme].alerte);
        expect(alerte.ratio).toBeGreaterThanOrEqual(SEUIL);
        expect(alerte.couleur).not.toBe(ATTENDU[theme].absent);
      });
    }

  it('L6. Vignettes : fond #fff gelé (silhouettes et empreintes transparentes)', () => {
    // Refus arbitré : --card serait foncé en sombre et les tracés sur fond
    // transparent deviendraient invisibles. Les vignettes restent blanches.
    for (const type of TYPES) {
      const imgs = tous(visuels(CAS[`${type}/clair`].page)).filter((n) => n.tag === 'img');
      expect(imgs.length).toBeGreaterThanOrEqual(2);
      for (const i of imgs) expect(declarations(i.attrs.style).background).toBe('#fff');
    }
  });

  it('R. Les quatre règles de classe de la feuille, valeurs exactes', () => {
    expect(declarationsCiblees('.cmp-alerte').color).toBe('#fca5a5');
    expect(declarationsCiblees('.cmp-attenue').color).toBe('rgba(255,255,255,0.6)');
    expect(declarationsCiblees('body.theme-clair .page-claire .cmp-alerte').color).toBe(
      'var(--red)'
    );
    expect(declarationsCiblees('body.theme-clair .page-claire .cmp-attenue').color).toBe(
      'var(--mut)'
    );
  });
});

describe('#268 comparaison — structure inchangée hors style et classes de thème', () => {
  // Référence FIGÉE, générée une seule fois depuis le code de main (547d458).
  for (const type of TYPES)
    it(`S. ${type}`, () => {
      expect(structure(CAS[`${type}/clair`].page)).toEqual(REFERENCE[type]);
    });

  it('St. Témoin : un enfant retiré change la structure', async () => {
    const p = await rendreComparaison('sport');
    p.enfants[0].enfants.pop();
    expect(structure(p)).not.toEqual(REFERENCE.sport);
  });
});
