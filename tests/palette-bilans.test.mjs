import { describe, it, expect } from 'vitest';
import { extraireBloc } from './helpers/mirror-diff.mjs';

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

// Attendu APRÈS remplacement, dans la zone. 42 substitutions + 2 var(--mut)
// préexistants (« Aucun patient. » / « Aucun résultat. ») = 44.
// --mut est autorisé à EXACTEMENT 2 : ce n'est pas une exception large. Un
// troisième var hors palette est un changement que personne n'a demandé.
const COMPTES_ATTENDUS = {
  '--posturo-*': 12,
  '--sport-*': 11,
  '--pedicurie-*': 7,
  '--podo-*': 7,
  '--encours': 4,
  '--red': 1,
  '--mut': 2,
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

  it('3b. Le total de la zone vaut 42 substitutions + 2 préexistants', () => {
    const vars = BLOC_ZONE.match(/var\(--[a-z-]+\)/g) || [];
    const attenduTotal = Object.values(COMPTES_ATTENDUS).reduce((a, b) => a + b, 0);
    expect(vars.length).toBe(attenduTotal);
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
