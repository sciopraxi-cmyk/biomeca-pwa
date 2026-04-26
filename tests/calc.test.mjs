import { describe, it, expect } from 'vitest';
import {
  interpretKfppa,
  clrKfppa,
  calcAngle3,
} from '../js/calc.mjs';

// ============================================================================
// interpretKfppa(p) — interprétation littérale d'un score KFPPA
// Seuils (depuis js/calc.mjs) :
//   v = p * 100
//   80 ≤ v ≤ 120  → 'dans la norme'
//   50 ≤ v ≤ 150  → 'valeur limite'
//   sinon         → 'hors norme — valgus excessif'
// ============================================================================
describe('interpretKfppa', () => {
  it('retourne "—" pour un score null (donnée manquante)', () => {
    expect(interpretKfppa(null)).toBe('—');
  });

  it('retourne "dans la norme" pour un score KFPPA à 100% (centre de la zone norme)', () => {
    expect(interpretKfppa(1.0)).toBe('dans la norme');
  });

  it('retourne "valeur limite" pour un score à 140% (zone limite haute)', () => {
    expect(interpretKfppa(1.4)).toBe('valeur limite');
  });

  it('retourne "hors norme — valgus excessif" pour un score à 160% (au-delà de la limite haute)', () => {
    expect(interpretKfppa(1.6)).toBe('hors norme — valgus excessif');
  });

  it('retourne "hors norme — valgus excessif" pour un score à 40% (en deçà de la limite basse)', () => {
    expect(interpretKfppa(0.4)).toBe('hors norme — valgus excessif');
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
// Note : les bornes sont strictes (p>140 et non p≥140), donc 140% pile = green.
// ============================================================================
describe('clrKfppa', () => {
  it('retourne var(--green) pour un score à 100% (zone norme)', () => {
    expect(clrKfppa(1.0)).toBe('var(--green)');
  });

  it('retourne var(--orange) pour un score à 150% (zone limite haute, |p|>140)', () => {
    expect(clrKfppa(1.5)).toBe('var(--orange)');
  });

  it('retourne var(--orange) pour un score à 40% (zone limite basse, |p|<60)', () => {
    expect(clrKfppa(0.4)).toBe('var(--orange)');
  });
});

// ============================================================================
// calcAngle3(pts) — angle ABC en degrés (loi du cosinus)
// Si moins de 3 points placés (x !== null), retourne null.
// Si 4 points placés, utilise les 3 derniers (skip du premier).
// ============================================================================
describe('calcAngle3', () => {
  it('retourne 90° pour un angle droit en B (A→B→C orthogonaux)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(calcAngle3(pts)).toBeCloseTo(90, 5);
  });

  it('retourne 180° pour 3 points alignés (angle plat en B)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    expect(calcAngle3(pts)).toBeCloseTo(180, 5);
  });

  it('retourne null si un des trois points n\'est pas placé (x null)', () => {
    const pts = [{ x: null, y: null }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    expect(calcAngle3(pts)).toBeNull();
  });
});
