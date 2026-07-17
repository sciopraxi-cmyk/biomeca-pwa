import { describe, it, expect } from 'vitest';
import { extractSupaKey } from '../scripts/check-prod-auth.mjs';

// Fixture au format RÉEL de la clé prod : sb_publishable_* (nouveau format
// Supabase, actif depuis la rotation post-incident #77). L'ancien format
// eyJ... (JWT legacy) reste couvert par un test dédié pour prouver que la
// regex est agnostique au format — un remplacement de format côté Supabase
// ne doit pas casser le healthcheck.
const FAKE_KEY_PUB = 'sb_publishable_abcdef1234567890abcdefgh';
const FAKE_KEY_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature';

describe('extractSupaKey', () => {
  it("extrait la clé quand le bundle contient `const SUPA_KEY = '...'`", () => {
    const src = `some prefix\nconst SUPA_KEY = '${FAKE_KEY_PUB}';\nsome suffix`;
    expect(extractSupaKey(src)).toBe(FAKE_KEY_PUB);
  });

  it('supporte les guillemets doubles', () => {
    const src = `const SUPA_KEY = "${FAKE_KEY_PUB}";`;
    expect(extractSupaKey(src)).toBe(FAKE_KEY_PUB);
  });

  it("supporte l'absence d'espaces autour du =", () => {
    const src = `const SUPA_KEY='${FAKE_KEY_PUB}';`;
    expect(extractSupaKey(src)).toBe(FAKE_KEY_PUB);
  });

  it("supporte plusieurs espaces autour du = et après 'const'", () => {
    const src = `const   SUPA_KEY   =   '${FAKE_KEY_PUB}';`;
    expect(extractSupaKey(src)).toBe(FAKE_KEY_PUB);
  });

  it('capture uniquement la première occurrence (le bundle prod n’en a qu’une)', () => {
    const src = `const SUPA_KEY = '${FAKE_KEY_PUB}';\nconst SUPA_KEY = 'second';`;
    expect(extractSupaKey(src)).toBe(FAKE_KEY_PUB);
  });

  it('throw quand SUPA_KEY est absent du bundle', () => {
    expect(() => extractSupaKey('un bundle sans la constante attendue')).toThrow(
      /SUPA_KEY introuvable/
    );
  });

  it('throw sur input vide', () => {
    expect(() => extractSupaKey('')).toThrow(/SUPA_KEY introuvable/);
  });

  it('throw sur input null / undefined (coerce → string vide → pas de match)', () => {
    expect(() => extractSupaKey(null)).toThrow(/SUPA_KEY introuvable/);
    expect(() => extractSupaKey(undefined)).toThrow(/SUPA_KEY introuvable/);
  });

  it('ignore une déclaration commentée qui ne matche pas la regex `const SUPA_KEY`', () => {
    const src = `// const SUPA_KEY_backup = 'ignored';\nconst SUPA_KEY = '${FAKE_KEY_PUB}';`;
    expect(extractSupaKey(src)).toBe(FAKE_KEY_PUB);
  });

  // Agnosticité du format : la regex ne présume rien de la forme de la clé
  // (préfixe, longueur, jeu de caractères). Un changement de format côté
  // Supabase (comme la migration récente eyJ...→sb_publishable_*) ne doit
  // pas casser le healthcheck. Ces 2 assertions prouvent qu'on extrait les
  // DEUX formats avec la même regex.
  it('agnostique au format : extrait aussi bien sb_publishable_* que eyJ... (JWT legacy)', () => {
    const srcPub = `const SUPA_KEY = '${FAKE_KEY_PUB}';`;
    const srcJwt = `const SUPA_KEY = '${FAKE_KEY_JWT}';`;
    expect(extractSupaKey(srcPub)).toBe(FAKE_KEY_PUB);
    expect(extractSupaKey(srcJwt)).toBe(FAKE_KEY_JWT);
  });
});
