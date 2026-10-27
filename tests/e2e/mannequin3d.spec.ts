import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

test('mannequin 3D dans le bilan postural (parcours réel, patiente fictive)', async ({ page }) => {
  test.setTimeout(240_000);
  requireCredentials();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const nom = `Mannequin${Date.now()}`;
  await login(page);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '1985-06-15');
  await page.selectOption('#np-civilite', 'Mme');
  await page.click('button:has-text("Créer le dossier")');
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  await page.evaluate(async (n) => {
    // eslint-disable-next-line no-undef
    const i = patients.findIndex((p: any) => p.nom === n);
    // eslint-disable-next-line no-undef
    await ouvrirBilanPosturo(i, null);
  }, nom);
  await page.click('#ptab-1');
  await expect(page.locator('#m3d-posturo .m3d')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(
    () => (document.querySelector('.m3d-msg') as HTMLElement).style.display === 'none',
    null,
    { timeout: 90_000 }
  );
  // sexe par défaut d'après la civilité
  await expect(page.locator('.m3d-btn.on', { hasText: 'Femme' })).toBeVisible();
  // curseurs : on ouvre Tronc et Bassin
  await page.locator('summary', { hasText: 'Tronc et rachis' }).click();
  await page.locator('summary', { hasText: 'Bassin' }).click();
  const champ = (lbl: string) =>
    page.locator('.m3d-row', { hasText: lbl }).locator('input[type=number]').first();
  await champ('Inclinaison du tronc').fill('-8');
  await champ('Inclinaison du tronc').dispatchEvent('change');
  await champ('Bascule du bassin').fill('7');
  await champ('Bascule du bassin').dispatchEvent('change');
  await champ('Hyperlordose').fill('15');
  await champ('Hyperlordose').dispatchEvent('change');
  await page.waitForTimeout(2500); // autosave 1 s
  const stocke = await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d');

  expect(stocke.valeurs).toEqual({ tronc_incl: -8, bassin_bascule: 7, tronc_lordose: 15 });
  await page.click('.m3d-btn:has-text("Retirer la peau")');
  await page.click('.m3d-btn:has-text("Profil G")');
  await page.waitForTimeout(500);
  // rapport
  const rap = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    await buildRapportPosturo();
    const ifr = document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement;
    const h = ifr.contentDocument!.body.innerHTML;
    const sec = Array.from(ifr.contentDocument!.querySelectorAll('.section')).find((x) =>
      x.textContent!.includes('Mannequin 3D')
    ) as HTMLElement;
    sec?.scrollIntoView();
    return {
      titre: h.includes('Mannequin 3D'),
      imgs: sec ? sec.querySelectorAll('img').length : 0,
      liste: h.includes('Hyperlordose lombaire : lordose 15'),
    };
  });

  expect(rap.titre).toBe(true);
  expect(rap.imgs).toBeGreaterThanOrEqual(4);
  expect(rap.liste).toBe(true);
  expect(erreurs, erreurs.join(' | ')).toEqual([]);
  // anciens dessins : sans dessin la zone est masquée, avec un dessin enregistré elle réapparaît telle quelle
  const hauteur = () =>
    page.evaluate(
      () =>
        (
          document.getElementById('posturo-body-canvas') as HTMLElement
        ).parentElement!.getBoundingClientRect().height
    );
  await page.evaluate("nav('pg-bilan-posturo')");
  await page.click('#ptab-1');
  await expect(page.locator('#m3d-posturo .m3d')).toBeVisible({ timeout: 20_000 });
  // les valeurs enregistrées reviennent dans les curseurs à la réouverture
  await expect(
    page
      .locator('.m3d-row', { hasText: 'Inclinaison du tronc' })
      .locator('input[type=number]')
      .first()
  ).toHaveValue('-8');
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(
          (document.getElementById('posturo-body-canvas') as HTMLElement).parentElement!
        ).visibility
    )
  ).toBe('hidden');
  expect(await hauteur()).toBeGreaterThan(100); // le canevas garde ses dimensions
  await page.evaluate(
    "currentPatient.bilanDataPosturo._bodyCanvas = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; showPosturoSection(1);"
  );
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(
          (document.getElementById('posturo-body-canvas') as HTMLElement).parentElement!
        ).visibility
    )
  ).toBe('visible');
  await expect(page.locator('#po-silh-legacy-titre')).toBeVisible();
  await page.evaluate('delete currentPatient.bilanDataPosturo._bodyCanvas');
  // membres supérieurs : deux colonnes (gauche / droite du patient)
  const bras = page.locator('details', {
    has: page.locator('summary', { hasText: 'Membres supérieurs' }),
  });
  await bras.locator('summary').click();
  await expect(bras.locator('.m3d-colhead', { hasText: 'Gauche' })).toBeVisible();
  await expect(bras.locator('.m3d-colhead', { hasText: 'Droite' })).toBeVisible();
  // dictée : le mannequin propose, le praticien valide
  await page.fill(
    '.m3d-dic textarea',
    'genu valgum bilatéral marqué, tête penchée à gauche de 6 degrés'
  );
  await page.click('.m3d-btn:has-text("Interpréter")');
  await expect(page.locator('.m3d-prop label')).toHaveCount(3);
  expect(
    await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d.valeurs.genou_valgus_D')
  ).toBeUndefined();
  await page.click('.m3d-btn:has-text("Appliquer")');
  await page.waitForTimeout(2500);
  const apres = await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d.valeurs');
  expect(apres.genou_valgus_D).toBe(11);
  expect(apres.genou_valgus_G).toBe(11);
  expect(apres.tete_incl).toBe(-6);
  // nettoyage
  await page.evaluate(() => (window as any).nav('pg-patients'));
  await page.waitForTimeout(500);
  page.once('dialog', (d) => d.accept());
  const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
  if (await card.count()) await card.first().locator('button', { hasText: '✕' }).click();
});
