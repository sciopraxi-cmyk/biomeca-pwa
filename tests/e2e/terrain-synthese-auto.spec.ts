import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
import { choisirTableau } from './fixtures/tableau';

// Chantier B : cochage automatique de « terrain / synthèse » depuis le mannequin 3D (posturo, sport), patient fictif.
test('terrain / synthèse coché par le mannequin et les préférences motrices (posturo + sport)', async ({
  page,
}) => {
  test.setTimeout(250_000);
  requireCredentials();
  const nom = `Ter${Date.now()}`;
  await login(page);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '1985-06-15');
  await page.selectOption('#np-civilite', 'Mme');
  await page.click('button:has-text("Créer le dossier")');
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  const coches = (pf: string) =>
    page.evaluate(
      (p) =>
        [
          'terrain-aerien',
          'terrain-terrien',
          'terrain-mixte',
          'posture-ant',
          'posture-post',
          'posture-later',
          'chaine-ext',
          'chaine-flex',
          'chaine-ferm',
          'chaine-ouv',
          'chaine-stat-opt',
          'chaine-stat-deg',
        ]
          .filter((k) => (document.getElementById(`${p}-${k}`) as any)?.checked)
          .join(','),
      pf
    );
  try {
    await page.evaluate(async (n) => {
      const i = patients.findIndex((p: any) => p.nom === n);
      await ouvrirBilanPosturo(i, null);
    }, nom);
    await page.click('#ptab-1');
    await expect(page.locator('#m3d-posturo .m3d')).toBeVisible({ timeout: 20_000 });
    await page.waitForFunction(
      () => (document.querySelector('.m3d-msg') as HTMLElement).style.display === 'none',
      null,
      { timeout: 90_000 }
    );
    expect(await coches('po')).toBe('');
    // chaîne d'ouverture = PL : seule la case « ouverture » est cochée, avec un avis discret
    await choisirTableau(page, 'chaine_ouverture_PL');
    await page.waitForTimeout(1500);
    expect(await coches('po')).toBe('chaine-ouv');
    await expect(page.locator('#avis-discret')).toContainText('ouverture (PL)');
    // fermeture = AL
    await choisirTableau(page, 'neutre');
    await choisirTableau(page, 'chaine_fermeture_AL');
    await page.waitForTimeout(1500);
    expect(await coches('po')).toContain('chaine-ferm');
    // ligne latérale droite = latéralisation globale à gauche
    await choisirTableau(page, 'neutre');
    await choisirTableau(page, 'chaine_laterale_D');
    await page.waitForTimeout(1500);
    expect(await coches('po')).toContain('posture-later');
    expect(
      await page.evaluate(
        () => (document.querySelector('input[name="po-posture-later-dir"]:checked') as any)?.value
      )
    ).toBe('gauche');
    await page.evaluate(() => showPosturoSection(7));
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('#psec-7 .stitle')!.scrollIntoView());
    await page.screenshot({ path: 'test-results/terrain-synthese.png', fullPage: false });
    await page.evaluate(() => showPosturoSection(1));
    // cases décochées par le praticien : pas recochées au changement suivant
    await page.evaluate(() => {
      ['po-chaine-ouv', 'po-chaine-ferm', 'po-posture-later'].forEach(
        (id) => ((document.getElementById(id) as any).checked = false)
      );
    });
    await choisirTableau(page, 'chaine_ouverture_PL');
    await page.waitForTimeout(1500);
    expect(await coches('po')).not.toContain('chaine-ouv');
    // préférences motrices (terrain aérien) : case « Aérien » du bloc terrain
    await page.evaluate(() => showPosturoSection(1));
    await page.evaluate(() =>
      (document.querySelector('input[name="po-pref-mot"][value="tonique-aerien"]') as any).click()
    );
    await page.waitForTimeout(1500);
    expect(await coches('po')).toContain('terrain-aerien');
    // enregistré : la case survit au rechargement du bilan (y compris « flexion », jadis non restaurée)
    await page.evaluate(() => (document.getElementById('po-chaine-flex') as any).click());
    await page.evaluate(async (n) => {
      await savePosturoBilan?.();
      const i = patients.findIndex((p: any) => p.nom === n);
      await ouvrirBilanPosturo(i, null);
    }, nom);
    await page.waitForTimeout(3000);
    expect(await coches('po')).toContain('chaine-flex');
    expect(await coches('po')).toContain('terrain-aerien');

    // sport
    await page.evaluate(async (n) => {
      const i = eval('patients').findIndex((p: any) => p.nom === n);
      eval('creerBilanSport')(i, 'initial');
    }, nom);
    await page.evaluate(() => eval('nav')('pg-bilan'));
    await page.evaluate(() => eval('showSportBilanSection')(1));
    await expect(page.locator('#m3d-sport .m3d')).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(
      () => {
        const m = document.querySelector('#m3d-sport .m3d-msg') as HTMLElement | null;
        return !!m && m.style.display === 'none';
      },
      null,
      { timeout: 90_000 }
    );
    expect(await coches('sp')).toBe('');
    await choisirTableau(page, 'chaine_laterale_G', '#m3d-sport');
    await page.waitForTimeout(1500);
    expect(await coches('sp')).toBe('posture-later');
    expect(
      await page.evaluate(
        () => (document.querySelector('input[name="sp-posture-later-dir"]:checked') as any)?.value
      )
    ).toBe('droite');
    expect(await page.evaluate(() => bilanData.posture_later)).toBe(true);
  } finally {
    await page.evaluate(() => (window as any).nav('pg-patients'));
    await page.waitForTimeout(500);
    page.once('dialog', (d) => d.accept());
    const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
    if (await card.count()) {
      await card.first().locator('button', { hasText: '✕' }).click();
      await expect(card).toHaveCount(0, { timeout: 10_000 });
      await page.waitForTimeout(4000);
    }
  }
});
