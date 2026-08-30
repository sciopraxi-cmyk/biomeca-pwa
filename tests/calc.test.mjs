import { describe, it, expect } from 'vitest';
import {
  interpretKfppa,
  clrKfppa,
  calcAngle3,
  rp_cssColor,
  rp_badgeCls,
  rp_badgeTxt,
  coord,
  isPlaced,
  normaliser,
  findMarkerAt,
} from '../js/calc.mjs';

// ============================================================================
// interpretKfppa(p) — classification factuelle d'un score KFPPA
// Seuils cliniques (depuis js/calc.mjs, alignés sur clrKfppa) :
//   v = p * 100
//   60 ≤ v ≤ 140      → 'dans la norme'
//   20 ≤ v ≤ 180      → 'valeur limite'
//   v < 20 ou v > 180 → 'hors norme'
//   p === null        → '—'
// ============================================================================
describe('interpretKfppa', () => {
  it('retourne "—" pour un score null (donnée manquante)', () => {
    expect(interpretKfppa(null)).toBe('—');
  });

  it('retourne "dans la norme" pour un score à 100% (centre de la zone norme)', () => {
    expect(interpretKfppa(1.0)).toBe('dans la norme');
  });

  it('retourne "dans la norme" pour un score à 60% (limite basse de la norme)', () => {
    expect(interpretKfppa(0.6)).toBe('dans la norme');
  });

  it('retourne "dans la norme" pour un score à 140% (limite haute de la norme)', () => {
    expect(interpretKfppa(1.4)).toBe('dans la norme');
  });

  it('retourne "valeur limite" pour un score à 50%', () => {
    expect(interpretKfppa(0.5)).toBe('valeur limite');
  });

  it('retourne "valeur limite" pour un score à 150%', () => {
    expect(interpretKfppa(1.5)).toBe('valeur limite');
  });

  it('retourne "hors norme" pour un score à 10% (très en deçà)', () => {
    expect(interpretKfppa(0.1)).toBe('hors norme');
  });

  it('retourne "hors norme" pour un score à 200% (très au-delà)', () => {
    expect(interpretKfppa(2.0)).toBe('hors norme');
  });
});

// ============================================================================
// clrKfppa(pct) — couleur CSS selon score KFPPA
// Seuils (depuis js/calc.mjs) :
//   p = |pct| * 100
//   p < 20 ou p > 180 → 'var(--red)'
//   p < 60 ou p > 140 → 'var(--orange)'
//   sinon             → 'var(--green)'
//   pct null/NaN      → 'var(--mut)'
// ============================================================================
describe('clrKfppa', () => {
  it('retourne var(--green) pour un score à 100% (zone norme)', () => {
    expect(clrKfppa(1.0)).toBe('var(--green)');
  });

  it('retourne var(--green) pour un score à 130% (encore dans la norme 60–140)', () => {
    expect(clrKfppa(1.3)).toBe('var(--green)');
  });

  it('retourne var(--orange) pour un score à 150% (zone limite haute, |p|>140)', () => {
    expect(clrKfppa(1.5)).toBe('var(--orange)');
  });

  it('retourne var(--orange) pour un score à 50% (zone limite basse, |p|<60)', () => {
    expect(clrKfppa(0.5)).toBe('var(--orange)');
  });

  it('retourne var(--red) pour un score à 10% (hors norme bas, |p|<20)', () => {
    expect(clrKfppa(0.1)).toBe('var(--red)');
  });

  it('retourne var(--red) pour un score à 190% (hors norme haut, |p|>180)', () => {
    expect(clrKfppa(1.9)).toBe('var(--red)');
  });
});

// ============================================================================
// calcAngle3(pts) — angle ABC en degrés (loi du cosinus)
// Si moins de 3 points placés (x !== null), retourne null.
// Si 4 points placés, utilise les 3 derniers (skip du premier).
// ============================================================================
describe('calcAngle3', () => {
  it('retourne 90° pour un angle droit en B (A→B→C orthogonaux)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(calcAngle3(pts)).toBeCloseTo(90, 5);
  });

  it('retourne 180° pour 3 points alignés (angle plat en B)', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(calcAngle3(pts)).toBeCloseTo(180, 5);
  });

  it("retourne null si un des trois points n'est pas placé (x null)", () => {
    const pts = [
      { x: null, y: null },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(calcAngle3(pts)).toBeNull();
  });
});

// ============================================================================
// rp_cssColor(p, genou=true) — couleur hex rapport, branche genou alignée KFPPA
// Seuils branche genou (depuis js/calc.mjs, fix 2026-04-26) :
//   60 ≤ v ≤ 140      → '#1a7a3e' (vert)
//   20 ≤ v ≤ 180      → '#856404' (orange)
//   v < 20 ou v > 180 → '#b30021' (rouge)
// ============================================================================
describe('rp_cssColor (genou=true)', () => {
  it('retourne #1a7a3e (vert) pour un score à 100% (centre norme)', () => {
    expect(rp_cssColor(1.0, true)).toBe('#1a7a3e');
  });

  it('retourne #1a7a3e (vert) pour un score à 130% — dans la norme 60-140 ; avant le fix retournait à tort orange (Limite)', () => {
    expect(rp_cssColor(1.3, true)).toBe('#1a7a3e');
  });

  it('retourne #856404 (orange) pour un score à 150% (limite haute, hors norme mais ≤ 180)', () => {
    expect(rp_cssColor(1.5, true)).toBe('#856404');
  });

  it('retourne #856404 (orange) pour un score à 170% (limite haute extrême, encore ≤ 180)', () => {
    expect(rp_cssColor(1.7, true)).toBe('#856404');
  });

  it('retourne #b30021 (rouge) pour un score à 200% (hors norme haut, v > 180)', () => {
    expect(rp_cssColor(2.0, true)).toBe('#b30021');
  });

  it('retourne #856404 (orange) pour un score à 50% (zone limite basse)', () => {
    expect(rp_cssColor(0.5, true)).toBe('#856404');
  });

  it('retourne #b30021 (rouge) pour un score à 10% (hors norme bas, v < 20)', () => {
    expect(rp_cssColor(0.1, true)).toBe('#b30021');
  });
});

// ============================================================================
// rp_badgeCls(p, genou=true) — classe CSS de badge, branche genou alignée KFPPA
// ============================================================================
describe('rp_badgeCls (genou=true)', () => {
  it('retourne rp-badge-g pour un score à 100% (norme)', () => {
    expect(rp_badgeCls(1.0, true)).toBe('rp-badge-g');
  });

  it('retourne rp-badge-g pour un score à 130% — dans la norme 60-140 ; avant le fix retournait à tort rp-badge-o (Limite)', () => {
    expect(rp_badgeCls(1.3, true)).toBe('rp-badge-g');
  });

  it('retourne rp-badge-o pour un score à 30% (limite basse, dans 20-180 mais hors norme 60-140)', () => {
    expect(rp_badgeCls(0.3, true)).toBe('rp-badge-o');
  });

  it('retourne rp-badge-r pour un score à 190% (hors norme haut, v>180)', () => {
    expect(rp_badgeCls(1.9, true)).toBe('rp-badge-r');
  });
});

// ============================================================================
// rp_badgeTxt(p, genou=true) — texte de badge, branche genou alignée KFPPA
// ============================================================================
describe('rp_badgeTxt (genou=true)', () => {
  it('retourne "Normal" pour un score à 100%', () => {
    expect(rp_badgeTxt(1.0, true)).toBe('Normal');
  });

  it('retourne "Normal" pour un score à 130% — dans la norme 60-140 ; avant le fix retournait à tort "Limite"', () => {
    expect(rp_badgeTxt(1.3, true)).toBe('Normal');
  });

  it('retourne "Limite" pour un score à 150% (limite haute, hors norme mais ≤ 180)', () => {
    expect(rp_badgeTxt(1.5, true)).toBe('Limite');
  });

  it('retourne "Hors norme" pour un score à 190% (v>180)', () => {
    expect(rp_badgeTxt(1.9, true)).toBe('Hors norme');
  });
});

// ============================================================================
// Cohérence inter-fonctions : les 5 fonctions KFPPA doivent classifier
// identiquement un score donné en zone norme / limite / hors norme.
// Couvre : interpretKfppa, clrKfppa, rp_cssColor(_, true), rp_badgeCls(_, true),
//          rp_badgeTxt(_, true).
// ============================================================================
describe('cohérence inter-fonctions KFPPA (5 fonctions)', () => {
  describe('zone norme (60–140%)', () => {
    [60, 100, 140].forEach((pct) => {
      it(`${pct}% : verdict aligné "norme" sur les 5 fonctions`, () => {
        const r = pct / 100;
        expect(interpretKfppa(r)).toBe('dans la norme');
        expect(clrKfppa(r)).toBe('var(--green)');
        expect(rp_cssColor(r, true)).toBe('#1a7a3e');
        expect(rp_badgeCls(r, true)).toBe('rp-badge-g');
        expect(rp_badgeTxt(r, true)).toBe('Normal');
      });
    });
  });

  describe('zone limite (20–60% ou 140–180%)', () => {
    [30, 50, 150, 170].forEach((pct) => {
      it(`${pct}% : verdict aligné "limite" sur les 5 fonctions`, () => {
        const r = pct / 100;
        expect(interpretKfppa(r)).toBe('valeur limite');
        expect(clrKfppa(r)).toBe('var(--orange)');
        expect(rp_cssColor(r, true)).toBe('#856404');
        expect(rp_badgeCls(r, true)).toBe('rp-badge-o');
        expect(rp_badgeTxt(r, true)).toBe('Limite');
      });
    });
  });

  describe('zone hors norme (<20% ou >180%)', () => {
    [10, 190].forEach((pct) => {
      it(`${pct}% : verdict aligné "hors norme" sur les 5 fonctions`, () => {
        const r = pct / 100;
        expect(interpretKfppa(r)).toMatch(/hors norme/);
        expect(clrKfppa(r)).toBe('var(--red)');
        expect(rp_cssColor(r, true)).toBe('#b30021');
        expect(rp_badgeCls(r, true)).toBe('rp-badge-r');
        expect(rp_badgeTxt(r, true)).toBe('Hors norme');
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// #243 — un point à moitié posé n'est pas un point posé
// ═══════════════════════════════════════════════════════════════════
//
// L'ancien filtre `p.x !== null` laissait passer un point dont seule
// l'abscisse était renseignée. `null` se coerce en 0 : pas de NaN qui se
// verrait, mais un angle FAUX ET PLAUSIBLE imprimé dans un rapport patient.
//
// Recensement du 29/08/2026 sur les données réelles : 798 marqueurs, 0
// demi-état, 0 coordonnée en chaîne. Ces gardes sont donc des DÉFENSES.

describe('#243 coord() — validation par le TYPE avant coercition', () => {
  it('1. Accepte les nombres finis et les chaînes numériques', () => {
    const acceptes = [
      [210, 210],
      ['210', 210],
      [' 210 ', 210],
      ['1e3', 1000],
      [0, 0],
      [-5, -5],
      [3.5, 3.5],
    ];
    let executes = 0;
    for (const [entree, attendu] of acceptes) {
      expect(coord(entree), `entrée ${JSON.stringify(entree)}`).toBe(attendu);
      executes++;
    }
    // Garde anti-succès-vacant : une boucle qui n'itère pas passerait.
    expect(executes).toBe(acceptes.length);
    expect(executes).toBeGreaterThan(6);
  });

  it('2. Rejette les douze valeurs non exploitables', () => {
    // Number(null), Number(''), Number(' '), Number(false) et Number([])
    // valent TOUS 0 : une garde du genre Number.isFinite(Number(v)) les
    // prendrait pour une coordonnée valide au bord supérieur de l'image.
    const rejetes = [
      null,
      undefined,
      NaN,
      Infinity,
      -Infinity,
      '',
      ' ',
      '210px',
      false,
      true,
      [],
      [210],
      {},
    ];
    let executes = 0;
    for (const v of rejetes) {
      expect(coord(v), `entrée ${JSON.stringify(v) ?? String(v)}`).toBeNull();
      executes++;
    }
    expect(executes).toBe(rejetes.length);
    expect(executes).toBeGreaterThan(10);
  });

  it('3. isPlaced exige les DEUX coordonnées', () => {
    expect(isPlaced({ x: 100, y: 200 })).toBe(true);
    expect(isPlaced({ x: 100, y: null })).toBe(false);
    expect(isPlaced({ x: null, y: 200 })).toBe(false);
    expect(isPlaced({ x: 100 })).toBe(false);
    expect(isPlaced({ x: 100, y: ' ' })).toBe(false);
    expect(isPlaced({ x: '100', y: '200' })).toBe(true);
  });
});

describe('#243 normaliser() — la précondition est GARANTIE, pas déclarée', () => {
  it('4. Ne lève pas sur un point filtré, et rend des nombres', () => {
    const r = normaliser({ x: '210', y: 300, name: 'A' });
    expect(r.x).toBe(210);
    expect(r.y).toBe(300);
    expect(r.name).toBe('A'); // les autres champs sont préservés
  });

  it('5. LÈVE sur un point non filtré — appel non filtré = erreur de programmation', () => {
    // L'assertion doit être ÉPROUVÉE, sinon c'est une ligne morte. Elle est
    // inatteignable en usage correct (isPlaced et normaliser appellent la
    // MÊME coord), mais un appel non filtré doit se voir immédiatement plutôt
    // que produire une coordonnée nulle silencieuse.
    expect(() => normaliser({ x: 100, y: null })).toThrow(/point non placé/);
    expect(() => normaliser({ x: 100 })).toThrow(/point non placé/);
    expect(() => normaliser({ x: ' ', y: 200 })).toThrow(/point non placé/);
  });
});

describe('#243 calcAngle3 — le cas fondateur', () => {
  it('6. Trois points dont le dernier a y = null → null, JAMAIS un angle faux et plausible', () => {
    // C'est le cœur de #243. Mesuré avant correction : ces trois points
    // rendaient 50,69° — une mesure crédible, fausse de 34 degrés, imprimable
    // dans un rapport remis à un patient. L'angle réel avec y = 210 vaut
    // 84,81°. `null - 210` vaut -210, pas NaN : rien ne se voyait.
    const avecTrou = [
      { x: 100, y: 200 },
      { x: 150, y: 260 },
      { x: 200, y: null },
    ];
    expect(calcAngle3(avecTrou)).toBeNull();

    // Contrôle : les mêmes points complets donnent bien la mesure attendue.
    const complet = [
      { x: 100, y: 200 },
      { x: 150, y: 260 },
      { x: 200, y: 210 },
    ];
    expect(calcAngle3(complet)).toBeCloseTo(84.81, 1);
  });

  it('7. Le point à moitié posé est écarté quelle que soit la forme du trou', () => {
    for (const mauvais of [null, undefined, NaN, '', ' ', '210px', false, []]) {
      const pts = [
        { x: 100, y: 200 },
        { x: 150, y: 260 },
        { x: 200, y: mauvais },
      ];
      expect(calcAngle3(pts), `y = ${JSON.stringify(mauvais) ?? String(mauvais)}`).toBeNull();
    }
  });

  it('8. Une coordonnée en CHAÎNE reste mesurée — le calcul consomme le normalisé', () => {
    // Sans .map(normaliser), '210' ne tomberait juste que par coercition
    // implicite, c'est-à-dire par accident.
    const enChaines = [
      { x: '100', y: '200' },
      { x: '150', y: '260' },
      { x: '200', y: '210' },
    ];
    expect(calcAngle3(enChaines)).toBeCloseTo(84.81, 1);
  });
});

describe('#243 calcAngle3 — basculement de branche', () => {
  it("9. Un point invalide sur 4 fait passer à l'autre triplet, et la mesure change", () => {
    // ⚠️ Le choix d'indices est clinique : à 4 points placés, l'angle se
    // mesure sur [1],[2],[3] — sommet Calca supérieur, trois points
    // inférieurs. Écarter un point ramène à 3, donc à un AUTRE triplet.
    // Ce test existe pour que ce basculement ne passe pas inaperçu le jour où
    // un point invalide apparaît.
    const quatre = [
      { x: 50, y: 50 },
      { x: 100, y: 200 },
      { x: 150, y: 260 },
      { x: 200, y: 210 },
    ];
    const surQuatre = calcAngle3(quatre);
    // Mesuré sur [1],[2],[3] : le premier point est ignoré.
    expect(surQuatre).toBeCloseTo(84.81, 1);

    // Le même jeu avec le DERNIER point invalidé : il ne reste que 3 points
    // placés, donc le triplet devient [0],[1],[2].
    const troisApresFiltre = [
      { x: 50, y: 50 },
      { x: 100, y: 200 },
      { x: 150, y: 260 },
      { x: 200, y: null },
    ];
    const surTrois = calcAngle3(troisApresFiltre);
    expect(surTrois).not.toBeNull();
    expect(surTrois).toBeCloseTo(
      calcAngle3([
        { x: 50, y: 50 },
        { x: 100, y: 200 },
        { x: 150, y: 260 },
      ]),
      6
    );
    // La mesure DIFFÈRE : ce n'est pas le même angle qui est rendu.
    expect(Math.abs(surTrois - surQuatre)).toBeGreaterThan(1);
  });

  it('10. Moins de trois points exploitables → null', () => {
    expect(
      calcAngle3([
        { x: 100, y: 200 },
        { x: 150, y: null },
        { x: 200, y: null },
      ])
    ).toBeNull();
    expect(calcAngle3([])).toBeNull();
  });
});

describe('#243 findMarkerAt — filtre complet', () => {
  it("11. Un point à moitié posé n'est jamais capturé", () => {
    // Avant : `if(m.x === null) continue` retenait {x:118, y:null} et
    // calculait Math.hypot(118-120, null-200) — donc une distance sur une
    // ordonnée traitée comme 0.
    expect(findMarkerAt(120, 200, [{ x: 118, y: null }], 800)).toBe(-1);
    expect(findMarkerAt(120, 200, [{ x: 118, y: 198 }], 800)).toBe(0);
  });

  it('12. Les coordonnées en chaîne restent capturables', () => {
    expect(findMarkerAt(120, 200, [{ x: '118', y: '198' }], 800)).toBe(0);
  });
});
