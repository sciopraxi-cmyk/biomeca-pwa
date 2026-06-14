import { describe, it, expect } from 'vitest';
import { isJwtIssueResponse } from '../js/auth-detect.mjs';

const STORAGE_SIGN_URL = 'https://xxx.supabase.co/storage/v1/object/sign/patient-media/...';
const REST_URL = 'https://xxx.supabase.co/rest/v1/user_data?email=eq.foo';
const AUTH_USER_URL = 'https://xxx.supabase.co/auth/v1/user';

describe('isJwtIssueResponse', () => {
  it('1. 400 Storage avec body « "exp" claim timestamp check failed » → true (bug #85 cas E2E)', () => {
    const body = {
      statusCode: '403',
      error: 'Unauthorized',
      message: '"exp" claim timestamp check failed',
    };
    const r = isJwtIssueResponse({ status: 400, url: STORAGE_SIGN_URL, body });
    expect(r).toBe(true);
  });

  it('2. 403 Auth avec body bad_jwt → true', () => {
    const body = { code: 'bad_jwt', message: 'JWT verification failed' };
    const r = isJwtIssueResponse({ status: 403, url: AUTH_USER_URL, body });
    expect(r).toBe(true);
  });

  it('3. 401 REST PGRST303 → true', () => {
    const body = { code: 'PGRST303', message: 'JWT expired' };
    const r = isJwtIssueResponse({ status: 401, url: REST_URL, body });
    expect(r).toBe(true);
  });

  it('4. 400 REST validation (non JWT) → false', () => {
    const body = { code: 'PGRST204', message: 'invalid request' };
    const r = isJwtIssueResponse({ status: 400, url: REST_URL, body });
    expect(r).toBe(false);
  });

  it('5. 200 OK → false (status non éligible)', () => {
    const r = isJwtIssueResponse({ status: 200, url: REST_URL, body: { ok: true } });
    expect(r).toBe(false);
  });

  it('6. 400 Storage sans body parsable → true (présomption JWT-issue, _retry one-shot protège)', () => {
    const r = isJwtIssueResponse({ status: 400, url: STORAGE_SIGN_URL, body: null });
    expect(r).toBe(true);
  });

  it('7. 403 Auth body claim sans autre mot-clé → true (couvre gotrue exp claim)', () => {
    const body = { error: 'Unauthorized', message: '"iat" claim timestamp check failed' };
    const r = isJwtIssueResponse({ status: 403, url: AUTH_USER_URL, body });
    expect(r).toBe(true);
  });

  it('8. 500 Storage server error → false (status non éligible)', () => {
    const body = { error: 'Internal Server Error' };
    const r = isJwtIssueResponse({ status: 500, url: STORAGE_SIGN_URL, body });
    expect(r).toBe(false);
  });

  it('9. 401 sans body (réseau dégradé) → false (body manquant + status auth)', () => {
    // 401 sans body parsable : on ne peut pas confirmer JWT-issue. Conservateur :
    // false (caller fait fail normal vs boucle de refresh inutile).
    const r = isJwtIssueResponse({ status: 401, url: REST_URL, body: undefined });
    expect(r).toBe(false);
  });

  it('10. 400 Auth avec body claim (cas limite Auth direct) → false (Auth retourne 401/403, pas 400)', () => {
    // Si Auth retournait 400 avec claim, statut non éligible (notre fenêtre 400
    // est strictement Storage). Garde l'invariant restrictif sur 400.
    const body = { message: '"exp" claim timestamp check failed' };
    const r = isJwtIssueResponse({ status: 400, url: AUTH_USER_URL, body });
    expect(r).toBe(false);
  });
});
