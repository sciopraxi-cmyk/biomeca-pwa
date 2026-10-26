// Landing : menu « Fonctionnalités » — cohérence des données et branchements.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const src = lire('js/landing-fonctions.js');
const fenetre = {
  document: { readyState: 'complete', getElementById: () => null, addEventListener() {} },
};
fenetre.window = fenetre;
vm.runInNewContext(src, fenetre);
const R = fenetre.LP_FONCTIONS;

describe('landing — fonctionnalités', () => {
  it("5 rubriques validées par Joël, dans l'ordre", () => {
    expect(R.map((r) => r.titre)).toEqual([
      'Agenda et patients',
      'Bilans',
      'Podologie',
      'Documents et relation patient',
      'Cabinet et conformité',
    ]);
  });
  it('identifiants uniques, textes renseignés', () => {
    const ids = R.flatMap((r) => r.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const i of R.flatMap((r) => r.items)) {
      expect(i.titre && i.resume && i.icone).toBeTruthy();
      expect(i.points.length).toBeGreaterThan(0);
    }
  });
  it('les fonctions futures citées par Joël sont marquées « à venir »', () => {
    const avenir = new Set(
      R.flatMap((r) => r.items)
        .filter((i) => i.avenir)
        .map((i) => i.id)
    );
    for (const id of [
      'bilan-osteopathique',
      'dictee-ia',
      'visualisation-3d',
      'mecanismes-lesionnels',
      'exercices-automatiques',
      'semelles-3d',
      'mes-rendez-vous',
      'comptabilite',
      'multi-praticiens',
      'hds',
    ])
      expect(avenir.has(id), id).toBe(true);
  });
  it('les fonctions livrées ne sont pas marquées « à venir »', () => {
    const livre = [
      'bilan-postural',
      'bilan-sport',
      'bilan-podopediatrie',
      'bilan-pedicurie',
      'ordonnances',
      'sterilisation',
      'messagerie',
      'signature-devis',
    ];
    const m = new Map(R.flatMap((r) => r.items).map((i) => [i.id, i]));
    for (const id of livre) expect(m.get(id).avenir, id).toBeFalsy();
  });
  it('particularités des bilans', () => {
    const t = (id) => JSON.stringify(R.flatMap((r) => r.items).find((i) => i.id === id));
    expect(t('bilan-podopediatrie')).toMatch(/âge de l'enfant/);
    expect(t('bilan-sport')).toMatch(/cinématique/);
  });
});

describe('landing — branchements', () => {
  const idx = lire('index.html');
  it('menu, conteneur, script et précache', () => {
    expect(idx).toMatch(/id="lpf-menu"/);
    expect(idx).toMatch(/id="lp-fonctions"/);
    expect(idx).toMatch(/<script src="js\/landing-fonctions\.js">/);
    expect(lire('service-worker.js')).toMatch(/'\.\/js\/landing-fonctions\.js'/);
  });
  it("aucun tarif ni lien « Fonctionnalités » sur l'accueil (patient)", () => {
    const css = lire('css/biomeca.css');
    expect(css).toMatch(/#pwa-login\.lp-accueil #lp-nav-fonctions\s*\{\s*display:none/);
    expect(css).toMatch(/#pwa-login\.lp-accueil #lp-nav-tarifs\s*\{\s*display:none/);
  });
});

describe("landing — mention d'engagement des tarifs", () => {
  it('la phrase suit le curseur mensuel / annuel (jamais « sans engagement » en annuel)', () => {
    expect(lire('index.html')).toMatch(/id="lp-engagement">Mensuel : sans engagement/);
    expect(lire('index.html')).not.toMatch(/>Sans engagement — résiliez à tout moment</);
    expect(lire('js/landing.js')).toMatch(/lpAnnual \? 'Annuel : engagement de 12 mois'/);
  });
});
