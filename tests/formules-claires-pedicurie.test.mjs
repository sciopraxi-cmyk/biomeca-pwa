// « Choisir une formule » : thème clair et mention « bilan pédicurie offert » sur chaque formule.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, ligneConst } from './helpers/extraire-biomeca.mjs';

const index = readFileSync(join(RACINE, 'index.html'), 'utf8');

describe('Choisir une formule', () => {
  it('la fenêtre porte page-claire et le titre suit le thème', () => {
    expect(index).toMatch(/<div id="modal-subscribe" class="page-claire"/);
    expect(index).toMatch(/<h2 id="ms-title"[^>]*color:var\(--txt\)/);
  });
  it('aucune couleur sombre en dur dans les cartes', () => {
    const src = fonction('msRenderCards');
    expect(src).not.toMatch(/#fff|#2dd4bf|rgba\(45,212,191/);
  });
  it('chaque formule (5 cartes) affiche « Bilan pédicurie offert »', () => {
    const noms = ligneConst('MS_PLAN_NAMES');
    const corps = [
      noms,
      'const MS_PRICES_M = [1, 2, 3, 4, 5];',
      'const MS_PRICES_A = [1, 2, 3, 4, 5];',
      'const MS_DESCR = ["a", "b", "c", "d", "e"];',
      'let _msIsAnnuel = true;',
      'const _escHtml = (s) => String(s);',
      fonction('msRenderCards'),
      'return { msRenderCards, MS_PLAN_NAMES };',
    ].join('\n');
    const el = { innerHTML: '' };
    // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
    const f = new Function('document', 'pwaUser', corps)(
      { getElementById: () => el },
      {
        user_data: { licence_payee: false, formule: 'formule_5' },
      }
    );
    f.msRenderCards();
    expect(f.MS_PLAN_NAMES).toHaveLength(5);
    expect(el.innerHTML.split('Bilan pédicurie offert').length - 1).toBe(5);
  });
});
