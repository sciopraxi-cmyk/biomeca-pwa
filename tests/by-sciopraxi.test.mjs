// « by Sciopraxi » sous chaque lockup Verticy : présent partout, et bien plus petit que Verticy.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';
import { RACINE } from './helpers/mirror-diff.mjs';

const HTML = readFileSync(join(RACINE, 'index.html'), 'utf8');
const SW = readFileSync(join(RACINE, 'service-worker.js'), 'utf8');

describe('« by Sciopraxi » — application', () => {
  it('le fichier existe et est précaché pour le mode hors connexion', () => {
    expect(existsSync(join(RACINE, 'assets/by-sciopraxi.png'))).toBe(true);
    expect(SW).toContain("'./assets/by-sciopraxi.png'");
  });
  it('une mention sous chaque lockup : 3 écrans de connexion, 2 en-têtes, 1 en-tête de rapport statique', () => {
    expect(HTML.split('assets/by-sciopraxi.png').length - 1).toBe(6 + 1); // 6 affichages + magasin d'images caché
    expect(HTML).toContain('id="imgjs-by-sciopraxi"');
  });
  it('chaque mention est plus petite que le logo Verticy voisin (hauteur ≤ 30 %)', () => {
    const lignes = HTML.split('\n');
    const mentions = lignes
      .map((l, i) => [l, i])
      .filter(([l]) => l.includes('src="assets/by-sciopraxi.png"') && l.includes('height:'));
    expect(mentions).toHaveLength(6);
    for (const [l, i] of mentions) {
      const h = Number(l.match(/height:(\d+)px/)[1]);
      const voisin =
        lignes
          .slice(Math.max(0, i - 12), i)
          .join('\n')
          .match(/assets\/verticy-(?:logo-simple|mark)\.png[^>]*height:(\d+)px/g) || [];
      const ref = Math.max(...voisin.map((v) => Number(v.match(/height:(\d+)px/)[1])));
      expect(h / ref, `ligne ${i + 1}`).toBeLessThanOrEqual(0.3);
    }
  });
});

describe('« by Sciopraxi » — rapports', () => {
  function monter(src) {
    const corps = `const document = { getElementById: (id) => (id === 'imgjs-by-sciopraxi' && ${JSON.stringify(src)} !== null ? { src: ${JSON.stringify(src)} } : null) };\n${fonction('_byScioHtml')}\nreturn _byScioHtml;`;
    // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
    return new Function(corps)();
  }
  it('mention avec « by » et le logo à la hauteur demandée', () => {
    const h = monter('http://x/assets/by-sciopraxi.png')(12);
    expect(h).toContain('>by<');
    expect(h).toContain('src="http://x/assets/by-sciopraxi.png"');
    expect(h).toContain('height:12px');
  });
  it('image absente → rien (le lockup reste inchangé)', () => {
    expect(monter(null)(12)).toBe('');
  });
  it('une URL piégée ne peut pas sortir de l’attribut', () => {
    const h = monter('http://x/a"onerror="alert(1)')(12);
    expect(h).not.toMatch(/src="[^"]*"onerror/);
    expect(h).not.toContain('"onerror');
  });
  it('les 4 rapports (posturo en direct, impression, pédicurie, podopédiatrie) appellent la mention', () => {
    expect(SRC_BIOMECA.split("_byScioHtml(12) : ''").length - 1).toBe(4);
  });
  it('les lockups des rapports gardent le logo Verticy à 48 px (la mention ne le remplace pas)', () => {
    expect(
      SRC_BIOMECA.split('style="height:48px;display:block;"').length - 1
    ).toBeGreaterThanOrEqual(4);
  });
});
