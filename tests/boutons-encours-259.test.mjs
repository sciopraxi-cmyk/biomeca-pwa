import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';

// #259 — Les boutons « Continuer » et « Finaliser » du bandeau « bilan en cours »
// portent la couleur de leur type de bilan (et non celle du bilan Sport).
const SRC = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8').split('\n');

const TYPES = [
  ['Sport', 'sport'],
  ['Posturo', 'posturo'],
  ['Podopediatrie', 'podo'],
  ['Pedicurie', 'pedicurie'],
];

function ligne(motif) {
  const l = SRC.filter((x) => x.includes(motif));
  expect(l.length, motif).toBe(1);
  return l[0];
}

describe('#259 couleurs des boutons du bandeau « en cours »', () => {
  for (const [nom, c] of TYPES) {
    it(`${nom} : Continuer et Finaliser en --${c}-encre`, () => {
      expect(ligne(`onclick="ouvrirBilan${nom}(\${i},null)"`)).toContain(
        `background:var(--${c}-encre)`
      );
      expect(ligne(`onclick="finalizeBilan${nom}(\${i})"`)).toContain(
        `background:var(--${c}-encre)`
      );
    });
  }
});
