// ═══════════════════════════════════════════════════════════════════
// #268-L1 — fenêtres en thème clair (lot --mut, L0, L1 groupe A)
// ═══════════════════════════════════════════════════════════════════
//
// Arbitrage du 10/10/2026. Le groupe A compte dix fenêtres (onze vues :
// l'agenda en a deux formulaires et une lecture seule). Toutes reçoivent la
// classe page-claire sur leur RACINE et n'emploient que les variables du
// thème : aucune couleur propre (décision #268-1).
//
// Ce que ces tests ne couvrent PAS, et pourquoi :
//   - « Choisir une formule » (#modal-subscribe) reste sombre : lot L1-bis,
//     avec sa garde sur les liens de paiement. Dette visible : on passe d'une
//     fenêtre claire à une fenêtre sombre par « Voir les formules ».
//   - Une fenêtre ouverte sur une page encore SOMBRE (Pédicurie,
//     Podopédiatrie) reste sombre : la portée claire exige body.theme-clair,
//     posé par la page active. Accepté, résolu par L3.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { contraste } from './helpers/contraste.mjs';
import { fonction } from './helpers/extraire-biomeca.mjs';
import {
  analyser,
  sousArbreParId,
  declarations,
  mesurerFenetre,
  structure,
  valeursClaires,
  FENETRES_A,
  racineFenetre,
  HTML_ENTIER,
  CSS_ENTIER,
} from './helpers/fenetres-claires.mjs';

const lire = (rel) => readFileSync(join(RACINE, rel), 'utf8');
const JS_FICHIERS = readdirSync(join(RACINE, 'js'))
  .filter((f) => /\.m?js$/.test(f))
  .map((f) => 'js/' + f);
const REFERENCE = JSON.parse(lire('tests/golden/structure-fenetres-268.json'));
const CLAIR = valeursClaires();

const aLaClasse = (n, c) => (n.attrs.class || '').split(/\s+/).includes(c);

// ─── Lot --mut ───────────────────────────────────────────────────────

// Lisible au sens WCAG AA texte normal sur les DEUX fonds de la portée
// claire : le blanc des fenêtres et cartes, le --bg des pages.
const SEUIL = 4.5;
const mutLisible = (hex) =>
  contraste(hex, '#ffffff') >= SEUIL && contraste(hex, CLAIR['--bg']) >= SEUIL;

describe('#268 lot --mut — texte secondaire lisible en clair', () => {
  it('M1. --mut de la portée claire atteint 4,5:1 sur blanc et sur --bg', () => {
    const mut = CLAIR['--mut'];
    expect(contraste(mut, '#ffffff'), `--mut ${mut} sur blanc`).toBeGreaterThanOrEqual(SEUIL);
    expect(
      contraste(mut, CLAIR['--bg']),
      `--mut ${mut} sur ${CLAIR['--bg']}`
    ).toBeGreaterThanOrEqual(SEUIL);
  });

  it('M1t. Témoin : l’ancienne valeur #6B7A90 échoue à la même garde', () => {
    // 4,36:1 sur blanc, 4,07:1 sur #F6F7F9 — la garde doit savoir la refuser.
    expect(mutLisible('#6B7A90')).toBe(false);
    expect(mutLisible(CLAIR['--mut'])).toBe(true);
  });

  it('M2. La consigne de la page de capture passe de --dim à --mut', () => {
    const lignes = HTML_ENTIER.split('\n').filter((l) =>
      l.includes('Cliquez pour sélectionner · Glissez pour déplacer')
    );
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('color:var(--mut)');
    expect(lignes[0]).not.toContain('var(--dim)');
  });

  it('M3. Les coordonnées de la liste des marqueurs passent de --dim à --mut', () => {
    const f = fonction('renderMkrList');
    expect(f).not.toContain('var(--dim)');
    expect(f).toContain('font-size:9px;color:var(--mut);font-family:var(--fm);');
  });

  it('M4. --dim ne reste QUE sur les trois boutons désactivés', () => {
    // Un composant inactif n'est pas soumis au contraste (WCAG 1.4.3) :
    // --dim reste leur couleur, et seulement la leur.
    expect(HTML_ENTIER).not.toContain('var(--dim)');
    const js = lire('js/biomeca.js');
    const usages = js.split('\n').filter((l) => l.includes('var(--dim)'));
    expect(usages).toHaveLength(3);
    for (const l of usages) expect(l).toMatch(/<button disabled [^>]*color:var\(--dim\)/);
  });
});

// ─── L0 — deux variables jamais déclarées ────────────────────────────

// --fg et --bg2 n'existent nulle part : une déclaration qui les emploie est
// INVALIDE au calcul, la couleur retombe sur l'héritage et le fond disparaît.
const VAR_FANTOME = /var\(--(fg|bg2)\)/g;

describe('#268 L0 — --fg et --bg2 remplacées par --txt et --bg', () => {
  it('L0a. Plus aucune occurrence dans index.html, js/ et la feuille', () => {
    const restes = [];
    for (const rel of ['index.html', 'css/biomeca.css', ...JS_FICHIERS]) {
      lire(rel)
        .split('\n')
        .forEach((l, i) => {
          if (l.match(VAR_FANTOME)) restes.push(`${rel}:${i + 1}`);
        });
    }
    expect(restes).toEqual([]);
  });

  it('L0t. Témoin : le détecteur trouve les deux formes', () => {
    expect('color:var(--fg);background:var(--bg2)'.match(VAR_FANTOME)).toHaveLength(2);
  });

  it('L0b. Les deux cibles sont déclarées en sombre ET en clair', () => {
    expect(CSS_ENTIER).toMatch(/:root\s*\{[^}]*--txt:/);
    expect(CSS_ENTIER).toMatch(/:root\s*\{[^}]*--bg:/);
    expect(CLAIR['--txt']).toBe('#0B1220');
    expect(CLAIR['--bg']).toBe('#F6F7F9');
    // Garde symétrique : ni --fg ni --bg2 n'ont été DÉCLARÉES pour faire
    // passer L0a — le remède est le remplacement, pas la déclaration.
    expect(CSS_ENTIER).not.toMatch(/--(fg|bg2)\s*:/);
  });
});

// ─── L1 — racines, contraste, couleurs en dur, structure ─────────────

const RACINES = Object.fromEntries(FENETRES_A.map((f) => [f.cle, racineFenetre(f)]));

describe('#268 L1 — les dix fenêtres du groupe A portent page-claire', () => {
  it('R1. Chaque racine porte la classe', () => {
    let executes = 0;
    for (const f of FENETRES_A) {
      const r = RACINES[f.cle];
      expect(r, `${f.nom} : fenêtre non construite`).not.toBeNull();
      expect(aLaClasse(r, 'page-claire'), `${f.nom} doit porter page-claire sur sa racine`).toBe(
        true
      );
      executes++;
    }
    expect(executes).toBe(11);
  });

  it('R2. Le groupe B ne l’a PAS (hors lot, arbitrage du 10/10/2026)', () => {
    // Sans cette moitié, poser la classe partout passerait R1.
    const arbre = analyser(HTML_ENTIER);
    for (const id of [
      'modal-subscribe',
      'backfill-lock-modal',
      'modal-vignette',
      'modal-modules-lp',
      'pwa-login',
    ]) {
      const n = sousArbreParId(arbre, id);
      expect(n, `${id} introuvable`).not.toBeNull();
      expect(aLaClasse(n, 'page-claire'), `${id} ne doit PAS porter page-claire`).toBe(false);
    }
    for (const fn of [
      'openPosturePlacementModal',
      'openGalleryLightbox',
      'showSubscribeModal',
      'msRenderCards',
    ]) {
      expect(fonction(fn), `${fn} ne doit PAS poser page-claire`).not.toContain('page-claire');
    }
  });
});

describe('#268 L1 — contraste ≥ 4,5:1 de chaque texte, fenêtre par fenêtre', () => {
  for (const f of FENETRES_A) {
    it(`C. ${f.nom}`, () => {
      const r = mesurerFenetre(RACINES[f.cle]);
      expect(r.claire, `${f.nom} mesurée hors portée claire`).toBe(true);
      // La mesure doit avoir trouvé du texte : un zéro défaut sur zéro mesure
      // ne prouverait rien.
      expect(r.mesures.length).toBeGreaterThan(2);
      const lus = r.defauts.map(
        (d) =>
          `${d.ratio ? d.ratio.toFixed(2) : 'indéterminé'} — ${d.couleur} sur ${d.fond} — « ${d.texte} »`
      );
      expect(lus).toEqual([]);
    });
  }
});

describe('#268 L1 — témoins : la garde de contraste voit les trois familles', () => {
  const mesurer = (html) => mesurerFenetre(analyser(html).enfants[0]);

  it('T1. Texte coloré pâle sur fond clair (#6B7A90 sur la carte)', () => {
    const r = mesurer(
      '<div class="page-claire"><div style="background:var(--card)"><div style="color:#6B7A90">Libellé</div></div></div>'
    );
    expect(r.defauts).toHaveLength(1);
    expect(r.defauts[0].ratio).toBeCloseTo(4.36, 1);
  });

  it('T2. Texte sombre (variable redéfinie) sur un fond fixe sombre', () => {
    const r = mesurer(
      '<div class="page-claire"><div style="background:#0e1f38"><div style="color:var(--txt)">Titre</div></div></div>'
    );
    expect(r.defauts).toHaveLength(1);
  });

  it('T3. Texte HÉRITÉ sous un élément qui ne pose que le fond', () => {
    const r = mesurer(
      '<div class="page-claire"><div style="background:#0e1f38"><span>Hérité</span></div></div>'
    );
    expect(r.defauts).toHaveLength(1);
    expect(r.defauts[0].couleur).toBe('#0b1220');
  });

  it('T4. Variable non déclarée : indéterminé, compté comme défaut', () => {
    const r = mesurer('<div class="page-claire"><div style="color:var(--fg)">Nom</div></div>');
    expect(r.defauts).toHaveLength(1);
    expect(r.defauts[0].ratio).toBeNull();
  });

  it('T5. Contrôle de formulaire : n’hérite pas, texte noir du navigateur', () => {
    // Un bouton sans couleur déclarée sur fond sombre : noir sur bleu nuit.
    const r = mesurer(
      '<div class="page-claire"><button style="background:#0e1f38">Fermer</button></div>'
    );
    expect(r.defauts).toHaveLength(1);
    expect(r.defauts[0].couleur).toBe('#000000');
  });
});

// Toute couleur littérale dans un style des fenêtres du groupe A. Seuls
// admis : le blanc d'un texte posé sur un aplat (bouton plein, pastille), et
// le voile translucide de la RACINE.
const LITTERAL = /#[0-9a-f]{3,8}\b|rgba?\(/i;
function couleursEnDur(racine) {
  const trouvees = [];
  const visiter = (n, estRacine) => {
    for (const [p, v] of Object.entries(declarations(n.attrs.style))) {
      if (!/color|background|border|shadow|outline/.test(p) || !LITTERAL.test(v)) continue;
      if (p === 'color' && /^#fff(fff)?$/i.test(v)) continue;
      if (estRacine && p === 'background' && /^rgba\(0,\s*0,\s*0,\s*0?\.\d+\)$/.test(v)) continue;
      trouvees.push(
        `<${n.tag}${n.attrs.id ? '#' + n.attrs.id : ''}> ${p}:${v} « ${(n.texte || '').trim().slice(0, 30)} »`
      );
    }
    for (const e of n.enfants) visiter(e, false);
  };
  visiter(racine, true);
  return trouvees;
}

describe('#268 L1 — plus de couleur en dur dans les fenêtres du groupe A', () => {
  for (const f of FENETRES_A) {
    it(`H. ${f.nom}`, () => {
      expect(couleursEnDur(RACINES[f.cle])).toEqual([]);
    });
  }

  it('Ht. Témoin : un gris en dur est relevé, le voile de la racine non', () => {
    const a = analyser(
      '<div style="background:rgba(0,0,0,0.5)"><div style="color:#888">x</div><button style="background:var(--green);color:#fff">ok</button></div>'
    ).enfants[0];
    expect(couleursEnDur(a)).toHaveLength(1);
  });

  it('H-JS1. Messages du mot de passe : variables du thème', () => {
    const f = fonction('changePassword');
    expect(f).not.toMatch(LITTERAL);
    expect(f.match(/msg\.style\.color = 'var\(--red\)'/g)).toHaveLength(3);
    expect(f.match(/msg\.style\.color = 'var\(--green\)'/g)).toHaveLength(1);
  });

  it('H-JS2. État de la licence dans Mon compte : variables du thème', () => {
    const lignes = fonction('loadAbonnementInfo')
      .split('\n')
      .filter((l) => l.includes('licenceEl.innerHTML'));
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain(
      '<span style="color:var(--green);font-weight:600;">✅ Licence activée</span>'
    );
    expect(lignes[1]).toContain('<span style="color:var(--red);">⚠️ Licence non activée</span>');
  });

  it('H-JS3. Bouton de période actif (Podopédiatrie) : encre de la famille', () => {
    const f = fonction('_renderPodopediatrieAgeModal');
    expect(f).not.toContain('#e11d48');
    expect(f).toContain("btn.style.background = active ? 'var(--podo-encre)' : 'transparent';");
    expect(f).toContain("btn.style.color = active ? '#fff' : 'var(--podo-encre)';");
  });
});

describe('#268 L1 — structure inchangée hors style et classe de thème', () => {
  // Référence FIGÉE, générée une seule fois depuis le code de main (2ad1030)
  // avant toute modification — jamais régénérée.
  it('S0. La référence couvre les onze vues', () => {
    expect(Object.keys(REFERENCE).sort()).toEqual(FENETRES_A.map((f) => f.cle).sort());
  });

  for (const f of FENETRES_A) {
    it(`S. ${f.nom}`, () => {
      expect(structure(RACINES[f.cle])).toEqual(REFERENCE[f.cle]);
    });
  }

  it('St. Témoin : un enfant retiré change la structure', () => {
    const a = racineFenetre(FENETRES_A[0]);
    a.enfants[0].enfants.pop();
    expect(structure(a)).not.toEqual(REFERENCE[FENETRES_A[0].cle]);
  });

  it('S-essai. _showAccessOverlay adresse titre et message PAR POSITION', () => {
    // children[1] = titre, children[2] = message du premier enfant de
    // l'overlay : ajouter un élément avant eux réécrirait le mauvais texte.
    const boite = RACINES['essai-termine'].enfants[0];
    expect(boite.enfants[1].texte.trim()).toBe('Essai gratuit terminé');
    expect(boite.enfants[2].texte.trim()).toBe('Choisissez une formule pour continuer.');
    expect(fonction('_showAccessOverlay')).toContain('const titleEl = wrapper.children[1];');
  });
});

describe('#268 L1 — encadrés d’erreur, cachés et vides dans la mesure statique', () => {
  // np-err et eu-err sont display:none et sans texte tant qu'aucune erreur
  // n'est levée : la garde C ne les voit pas. On y injecte un texte FICTIF et
  // on les mesure comme ils s'afficheront.
  // Fond commun : var(--red-d), teinte TRANSLUCIDE composée sur le fond réel
  // (eu-err portait une teinte en dur, alignée sur np-err). En clair : --red
  // #B91C1C sur --red-d composé sur blanc = 5,30:1.
  //
  // DETTE CONNUE (#268, arbitrage du 10/10/2026) — en thème SOMBRE, --red
  // #f04060 sur --card #0f2a52 donne 3,81:1 sans teinte et 3,43:1 avec
  // --red-d. Le défaut vient du ROUGE du thème sombre, pas du fond : aucune
  // teinte posée sur cette carte ne l'amène à 4,5:1. Il touche tous les
  // messages rouges des surfaces encore sombres. Après L3 ne resteront que
  // les surfaces sombres voulues (connexion, vitrine) : lot dédié « rouge du
  // thème sombre », non lié à #268. Le témoin Ed affiche le ratio sans
  // l'exiger, pour que la dette reste visible dans la sortie des tests.
  const CAS = [
    ['nouveau-patient', 'np-err'],
    ['admin-utilisateur', 'eu-err'],
  ];
  const avecErreur = (cle, id, claire) => {
    const r = racineFenetre(FENETRES_A.find((f) => f.cle === cle));
    if (!claire) r.attrs.class = (r.attrs.class || '').replace(/\bpage-claire\b/, '').trim();
    const pile = [r];
    let n = null;
    while (pile.length && !n) {
      const x = pile.pop();
      if (x.attrs.id === id) n = x;
      else pile.push(...x.enfants);
    }
    if (!n) return { n: null, m: undefined };
    n.texte = 'Erreur fictive de saisie';
    return { n, m: mesurerFenetre(r).mesures.find((x) => x.chemin.endsWith('#' + id)) };
  };

  for (const [cle, id] of CAS) {
    it(`E. ${id} : un message d’erreur se lit à 4,5:1 au moins en clair`, () => {
      const { n, m } = avecErreur(cle, id, true);
      expect(n, `${id} introuvable`).not.toBeNull();
      expect(m, `${id} non mesuré`).toBeDefined();
      expect(m.ratio, `${id} : ${m.couleur} sur ${m.fond}`).not.toBeNull();
      expect(m.ratio, `${id} : ${m.couleur} sur ${m.fond}`).toBeGreaterThanOrEqual(SEUIL);
      expect(declarations(n.attrs.style).background).toBe('var(--red-d)');
    });

    // Témoin DOCUMENTAIRE : calculé à la collecte, affiché dans le titre,
    // jamais exigé ≥ 4,5 (dette ci-dessus).
    const sombre = avecErreur(cle, id, false).m;
    const lu = sombre && sombre.ratio ? sombre.ratio.toFixed(2).replace('.', ',') : 'non mesuré';
    it(`Ed. ${id} en SOMBRE : ${lu}:1 — dette connue « rouge du thème sombre », non exigée`, () => {
      expect(sombre, `${id} non mesuré en sombre`).toBeDefined();
      expect(typeof sombre.ratio).toBe('number');
    });
  }

  it('Et. Témoin : un fond translucide est COMPOSÉ sur l’ancêtre, pas ignoré', () => {
    // Texte sombre sous un voile noir à 60 % posé sur la carte blanche :
    // ignorer le voile mesurerait 18:1 sur blanc ; composé, le fond devient
    // gris foncé et le défaut apparaît.
    const r = mesurerFenetre(
      analyser(
        '<div class="page-claire"><div style="background:var(--card)"><div style="background:rgba(0,0,0,0.6)">Voilé</div></div></div>'
      ).enfants[0]
    );
    expect(r.defauts).toHaveLength(1);
    expect(r.defauts[0].fond).toBe('#666666');
  });
});

describe('#268 L1 — choix de couleur arbitrés', () => {
  const style = (n) => declarations(n.attrs.style);
  const trouver = (racine, pred) => {
    const pile = [racine];
    while (pile.length) {
      const n = pile.pop();
      if (pred(n)) return n;
      pile.push(...n.enfants);
    }
    return null;
  };

  it('P1. Modifier le patient : Sauvegarder plein vert, Annuler en contour', () => {
    const r = RACINES['modifier-patient'];
    const sauver = style(trouver(r, (n) => n.tag === 'button' && n.texte.includes('Sauvegarder')));
    expect(sauver.background).toBe('var(--green)');
    expect(sauver.color).toBe('#fff');
    const annuler = style(trouver(r, (n) => n.tag === 'button' && n.texte.trim() === 'Annuler'));
    expect(annuler.background).toBe('var(--card)');
    expect(annuler.border).toBe('1px solid var(--bord)');
    expect(annuler.color).toBe('var(--txt)');
  });

  it('P2. Podopédiatrie : rose = --podo-encre, avertissement = --encours-encre', () => {
    const r = RACINES['podo-age'];
    const titre = trouver(r, (n) => n.texte.includes('Bilan Podopédiatrie'));
    expect(style(titre).color).toBe('var(--podo-encre)');
    const alerte = trouver(r, (n) => n.attrs.id === 'podopediatrie-too-young');
    expect(style(alerte).color).toBe('var(--encours-encre)');
    // Variable EXISTANTE (déclarée sur :root, #258) : aucune valeur nouvelle.
    expect(CLAIR['--encours-encre']).toBe('#8A5A00');
    expect(CLAIR['--podo-encre']).toBe('#BE123C');
  });
});
