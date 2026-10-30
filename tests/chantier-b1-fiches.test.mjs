// Chantier B, lot 1 : liste de secours (hors ligne) des catégories d'exercices. Données fictives.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { objet } from './helpers/extraire-biomeca.mjs';

// eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
const FICHES = new Function(objet('FICHES_SYSTEMES') + '\nreturn FICHES_SYSTEMES;')();

describe('chantier B lot 1 : liste de secours', () => {
  it('« Rééducation posturale » est proposée au sport ET au posturo', () => {
    expect(FICHES['reeduc-posturale'].bilans).toEqual(['sport', 'posturo']);
  });
  it("« Faim d'air » est dans les deux catégories de respiration, avec le numéro suivant", () => {
    expect(FICHES['respi-sport'].subs.at(-1)).toBe("8. Faim d'air");
    expect(FICHES['respi-posture'].subs.at(-1)).toBe("4. Faim d'air");
  });
  it('le profil dit « biomécanique / organique / articulaire » (ancien terme viscéral remplacé)', () => {
    const src = readFileSync(new URL('../js/mannequin3d/chaines.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/Biomécanique (et\/ou|\/) viscéral/);
    expect(src).toMatch(/Biomécanique \/ organique \/ articulaire/);
  });
});
