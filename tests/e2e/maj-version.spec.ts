import { test, expect } from '@playwright/test';

// Page ouverte depuis longtemps : quand un nouveau service worker prend la main, un bandeau propose d'actualiser
// (sans recharger de force) ; « Mon compte » indique la version du code réellement chargé dans la page.
test('bandeau « nouvelle version » et version du code chargé', async ({ page }) => {
  await page.goto('/index.html');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // la page est maintenant contrôlée par le service worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForTimeout(500);
  await expect(page.locator('#maj-version-bandeau')).toHaveCount(0);
  // un nouveau service worker prend le contrôle (simulé)
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await expect(page.locator('#maj-version-bandeau')).toContainText('nouvelle version');
  await expect(
    page.locator('#maj-version-bandeau button', { hasText: 'Actualiser' })
  ).toBeVisible();
  // une seule fois, même si l'événement se répète
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));
  await expect(page.locator('#maj-version-bandeau')).toHaveCount(1);
  await page.locator('#maj-version-bandeau button[aria-label="Plus tard"]').click();
  await expect(page.locator('#maj-version-bandeau')).toHaveCount(0);
});
