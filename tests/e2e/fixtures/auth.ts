import { expect, type Page } from '@playwright/test';

export const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL ?? '';
export const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

export function requireCredentials() {
  if (!TEST_USER_EMAIL || !TEST_USER_PASSWORD) {
    throw new Error(
      'TEST_USER_EMAIL / TEST_USER_PASSWORD manquants. Copier .env.local.example en .env.local et renseigner le mot de passe.'
    );
  }
}

export async function login(
  page: Page,
  opts: { email?: string; password?: string; expectSuccess?: boolean } = {}
) {
  const email = opts.email ?? TEST_USER_EMAIL;
  const password = opts.password ?? TEST_USER_PASSWORD;
  const expectSuccess = opts.expectSuccess ?? true;

  if (expectSuccess) requireCredentials();

  await page.goto('/index.html');
  await expect(page.locator('#pwa-login')).toBeVisible();
  await page.fill('#pwa-email', email);
  await page.fill('#pwa-pwd', password);
  await page.click('#pwa-login-btn');

  if (expectSuccess) {
    await expect(page.locator('#pwa-login')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('#pg-patients')).toBeVisible();
  }
}

export async function logout(page: Page) {
  // pwaLogout() declenche un confirm() — accepter la dialog avant le clic.
  page.once('dialog', (d) => d.accept());
  // Plusieurs boutons appellent pwaLogout() — celui de la topbar (⎋ Déconnexion) suffit.
  await page
    .getByRole('button', { name: /Déconnexion/i })
    .first()
    .click();
  await expect(page.locator('#pwa-login')).toBeVisible({ timeout: 10_000 });
}
