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
      expect(i.titre && i.resume && i.ic).toBeTruthy();
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

describe('portail patient — présentation avant connexion', () => {
  const html = lire('patient/index.html');
  const bloc = html.slice(html.indexOf('id="ecran-fonctions"'), html.indexOf('id="ecran-mdp"'));
  it('écran branché : bouton depuis la connexion, retour, écran déclaré', () => {
    expect(html).toMatch(/id="btn-fonctions"/);
    // Placé en haut de l'écran de connexion, avant « Bienvenue », avec le libellé voulu par Joël.
    expect(html).toMatch(
      /id="btn-fonctions"[\s\S]*?Découvrez vos fonctionnalités ici[\s\S]*?<h1>Bienvenue/
    );
    expect(lire('patient/patient.js')).toMatch(/'fonctions',/);
    expect(lire('patient/patient.js')).toMatch(/btn-fonctions-retour'\)\.addEventListener/);
  });
  it('aucun tarif ni sujet praticien ; « Mes rendez-vous » marqué à venir', () => {
    expect(bloc).not.toMatch(/€|tarif|abonnement|facturation|licence/i);
    expect(bloc).toMatch(/Mes rendez-vous <em class="avenir">À venir<\/em>/);
  });
});

describe('landing — refonte design (vue praticien)', () => {
  const idx = lire('index.html');
  it('le titre est rappelé en tête de la vue praticien, avec essai et connexion à portée', () => {
    const hero = idx.slice(idx.indexOf('class="lpx-hero"'), idx.indexOf('id="lpx-bilans"'));
    expect(hero).toMatch(/Des bilans cliniques <em>complets<\/em>/);
    expect(hero).toMatch(/id="pwa-login-form"/);
    expect(hero).toMatch(/id="pwa-register-form"/);
    expect(hero).toMatch(/lpScroller\('lpx-explorer'\)/);
  });
  it('les formulaires et les 5 prix existent une seule fois (liens Stripe intacts)', () => {
    for (const id of [
      'pwa-login-form',
      'pwa-register-form',
      'pwa-reset-password-form',
      'lpp1',
      'lpp5',
    ]) {
      expect(idx.split('id="' + id + '"').length - 1, id).toBe(1);
    }
    expect(lire('js/landing.js').match(/buy\.stripe\.com/g).length).toBe(10);
  });
  it('les pages de fonctionnalité utilisent les photos des bilans déjà présentes', () => {
    const js = lire('js/landing-fonctions.js');
    for (const f of ['postural', 'sport', 'podopediatrie', 'pedicurie', 'osteopathie']) {
      expect(js).toContain('assets/bilans/illus-' + f + '.jpg');
    }
  });
});

describe('landing — fond pleine largeur', () => {
  const css = lire('css/biomeca.css');
  it('dégradé et points sont portés par la vue entière (.lpx-prat), pas par le héros borné à 1200 px', () => {
    expect(css).toMatch(/\.lpx-prat::before\{[^}]*left:0; right:0/);
    expect(css).toMatch(/\.lpx-prat::after\{[^}]*left:0; right:0/);
    expect(css).not.toMatch(/\.lpx-hero::before/);
    expect(css).not.toMatch(/\.lpx-hero::after/);
  });
});

describe('landing — confort de connexion', () => {
  const idx = lire('index.html');
  const land = lire('js/landing.js');
  const bm = lire('js/biomeca.js');
  it("case « Se souvenir de moi » : mémorise l'adresse e-mail SEULEMENT, jamais le mot de passe", () => {
    expect(idx).toMatch(/id="pwa-remember-cb" type="checkbox"/);
    expect(idx).toMatch(/Se souvenir de moi/);
    const mem = land.slice(
      land.indexOf('function lpMemoriserEmail'),
      land.indexOf('var LP_OEIL =')
    );
    expect(mem).toMatch(/localStorage\.setItem\(LP_CLE_EMAIL, String\(email\)/);
    expect(mem).not.toMatch(/pwd|password|mot de passe/i);
  });
  it('branchements : mémorisation après connexion réussie, restauration après déconnexion', () => {
    expect(bm).toMatch(/lpMemoriserEmail\(email\)/);
    expect(bm).toMatch(/lpRestaurerEmail\(\)/);
  });
  it('œil du mot de passe sur connexion, inscription et réinitialisation', () => {
    expect(land).toMatch(
      /\['pwa-pwd', 'reg-pwd', 'reset-pwd-new', 'reset-pwd-confirm'\]\.forEach\(lpInstallerOeil\)/
    );
    expect(land).toMatch(/Afficher le mot de passe/);
  });
});
