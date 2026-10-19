// help-chat : plafond journalier atomique (RPC) — contenu des fichiers.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
describe('help-chat — compteur atomique', () => {
  const fn = lire('../supabase/functions/help-chat/index.ts');
  const sql = lire('../supabase/migrations/help-chat-usage-atomique.sql');
  it('la fonction passe par le RPC, plus de lecture puis upsert', () => {
    expect(fn).toContain("rpc('help_chat_incrementer'");
    expect(fn).not.toMatch(/\.from\('help_chat_usage'\)/);
    expect(fn).toMatch(/newCount === null[\s\S]*429/);
  });
  it('le SQL incrémente seulement sous la limite et est réservé au service_role', () => {
    expect(sql).toMatch(/DO UPDATE SET count = u\.count \+ 1\s+WHERE u\.count < p_limit/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
  });
});
