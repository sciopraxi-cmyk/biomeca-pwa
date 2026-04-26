import { describe, it, expect } from 'vitest';
import { interpretKfppa, clrKfppa, calcAngle3 } from '../js/calc.mjs';

// ============================================================================
// interpretKfppa(p) — interprétation littérale d'un score KFPPA
// Seuils cliniques (depuis js/calc.mjs, alignés sur clrKfppa) :
//   v = p * 100
//   60 ≤ v ≤ 140      → 'dans la norme'
//   20 ≤ v ≤ 180      → 'valeur limite'
//   v < 20 ou v > 180 → 'hors norme — valgus excessif'
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

  it('retourne "hors norme — valgus excessif" pour un score à 10% (très en deçà)', () => {
    expect(interpretKfppa(0.1)).toBe('hors norme — valgus excessif');
  });

  it('retourne "hors norme — valgus excessif" pour un score à 200% (très au-delà)', () => {
    expect(interpretKfppa(2.0)).toBe('hors norme — valgus excessif');
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
// Cohérence inter-fonctions : interpretKfppa et clrKfppa doivent toujours
// donner un verdict aligné (norme/limite/hors norme) pour le même score.
// ============================================================================
describe('cohérence clrKfppa ↔ interpretKfppa', () => {
  describe('zone norme (60–140%)', () => {
    [60, 100, 140].forEach((pct) => {
      it(`${pct}% : interpretKfppa "dans la norme" + clrKfppa var(--green)`, () => {
        expect(interpretKfppa(pct / 100)).toBe('dans la norme');
        expect(clrKfppa(pct / 100)).toBe('var(--green)');
      });
    });
  });

  describe('zone limite (20–60% ou 140–180%)', () => {
    [30, 50, 150, 170].forEach((pct) => {
      it(`${pct}% : interpretKfppa "valeur limite" + clrKfppa var(--orange)`, () => {
        expect(interpretKfppa(pct / 100)).toBe('valeur limite');
        expect(clrKfppa(pct / 100)).toBe('var(--orange)');
      });
    });
  });

  describe('zone hors norme (<20% ou >180%)', () => {
    [10, 190].forEach((pct) => {
      it(`${pct}% : interpretKfppa "hors norme" + clrKfppa var(--red)`, () => {
        expect(interpretKfppa(pct / 100)).toMatch(/hors norme/);
        expect(clrKfppa(pct / 100)).toBe('var(--red)');
      });
    });
  });
});
