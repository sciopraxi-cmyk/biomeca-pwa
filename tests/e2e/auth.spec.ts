import { test, expect } from '@playwright/test';
import { login, logout, TEST_USER_EMAIL, requireCredentials } from './fixtures/auth';

test.describe('Authentication', () => {
  test('1.1 — login redirige vers la page Patients', async ({ page }) => {
    requireCredentials();
    await login(page);
    await expect(page.locator('#pg-patients')).toBeVisible();
    await expect(page.locator('#tn-patients')).toBeVisible();
  });

  test('1.2 — logout revient à l\'écran de login', async ({ page }) => {
    requireCredentials();
    await login(page);
    await logout(page);
    await expect(page.locator('#pwa-login')).toBeVisible();
    await expect(page.locator('#pwa-email')).toBeVisible();
  });

  test('1.3 — mauvais mot de passe affiche un message d\'erreur', async ({ page }) => {
    await login(page, {
      email: TEST_USER_EMAIL || 'podologue@hotmail.com',
      password: 'mauvais-mot-de-passe-' + Date.now(),
      expectSuccess: false,
    });
    const err = page.locator('#pwa-login-err');
    await expect(err).toBeVisible({ timeout: 15_000 });
    await expect(err).not.toBeEmpty();
    // Le login overlay reste visible.
    await expect(page.locator('#pwa-login')).toBeVisible();
  });
});
