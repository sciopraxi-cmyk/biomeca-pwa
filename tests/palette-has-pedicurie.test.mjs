import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { contraste, composer } from './helpers/contraste.mjs';

// Palette des grades HAS (Pédicurie) : titre lisible (≥ 4,5:1) sur son fond,
// et couleur jamais seul indice (symbole + bordure croissante, tous distincts).
const SRC = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');
const bloc = SRC.slice(
  SRC.indexOf('function computePedicurieGrade'),
  SRC.indexOf('function applyPedicurieGradeSuggestion')
);
const lignes = [
  ...bloc.matchAll(
    /(\d): \{ bg: 'rgba\((\d+),(\d+),(\d+),([\d.]+)\)',\s+border: '(#[0-9a-f]{6})', sym: '(.)', bw: '(\d+)px' \}/g
  ),
];

describe('palette HAS Pédicurie', () => {
  it('4 grades lus dans le code', () => {
    expect(lignes.length).toBe(4);
  });
  it('titre ≥ 4,5:1 sur le fond composé sur blanc, pour chaque grade', () => {
    for (const m of lignes) {
      const fond = composer([+m[2], +m[3], +m[4]], +m[5], '#ffffff');
      const fondHex =
        typeof fond === 'string'
          ? fond
          : '#' + fond.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
      expect(contraste(m[6], fondHex), 'grade ' + m[1]).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('symboles et épaisseurs tous distincts, épaisseur croissante', () => {
    const sym = lignes.map((m) => m[7]);
    const bw = lignes.map((m) => +m[8]);
    expect(new Set(sym).size).toBe(4);
    expect(bw).toEqual([...bw].sort((a, b) => a - b));
    expect(new Set(bw).size).toBe(4);
  });
  it('le bandeau affiche le symbole et applique l’épaisseur', () => {
    expect(bloc).toContain("palette.bw + ' solid ' + palette.border");
    expect(bloc).toContain("palette.sym + ' Grade suggéré : '");
  });
});
