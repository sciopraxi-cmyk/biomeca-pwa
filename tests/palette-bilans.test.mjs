import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraireBloc, RACINE } from './helpers/mirror-diff.mjs';

// ═══════════════════════════════════════════════════════════════════
// #257 Lot 1 — palette par type de bilan centralisée dans le CSS
// ═══════════════════════════════════════════════════════════════════
//
// Les couleurs de chaque type de bilan étaient recopiées à la main en
// hexadécimal dans renderPatientList(). Les lots 2 et 3 repassent
// l'application en fond clair : tant que ces valeurs restent dispersées,
// aucun changement de palette n'est vérifiable.
//
// Les deux blocs surveillés n'ont AUCUN miroir. Les marqueurs servent
// uniquement à les rendre testables — convention #132, usage n°2. Ne
// cherchez pas la copie, il n'y en a pas.
//
// CE QUE CES TESTS PROTÈGENT
// Une couleur réintroduite en dur dans la zone échapperait au lot 2 : elle
// resterait sombre sur un fond devenu clair, et personne ne le verrait avant
// qu'un praticien n'ouvre sa page d'accueil. Le test 2 refuse ce retour.
// Le test 3 refuse l'inverse — une couleur PERDUE au passage aux variables,
// qu'un simple « plus aucun hexadécimal » ne détecterait pas : supprimer la
// déclaration entière satisfait ce critère aussi.

const BLOC_PALETTE = extraireBloc('css/biomeca.css', '#257 PALETTE — DÉBUT', '#257 PALETTE — FIN');
const BLOC_ENCRES = extraireBloc('css/biomeca.css', '#258 ENCRES — DÉBUT', '#258 ENCRES — FIN');
const BLOC_ZONE = extraireBloc('js/biomeca.js', '#257 ZONE — DÉBUT', '#257 ZONE — FIN');

// Valeurs de production relevées dans renderPatientList() AVANT la refonte
// (mesure du 13/09/2026 : 42 occurrences, 21 valeurs distinctes). Ce lot est
// à iso-rendu : toute divergence ici est un changement de couleur.
const PALETTE = {
  '--posturo-vif': '#2dd4bf',
  '--posturo-btn': '#1D9E75',
  '--posturo-sombre': '#0d4a32',
  '--posturo-bord': '#1a7a52',
  '--posturo-contraste': '#04342C',
  '--posturo-clair': '#7fe0d1',
  '--sport-vif': '#378ADD',
  '--sport-btn': '#185FA5',
  '--sport-sombre': '#0d2e5c',
  '--sport-bord': '#1a4a8a',
  '--sport-clair': '#9cc4ed',
  '--pedicurie-vif': '#d97706',
  '--pedicurie-btn': '#b45309',
  '--pedicurie-sombre': '#3d2410',
  '--pedicurie-bord': '#7c3a0e',
  '--pedicurie-clair': '#f0bd7e',
  '--podo-vif': '#e11d48',
  '--podo-sombre': '#9f1239',
  '--podo-clair': '#f2a1b5',
  '--encours': '#f7a528',
};

// #f04060 n'entre pas dans la palette : il avait DÉJÀ sa variable, --red
// (css/biomeca.css, :root de base). En créer une seconde aurait été résoudre
// une duplication en en fabriquant une autre. Il compte malgré tout parmi les
// 21 hexadécimaux qui doivent avoir disparu de la zone.
const HEX_RED = '#f04060';

// Comptes de var() dans la zone. Mesure FRAÎCHE du 14/09/2026, après la
// bascule en fond clair de #258 : les valeurs du lot 1 (12/11/7/7/4/1/2 = 44)
// ne valent plus, la zone ayant été réécrite. Elles sont relevées, jamais
// devinées — un attendu recopié d'une version précédente ne teste rien.
//
// var(--red) a DISPARU de la zone : le ✕ de suppression patient passe
// désormais par la classe .bl-x, qui le laisse neutre au repos et ne le rougit
// qu'au survol. Sa présence ici serait donc une régression, pas un oubli.
const COMPTES_ATTENDUS = {
  '--posturo-*': 14,
  '--sport-*': 13,
  '--mut': 12,
  '--txt': 9,
  '--pedicurie-*': 9,
  '--podo-*': 9,
  '--card': 7,
  '--bord': 6,
  '--encours-*': 4,
  '--encours': 4,
  '--danger-*': 4,
  '--dim': 3,
};

// #258 — le bloc ENCRES, valeurs exactes. Les quatre premières familles sont
// les encres lisibles sur blanc ; suivent l'ambre « en cours » et la couleur
// de danger. Traits et fonds sont l'encre mélangée à du blanc (32 %, 55 %, 6 %),
// figés ici plutôt que calculés par color-mix() : une déclaration color-mix non
// supportée est ignorée en silence.
const ENCRES = {
  '--posturo-encre': '#0F766E',
  '--posturo-trait': '#b2d3d1',
  '--posturo-trait-survol': '#7bb4af',
  '--posturo-fond': '#f1f7f6',
  '--sport-encre': '#175FA8',
  '--sport-trait': '#b5cce3',
  '--sport-trait-survol': '#7fa7cf',
  '--sport-fond': '#f1f5fa',
  '--pedicurie-encre': '#9A4A06',
  '--pedicurie-trait': '#dfc5af',
  '--pedicurie-trait-survol': '#c79b76',
  '--pedicurie-fond': '#f9f4f0',
  '--podo-encre': '#BE123C',
  '--podo-trait': '#eab3c1',
  '--podo-trait-survol': '#db7d94',
  '--podo-fond': '#fbf1f3',
  '--encours-encre': '#8A5A00',
  '--encours-trait': '#dacaad',
  '--encours-trait-survol': '#bfa473',
  '--encours-fond': '#f8f5f0',
  '--danger-repos': '#C2CBD6',
  '--danger-actif': '#B91C1C',
  '--danger-fond': '#fbf1f1',
};

// Regroupe un nom de variable en famille. Un nom composé (--posturo-btn) rend
// --posturo-* ; un nom simple (--red) reste lui-même. Aucune liste en dur :
// c'est la présence d'un tiret après le préfixe « -- » qui décide.
function famille(nom) {
  const corps = nom.slice(2);
  return corps.includes('-') ? '--' + corps.replace(/-[a-z]+$/, '') + '-*' : nom;
}

// ═══════════════════════════════════════════════════════════════════
// 0. GARDES PREMIÈRES — les deux extractions ont-elles ramené du code ?
// ═══════════════════════════════════════════════════════════════════

describe('#257 extraction des deux blocs', () => {
  it('0. Les deux blocs sortent de l’extraction et sont substantiels', () => {
    // extraireBloc garantit déjà marqueurs-uniques et plancher de 400 octets.
    // On vérifie ici que chaque bloc est bien CELUI attendu, pas un autre.
    expect(BLOC_PALETTE).toContain('--posturo-vif');
    expect(BLOC_PALETTE).toContain('--encours');
    expect(BLOC_ZONE).toContain('function renderPatientList');
    expect(BLOC_ZONE).toContain("getElementById('pt-list-el')");
  });

  it('0b. L’extraction ÉCHOUE si un marqueur manque', () => {
    // Assertion sur le FAIT qu'elle lève, jamais sur le libellé du message.
    expect(() =>
      extraireBloc('js/biomeca.js', '#257 MARQUEUR-INEXISTANT', '#257 ZONE — FIN')
    ).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 1. La palette déclare les 20 variables avec les 20 valeurs de production
// ═══════════════════════════════════════════════════════════════════

describe('#257 le bloc PALETTE déclare la production à l’identique', () => {
  it('1. Chaque variable est déclarée avec exactement sa valeur d’origine', () => {
    let executes = 0;
    for (const [nom, hex] of Object.entries(PALETTE)) {
      // Déclaration complète, valeur comprise : chercher le nom seul passerait
      // sur `--posturo-vif:#ffffff`.
      expect(BLOC_PALETTE, `${nom} déclaré à ${hex}`).toContain(`${nom}:${hex}`);
      executes++;
    }
    // Garde anti-succès-vacant : une table vide passerait la boucle ci-dessus.
    expect(executes).toBeGreaterThan(0);
    // Et le bloc ne déclare RIEN d'autre : une variable ajoutée en douce au
    // lot 1 échapperait à la boucle, qui ne vérifie que dans un sens.
    const declarees = (BLOC_PALETTE.match(/--[a-z-]+(?=\s*:)/g) || []).sort();
    expect(declarees).toEqual(Object.keys(PALETTE).sort());
  });

  it('1b. --red n’est PAS redéclaré dans la palette', () => {
    // #f04060 avait déjà sa variable. Une seconde déclaration ferait diverger
    // les deux au premier changement de palette.
    expect(BLOC_PALETTE).not.toContain(HEX_RED);
    expect(BLOC_PALETTE).not.toContain('--red');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. La zone ne contient plus aucun des 21 hexadécimaux
// ═══════════════════════════════════════════════════════════════════

describe('#257 la zone est purgée des littéraux hexadécimaux', () => {
  it('2. Aucune des 21 valeurs ne subsiste dans la zone', () => {
    const tous = [...Object.values(PALETTE), HEX_RED];
    let executes = 0;
    for (const hex of tous) {
      // Insensible à la casse : #1D9E75 et #1d9e75 sont la même couleur, et
      // une réintroduction ne respecterait pas forcément la casse d'origine.
      expect(BLOC_ZONE.toLowerCase(), `${hex} absent de la zone`).not.toContain(hex.toLowerCase());
      executes++;
    }
    expect(executes).toBeGreaterThan(0);
  });

  it('2b. TÉMOIN — le même détecteur trouve ces valeurs là où elles vivent', () => {
    // Sans ce témoin, le test 2 serait vert même si `toContain` ne savait
    // rien trouver. On applique le MÊME prédicat au bloc PALETTE, où les 20
    // valeurs doivent au contraire toutes être présentes.
    let trouves = 0;
    for (const hex of Object.values(PALETTE)) {
      if (BLOC_PALETTE.toLowerCase().includes(hex.toLowerCase())) trouves++;
    }
    expect(trouves).toBe(Object.keys(PALETTE).length);
  });

  it('2c. Plus AUCUN hexadécimal à six chiffres, connu ou non, dans la zone', () => {
    // Le test 2 ne couvre que les 21 valeurs relevées. Une couleur INCONNUE
    // introduite plus tard y échapperait ; ce balayage la rattrape.
    const restants = BLOC_ZONE.match(/#[0-9a-fA-F]{6}/g) || [];
    expect(restants).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Les comptes par famille — une couleur perdue n’est pas une approximation
// ═══════════════════════════════════════════════════════════════════

describe('#257 aucune couleur n’a été perdue au passage aux variables', () => {
  it('3. Les comptes de var() par famille valent ceux mesurés avant', () => {
    const vars = BLOC_ZONE.match(/var\(--[a-z-]+\)/g) || [];
    // Garde anti-succès-vacant : une zone vide rendrait [] et les toEqual
    // ci-dessous passeraient sur des objets tous deux vides si l'attendu
    // l'était aussi. Ici l'attendu ne l'est pas, mais on ancre quand même.
    expect(vars.length).toBeGreaterThan(0);

    const obtenus = {};
    for (const v of vars) {
      const fam = famille(v.slice(4, -1));
      obtenus[fam] = (obtenus[fam] || 0) + 1;
    }
    // Comparaison d'objets entiers, pas famille par famille : une famille
    // INATTENDUE ferait échouer, là où une boucle sur les clés attendues la
    // laisserait passer.
    expect(obtenus).toEqual(COMPTES_ATTENDUS);
  });

  it('3b. Le total de la zone vaut la somme des familles', () => {
    const vars = BLOC_ZONE.match(/var\(--[a-z-]+\)/g) || [];
    const attenduTotal = Object.values(COMPTES_ATTENDUS).reduce((a, b) => a + b, 0);
    expect(vars.length).toBe(attenduTotal);
  });

  it('3c. var(--red) a bien QUITTÉ la zone', () => {
    // Le ✕ de suppression patient passe par .bl-x : neutre au repos, rouge au
    // survol seulement. Un var(--red) qui réapparaîtrait ici signifierait un
    // retour au ✕ rouge permanent, que #258 a délibérément écarté.
    expect(BLOC_ZONE).not.toContain('var(--red)');
  });
});

// ═══════════════════════════════════════════════════════════════════
// #258 — bascule en fond clair : encres, et plus aucune couleur littérale
// ═══════════════════════════════════════════════════════════════════

describe('#258 le bloc ENCRES déclare les valeurs calculées', () => {
  it('5. Chaque encre est déclarée avec exactement sa valeur', () => {
    let executes = 0;
    for (const [nom, hex] of Object.entries(ENCRES)) {
      expect(BLOC_ENCRES, `${nom} déclaré à ${hex}`).toContain(`${nom}:${hex}`);
      executes++;
    }
    expect(executes).toBeGreaterThan(0);
    // Et rien d'autre : une variable ajoutée en douce échapperait à la boucle,
    // qui ne vérifie que dans un sens.
    const declarees = (BLOC_ENCRES.match(/--[a-z-]+(?=\s*:)/g) || []).sort();
    expect(declarees).toEqual(Object.keys(ENCRES).sort());
  });

  it('5b. Les encres ne redéclarent aucune variable de la palette #257', () => {
    // Les deux blocs coexistent dans la cascade : une même variable déclarée
    // dans les deux ferait gagner la dernière, silencieusement.
    const enPalette = new Set(BLOC_PALETTE.match(/--[a-z-]+(?=\s*:)/g) || []);
    const enEncres = new Set(BLOC_ENCRES.match(/--[a-z-]+(?=\s*:)/g) || []);
    expect(enPalette.size).toBeGreaterThan(0);
    expect(enEncres.size).toBeGreaterThan(0);
    const communes = [...enEncres].filter((v) => enPalette.has(v));
    expect(communes).toEqual([]);
  });
});

describe('#258 la zone ne contient plus aucune couleur littérale', () => {
  it('6. Aucun rgba( dans la zone', () => {
    // Formulation volontairement large : une liste de motifs interdits
    // laisserait passer la teinte qu'on aurait oublié d'énumérer.
    // Le commentaire d'en-tête de la zone est rédigé pour ne pas écrire
    // lui-même ce motif — sans quoi ce test échouerait sur sa propre doctrine.
    const restants = BLOC_ZONE.match(/rgba\(/g) || [];
    expect(restants).toEqual([]);
  });

  it('6b. TÉMOIN — le même détecteur trouve des rgba( là où il en reste', () => {
    // Sans ce témoin, le test 6 serait vert même si le motif ne savait rien
    // trouver. css/biomeca.css en contient encore beaucoup : c'est le
    // périmètre des lots 2B et 3, et cela suffit à prouver le détecteur.
    const cssEntier = readFileSync(join(RACINE, 'css/biomeca.css'), 'utf8');
    expect((cssEntier.match(/rgba\(/g) || []).length).toBeGreaterThan(0);
  });

  it('7. Les 4 illustrations de carte sont référencées', () => {
    const chemins = [
      ...new Set(BLOC_ZONE.match(/assets\/bilans\/illus-[a-z]+\.jpg/g) || []),
    ].sort();
    expect(chemins).toEqual([
      'assets/bilans/illus-pedicurie.jpg',
      'assets/bilans/illus-podopediatrie.jpg',
      'assets/bilans/illus-postural.jpg',
      'assets/bilans/illus-sport.jpg',
    ]);
  });

  it('8. Tout .bl-ligne et tout .bl-cmp porte une classe de FAMILLE', () => {
    // Les teintes de survol passent par les propriétés locales --t/--ts/--f,
    // posées par les classes de famille. Une propriété personnalisée inconnue
    // rend la déclaration invalide au calcul : la règle de survol serait
    // ignorée EN SILENCE, sans erreur ni avertissement. C'est le mode de
    // défaillance que ce test interdit.
    const FAMILLES = '(posturo|sport|pedicurie|podo|encours)';
    for (const base of ['bl-ligne', 'bl-cmp']) {
      const avec = BLOC_ZONE.match(new RegExp(`class="${base} bl-${FAMILLES}"`, 'g')) || [];
      const sans = BLOC_ZONE.match(new RegExp(`class="${base}"`, 'g')) || [];
      expect(avec.length, `${base} avec famille`).toBeGreaterThan(0);
      expect(sans.length, `${base} SANS famille`).toBe(0);
    }
  });

  it('7b. Ces 4 chemins sont AUSSI au précache du service worker', () => {
    // Une carte dont l'image n'est pas au cache s'affiche vide hors ligne —
    // mode de fonctionnement réel en cabinet, pas un cas limite.
    const sw = readFileSync(join(RACINE, 'service-worker.js'), 'utf8');
    const dansJs = [...new Set(BLOC_ZONE.match(/assets\/bilans\/illus-[a-z]+\.jpg/g) || [])].sort();
    const dansSw = [...new Set(sw.match(/assets\/bilans\/illus-[a-z]+\.jpg/g) || [])].sort();
    expect(dansJs.length).toBe(4);
    expect(dansSw).toEqual(dansJs);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. La zone n'alimente aucune fenêtre d'impression
// ═══════════════════════════════════════════════════════════════════

describe('#257 la sortie de la zone reste dans le document courant', () => {
  it('4. La zone n’écrit que dans #pt-list-el', () => {
    // Une var() ne se résout que si css/biomeca.css est chargé. Si cette zone
    // alimentait une iframe d'impression ou une fenêtre construite à la main,
    // les couleurs y deviendraient transparentes.
    const ecritures = BLOC_ZONE.match(/\.innerHTML\s*=/g) || [];
    expect(ecritures.length).toBeGreaterThan(0);

    // Toutes les écritures portent sur `el`, lié une seule fois.
    const liaisons = BLOC_ZONE.match(/(?:const|let|var)\s+el\s*=\s*[^;]+/g) || [];
    expect(liaisons).toHaveLength(1);
    expect(liaisons[0]).toContain("getElementById('pt-list-el')");
    // Espaces normalisés avant comparaison : la zone écrit « el.innerHTML= »
    // à deux endroits et « el.innerHTML = » au troisième. Ce qui doit être
    // prouvé est la CIBLE de l'écriture, pas sa mise en forme — un passage de
    // prettier sur ces lignes ne doit pas faire rougir ce test.
    const cibles = (BLOC_ZONE.match(/(\w+)\.innerHTML\s*=/g) || []).map((m) =>
      m.replace(/\s+/g, '')
    );
    expect(cibles).toEqual(Array(ecritures.length).fill('el.innerHTML='));

    // Et aucun chemin de sortie hors document.
    for (const interdit of ['document.write', 'window.open', 'createObjectURL', '.print(']) {
      expect(BLOC_ZONE, `${interdit} absent de la zone`).not.toContain(interdit);
    }
  });
});
