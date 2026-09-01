import { describe, it, expect } from 'vitest';
import { extraireBloc, fabriquerAvecDependances } from './helpers/mirror-diff.mjs';
import { calcAngle3 } from '../js/calc.mjs';

// ═══════════════════════════════════════════════════════════════════
// #250 — persister les coordonnées des marqueurs des tests biomécaniques
// ═══════════════════════════════════════════════════════════════════
//
// Les deux fonctions couvertes vivent dans js/biomeca.js, qui n'est pas un
// module ES. Elles sont extraites entre marqueurs — même mécanisme que #47 et
// #243, mais finalité différente : ce bloc n'a AUCUN miroir, les marqueurs
// servent uniquement à le rendre testable (convention #132).
//
// #243 COORD est concaténé parce que _serialiserMarqueurs appelle _isPlacedPt,
// qui y vit. Les évaluer séparément produirait une référence non définie.
//
// LA RÈGLE QUE CES TESTS PROTÈGENT
// Une image d'avant #250 n'a jamais eu de points : le champ `markers` est
// absent du persisté. La relecture pose `markers: []` (repli nécessaire — les
// consommateurs font .filter sans garde), et si la persistance réécrivait ce
// tableau vide, l'image basculerait IRRÉVERSIBLEMENT de « jamais eu de
// points » à « rien posé ». Un accident déguisé en choix, la faute même que
// #243 a corrigée sur les rapports.
// L'écriture conditionnelle l'empêche. Le test 3 en est la démonstration.

const BLOC_COORD = extraireBloc('js/biomeca.js', '#243 COORD — DÉBUT', '#243 COORD — FIN');
const BLOC_PERSIST = extraireBloc('js/biomeca.js', '#250 PERSIST — DÉBUT', '#250 PERSIST — FIN');

const NOMS = ['_coord', '_isPlacedPt', '_serialiserMarqueurs', '_relireMarqueurs'];
const rt = fabriquerAvecDependances([BLOC_COORD, BLOC_PERSIST], NOMS);

// Points réels du gabarit 'ap-bi' (js/biomeca.js — MARKER_TEMPLATES), côté D.
const PTS_D = [
  { name: 'Milieu mollet D', side: 'D', x: 100, y: 0 },
  { name: 'Jonction musculo-tend. D', side: 'D', x: 100, y: 100 },
  { name: 'Calca supérieur D', side: 'D', x: 100, y: 200 },
  { name: 'Calca inférieur D', side: 'D', x: 114, y: 300 },
];
// Gabarit 'genou-bi' (KFPPA) : 3 points par côté.
const PTS_GENOU = [
  { name: 'EIAS D', side: 'D', x: 100, y: 0 },
  { name: 'Rotule D', side: 'D', x: 112, y: 150 },
  { name: 'Tarse D', side: 'D', x: 100, y: 300 },
];
const DIMS = { w: 1280, h: 720 };

// ═══════════════════════════════════════════════════════════════════
// 0. GARDE PREMIÈRE — l'extraction a-t-elle ramené les DEUX fonctions ?
// ═══════════════════════════════════════════════════════════════════

describe('#250 extraction du bloc PERSIST', () => {
  it('0. Les deux fonctions sortent de l’extraction', () => {
    // Si l'une manque, TOUS les tests suivants seraient verts sur du vide.
    expect(typeof rt._serialiserMarqueurs).toBe('function');
    expect(typeof rt._relireMarqueurs).toBe('function');
    // _isPlacedPt est une DÉPENDANCE du bloc, fournie par #243 COORD.
    expect(typeof rt._isPlacedPt).toBe('function');
    // Le bloc extrait est substantiel : une extraction qui aurait ramené
    // quelques lignes de commentaire passerait les tests ci-dessus.
    expect(BLOC_PERSIST.length).toBeGreaterThan(400);
  });

  it('0b. Le bloc extrait contient bien le code attendu', () => {
    expect(BLOC_PERSIST).toContain('function _serialiserMarqueurs');
    expect(BLOC_PERSIST).toContain('function _relireMarqueurs');
    expect(BLOC_COORD).toContain('function _isPlacedPt');
  });

  it('0c. L’extraction ÉCHOUE si un marqueur manque', () => {
    // Assertion sur le FAIT qu'elle lève, jamais sur le libellé du message :
    // une reformulation casserait le test sans qu'aucun comportement change.
    expect(() =>
      extraireBloc('js/biomeca.js', '#250 MARQUEUR-INEXISTANT', '#250 PERSIST — FIN')
    ).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 1 à 3 — « jamais écrit » ne doit jamais devenir « écrit vide »
// ═══════════════════════════════════════════════════════════════════

describe('#250 génération d’avant : l’absence se conserve', () => {
  it('1. Entrée sans champ markers → markersConnus false, markers vide', () => {
    const relu = rt._relireMarqueurs({ time: 1.2, angD: 8.2 });
    expect(relu.markersConnus).toBe(false);
    expect(Array.isArray(relu.markers)).toBe(true);
    expect(relu.markers.length).toBe(0);
    expect(relu.dims).toBeNull();
  });

  it('2. Ce relu re-sérialisé → PAS de clé markers', () => {
    const relu = rt._relireMarqueurs({ time: 1.2, angD: 8.2 });
    const persiste = rt._serialiserMarqueurs(relu);
    expect('markers' in persiste).toBe(false);
    expect('dims' in persiste).toBe(false);
    expect(Object.keys(persiste).length).toBe(0);
  });

  it('3. Aller-retour ×3 → markersConnus reste false à chaque tour', () => {
    // LE test du chantier. Sans l'écriture conditionnelle, markersConnus
    // basculerait à true dès le premier tour (le tableau vide serait écrit),
    // et l'image passerait de « jamais eu de points » à « rien posé »,
    // irréversiblement.
    let base = { time: 1.2, angD: 8.2 };
    let executes = 0;
    for (let tour = 1; tour <= 3; tour++) {
      const relu = rt._relireMarqueurs(base);
      expect(relu.markersConnus, `tour ${tour} : markersConnus`).toBe(false);
      expect(relu.markers.length, `tour ${tour} : markers.length`).toBe(0);
      base = { ...base, ...rt._serialiserMarqueurs(relu) };
      expect('markers' in base, `tour ${tour} : clé markers absente du persisté`).toBe(false);
      executes++;
    }
    // Garde anti-succès-vacant : une boucle qui n'itère pas passerait.
    expect(executes).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4 — « rien posé » reste distinct de « jamais eu »
// ═══════════════════════════════════════════════════════════════════

describe('#250 génération d’après : l’absence de points est un état', () => {
  it('4. markersConnus true + markers [] → la clé markers EXISTE, valant []', () => {
    const persiste = rt._serialiserMarqueurs({ markersConnus: true, markers: [], dims: DIMS });
    expect('markers' in persiste).toBe(true);
    expect(persiste.markers.length).toBe(0);
    expect(persiste.dims).toEqual(DIMS);
    // Et une relecture le distingue bien du cas 1.
    const relu = rt._relireMarqueurs(persiste);
    expect(relu.markersConnus).toBe(true);
    expect(relu.markers.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5, 6, 8 — la géométrie survit à l’aller-retour
// ═══════════════════════════════════════════════════════════════════

describe('#250 la géométrie est préservée', () => {
  it('5. Points réels → sérialiser → relire → calcAngle3 rend la MÊME valeur', () => {
    const avant = calcAngle3(PTS_D);
    expect(avant).not.toBeNull();

    const persiste = rt._serialiserMarqueurs({ markersConnus: true, markers: PTS_D, dims: DIMS });
    const relu = rt._relireMarqueurs(persiste);
    const apres = calcAngle3(relu.markers);

    // Au dix-millième : aucune transformation de repère ne s'est glissée.
    expect(apres).toBeCloseTo(avant, 4);
    expect(relu.dims).toEqual(DIMS);
    expect(relu.markers.length).toBe(4);
  });

  it('6. Deux jeux DIFFÉRENTS → deux sorties distinctes', () => {
    // Le geste réel du praticien : il place ses points AVANT chaque capture,
    // image par image. Deux captures successives ne portent donc pas le même
    // jeu, et la sérialisation ne doit pas les confondre.
    // UN SEUL point déplacé : une translation de tous les points laisserait
    // l'angle inchangé (mesuré : 172,03 des deux côtés).
    const jeu2 = PTS_D.map((p, i) => (i === 3 ? { ...p, x: p.x + 25 } : p));
    const a = rt._serialiserMarqueurs({ markersConnus: true, markers: PTS_D, dims: DIMS });
    const b = rt._serialiserMarqueurs({ markersConnus: true, markers: jeu2, dims: DIMS });

    expect(a.markers).not.toEqual(b.markers);
    expect(a.markers[3].x).toBe(114);
    expect(b.markers[3].x).toBe(139);
    // Et les angles diffèrent réellement, pas seulement les coordonnées.
    expect(calcAngle3(a.markers)).not.toBeCloseTo(calcAngle3(b.markers), 4);
  });

  it('8. Gabarit à 3 points (genou-bi, KFPPA) → sérialisé aussi', () => {
    const persiste = rt._serialiserMarqueurs({
      markersConnus: true,
      markers: PTS_GENOU,
      dims: DIMS,
    });
    expect(persiste.markers.length).toBe(3);
    const relu = rt._relireMarqueurs(persiste);
    expect(calcAngle3(relu.markers)).toBeCloseTo(calcAngle3(PTS_GENOU), 4);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7 — le filtre agit à la persistance, et ne mute pas son argument
// ═══════════════════════════════════════════════════════════════════

describe('#250 filtrage des marqueurs à moitié posés', () => {
  it('7. x fini, y null → écarté à la sérialisation, CONSERVÉ dans l’entrée', () => {
    const entree = {
      markersConnus: true,
      dims: DIMS,
      markers: [...PTS_D, { name: 'Fantôme D', side: 'D', x: 200, y: null }],
    };
    const persiste = rt._serialiserMarqueurs(entree);

    // Écarté du persisté : un point à moitié posé n'est pas un point posé.
    expect(persiste.markers.length).toBe(4);
    expect(persiste.markers.some((m) => m.name === 'Fantôme D')).toBe(false);

    // Mais TOUJOURS présent dans l'entrée : la fonction ne mute pas son
    // argument. La copie en mémoire doit rester entière — selectFrame la
    // réinjecte, et un tableau amputé priverait le praticien des
    // emplacements restant à pourvoir.
    expect(entree.markers.length).toBe(5);
    expect(entree.markers[4].name).toBe('Fantôme D');
  });

  it('7b. Les valeurs coercibles sont écartées comme les null', () => {
    let executes = 0;
    for (const mauvais of [null, undefined, NaN, '', ' ', '210px', false, []]) {
      const entree = {
        markersConnus: true,
        markers: [{ name: 'X', side: 'D', x: 100, y: mauvais }],
      };
      const persiste = rt._serialiserMarqueurs(entree);
      expect(persiste.markers.length, `y = ${JSON.stringify(mauvais) ?? String(mauvais)}`).toBe(0);
      executes++;
    }
    expect(executes).toBe(8);
  });
});
