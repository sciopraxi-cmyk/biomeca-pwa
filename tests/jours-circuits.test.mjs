// Jours des circuits (programme patient) : lecture, écriture, texte du rapport. Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter(cochees = {}) {
  const cases = [];
  ['sp', 'po'].forEach((p) =>
    ['express', 'chauffe'].forEach((k) =>
      [1, 2, 3, 4, 5, 6, 7].forEach((v) =>
        cases.push({
          name: p + '-jours-' + k,
          value: String(v),
          checked: !!(cochees[p + '-' + k] || []).includes(v),
        })
      )
    )
  );
  const document = {
    querySelectorAll: (sel) => {
      const m = sel.match(/name="([^"]+)"\]?(:checked)?/);
      return cases.filter((c) => c.name === m[1] && (!m[2] || c.checked));
    },
  };
  const debut = SRC_BIOMECA.indexOf('const JOURS_CIRCUITS_NOMS');
  const noms = SRC_BIOMECA.slice(debut, SRC_BIOMECA.indexOf('\n', debut) + 1);
  const corps = [
    noms,
    fonction('_lireJoursCircuits'),
    fonction('_ecrireJoursCircuits'),
    fonction('_texteJoursCircuits'),
    'return { _lireJoursCircuits, _ecrireJoursCircuits, _texteJoursCircuits };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return { f: new Function('document', corps)(document), cases };
}

describe('jours des circuits', () => {
  it('lit les jours cochés séparément pour Express et Échauffement', () => {
    const { f } = monter({ 'sp-express': [1, 3, 5], 'sp-chauffe': [2, 4], 'po-express': [7] });
    expect(f._lireJoursCircuits('sp')).toEqual({ express: [1, 3, 5], chauffe: [2, 4] });
    expect(f._lireJoursCircuits('po')).toEqual({ express: [7], chauffe: [] });
  });
  it("écrit puis relit à l'identique ; un bilan sans jours décoche tout", () => {
    const { f } = monter({ 'sp-express': [6] });
    f._ecrireJoursCircuits('sp', { express: [1, 2], chauffe: [3] });
    expect(f._lireJoursCircuits('sp')).toEqual({ express: [1, 2], chauffe: [3] });
    f._ecrireJoursCircuits('sp', undefined);
    expect(f._lireJoursCircuits('sp')).toEqual({ express: [], chauffe: [] });
  });
  it('texte du rapport : noms de jours, rien si vide, valeurs hors 1-7 ignorées', () => {
    const { f } = monter();
    expect(f._texteJoursCircuits({ express: [1, 3], chauffe: [2] })).toBe(
      'Circuits Express 1 et 2 : lundi, mercredi · Échauffement : mardi'
    );
    expect(f._texteJoursCircuits({ express: [], chauffe: [] })).toBe('');
    expect(f._texteJoursCircuits(undefined)).toBe('');
    expect(f._texteJoursCircuits({ express: [0, 8, 5], chauffe: [] })).toBe(
      'Circuits Express 1 et 2 : vendredi'
    );
  });
});
