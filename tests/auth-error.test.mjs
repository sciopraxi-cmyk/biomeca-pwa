import { describe, it, expect } from 'vitest';
import { classifyAuthError } from '../js/auth-error.mjs';

describe('classifyAuthError — vrai échec d’identifiants (message générique attendu)', () => {
  it("400 + { error_code: 'invalid_credentials' } → credentials", () => {
    expect(classifyAuthError({ status: 400, body: { error_code: 'invalid_credentials' } })).toEqual(
      {
        kind: 'credentials',
      }
    );
  });

  it("400 + { error: 'invalid_grant' } → credentials (format OAuth2 classique)", () => {
    expect(classifyAuthError({ status: 400, body: { error: 'invalid_grant' } })).toEqual({
      kind: 'credentials',
    });
  });

  it("400 + { message: 'Invalid login credentials' } → credentials (GoTrue moderne)", () => {
    expect(
      classifyAuthError({ status: 400, body: { message: 'Invalid login credentials' } })
    ).toEqual({ kind: 'credentials' });
  });

  it("400 + { msg: 'Invalid login credentials' } → credentials (GoTrue legacy)", () => {
    expect(classifyAuthError({ status: 400, body: { msg: 'Invalid login credentials' } })).toEqual({
      kind: 'credentials',
    });
  });

  it("regex insensible à la casse : 'INVALID Login Credentials' → credentials", () => {
    expect(
      classifyAuthError({ status: 400, body: { message: 'INVALID Login Credentials' } })
    ).toEqual({ kind: 'credentials' });
  });
});

describe('classifyAuthError — panne infra (message déculpabilisant + log technique)', () => {
  // Le cas historique #77 : la classification actuelle DOIT ranger cette
  // erreur en infra pour que l'utilisateur ne se croie pas fautif et pour
  // que le message technique soit remonté au log.
  it("401 + { message: 'Legacy API keys are disabled' } → infra (cas #77)", () => {
    const result = classifyAuthError({
      status: 401,
      body: { message: 'Legacy API keys are disabled' },
    });
    expect(result.kind).toBe('infra');
    expect(result.status).toBe(401);
    expect(result.technical).toBe('Legacy API keys are disabled');
  });

  it('500 + body vide → infra + technical par défaut', () => {
    const result = classifyAuthError({ status: 500, body: {} });
    expect(result).toEqual({ kind: 'infra', status: 500, technical: '(pas de message)' });
  });

  it("503 + { error_description: 'Service Unavailable' } → infra + technical extrait", () => {
    const result = classifyAuthError({
      status: 503,
      body: { error_description: 'Service Unavailable' },
    });
    expect(result).toEqual({ kind: 'infra', status: 503, technical: 'Service Unavailable' });
  });

  it('400 sans aucun marqueur credential → infra (fallback conservateur)', () => {
    const result = classifyAuthError({ status: 400, body: { message: 'Some other 400 error' } });
    expect(result.kind).toBe('infra');
    expect(result.status).toBe(400);
    expect(result.technical).toBe('Some other 400 error');
  });

  it('400 avec message credentials MAIS champ error non-credential → credentials gagne (safe default)', () => {
    // Défensif : dès qu'un marqueur credential est présent, on affiche le
    // message générique. On préfère un faux positif « credentials » (affichage
    // flou) à un faux positif « infra » (leak d'infos techniques à l'utilisateur).
    const result = classifyAuthError({
      status: 400,
      body: { error: 'other_error', message: 'Invalid login credentials' },
    });
    expect(result.kind).toBe('credentials');
  });
});

describe('classifyAuthError — inputs pathologiques', () => {
  it('body null → infra + technical par défaut', () => {
    expect(classifyAuthError({ status: 500, body: null })).toEqual({
      kind: 'infra',
      status: 500,
      technical: '(pas de message)',
    });
  });

  it('body undefined → infra + technical par défaut', () => {
    expect(classifyAuthError({ status: 500, body: undefined })).toEqual({
      kind: 'infra',
      status: 500,
      technical: '(pas de message)',
    });
  });

  it('body non-objet (string, number) → traité comme vide → infra', () => {
    expect(classifyAuthError({ status: 500, body: 'oops' })).toEqual({
      kind: 'infra',
      status: 500,
      technical: '(pas de message)',
    });
    expect(classifyAuthError({ status: 500, body: 42 })).toEqual({
      kind: 'infra',
      status: 500,
      technical: '(pas de message)',
    });
  });

  it('champs non-string dans body (défensif type-guard) → coerce en vide', () => {
    // Pas de crash si GoTrue renvoie un jour message: {...} au lieu de string.
    const result = classifyAuthError({
      status: 500,
      body: { message: { nested: true }, msg: null },
    });
    expect(result.kind).toBe('infra');
    expect(result.technical).toBe('(pas de message)');
  });
});
