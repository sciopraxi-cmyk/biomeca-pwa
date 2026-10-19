// admin-users — la liste et la résolution e-mail→compte parcourent TOUTES les pages
// (listUsers() sans argument = 50 comptes ; PostgREST plafonne à 1000 lignes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireToutesLesPages } from '../supabase/functions/_shared/pagination.ts';

const faux = (total) => async (page, parPage) => {
  const debut = (page - 1) * parPage;
  const items = Array.from({ length: Math.max(0, Math.min(parPage, total - debut)) }, (_, i) => ({
    id: debut + i,
    email: `u${debut + i}@x.fr`,
  }));
  return { items, error: null };
};

describe('lireToutesLesPages', () => {
  it('renvoie tout au-delà d’une page (2 500 éléments, pages de 1000)', async () => {
    expect(await lireToutesLesPages(faux(2500))).toHaveLength(2500);
  });
  it('total = multiple exact de la page : une page vide finale suffit', async () => {
    expect(await lireToutesLesPages(faux(2000))).toHaveLength(2000);
  });
  it('liste vide et petite liste', async () => {
    expect(await lireToutesLesPages(faux(0))).toHaveLength(0);
    expect(await lireToutesLesPages(faux(7))).toHaveLength(7);
  });
  it('stop : s’arrête dès que l’élément est trouvé', async () => {
    let appels = 0;
    const lire = async (p, n) => (appels++, faux(5000)(p, n));
    const r = await lireToutesLesPages(lire, { stop: (u) => u.id === 1500 });
    expect(appels).toBe(2);
    expect(r.some((u) => u.id === 1500)).toBe(true);
  });
  it('une erreur de page lève (jamais de liste partielle silencieuse)', async () => {
    const lire = async (p) =>
      p === 2 ? { items: [], error: { message: 'boom' } } : faux(5000)(p, 1000);
    await expect(lireToutesLesPages(lire)).rejects.toThrow('boom');
  });
  it('plafond atteint → lève au lieu de conclure faux', async () => {
    await expect(lireToutesLesPages(faux(10000), { plafondPages: 3 })).rejects.toThrow('plafond');
  });
});

describe('admin-users/index.ts', () => {
  const src = readFileSync(
    new URL('../supabase/functions/admin-users/index.ts', import.meta.url),
    'utf8'
  );
  it('plus aucun listUsers() sans pagination', () => {
    expect(src).not.toMatch(/listUsers\(\s*\)/);
    expect(src).toMatch(/listUsers\(\{ page, perPage: parPage \}\)/);
  });
  it('user_data lu par tranches ordonnées', () => {
    expect(src).toMatch(/\.order\('user_id'\)\s*\.range\(/);
  });
});
