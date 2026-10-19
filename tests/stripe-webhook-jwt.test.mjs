// Le webhook Stripe est appelé par Stripe, sans JWT Supabase : la passerelle ne doit
// pas exiger de jeton (la signature est vérifiée dans la fonction).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const toml = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const src = readFileSync(
  new URL('../supabase/functions/stripe-webhook/index.ts', import.meta.url),
  'utf8'
);
describe('stripe-webhook', () => {
  it('verify_jwt = false dans config.toml', () => {
    const bloc = toml.split('[functions.stripe-webhook]')[1].split('\n[')[0];
    expect(bloc).toMatch(/^verify_jwt = false$/m);
  });
  it('la signature Stripe est toujours vérifiée dans la fonction', () => {
    expect(src).toContain("req.headers.get('stripe-signature')");
    expect(src).toContain('constructEventAsync');
  });
});
