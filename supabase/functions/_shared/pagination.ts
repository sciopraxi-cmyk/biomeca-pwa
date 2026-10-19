// Pagination des lectures Supabase côté Edge Functions (#admin-users).
//
// Pourquoi : `auth.admin.listUsers()` sans argument ne renvoie qu'UNE page
// (50 comptes) et PostgREST plafonne les lectures (max_rows = 1000). Passé ces
// seuils, la liste admin est tronquée et un compte devient « introuvable » sans
// aucune erreur. Ces helpers parcourent toutes les pages, et REFUSENT de
// conclure (exception) si le garde-fou est atteint : mieux vaut une erreur
// visible qu'une liste silencieusement incomplète.

export const PAR_PAGE_COMPTES = 1000;
export const PLAFOND_PAGES = 50; // garde-fou anti-boucle (50 000 éléments)

export type PageResultat<T> = { items: T[]; error: { message: string } | null };

/**
 * Parcourt `lirePage(page, parPage)` (page à partir de 1) jusqu'à une page
 * incomplète. Lève une Error si une page échoue ou si le plafond est atteint.
 * `stop(item)` (facultatif) arrête dès qu'un élément convient (recherche).
 */
export async function lireToutesLesPages<T>(
  lirePage: (page: number, parPage: number) => Promise<PageResultat<T>>,
  opts: { parPage?: number; plafondPages?: number; stop?: (item: T) => boolean } = {}
): Promise<T[]> {
  const parPage = opts.parPage ?? PAR_PAGE_COMPTES;
  const plafond = opts.plafondPages ?? PLAFOND_PAGES;
  const tout: T[] = [];
  for (let page = 1; page <= plafond; page++) {
    const { items, error } = await lirePage(page, parPage);
    if (error) throw new Error(error.message);
    tout.push(...items);
    if (opts.stop && items.some(opts.stop)) return tout;
    if (items.length < parPage) return tout;
  }
  throw new Error('plafond de pagination atteint (' + plafond + ' pages)');
}
