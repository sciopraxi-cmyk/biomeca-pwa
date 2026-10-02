import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { chargerDessin, journalDessin, JEUX } from './helpers/harnais-dessin.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3a — dessin des points paramétrable, sans changement d'aspect
// ═══════════════════════════════════════════════════════════════════
//
// La RÉFÉRENCE (tests/golden/dessin-279.json) est le journal des opérations
// de dessin de drawOverlay AVANT la modification (code de 5e48d82, lu via
// BIOMECA_SRC), pour trois gabarits et deux réglages de taille/opacité.
// Marqueurs synthétiques, coordonnées inventées.
//
// Pourquoi des options : au moment du rapport, les réglages globaux (taille,
// opacité des marqueurs) et le test courant ne sont plus ceux de la capture.
// Redessiner les points d'une capture exige de passer SES valeurs.

const REF = JSON.parse(readFileSync(join(RACINE, 'tests/golden/dessin-279.json'), 'utf8'));
const REGLAGES = [
  [0.55, 0.5],
  [1.2, 0.9],
];

describe('#279 étape 3a — drawOverlay', () => {
  it('F0. Sans option : exactement le dessin d’avant, pour chaque gabarit et réglage', () => {
    let n = 0;
    for (const [id, j] of Object.entries(JEUX)) {
      for (const [taille, opacite] of REGLAGES) {
        const env = chargerDessin();
        env.reglages({ taille, opacite, test: id });
        expect(journalDessin(env, j.marqueurs, j.view), `${id} ${taille}/${opacite}`).toEqual(
          REF[`${id}|${taille}|${opacite}`]
        );
        n++;
      }
    }
    expect(n).toBe(6);
  });

  it('F0b. Témoin : la référence distingue bien deux réglages', () => {
    for (const id of Object.keys(JEUX)) {
      expect(REF[`${id}|0.55|0.5`], id).not.toEqual(REF[`${id}|1.2|0.9`]);
    }
  });

  it('F1. Avec options : le dessin suit {taille, opacite, testId}, jamais les réglages globaux', () => {
    for (const [id, j] of Object.entries(JEUX)) {
      const env = chargerDessin();
      // Globaux volontairement DIFFÉRENTS de ceux demandés, test courant compris.
      env.reglages({ taille: 0.55, opacite: 0.5, test: 'mobilite' });
      const journal = journalDessin(env, j.marqueurs, j.view, {
        taille: 1.2,
        opacite: 0.9,
        testId: id,
      });
      expect(journal, id).toEqual(REF[`${id}|1.2|0.9`]);
    }
  });
});
