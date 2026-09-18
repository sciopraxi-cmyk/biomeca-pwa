import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraireBloc, RACINE } from './helpers/mirror-diff.mjs';
import { contraste, verdictDegrade, fondsDegrades } from './helpers/contraste.mjs';

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

describe('#258 les commentaires CSS sont équilibrés', () => {
  it('9. Chaque bloc balisé ouvre et ferme autant de commentaires', () => {
    // DEUX incidents dans ce chantier, tous deux silencieux :
    //   — un commentaire contenant le motif qu'il proscrivait ;
    //   — un `*/` prématuré, après quoi le texte du commentaire est devenu du
    //     CSS brut. Le parseur a consommé jusqu'à la première accolade et a
    //     jeté la règle body.theme-clair{background:#F6F7F9} qui suivait.
    // Rien n'a été signalé : un CSS mal commenté est ignoré sans bruit, et le
    // fichier semblait correct alors que le rendu ne l'était pas.
    //
    // NB : on ne peut PAS réutiliser extraireBloc ici. Il coupe APRÈS la ligne
    // du marqueur d'ouverture, or le `/*` vit sur cette ligne même
    // (« /* --- #258 CLAIR — DÉBUT --- »). Chaque bloc extrait porterait donc
    // un `*/` orphelin, et le test échouerait sur tous les blocs, y compris
    // sains. On relit le fichier en incluant les lignes de marqueur.
    const css = readFileSync(join(RACINE, 'css/biomeca.css'), 'utf8');
    const lignes = css.split('\n');
    const region = (marqueur) => {
      const d = lignes.findIndex((l) => l.includes(`${marqueur} — DÉBUT`));
      const f = lignes.findIndex((l) => l.includes(`${marqueur} — FIN`));
      expect(d, `${marqueur} : marqueur DÉBUT`).toBeGreaterThanOrEqual(0);
      expect(f, `${marqueur} : marqueur FIN après DÉBUT`).toBeGreaterThan(d);
      return lignes.slice(d, f + 1).join('\n');
    };

    let executes = 0;
    for (const marqueur of ['#257 PALETTE', '#258 ENCRES', '#258 CLAIR', '#258 COMPOSANTS']) {
      const bloc = region(marqueur);
      const ouvrants = (bloc.match(/\/\*/g) || []).length;
      const fermants = (bloc.match(/\*\//g) || []).length;
      expect(ouvrants, `${marqueur} : /* et */ doivent s'équilibrer`).toBe(fermants);
      executes++;
    }
    expect(executes).toBe(4);

    // Et le fichier entier : un déséquilibre hors des blocs balisés compte
    // autant. C'est cette forme-là qui aurait attrapé le `*/` prématuré.
    const totalOuvrants = (css.match(/\/\*/g) || []).length;
    const totalFermants = (css.match(/\*\//g) || []).length;
    expect(totalOuvrants).toBeGreaterThan(0);
    expect(totalOuvrants, 'css/biomeca.css entier').toBe(totalFermants);
  });

  it('9b. TÉMOIN — le compteur voit un déséquilibre quand il y en a un', () => {
    // Le cas nominal étant l'équilibre, rien ne distinguerait sans cela
    // « équilibré » de « compteur incapable de compter ».
    const sain = '/* a */\n.x{color:red}\n/* b */';
    const casse = '/* a */\n.x{color:red}\n*/'; // le `*/` prématuré du lot #258
    const compte = (s) => [(s.match(/\/\*/g) || []).length, (s.match(/\*\//g) || []).length];
    expect(compte(sain)[0]).toBe(compte(sain)[1]);
    expect(compte(casse)[0]).not.toBe(compte(casse)[1]);
  });
});

// Repère les blocs style="…" qui posent À LA FOIS une surface thémée et du
// texte blanc en dur. Le travail se fait DÉCLARATION PAR DÉCLARATION, pas par
// proximité textuelle : un motif qui exigerait background avant color laisserait
// passer l'ordre inverse, et n'aurait rien vu quand les deux propriétés vivaient
// sur des lignes voisines — c'est exactement ce qui est arrivé pendant ce lot.
function blancSurSurfaceThemee(source) {
  const styles = source.match(/style="[^"]*"/g) || [];
  return styles.filter((s) => {
    const decls = s
      .slice(7, -1)
      .split(';')
      .map((d) => d.replace(/\s+/g, '').toLowerCase())
      .filter(Boolean);
    const surface = decls.some((d) => /^background(-color)?:var\(--(card|surf)\)$/.test(d));
    const blanc = decls.some((d) => /^color:#(fff|ffffff)$/.test(d));
    return surface && blanc;
  });
}

describe('#258 la zone ne contient plus aucune couleur littérale', () => {
  it('6c. Aucun color:#fff posé sur une surface thémée', () => {
    // Trois caractères : invisible aux deux gardes existantes — ni « zéro
    // rgba( » ni « zéro hexadécimal à SIX chiffres » ne l'attrapent. C'est
    // pourtant le motif exact qui a produit le défaut de la modale
    // d'abonnement : color:#fff en dur sur var(--card) devenu blanc.
    // Le blanc reste légitime comme ENCRE sur un aplat d'identité, où le fond
    // est une couleur pleine ; il ne l'est pas sur une surface thémée.
    expect(blancSurSurfaceThemee(BLOC_ZONE)).toEqual([]);
  });

  it('6d. TÉMOIN — le détecteur trouve le défaut dans les DEUX ordres', () => {
    // Sans ce témoin, 6c reste vert sur un prédicat aveugle : le cas nominal
    // étant précisément l'absence, rien ne distinguerait « rien trouvé » de
    // « incapable de trouver ».
    const surfacePuisTexte = '<div style="background:var(--card);color:#fff;">x</div>';
    const textePuisSurface = '<div style="color:#fff;padding:4px;background:var(--surf);">x</div>';
    const separeParUnAttribut =
      '<div class="k" style="color:#FFFFFF; border:none; background:var(--card)">x</div>';
    expect(blancSurSurfaceThemee(surfacePuisTexte)).toHaveLength(1);
    expect(blancSurSurfaceThemee(textePuisSurface)).toHaveLength(1);
    expect(blancSurSurfaceThemee(separeParUnAttribut)).toHaveLength(1);
    // Contre-épreuve : ni un blanc sur aplat d'identité, ni une surface thémée
    // à texte thémé ne doivent être signalés — sinon 6c échouerait à tort et
    // on serait tenté de l'assouplir.
    expect(
      blancSurSurfaceThemee('<div style="background:var(--podo-vif);color:#fff;">x</div>')
    ).toEqual([]);
    expect(
      blancSurSurfaceThemee('<div style="background:var(--card);color:var(--txt);">x</div>')
    ).toEqual([]);
  });

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

// ═══════════════════════════════════════════════════════════════════
// #263 Lot 3A — la portée du thème clair passe par une CLASSE
// ═══════════════════════════════════════════════════════════════════
//
// #258 tenait la liste des pages claires à DEUX endroits — le sélecteur CSS
// et le test dans _appliquerTheme — donc chaque page ajoutée coûtait deux
// entrées à garder accordées. Un miroir manuel finit toujours par dériver.
// Désormais la page déclare elle-même qu'elle est claire, et les deux
// lecteurs lisent la même source : le balisage.
//
// Ce que ces tests refusent : qu'un des trois maillons disparaisse sans les
// autres. Une classe posée sans sélecteur CSS ne fait rien ; un sélecteur
// sans classe ne fait rien ; et un JS qui compare encore un identifiant
// ignorerait les six pages ajoutées — le tout en silence, puisque rien ne
// lève quand une règle CSS ne s'applique à personne.

const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
const CSS_ENTIER = readFileSync(join(RACINE, 'css/biomeca.css'), 'utf8');
const JS_ENTIER = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');

// Les sept pages qui doivent porter la classe. pg-patients y est inclus :
// #258 l'avait scopée par identifiant, ce lot la migre vers le même
// mécanisme que les six autres.
const PAGES_CLAIRES = [
  'pg-sport',
  'pg-posturo',
  'pg-params',
  'pg-patients',
  'pg-compare',
  'pg-praticiens',
  'pg-agenda',
  // #265 lot 3B — le bilan clinique sportif. La bascule y AMÉLIORE la
  // lisibilité, mesuré : 147 éléments porteurs de texte sous 4,5:1 en sombre,
  // 127 en clair. Le thème sombre accumulait des blancs translucides à 0,3-0,5
  // d'opacité qui plafonnaient sous le seuil.
  //
  // CES CHIFFRES ONT ÉTÉ CORRIGÉS. La première mesure annonçait 262 → 91 :
  // elle traversait les background-IMAGE en silence. getComputedStyle rend
  // rgba(0,0,0,0) pour un dégradé, et la mesure remontait alors aux ancêtres,
  // lisant un fond qui n'était pas celui qui est peint — sur 201 éléments de
  // cette seule page. L'écart réel est bien plus mince que ce qu'on croyait,
  // et la bascule reste justifiée, mais pas par les chiffres d'origine.
  'pg-bilan',
];

// Et celles qui ne doivent PAS l'avoir. pg-capture reste volontairement
// sombre : c'est une surface de mesure vidéo. Les deux rapports sont déjà
// clairs par leur propre style. Les deux bilans restants sont le lot 3C.
const PAGES_SOMBRES = [
  'pg-capture',
  'pg-pedicurie',
  'pg-podopediatrie',
  'pg-rapport',
  'pg-rapport-posturo',
];

// Extrait la valeur de class="…" de la balise portant cet identifiant.
function classesDe(id) {
  const m = HTML.match(new RegExp(`<div class="([^"]*)" id="${id}"`));
  return m ? m[1].split(/\s+/) : null;
}

describe('#263 la classe page-claire est posée sur les bonnes pages', () => {
  it('10. Les sept pages du lot portent page-claire', () => {
    let executes = 0;
    for (const id of PAGES_CLAIRES) {
      const cl = classesDe(id);
      expect(cl, `${id} : balise introuvable`).not.toBeNull();
      expect(cl, `${id} doit porter page-claire`).toContain('page-claire');
      expect(cl, `${id} doit rester une page`).toContain('page');
      executes++;
    }
    expect(executes).toBe(PAGES_CLAIRES.length);
  });

  it('10b. Les pages hors périmètre ne l’ont PAS', () => {
    // Sans cette moitié, poser la classe partout passerait le test 10.
    let executes = 0;
    for (const id of PAGES_SOMBRES) {
      const cl = classesDe(id);
      expect(cl, `${id} : balise introuvable`).not.toBeNull();
      expect(cl, `${id} ne doit PAS porter page-claire`).not.toContain('page-claire');
      executes++;
    }
    expect(executes).toBe(PAGES_SOMBRES.length);
  });

  it('10c. Exactement sept balises portent la classe', () => {
    // Compte d'occurrences, pas de lignes : une huitième page ajoutée
    // ailleurs dans le fichier échapperait aux deux listes ci-dessus.
    const n = (HTML.match(/class="[^"]*\bpage-claire\b/g) || []).length;
    expect(n).toBe(PAGES_CLAIRES.length);
  });
});

describe('#263 les trois maillons du mécanisme sont présents', () => {
  it('11. Le CSS porte un sélecteur .page-claire', () => {
    expect(CSS_ENTIER).toContain('body.theme-clair .page-claire');
  });

  it('11b. Le CSS ne scope plus par identifiant', () => {
    // Deux mécanismes qui font la même chose, c'est le piège qu'on évite —
    // et #pg-patients, plus spécifique, l'emporterait silencieusement.
    expect(CSS_ENTIER).not.toContain('body.theme-clair #pg-patients');
  });

  it('11c. _appliquerTheme lit la CLASSE, pas un identifiant', () => {
    // Les deux bornes sont affirmées sur ce qu'elles valent : un indexOf à -1
    // donnerait un slice(-1, …) qui rend le dernier caractère du fichier —
    // longueur 1, donc « > 0 » vert, sur une chaîne qui n'est pas la fonction.
    const iDeb = JS_ENTIER.indexOf('function _appliquerTheme');
    expect(iDeb, '_appliquerTheme introuvable dans js/biomeca.js').toBeGreaterThan(-1);
    const iFin = JS_ENTIER.indexOf('\n}', iDeb);
    expect(iFin, 'fin de _appliquerTheme introuvable').toBeGreaterThan(iDeb);
    const fn = JS_ENTIER.slice(iDeb, iFin);
    expect(fn).toContain("classList.contains('page-claire')");
    expect(fn).not.toContain('pg-patients');
  });
});

// ═══════════════════════════════════════════════════════════════════
// #263 bis — les encres de la portée claire passent le seuil WCAG
// ═══════════════════════════════════════════════════════════════════
//
// --blue et --green valaient la MÊME menthe #2dd4bf : les noms promettaient
// une distinction que les valeurs ne tenaient pas, et aucune des trois
// n'atteignait le seuil sur le fond clair (1,74:1 et 3,49:1).
//
// Ce test est le vrai apport du lot : il refuse PAR AVANCE qu'une encre sous
// le seuil entre dans la portée claire, y compris aux lots 3B et 3C. Aucun
// test de structure ne verrait ce défaut — seule une mesure de contraste.

const FOND_CLAIR = '#F6F7F9';

// La fonction de contraste vit désormais dans tests/helpers/contraste.mjs :
// elle y a existé un temps en double, et les deux exemplaires ont divergé
// sur le traitement des dégradés. Une seule implémentation (#132).

// Extraction par MARQUEURS, pas par chaîne : le sélecteur
// `body.theme-clair .page-claire` apparaît aussi dans la règle partagée avec
// .topbar, et un indexOf y tombait d'abord — il rendait les surfaces
// (--card #FFFFFF sur #F6F7F9, soit 1,05:1) au lieu des encres, faisant
// échouer le test pour une raison fausse.
function encresDeLaPorteeClaire() {
  const bloc = extraireBloc(
    'css/biomeca.css',
    '#263 ENCRES-CLAIR — DÉBUT',
    '#263 ENCRES-CLAIR — FIN'
  );
  const out = {};
  for (const m of bloc.matchAll(/(--[a-z-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}

describe('#263 bis les encres de la portée claire sont lisibles', () => {
  it('12. TÉMOIN — la fonction de contraste sait mesurer', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
    // Et elle sait rendre une valeur BASSE sur un cas connu : la menthe
    // d'avant, mesurée à 1,74:1 sur ce fond.
    expect(contraste('#2dd4bf', FOND_CLAIR)).toBeLessThan(2);
  });

  it('12b. Chaque encre atteint 4,5:1 sur le fond clair réel', () => {
    const encres = encresDeLaPorteeClaire();
    expect(Object.keys(encres).length, 'bloc ENCRES-CLAIR vide').toBeGreaterThan(0);
    const noms = Object.keys(encres);
    expect(noms.length, 'aucune encre déclarée — mesure non concluante').toBeGreaterThan(0);
    let executes = 0;
    for (const [nom, valeur] of Object.entries(encres)) {
      const k = contraste(valeur, FOND_CLAIR);
      expect(
        k,
        `${nom} = ${valeur} donne ${k.toFixed(2)}:1 sur ${FOND_CLAIR}`
      ).toBeGreaterThanOrEqual(4.5);
      executes++;
    }
    expect(executes).toBe(noms.length);
  });

  it('12c. --blue et --green ne valent plus la même couleur', () => {
    const e = encresDeLaPorteeClaire();
    expect(e['--blue']).toBeDefined();
    expect(e['--green']).toBeDefined();
    expect(e['--blue']).not.toBe(e['--green']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// #263 bis — tout blanc en dur d'une page claire est MESURÉ, pas classé
// ═══════════════════════════════════════════════════════════════════
//
// La version précédente demandait « y a-t-il un aplat ? ». Ce n'était qu'un
// SUBSTITUT de « le texte est-il lisible ? », et il produisait des faux
// positifs — quatre cas refusés alors qu'ils mesuraient 5,47:1 et 6,48:1 —
// en même temps qu'il laissait passer deux boutons à 3,59:1 sur #378ADD.
// Assouplir le substitut aurait été le mauvais remède : on mesure la chose.
//
// C'est le même contrôle que le test 12b, appliqué au texte au lieu des
// encres. Une seule notion pour tout le lot : le contraste mesuré.

// Valeurs des variables TELLES QU'ELLES SE RÉSOLVENT en portée claire :
// le :root de base, puis les redéfinitions sous body.theme-clair qui les
// écrasent. Dérivé du CSS, jamais écrit à la main.
// Variables dont la valeur DÉPEND DU THÈME. Toute variable déclarée dans une
// portée `body.theme-clair` y vaut autre chose qu'ailleurs — ou n'y existe
// qu'en clair. Elle n'a donc pas de valeur unique résoluble statiquement.
//
// POURQUOI C'EST UN REFUS ET NON UNE COMMODITÉ
// VALS porte les valeurs en portée CLAIRE. Un même dégradé, écrit une seule
// fois, peut être rendu sur une page claire ET sur une page sombre : c'est
// exactement le cas du bouton « Générer la synthèse », dont le jumeau est
// injecté par getBilanPosturoHTML dans pg-bilan-posturo, restée sombre.
// Résoudre une variable dépendante du thème avec sa valeur claire affirmerait
// sur la page sombre un contraste qui n'y est pas rendu — un faux conforme,
// invisible. Elle reste donc INDÉTERMINÉE.
function variablesDependantesDuTheme() {
  const dep = new Set();
  for (const m of CSS_ENTIER.matchAll(/body\.theme-clair[^{]*\{([^}]*)\}/g))
    for (const v of m[1].matchAll(/(--[a-z0-9-]+)\s*:/g)) dep.add(v[1]);
  return dep;
}

function valeursEnPorteeClaire() {
  const vals = {};
  for (const bloc of CSS_ENTIER.match(/:root\s*\{[^}]*\}/g) || [])
    for (const m of bloc.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) vals[m[1]] = m[2].trim();
  for (const m of CSS_ENTIER.matchAll(/body\.theme-clair[^{]*\{([^}]*)\}/g))
    for (const v of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) vals[v[1]] = v[2].trim();
  return vals;
}

const versRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const versHex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

// Résout une expression de fond en couleur opaque, ou rend null si la
// résolution statique est impossible. Un null n'est PAS une conformité.
function resoudreFond(expr, vals, prof = 0) {
  if (prof > 6 || !expr) return null;
  const e = expr.trim();
  const mv = e.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,([\s\S]*))?\)$/);
  if (mv) {
    if (vals[mv[1]] !== undefined) return resoudreFond(vals[mv[1]], vals, prof + 1);
    if (mv[2]) return resoudreFond(mv[2], vals, prof + 1); // valeur de repli
    return null;
  }
  if (/^#[0-9a-fA-F]{6}$/.test(e)) return e.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(e))
    return ('#' + [...e.slice(1)].map((c) => c + c).join('')).toLowerCase();
  const mr = e.match(/^rgba?\(([^)]+)\)$/i);
  if (mr) {
    const p = mr[1].split(',').map((s) => parseFloat(s));
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    const a = p.length > 3 ? p[3] : 1;
    // Un fond translucide se compose sur le fond de page clair — c'est ainsi
    // que le champ de recherche, blanc à 6 % sur blanc, se révèle à 1,00:1.
    const base = versRgb(FOND_CLAIR);
    return versHex(p.slice(0, 3).map((v, i) => v * a + base[i] * (1 - a)));
  }
  return null; // dégradé, transparent, mot-clé : non résoluble
}

// Pour chaque blanc en dur d'une source, rend {ligne, fond, contraste} ou
// {ligne, indetermine:true}. Aucun cas n'est écarté en silence.
//
// Les DÉGRADÉS sont résolus par le helper partagé, qui prend le PIRE arrêt :
// un dégradé n'est lisible que si son point le moins contrasté l'est. Un
// arrêt non résoluble — translucide, oklch(), nom inconnu — rend le tout
// indéterminé, jamais conforme.
// Dégradés portant du texte BLANC, dans du balisage rendu depuis JavaScript.
//
// POURQUOI UNE SECONDE FONCTION
// blancsMesures balaie le BALISAGE des pages claires d'index.html. Un bouton
// rendu depuis un littéral de gabarit n'y figure pas — c'est l'angle mort qui
// a valu son test 13b à _adminUserRowHTML, et c'est par là que le jumeau du
// bouton « Générer la synthèse » a vécu à 2,87:1 sans qu'aucune garde le voie.
//
// CE QU'ELLE NE VOIT PAS, ET QUI RESTE UNE DETTE
// Elle exige que le blanc ET le fond soient dans la MÊME déclaration
// style="…", en guillemets doubles. Un blanc posé par une classe ou hérité
// d'un parent lui échappe — or c'est précisément le mécanisme qui a causé
// cette refonte, où le blanc n'était écrit nulle part. Le compte qu'elle rend
// est donc un PLANCHER, jamais un total.
//
// L'extraction du fond passe par fondsDegrades, à parenthèses équilibrées :
// un `[^)]*` s'arrêterait au `)` d'un rgba() imbriqué et perdrait la fin de la
// déclaration en silence.
function degradesBlancsDuJs(source) {
  const out = [];
  for (const m of source.matchAll(/style="([^"]*)"/g)) {
    const attr = m[1];
    if (!/color\s*:\s*(#fff\b|#ffffff\b|white\b)/i.test(attr)) continue;
    for (const { decl, tronquee } of fondsDegrades(attr).degrades) {
      out.push({ decl, tronquee, ligne: source.slice(0, m.index).split('\n').length });
    }
  }
  return out;
}

// Le résolveur d'ARRÊT DE DÉGRADÉ : resoudreFond, précédé du refus des
// variables dépendantes du thème. C'est ici — et nulle part ailleurs — que
// variablesDependantesDuTheme() est consommée ; une garde déclarée et jamais
// appelée ne garde rien.
const DEPENDANTES_DU_THEME = variablesDependantesDuTheme();

function resoudreArret(vals) {
  return (expr) => {
    const m = expr.match(/^var\(\s*(--[a-z0-9-]+)/);
    if (m && DEPENDANTES_DU_THEME.has(m[1])) return null; // valeur non unique
    return resoudreFond(expr, vals);
  };
}

function blancsMesures(source, vals) {
  const BLANC = /color:\s*#fff\b/i;
  const FOND = /background(-color)?:\s*([^;"]+)/i;
  const out = [];
  for (const l of source.split('\n')) {
    if (!BLANC.test(l)) continue;
    const parts = l.split(/style="/).filter((x) => BLANC.test(x));
    const seg = parts.length ? parts[0] : l;
    const mf = seg.match(FOND);
    const txt = l.trim().slice(0, 100);
    if (!mf) {
      out.push({ txt, indetermine: true, raison: 'aucun fond sur la déclaration' });
      continue;
    }
    const expr = mf[2].trim();
    if (/gradient\s*\(/i.test(expr)) {
      // blancsMesures travaille LIGNE PAR LIGNE : un dégradé écrit sur deux
      // lignes rend une expression aux parenthèses déséquilibrées. Sans ce
      // calcul, le verdict tomberait sur « aucun arrêt extrait » — bonne
      // direction, mauvais diagnostic, et le message ne dirait pas la cause.
      const tronquee = (expr.match(/\(/g) || []).length !== (expr.match(/\)/g) || []).length;
      // Le résolveur du test traverse la frontière du dégradé : un arrêt
      // var(--x) se résout par LA MÊME fonction qu'un fond var(--x), avec la
      // même table. Écrire une seconde résolution dans le helper recréerait
      // la divergence que ce fichier existe pour éviter.
      const v = verdictDegrade(expr, '#ffffff', { tronquee, resoudre: resoudreArret(vals) });
      if (v.etat === 'INDÉTERMINÉ') out.push({ txt, indetermine: true, raison: v.raison });
      else out.push({ txt, fond: `${v.pireArret} (pire arrêt du dégradé)`, contraste: v.pire });
      continue;
    }
    const resolu = resoudreFond(expr, vals);
    if (!resolu) {
      out.push({ txt, indetermine: true, raison: `fond « ${expr.slice(0, 40)} » non résoluble` });
    } else {
      out.push({ txt, fond: resolu, contraste: contraste('#ffffff', resolu) });
    }
  }
  return out;
}

describe('#263 bis chaque blanc en dur d’une page claire est lisible', () => {
  const VALS = valeursEnPorteeClaire();

  it('13z. TÉMOIN — la résolution des variables en portée claire', () => {
    // Un ensemble vide, ou des valeurs sombres, rendraient les tests suivants
    // verts par construction ou faux par construction.
    expect(Object.keys(VALS).length, 'aucune variable résolue').toBeGreaterThan(0);
    expect(resoudreFond('var(--card)', VALS), '--card doit valoir le blanc clair').toBe('#ffffff');
    expect(resoudreFond('var(--blue)', VALS), '--blue doit valoir l’encre').toBe('#175fa8');
    expect(resoudreFond('var(--sport-btn)', VALS), '--sport-btn non redéfini').toBe('#185fa5');
    expect(
      resoudreFond('var(--inexistante)', VALS),
      'variable inconnue → non résoluble'
    ).toBeNull();
    expect(
      resoudreFond('linear-gradient(90deg,#fff,#000)', VALS),
      'dégradé → non résoluble'
    ).toBeNull();
    // Un blanc translucide sur le fond clair se compose en quasi-blanc. On
    // affirme la PROPRIÉTÉ, pas un littéral écrit de tête : la première
    // rédaction attendait #f6f7f9 quand le calcul donne #f7f7f9, et c'était
    // l'attendu qui avait tort.
    const compose = resoudreFond('rgba(255,255,255,0.06)', VALS);
    expect(compose, 'un blanc translucide doit se résoudre').not.toBeNull();
    expect(contraste('#ffffff', compose), 'blanc sur blanc translucide').toBeLessThan(1.1);
  });

  it('13x. TÉMOIN — un var() DANS un dégradé se résout, et le refus mord', () => {
    const R = resoudreArret(VALS);
    const G = (arret) => `linear-gradient(90deg,#2a7a4e,${arret})`;

    // (a) Variable INVARIANTE et présente : l'arrêt se résout, verdict chiffré.
    // --sport-btn n'est déclarée qu'au :root : sa valeur ne dépend pas du thème.
    expect(DEPENDANTES_DU_THEME.has('--sport-btn'), '--sport-btn doit être invariante').toBe(false);
    const a = verdictDegrade(G('var(--sport-btn)'), '#ffffff', { resoudre: R });
    expect(a.etat).toBe('CONFORME');
    expect(a.pire, 'le pire arrêt doit être CHIFFRÉ, pas absent').toBeGreaterThan(0);
    // Valeur DÉRIVÉE de la table, jamais retapée : un littéral ici serait un
    // miroir manuel de plus (#132), qui casserait le test pour une raison
    // fausse le jour où la palette bouge.
    expect(a.resolus, 'les deux arrêts doivent être résolus').toEqual([
      '#2a7a4e',
      VALS['--sport-btn'].toLowerCase(),
    ]);

    // (b) CONTRE-TÉMOIN — variable ABSENTE de la table : rien à résoudre.
    expect(verdictDegrade(G('var(--inexistante)'), '#ffffff', { resoudre: R }).etat).toBe(
      'INDÉTERMINÉ'
    );

    // (c) CONTRE-TÉMOIN — variable REDÉFINIE sous body.theme-clair : deux
    // valeurs selon le thème, donc aucune valeur unique. C'est ce cas qui
    // protège le jumeau rendu sur une page restée sombre.
    expect(DEPENDANTES_DU_THEME.has('--blue'), '--blue doit être dépendante du thème').toBe(true);
    expect(resoudreFond('var(--blue)', VALS), '--blue est pourtant résoluble en clair').toBe(
      '#175fa8'
    );
    expect(
      verdictDegrade(G('var(--blue)'), '#ffffff', { resoudre: R }).etat,
      'résoluble en clair ne veut pas dire résoluble tout court'
    ).toBe('INDÉTERMINÉ');

    // (d) TÉMOIN DE TRANSMISSION — sans résolveur, (a) doit RETOMBER en
    // indéterminé. Si (a) restait vert ici, c'est que le var() n'a jamais eu
    // besoin d'être résolu, et les trois cas ci-dessus ne prouveraient rien.
    expect(verdictDegrade(G('var(--sport-btn)'), '#ffffff').etat).toBe('INDÉTERMINÉ');
  });

  it('13y. TÉMOIN — les deux cas que la règle structurelle confondait', () => {
    const surCard = contraste('#ffffff', resoudreFond('var(--card)', VALS));
    const surBlue = contraste('#ffffff', resoudreFond('var(--blue)', VALS));
    expect(surCard, 'blanc sur var(--card) doit ÉCHOUER').toBeLessThan(4.5);
    expect(surBlue, 'blanc sur var(--blue) doit PASSER').toBeGreaterThanOrEqual(4.5);
    // Et la fonction de contraste elle-même.
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contraste('#ffffff', '#ffffff')).toBeCloseTo(1, 2);
  });

  // Intervalles DÉRIVÉS : les coder en dur les laisserait périmer au premier
  // commentaire ajouté — ce qui est arrivé deux fois pendant ce lot.
  const lignes = HTML.split('\n');
  const ouvertures = [];
  lignes.forEach((l, i) => {
    const m = l.match(/<div class="page[^"]*" id="(pg-[a-z0-9-]+)"/);
    if (m) ouvertures.push({ id: m[1], d: i + 1, claire: l.includes('page-claire') });
  });
  const claires = ouvertures
    .map((o, k) => ({
      ...o,
      f: k + 1 < ouvertures.length ? ouvertures[k + 1].d - 1 : lignes.length,
    }))
    .filter((o) => o.claire);

  it('13. Tout blanc en dur du balisage clair atteint 4,5:1', () => {
    // Dérivé de PAGES_CLAIRES plutôt que d'un nombre écrit : ce compte a déjà
    // périmé une fois au lot 3B, et un attendu recopié ne teste rien.
    expect(claires.length, 'aucune page claire — mesure non concluante').toBe(PAGES_CLAIRES.length);
    const sousSeuil = [];
    const indetermines = [];
    let examines = 0;
    for (const p of claires) {
      const zone = lignes.slice(p.d - 1, p.f).join('\n');
      for (const c of blancsMesures(zone, VALS)) {
        examines++;
        if (c.indetermine) indetermines.push(`${p.id} : ${c.raison} — ${c.txt}`);
        else if (c.contraste < 4.5)
          sousSeuil.push(`${p.id} : ${c.contraste.toFixed(2)}:1 sur ${c.fond} — ${c.txt}`);
      }
    }
    expect(examines, 'aucun blanc examiné — le balayage ne trouve rien').toBeGreaterThan(0);
    // UNE SEULE assertion pour les deux listes. Enchaîner deux expect ferait
    // qu'un SOUS SEUIL masquerait tous les INDÉTERMINÉ : le rapport d'échec
    // s'arrête au premier, et on croirait la seconde liste vide. Un cas qu'on
    // ne sait pas mesurer n'est pas un cas sans risque — il doit se voir en
    // même temps que les autres.
    expect({ examines, sousSeuil, indetermines }).toEqual({
      examines,
      sousSeuil: [],
      indetermines: [],
    });
  });

  it('13b. _adminUserRowHTML non plus — il est rendu dans pg-params', () => {
    const i = JS_ENTIER.indexOf('function _adminUserRowHTML');
    expect(i, '_adminUserRowHTML introuvable').toBeGreaterThan(-1);
    const j = JS_ENTIER.indexOf('\n}', i);
    expect(j, 'fin de _adminUserRowHTML introuvable').toBeGreaterThan(i);
    const cas = blancsMesures(JS_ENTIER.slice(i, j), VALS);
    expect(cas.filter((c) => c.indetermine || c.contraste < 4.5)).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════
  // 13c — LES DÉGRADÉS RENDUS DEPUIS JAVASCRIPT
  // ═══════════════════════════════════════════════════════════════════
  //
  // Le test 13 balaie le balisage des pages claires d'index.html. Le bouton
  // « Générer la synthèse » y a été vu à 2,87:1 — mais son JUMEAU, écrit dans
  // getBilanPosturoHTML et injecté par injectBilanPosturoPage, portait le même
  // dégradé sans qu'aucune garde l'atteigne. Corriger l'un en laissant l'autre
  // aurait éteint le voyant : la garde qui suit couvre le second chemin.
  //
  // Les témoins viennent AVANT la garde : une garde dont on ne sait pas si
  // elle discrimine ne prouve rien, et un zéro ne vaut que si la mesure sait
  // trouver quelque chose.

  it('13w. TÉMOIN — la garde des dégradés JS discrimine les trois états', () => {
    const R = resoudreArret(VALS);
    const v = (d) => verdictDegrade(d, '#ffffff', { resoudre: R }).etat;
    // Trois verdicts DIFFÉRENTS : sans cela, une fonction qui rendrait toujours
    // la même chose passerait les trois cas.
    const conforme = v('linear-gradient(135deg,#2a7a4e,#0f766e)');
    const sousSeuil = v('linear-gradient(135deg,#2a7a4e,#27ae60)');
    const indetermine = v('linear-gradient(135deg,#2a7a4e,rgba(0,0,0,.2))');
    expect(conforme).toBe('CONFORME');
    expect(sousSeuil).toBe('SOUS SEUIL');
    expect(indetermine).toBe('INDÉTERMINÉ');
    expect(new Set([conforme, sousSeuil, indetermine]).size, 'la garde ne discrimine pas').toBe(3);

    // Et l'EXTRACTION, pas seulement le verdict : un attribut sans texte blanc
    // ne doit pas entrer dans le balayage, un attribut avec texte blanc oui.
    const avec = '<b style="background:linear-gradient(90deg,#000,#111);color:#fff;">x</b>';
    const sans = '<b style="background:linear-gradient(90deg,#000,#111);color:#222;">x</b>';
    expect(degradesBlancsDuJs(avec).length, 'un dégradé à texte blanc doit être vu').toBe(1);
    expect(degradesBlancsDuJs(sans).length, 'un dégradé à texte sombre ne la concerne pas').toBe(0);
  });

  it('13v. TÉMOIN — la garde s’exécute sur le FICHIER RÉEL, pas sur une démo', () => {
    // Le témoin décisif. Les cas ci-dessus sont des chaînes écrites ici : ils
    // prouvent que l'outil discrimine, pas qu'il est branché sur js/biomeca.js.
    // On réintroduit le défaut dans une COPIE du fichier réel et on exige que
    // la garde le retrouve, à sa ligne. Si ce témoin restait vert avec zéro
    // trouvaille, c'est que la garde ne lit pas ce qu'elle prétend lire.
    const mute = JS_ENTIER.replace('var(--valider-fond)', '#27ae60');
    expect(mute, 'la mutation n’a rien changé — le témoin serait creux').not.toBe(JS_ENTIER);

    const R = resoudreArret(VALS);
    const trouves = degradesBlancsDuJs(mute)
      .map((c) => ({
        c,
        v: verdictDegrade(c.decl, '#ffffff', { tronquee: c.tronquee, resoudre: R }),
      }))
      .filter((x) => x.v.etat === 'SOUS SEUIL');

    expect(trouves.length, 'le défaut réintroduit doit être RETROUVÉ').toBe(1);
    expect(trouves[0].v.pireArret).toBe('#27ae60');
    expect(trouves[0].v.pire).toBeLessThan(4.5);
    // La ligne doit être celle de getBilanPosturoHTML, pas une autre.
    expect(mute.split('\n')[trouves[0].c.ligne - 1]).toContain('genererSynthese()');
  });

  it('13c. Aucun dégradé rendu depuis JavaScript ne porte de texte blanc illisible', () => {
    const cas = degradesBlancsDuJs(JS_ENTIER);
    // Garde anti-succès-vacant : un balayage qui ne trouve rien passerait les
    // deux listes vides sans avoir rien mesuré.
    expect(
      cas.length,
      'aucun dégradé à texte blanc dans le JS — balayage non concluant'
    ).toBeGreaterThan(0);

    const R = resoudreArret(VALS);
    const sousSeuil = [];
    const indetermines = [];
    for (const c of cas) {
      const v = verdictDegrade(c.decl, '#ffffff', { tronquee: c.tronquee, resoudre: R });
      if (v.etat === 'INDÉTERMINÉ') {
        indetermines.push(`js/biomeca.js:${c.ligne} — ${v.raison}`);
      } else if (v.etat === 'SOUS SEUIL') {
        sousSeuil.push(`js/biomeca.js:${c.ligne} — ${v.pire.toFixed(2)}:1 sur ${v.pireArret}`);
      }
    }
    // Une seule assertion : un SOUS SEUIL ne doit pas masquer les INDÉTERMINÉ.
    expect({ n: cas.length, sousSeuil, indetermines }).toEqual({
      n: cas.length,
      sousSeuil: [],
      indetermines: [],
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// #263 — le contour des cartes de test, et le piège de cascade
// ═══════════════════════════════════════════════════════════════════
//
// Le piège réel de ces deux règles n'est PAS la couleur, c'est la
// spécificité. `body.theme-clair .tcard` pèse (0,2,1) contre (0,2,0) pour
// `.tcard:hover` : à égalité de classes, l'élément body départage, donc la
// règle scopée l'emporterait AUSSI au survol. Sans la seconde ligne, le
// survol ne serait pas confondu avec le repos — il serait MORT.
// Ce défaut est invisible à la relecture : les deux règles ont l'air justes
// séparément. Seul le calcul de la cascade le montre.
//
// Ce test ne vérifie donc pas la PRÉSENCE des règles, il calcule QUI GAGNE
// dans chaque état et exige que les deux vainqueurs diffèrent.

// Spécificité CSS : [identifiants, classes+pseudo-classes+attributs, éléments].
function specificite(sel) {
  const ids = (sel.match(/#[\w-]+/g) || []).length;
  const cls =
    (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)(?!hover\b)[\w-]+(\([^)]*\))?/g) || []).length +
    (sel.match(/:hover\b/g) || []).length;
  const els = (sel.replace(/[.#:[][^\s>+~]*/g, ' ').match(/[a-zA-Z][\w-]*/g) || []).length;
  return [ids, cls, els];
}
const plusFort = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return true; // à égalité, la dernière déclarée gagne
};

// Couleur de bordure d'un bloc de déclarations : `border-color` s'il existe,
// sinon la couleur extraite du RACCOURCI `border`. Sans ce second cas, la
// règle .tcard — qui pose `border:1px solid var(--bord)` — serait invisible,
// et le repos n'aurait aucune valeur à comparer.
function couleurDeBordure(bloc) {
  const direct = bloc.match(/(?:^|;)\s*border-color\s*:\s*([^;]+)/);
  if (direct) return direct[1].trim();
  const raccourci = bloc.match(/(?:^|;)\s*border\s*:\s*([^;]+)/);
  if (!raccourci) return null;
  const couleur = raccourci[1].match(/(var\([^)]*\)|#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/);
  return couleur ? couleur[1] : null;
}

// Parcourt le CSS et rend la déclaration gagnante de la couleur de bordure
// sur un élément portant `classes`, dans l'état demandé.
// Les COMMENTAIRES sont retirés d'abord : sans cela le commentaire qui
// précède une règle est capturé dans son sélecteur, et la règle entière est
// écartée — c'est ce qui rendait ce test aveugle à sa première rédaction.
function gagnante(cssBrut, classes, avecSurvol) {
  const css = cssBrut.replace(/\/\*[\s\S]*?\*\//g, ' ');
  let vainqueur = null;
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@')) continue;
    const survol = sel.includes(':hover');
    if (survol && !avecSurvol) continue;
    // Le sélecteur cible-t-il notre élément ? On exige que chaque classe
    // nommée dans le sélecteur soit portée par l'élément ou son contexte.
    const requises = sel.match(/\.[\w-]+/g) || [];
    if (!requises.length || !requises.every((c) => classes.includes(c.slice(1)))) continue;
    const val = couleurDeBordure(m[2]);
    if (!val) continue;
    const md = [null, val];
    const s = specificite(sel);
    if (!vainqueur || plusFort(s, vainqueur.spec)) vainqueur = { sel, val: md[1].trim(), spec: s };
  }
  return vainqueur;
}

describe('#263 le contour des cartes distingue repos et survol', () => {
  const VALS = valeursEnPorteeClaire();
  // Contexte d'une carte en page claire : body.theme-clair > … > .tcard
  const CONTEXTE = ['theme-clair', 'page-claire', 'tcard'];

  it('14z. TÉMOIN — le calcul de spécificité', () => {
    expect(specificite('body.theme-clair .tcard'), 'body + 2 classes').toEqual([0, 2, 1]);
    expect(specificite('.tcard:hover'), '1 classe + 1 pseudo-classe').toEqual([0, 2, 0]);
    expect(specificite('body.theme-clair .tcard:hover'), 'body + 3').toEqual([0, 3, 1]);
    expect(specificite('#pg-patients'), 'un identifiant').toEqual([1, 0, 0]);
    // Et l'ordre : (0,3,1) doit battre (0,2,1), qui doit battre (0,2,0).
    expect(plusFort([0, 3, 1], [0, 2, 1])).toBe(true);
    expect(plusFort([0, 2, 1], [0, 2, 0])).toBe(true);
    expect(plusFort([0, 2, 0], [0, 2, 1])).toBe(false);
  });

  it('14y. TÉMOIN — la recherche de règle gagnante trouve quelque chose', () => {
    // Un null ferait passer le test 14 par absence de comparaison.
    const repos = gagnante(CSS_ENTIER, CONTEXTE, false);
    expect(repos, 'aucune règle de border-color trouvée au repos').not.toBeNull();
    const survol = gagnante(CSS_ENTIER, CONTEXTE, true);
    expect(survol, 'aucune règle de border-color trouvée au survol').not.toBeNull();
  });

  it('14. Repos et survol ne se résolvent PAS sur la même couleur', () => {
    const repos = gagnante(CSS_ENTIER, CONTEXTE, false);
    const survol = gagnante(CSS_ENTIER, CONTEXTE, true);
    const cRepos = resoudreFond(repos.val, VALS);
    const cSurvol = resoudreFond(survol.val, VALS);
    expect(cRepos, `repos non résoluble : ${repos.val}`).not.toBeNull();
    expect(cSurvol, `survol non résoluble : ${survol.val}`).not.toBeNull();
    // LE test : si la règle scopée du survol disparaît, c'est « body.theme-clair
    // .tcard » qui gagne les deux états, et ces deux valeurs deviennent égales.
    // Le message nomme les DEUX vainqueurs : selon la cause, ce sont deux
    // règles différentes qui rendent la même couleur, ou une seule règle qui
    // gagne les deux états — et le lecteur doit savoir laquelle il regarde.
    const memeRegle = repos.sel === survol.sel;
    expect(
      cSurvol,
      memeRegle
        ? `le survol est MORT : « ${survol.sel} » l'emporte dans les DEUX états ` +
            `(la règle scopée du survol manque, ou perd la cascade) — tout vaut ${cRepos}`
        : `repos « ${repos.sel} » et survol « ${survol.sel} » se résolvent tous ` +
            `deux sur ${cRepos} : les deux états seraient indistinguables`
    ).not.toBe(cRepos);
  });

  it('14b. Le contour au repos est visible — seuil composant 3:1', () => {
    const repos = gagnante(CSS_ENTIER, CONTEXTE, false);
    const c = resoudreFond(repos.val, VALS);
    // Fond de carte en page claire : --card, redéfini au blanc.
    const fond = resoudreFond('var(--card)', VALS);
    expect(fond).toBe('#ffffff');
    const k = contraste(c, fond);
    expect(k, `${repos.val} = ${c} donne ${k.toFixed(2)}:1 sur la carte`).toBeGreaterThanOrEqual(3);
  });
});
