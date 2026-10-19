// Audit 19/10 — « Supprimer ce patient » supprime aussi la ligne cloud de la table
// normalisée `patients` (les bilans suivent par ON DELETE CASCADE).
import { describe, it, expect, vi } from 'vitest';
import { fonction } from './helpers/extraire-biomeca.mjs';

function monter({ cloudId, rep = { ok: true, status: 204 }, storageOk = true }) {
  const appels = [];
  const authFetch = vi.fn(async (url, opts) => {
    appels.push([url, opts?.method]);
    return rep;
  });
  const patient = { id: 42, nom: 'X', _cloudId: cloudId };
  const ctx = {
    patients: [patient],
    currentPatient: null,
    _intentionalReduction: false,
    pwaUser: { id: 'u1' },
    SUPA_URL: 'https://x.supabase.co',
    authFetch,
    confirm: () => true,
    deletePatientFolder: async () => ({ ok: storageOk }),
    savePatients: vi.fn(),
    renderPatientList: vi.fn(),
  };
  const f = new Function(
    ...Object.keys(ctx),
    `${fonction('deletePatient')}; return deletePatient;`
  )(...Object.values(ctx));
  return { f, ctx, appels };
}

describe('deletePatient — ligne cloud', () => {
  it('envoie DELETE patients?id=eq.<_cloudId> après la suppression locale', async () => {
    const { f, ctx, appels } = monter({ cloudId: 'aaaa-bbbb' });
    await f(0);
    expect(ctx.patients).toHaveLength(0);
    expect(ctx.savePatients).toHaveBeenCalled();
    expect(appels).toEqual([['https://x.supabase.co/rest/v1/patients?id=eq.aaaa-bbbb', 'DELETE']]);
  });
  it('patient jamais synchronisé (pas de _cloudId) → aucun appel', async () => {
    const { f, appels } = monter({ cloudId: undefined });
    await f(0);
    expect(appels).toEqual([]);
  });
  it('échec réseau/HTTP : la suppression locale reste acquise, pas d’exception', async () => {
    const { f, ctx } = monter({ cloudId: 'z', rep: { ok: false, status: 500 } });
    await expect(f(0)).resolves.toBeUndefined();
    expect(ctx.patients).toHaveLength(0);
  });
  it('ne vise qu’une ligne : l’identifiant est encodé et jamais vide', async () => {
    const { f, appels } = monter({ cloudId: 'a b&c=1' });
    await f(0);
    expect(appels[0][0]).toBe('https://x.supabase.co/rest/v1/patients?id=eq.a%20b%26c%3D1');
  });
});
