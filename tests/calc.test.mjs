import { describe, it, expect } from 'vitest';
import {
  interpretKfppa,
  clrKfppa,
  calcAngle3,
  rp_cssColor,
  rp_badgeCls,
  rp_badgeTxt,
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
