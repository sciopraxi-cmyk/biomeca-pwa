// ═══════════════════════════════════════════════════════════════════
// #268 L3 + L2 — bilans Pédicurie et Podopédiatrie en thème clair
// ═══════════════════════════════════════════════════════════════════
//
// Arbitrage du praticien (11/10/2026) :
//   - l'ARRIÈRE-PAGE passe en clair (page-claire sur pg-pedicurie et
//     pg-podopediatrie) ; les FONDS COLORÉS propres à chaque bilan restent
//     tels quels (cartes orange .card.sport-card-orange, cartes roses
//     « #pg-podopediatrie .card ») ;
//   - les textes d'identité trop pâles sont foncés DANS LA MÊME TEINTE, avec
//     les encres existantes --pedicurie-encre, --pedicurie-btn, --podo-encre ;
//   - le ↻ marine des vignettes posturales (sp, pp, po) passe sur
//     var(--verticy-bleu, #0e1f38).
//
// Thème sombre : une baisse de contraste y est ACCEPTÉE (titres et onglets
// de Pédicurie, 5,20 → 2,65), parce que ces pages ne s'affichent plus jamais
// en sombre : seul _appliquerTheme pose ou retire body.theme-clair, d'après
// la classe page-claire de la page active (preuve établie pour la
// comparaison, #262), et il n'existe aucun réglage de thème. Le test P0
// vérifie que les deux pages portent page-claire.
//
// HORS PÉRIMÈTRE, valeurs FIGÉES par les tests D (lot clinique dédié) :
//   - titres des grades HAS (computePedicurieGrade) ;
//   - interprétations Podopédiatrie (_podoInterpretStyle : #15803d, #b91c1c,
//     var(--mut)).
// DETTES :
//   - --mut local #8a6672 des cartes roses (4,15:1) ;
//   - titre de section #b7740a de la synthèse Pédicurie
//     (genererSynthesePedicurie), 3,33:1 dans l'onglet Synthèse : gardé
//     parce que ce HTML est inséré dans le rapport, qui est gelé.
//
// GEL DES RAPPORTS (tests G) : seule la COLLECTE est simulée ; les fonctions
// de rendu s'exécutent depuis le dépôt. Le gel NE protège PAS la traduction
// des données en libellés par les collecteurs (_collectPedicurieSections,
// _collectPodopediatrieSyntheseSections) : renvoyée à un lot « tests des
// collecteurs ».

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { contraste } from './helpers/contraste.mjs';
import { fonction } from './helpers/extraire-biomeca.mjs';
import {
  analyser,
  sousArbreParId,
  declarations,
  declarationsCiblees,
  mesurerFenetre,
  structure,
  regles,
  resoudre,
  valeursClaires,
  rendreSlotPosture,
  rapportPedicurie,
  rapportPodopediatrie,
  SECTIONS_PEDICURIE_FICTIVES,
  SECTIONS_PODO_FICTIVES,
  HTML_ENTIER,
} from './helpers/fenetres-claires.mjs';

const SEUIL = 4.5;
const CLAIR = valeursClaires();
const lire = (rel) => JSON.parse(readFileSync(join(RACINE, rel), 'utf8'));
const STRUCTURE = lire('tests/golden/structure-pedicurie-podo-268.json');
const RAPPORTS = lire('tests/golden/rapports-pedicurie-podo-268.json');
const aCl = (n, c) => (n.attrs.class || '').split(/\s+/).includes(c);
const page = (id) => sousArbreParId(analyser(HTML_ENTIER), id);
const tous = (r) => {
  const out = [];
  const pile = [r];
  while (pile.length) {
    const n = pile.pop();
    out.push(n);
    pile.push(...n.enfants);
  }
  return out;
};
const style = (n) => declarations(n.attrs.style);
const regle = (sel) => regles().find((r) => r.selecteurs.includes(sel))?.decl || {};

// Mesure d'une page, avec pour chaque texte : est-il DANS une carte colorée ?
function mesurer(id) {
  const p = page(id);
  const dansCarte = new Set();
  const marquer = (n, c) => {
    if (c) dansCarte.add(n);
    n.enfants.forEach((e) => marquer(e, c || aCl(n, 'card')));
  };
  marquer(p, false);
  const r = mesurerFenetre(p);
  const enCarte = (m) => dansCarte.has(m.noeud) || aCl(m.noeud, 'card');
  return { p, r, hors: r.mesures.filter((m) => !enCarte(m)), dans: r.mesures.filter(enCarte) };
}
const lisible = (ms) =>
  ms
    .filter((m) => m.ratio === null || m.ratio < SEUIL)
    .map((m) => `${m.ratio} — ${m.couleur} sur ${m.fond} — « ${m.texte} »`);

const PED = mesurer('pg-pedicurie');
const PODO = mesurer('pg-podopediatrie');

describe('#268 L3 — les deux pages sont claires', () => {
  it('P0. pg-pedicurie et pg-podopediatrie portent page-claire (jamais affichées en sombre)', () => {
    for (const id of ['pg-pedicurie', 'pg-podopediatrie']) {
      const p = page(id);
      expect(aCl(p, 'page'), id).toBe(true);
      expect(
        aCl(p, 'page-claire'),
        `${id} sans page-claire : _appliquerTheme retirerait body.theme-clair`
      ).toBe(true);
    }
  });
});

describe('#268 L3 — contraste ≥ 4,5:1 hors des fonds colorés, et des textes d’identité dedans', () => {
  for (const [nom, M, min] of [
    ['Pédicurie', PED, 300],
    ['Podopédiatrie', PODO, 650],
  ]) {
    it(`C. ${nom} : tous les textes hors des cartes`, () => {
      expect(M.r.claire).toBe(true);
      expect(M.r.mesures.length).toBeGreaterThan(min);
      expect(M.r.mesures.filter((m) => m.ratio === null).map((m) => m.texte)).toEqual([]);
      expect(lisible(M.hors)).toEqual([]);
    });
  }

  it('C-ped. Pédicurie : aucun défaut, même dans les cartes orange', () => {
    expect(lisible(PED.dans)).toEqual([]);
    expect(PED.dans.filter((m) => m.couleur === '#b7740a').map((m) => m.texte)).toEqual([]);
  });

  it('C-podo. Podopédiatrie : dans les cartes roses, seul reste le --mut local (dette)', () => {
    const restes = PODO.dans.filter((m) => m.ratio < SEUIL);
    expect(restes.length).toBeGreaterThan(0);
    expect([...new Set(restes.map((m) => m.couleur))]).toEqual(['#8a6672']);
    expect(PODO.dans.filter((m) => m.couleur === '#e11d48').map((m) => m.texte)).toEqual([]);
  });
});

describe('#268 L3 — couleurs d’identité arbitrées', () => {
  const ped = page('pg-pedicurie');
  const podo = page('pg-podopediatrie');
  const bouton = (p, re) => tous(p).find((n) => n.tag === 'button' && re.test(n.texte));

  it('I-ped. Pédicurie : titre et onglets en encre, boutons pleins sur --pedicurie-btn', () => {
    expect(style(tous(ped).find((n) => n.tag === 'h2')).color).toBe('var(--pedicurie-encre)');
    const onglets = tous(ped).filter((n) => aCl(n, 'pedicurie-tab'));
    expect(onglets).toHaveLength(10);
    for (const o of onglets) {
      const s = style(o);
      if (o.attrs.id === 'pdtab-0') expect(s.background).toBe('var(--pedicurie-btn)');
      else expect(s.color).toBe('var(--pedicurie-encre)');
    }
    for (const re of [/Sauvegarder/, /Appliquer le grade/, /Générer la synthèse/])
      expect(style(bouton(ped, re)).background, String(re)).toBe('var(--pedicurie-btn)');
    expect(style(tous(ped).find((n) => n.attrs.id === 'ped-btn-print')).background).toBe(
      'var(--pedicurie-btn)'
    );
    expect(style(bouton(ped, /Envoyer par mail/)).background).toBe('var(--pedicurie-encre)');
    expect(style(tous(ped).find((n) => n.attrs.id === 'pedicurie-patient-info')).background).toBe(
      'var(--pedicurie-btn)'
    );
  });

  it('I-podo. Podopédiatrie : titre, onglets, boutons et bandeau en --podo-encre', () => {
    expect(style(tous(podo).find((n) => n.tag === 'h2')).color).toBe('var(--podo-encre)');
    const onglets = tous(podo).filter((n) => aCl(n, 'podopediatrie-tab'));
    expect(onglets).toHaveLength(12);
    for (const o of onglets) expect(style(o).border).toBe('1px solid var(--podo-encre)');
    expect(style(bouton(podo, /Sauvegarder/)).background).toBe('var(--podo-encre)');
    expect(style(tous(podo).find((n) => n.attrs.id === 'podo-btn-print')).background).toBe(
      'var(--podo-encre)'
    );
    expect(
      style(tous(podo).find((n) => n.attrs.id === 'podopediatrie-patient-info')).background
    ).toBe('var(--podo-encre)');
  });

  it('I-js. Les bascules d’onglet repeignent avec les mêmes variables', () => {
    const p = fonction('showPedicurieSection');
    expect(p).toContain("t.style.background  = active ? 'var(--pedicurie-btn)' : 'transparent';");
    expect(p).toContain("t.style.color       = active ? '#fff'    : 'var(--pedicurie-encre)';");
    expect(p).not.toContain('#d97706');
    const q = fonction('showPodopediatrieSection');
    expect(q).toContain("t.style.background  = active ? 'var(--podo-encre)' : 'transparent';");
    expect(q).not.toContain('#e11d48');
  });

  it('I-titres. Titres de bloc Pédicurie : règle limitée à la page, la règle partagée intacte', () => {
    expect(declarationsCiblees('#pg-pedicurie .sport-block-title.c-orange').color).toBe(
      'var(--pedicurie-encre)'
    );
    expect(regle('.sport-block-title.c-orange').color).toBe('#b7740a');
    const titres = PED.r.mesures.filter((m) => aCl(m.noeud, 'c-orange'));
    expect(titres).toHaveLength(9);
    for (const m of titres) expect(m.couleur).toBe('#9a4a06');
  });

  it('I-sport. Sport (pg-bilan) : les 3 titres c-orange gardent exactement leur couleur', () => {
    const p = page('pg-bilan');
    const t = mesurerFenetre(p).mesures.filter((m) => aCl(m.noeud, 'c-orange'));
    expect(t).toHaveLength(3);
    for (const m of t) expect(m.couleur).toBe('#1f6fb0');
  });

  it('I-radio. Radios et visages EVA : repos en encre, sélection pleine et nettement distincte', () => {
    for (const cls of ['.podo-radio-btn', '.podo-eva-face']) {
      const repos = regle(cls);
      const choisi = regle(`${cls}:has(input[type=radio]:checked)`);
      expect(repos.color, cls).toBe('var(--podo-encre)');
      expect(repos.border, cls).toBe('1px solid var(--podo-encre)');
      expect(repos.background, cls).toBe('transparent');
      expect(choisi.background, cls).toBe('var(--podo-encre)');
      expect(choisi.color, cls).toBe('#fff');
      expect(contraste('#ffffff', resoudre(choisi.background, CLAIR))).toBeGreaterThanOrEqual(
        SEUIL
      );
    }
    const radios = PODO.r.mesures.filter((m) => aCl(m.noeud, 'podo-radio-btn'));
    expect(radios.length).toBeGreaterThan(200);
    for (const m of radios) expect(m.ratio).toBeGreaterThanOrEqual(SEUIL);
  });

  it('I-bords. Bords gauches des panneaux roses : #e11d48 conservé', () => {
    const panneaux = tous(podo).filter((n) =>
      (n.attrs.style || '').includes('linear-gradient(135deg,#fff5f7,#ffe4e9)')
    );
    expect(panneaux.length).toBeGreaterThanOrEqual(2);
    for (const n of panneaux) expect(style(n)['border-left']).toBe('4px solid #e11d48');
    expect(regle('.podo-conditional-block')['border-left']).toBe('3px solid #e11d48');
  });
});

describe('#268 L2 — vignettes de capture posturale (sp, pp, po)', () => {
  for (const px of ['sp', 'pp', 'po']) {
    it(`V. ${px} : ↻ sur --verticy-bleu (repli #0e1f38), ⬆ inchangé`, () => {
      const slot = rendreSlotPosture(px);
      const clair = analyser('<div class="page page-claire"></div>').enfants[0];
      clair.enfants.push(slot);
      const ms = mesurerFenetre(clair).mesures;
      const rond = tous(slot).find((n) => n.tag === 'button' && n.texte.trim() === '↻');
      expect(style(rond).background).toBe('var(--verticy-bleu, #0e1f38)');
      expect(ms.find((m) => m.texte === '↻').fond).toBe('#2563eb');
      const haut = ms.find((m) => m.texte === '⬆');
      expect(haut.fond).toBe('#0e7490');
      for (const m of [ms.find((x) => x.texte === '↻'), haut])
        expect(m.ratio).toBeGreaterThanOrEqual(SEUIL);
    });
  }
});

describe('#268 L3 — hors périmètre : valeurs figées (lot clinique dédié)', () => {
  it('D1. Gradation HAS (computePedicurieGrade) : palette inchangée', () => {
    const f = fonction('computePedicurieGrade');
    for (const l of [
      "0: { bg: 'rgba(34,197,94,0.12)',  border: '#22c55e' },",
      "1: { bg: 'rgba(217,119,6,0.12)',  border: '#d97706' },",
      "2: { bg: 'rgba(234,88,12,0.14)',  border: '#ea580c' },",
      "3: { bg: 'rgba(220,38,38,0.14)',  border: '#dc2626' },",
    ])
      expect(f).toContain(l);
    expect(f).toContain("banner.style.color       = '#1f2937';");
  });

  it('D2. Interprétations Podopédiatrie (_podoInterpretStyle) : couleurs inchangées', () => {
    const f = fonction('_podoInterpretStyle');
    expect(f).toContain("el.style.color = '#15803d';");
    expect(f).toContain("el.style.color = '#b91c1c';");
    expect(f).toContain("el.style.color = 'var(--mut)';");
  });

  it('D3. Dette : titre de section #b7740a de la synthèse (inséré dans le rapport gelé)', () => {
    expect(fonction('genererSynthesePedicurie')).toContain(
      'color:#b7740a;border-bottom:1px solid rgba(217,119,6,0.25)'
    );
  });

  it('D4. Cadres #fff des canvas morpho Podopédiatrie : figés', () => {
    const podo = page('pg-podopediatrie');
    for (const id of [
      'podo-morpho-face',
      'podo-morpho-face2',
      'podo-morpho-profilG',
      'podo-morpho-profilD',
    ]) {
      const cadre = tous(podo).find((n) => n.enfants.some((e) => e.attrs.id === id));
      expect(cadre, id).toBeDefined();
      expect(style(cadre).background, id).toBe('#fff');
    }
  });
});

describe('#268 L3 — l’outil modélise les règles à identifiant et d’attribut', () => {
  const m = (html) =>
    mesurerFenetre(analyser(html).enfants[0]).mesures.find((x) => x.texte === 'Texte');
  const ROSE = (c) => `<div id="pg-podopediatrie" class="page page-claire">${c}</div>`;
  const ORANGE = (c) => `<div class="page page-claire">${c}</div>`;

  it('M1. Un fond en ligne sur une carte rose ne change rien (!important prime)', () => {
    const a = m(ROSE('<div class="card"><span>Texte</span></div>'));
    const b = m(ROSE('<div class="card" style="background:#000000"><span>Texte</span></div>'));
    expect(b.fond).toBe(a.fond);
    expect(b.ratio).toBe(a.ratio);
  });

  it('M2. Une couleur en ligne prime sur une règle SANS !important', () => {
    expect(
      m(ROSE('<div class="card" style="color:#ff0000"><span>Texte</span></div>')).couleur
    ).toBe('#ff0000');
    expect(
      m(
        ORANGE('<div class="card sport-card-orange" style="color:#ff0000"><span>Texte</span></div>')
      ).couleur
    ).toBe('#ff0000');
  });

  it('M3. Variables locales : --mut des cartes roses, --mut de la portée claire ailleurs', () => {
    expect(
      m(ROSE('<div class="card"><span style="color:var(--mut)">Texte</span></div>')).couleur
    ).toBe('#8a6672');
    expect(m(ROSE('<div><span style="color:var(--mut)">Texte</span></div>')).couleur).toBe(
      '#5e6b7f'
    );
    expect(m(ORANGE('<div class="card sport-card-orange"><span>Texte</span></div>')).couleur).toBe(
      '#1a2b3c'
    );
  });
});

describe('#268 L3 — gel des documents de rapport (référence figée depuis main)', () => {
  // Construits UNE fois avant les tests : un échec de construction fait
  // échouer le bloc entier, au lieu de rendre G1-G3 trompeurs.
  const RAPPORT = {};
  beforeAll(async () => {
    RAPPORT.pedicurie = await rapportPedicurie();
    RAPPORT.podopediatrie = await rapportPodopediatrie();
  });

  it('G0. Les deux rapports sont construits (bilans, patient, praticien FICTIFS)', () => {
    expect(RAPPORT.pedicurie.length).toBeGreaterThan(4000);
    expect(RAPPORT.podopediatrie.length).toBeGreaterThan(4000);
  });

  it('G1. HTML identique à la référence', () => {
    expect(RAPPORT.pedicurie).toBe(RAPPORTS.pedicurie);
    expect(RAPPORT.podopediatrie).toBe(RAPPORTS.podopediatrie);
  });

  it('G2. Témoins : toutes les sections, aucun déchet de rendu, aucune donnée réelle', () => {
    for (const s of SECTIONS_PEDICURIE_FICTIVES)
      expect(RAPPORT.pedicurie, s.titre).toContain(s.titre);
    for (const s of SECTIONS_PODO_FICTIVES.filter((x) => !x.isAlerts))
      expect(RAPPORT.podopediatrie, s.titre).toContain(s.titre);
    expect(RAPPORT.podopediatrie).toContain('📊 Synthèse');
    expect(RAPPORT.podopediatrie).toContain('FPI hors norme');
    for (const h of Object.values(RAPPORT)) {
      expect(h).not.toMatch(/undefined|\bnull\b|\bNaN\b|\[object/);
      // Données du praticien : contrôles GÉNÉRIQUES, sans aucune donnée
      // réelle (dépôt public). L'en-tête porte le praticien fictif ; le seul
      // numéro de téléphone accepté est celui du praticien fictif.
      expect(h).toContain('Praticien Fictif');
      expect(h).toContain('Cabinet fictif');
      expect(h).toContain('1 rue Fictive');
      expect([...new Set(h.match(/\d\d[ .]\d\d[ .]\d\d[ .]\d\d[ .]\d\d/g) || [])]).toEqual([
        '00 00 00 00 00',
      ]);
      expect([
        ...new Set(h.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []),
      ]).toEqual(['praticien@exemple.invalid']);
    }
  });

  it('G3. Visuels : « ko » mentionné, « nu » silencieux', () => {
    const h = RAPPORT.podopediatrie;
    // Grille des silhouettes seule : de son ouverture à sa fermeture (tuile,
    // grille, section). Une tuile = du début d'une « rp-imgs-tile » au début
    // de la suivante, À L'INTÉRIEUR de cette grille.
    const debut = h.indexOf('<div class="rp-imgs-grid');
    expect(debut).toBeGreaterThan(-1);
    const grille = h.slice(debut, h.indexOf('</div></div></div>', debut) + 18);
    const tuiles = grille.split('<div class="rp-imgs-tile">').slice(1);
    expect(tuiles).toHaveLength(3);
    const tuile = (lbl) => tuiles.find((t) => t.includes(`>${lbl}</div>`));
    // ok : tuile présente, avec son image, sans mention.
    expect(tuile('Face'), 'tuile Face absente').toBeDefined();
    expect(tuile('Face')).toContain('data:image');
    expect(tuile('Face')).not.toContain('Annotations non chargées');
    // ko : tuile présente, avec la mention rouge.
    expect(tuile('Profil G'), 'tuile Profil G absente').toBeDefined();
    expect(tuile('Profil G')).toContain(
      '<div class="rp-imgs-tile-ko">Annotations non chargées</div>'
    );
    // nu (jamais dessiné) : _renderPodoMorphoBlock rend la tuile (gabarit
    // nu) SANS mention — état attendu « tuile présente, sans mention ».
    expect(tuile('Profil D'), 'tuile Profil D absente').toBeDefined();
    expect(tuile('Profil D')).toContain('data:image');
    expect(tuile('Profil D')).not.toContain('Annotations non chargées');
    expect(h).toContain('⚠️ Annotations non chargées sur le schéma plantaire');
  });
});

describe('#268 L3 — structure inchangée hors style et classe de thème', () => {
  for (const [cle, id] of [
    ['pedicurie', 'pg-pedicurie'],
    ['podopediatrie', 'pg-podopediatrie'],
  ])
    it(`S. ${id}`, () => {
      expect(structure(page(id))).toEqual(STRUCTURE[cle]);
    });
});
