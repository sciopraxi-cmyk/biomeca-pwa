// Garde-fou de la migration user-data-insert-delete-hardening.sql (faille
// DELETE+INSERT du 19/10/2026). Vérifie le contenu du fichier : la base elle-même
// est vérifiée à la main (voir CONTEXTE.md / audit).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const sql = readFileSync(
  new URL('../supabase/migrations/user-data-insert-delete-hardening.sql', import.meta.url),
  'utf8'
);
describe('migration user_data — durcissement INSERT/DELETE', () => {
  it('trigger BEFORE INSERT qui neutralise les 5 champs administratifs', () => {
    expect(sql).toMatch(/BEFORE INSERT ON public\.user_data/);
    for (const c of [
      'licence_payee := false',
      'formule := NULL',
      'engagement := NULL',
      'date_debut_abonnement := NULL',
      'stripe_customer_id := NULL',
    ])
      expect(sql).toContain(c);
  });
  it('ne vise que le rôle authenticated (service_role intact)', () => {
    expect(sql).toMatch(/auth\.role\(\) = 'authenticated'/);
  });
  it('supprime delete_own et fige search_path', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS delete_own ON public\.user_data/);
    expect(sql.match(/SET search_path = public, pg_temp/g).length).toBe(2);
  });
});
