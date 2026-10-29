import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
test("ouvrir la section morphostatique n'écrit rien (parcours réel, patiente fictive)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  requireCredentials();
  const nom = `Ouv${Date.now()}`;
  await login(page);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '1985-06-15');
  await page.selectOption('#np-civilite', 'Mme');
  await page.click('button:has-text("Créer le dossier")');
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  await page.evaluate(async (n) => {
    const i = patients.findIndex((p: any) => p.nom === n);
    await ouvrirBilanPosturo(i, null);
  }, nom);
  await page.waitForTimeout(3000);
  const taille = () =>
    page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith('bm4-'))
        .reduce((s, k) => s + (k.length + localStorage[k].length) * 2, 0)
    );
  const avant = await taille();
  const etatAvant = await page.evaluate(() =>
    JSON.stringify((currentPatient.bilanDataPosturo || {}).mannequin3d || null)
  );
  await page.evaluate(() => {
    (window as any).__w = 0;
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k.startsWith('bm4-patients')) (window as any).__w++;
      return o.call(this, k, v);
    };
  });
  await page.click('#ptab-1');
  await expect(page.locator('#m3d-posturo .m3d')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => (document.querySelector('.m3d-msg') as HTMLElement).style.display === 'none',
    null,
    { timeout: 90_000 }
  );
  await page.waitForTimeout(4000);
  const apres = await taille();
  const etatApres = await page.evaluate(() =>
    JSON.stringify((currentPatient.bilanDataPosturo || {}).mannequin3d || null)
  );
  const w = await page.evaluate(() => (window as any).__w);
  expect(w).toBe(0);
  expect(etatApres).toBe('null');
  expect(apres).toBe(avant);
  // un vrai changement, lui, est bien enregistré
  await page.locator('.m3d-btn', { hasText: 'Homme' }).click();
  await page.waitForFunction(() => !!(currentPatient.bilanDataPosturo || {}).mannequin3d, null, {
    timeout: 10_000,
  });
  await page.evaluate(() => (window as any).nav('pg-patients'));
  await page.waitForTimeout(500);
  page.once('dialog', (d) => d.accept());
  const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
  if (await card.count()) await card.first().locator('button', { hasText: '✕' }).click();
});
