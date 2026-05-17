import { test, expect, type Page } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

const PATIENT_FIRST_NAME = 'E2E';

async function createPatient(page: Page, lastName: string) {
  await page.click('button:has-text("Nouveau patient")');
  await expect(page.locator('#modal-new-patient')).toBeVisible();
  await page.fill('#np-nom', lastName);
  await page.fill('#np-prenom', PATIENT_FIRST_NAME);
  await page.click('button:has-text("Créer le dossier")');
  // Le modal se ferme et nav('pg-patients') est appele.
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('#pg-patients')).toBeVisible();
}

async function deletePatientByName(page: Page, lastName: string): Promise<boolean> {
  // Localise la carte patient par son nom complet et clique le bouton ✕.
  const card = page.locator('#pt-list-el > div', {
    has: page.locator(`text=${PATIENT_FIRST_NAME} ${lastName}`),
  });
  const count = await card.count();
  if (count === 0) return false;
  // confirm('Supprimer ce patient ?') s'affiche au clic
  page.once('dialog', (d) => d.accept());
  await card.first().locator('button', { hasText: '✕' }).click();
  await expect(card).toHaveCount(0, { timeout: 10_000 });
  return true;
}

test.describe('Patient — création + persistence', () => {
  // Nom unique par test (timestamp) pour eviter les collisions en prod Supabase.
  let patientLastName: string;

  test.beforeEach(async ({ page }) => {
    requireCredentials();
    patientLastName = `Test${Date.now()}`;
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup best-effort : si le patient existe encore, le supprimer pour ne pas polluer Supabase prod.
    try {
      await deletePatientByName(page, patientLastName);
    } catch {
      // ignore — page peut être déjà fermée ou en état inattendu
    }
  });

  test("2.1 — création d'un patient avec nom unique apparait dans la liste", async ({ page }) => {
    await createPatient(page, patientLastName);
    await expect(
      page.locator('#pt-list-el').getByText(`${PATIENT_FIRST_NAME} ${patientLastName}`)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('2.2 — patient persiste après reload (localStorage + Supabase)', async ({ page }) => {
    await createPatient(page, patientLastName);
    await expect(
      page.locator('#pt-list-el').getByText(`${PATIENT_FIRST_NAME} ${patientLastName}`)
    ).toBeVisible();

    await page.reload();
    // Re-attendre que l'app se reconnecte et arrive sur la page patients.
    await expect(page.locator('#pwa-login')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('#pg-patients')).toBeVisible();
    await expect(
      page.locator('#pt-list-el').getByText(`${PATIENT_FIRST_NAME} ${patientLastName}`)
    ).toBeVisible({ timeout: 15_000 });
  });

  test('2.3 — suppression du patient le retire de la liste', async ({ page }) => {
    await createPatient(page, patientLastName);
    await expect(
      page.locator('#pt-list-el').getByText(`${PATIENT_FIRST_NAME} ${patientLastName}`)
    ).toBeVisible();
    const deleted = await deletePatientByName(page, patientLastName);
    expect(deleted).toBe(true);
    await expect(
      page.locator('#pt-list-el').getByText(`${PATIENT_FIRST_NAME} ${patientLastName}`)
    ).toHaveCount(0);
  });
});
