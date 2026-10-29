import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
import { choisirTableau } from './fixtures/tableau';

// Mannequin 3D dans le bilan de podologie du sport et dans la podopédiatrie (période II, III ou IV).
test('mannequin 3D : bilan sport et podopédiatrie (parcours réel, patient fictif)', async ({
  page,
}) => {
  test.setTimeout(280_000);
  requireCredentials();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      /Content Security Policy|Couldn't load texture|GLTFLoader/.test(m.text())
    )
      erreurs.push(m.text());
  });
  const requetes: string[] = [];
  page.on('request', (r) => {
    if (/assets\/mannequin\//.test(r.url()))
      requetes.push(r.url().replace(/^.*assets\/mannequin\//, ''));
  });
  const nom = `Spp${Date.now()}`;
  await login(page);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '2017-03-10');
  await page.click('button:has-text("Créer le dossier")');
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  const attendre = () =>
    page.waitForFunction(
      () => {
        const m = document.querySelector('.m3d-msg') as HTMLElement | null;
        return !!m && m.style.display === 'none';
      },
      null,
      { timeout: 90_000 }
    );

  // ── bilan de podologie du sport ──
  await page.evaluate(async (n) => {
    const i = eval('patients').findIndex((p: any) => p.nom === n);
    eval('creerBilanSport')(i, 'initial');
  }, nom);
  await page.evaluate(() => eval('nav')('pg-bilan'));
  await page.evaluate(() => eval('showSportBilanSection')(1));
  await expect(page.locator('#m3d-sport .m3d')).toBeVisible({ timeout: 30_000 });
  await attendre();
  await expect(page.locator('#m3d-sport .m3d-build')).toContainText('Mannequin 3D v');
  await expect(page.locator('#m3d-sport .m3d-btn.on', { hasText: 'Homme' })).toBeVisible();
  // le mannequin ouvre la section ; les anciennes silhouettes sont masquées
  expect(
    await page.evaluate("document.getElementById('m3d-sport').previousElementSibling.className")
  ).toContain('sport-block-title');
  const dessinVisible = await page.evaluate(() => {
    const c = document.getElementById('morpho-face') as HTMLElement;
    return getComputedStyle(c.parentElement!.parentElement!.parentElement!).visibility;
  });
  expect(dessinVisible).toBe('hidden');
  await choisirTableau(page, 'genu_valgum_bilat', '#m3d-sport');
  await choisirTableau(page, 'bascule_bassin_D', '#m3d-sport');
  await page.waitForTimeout(2500);
  const sport: any = await page.evaluate('currentPatient.bilanData ? bilanData.mannequin3d : null');
  expect(sport.valeurs.genou_valgus_D).toBeGreaterThan(0);
  expect(sport.valeurs.bassin_bascule).not.toBe(0);
  // enregistré dans le bilan du patient (autosave), pas seulement en mémoire de travail
  expect(
    await page.evaluate(
      'currentPatient.bilanData.mannequin3d && currentPatient.bilanData.mannequin3d.valeurs.genou_valgus_D'
    )
  ).toBeGreaterThan(0);
  // mécanismes lésionnels : disponibles pour l'adulte (sport)
  await expect(page.locator('#m3d-sport .m3d-meca details.m3d-hyp').first()).toBeVisible();
  await page.locator('#m3d-sport .m3d-meca input[data-meca]').first().check();
  await page.waitForTimeout(2500);
  // rapport : 4 vues + hypothèse retenue
  const rapSport: any = await page.evaluate('_m3dVuesRapport(bilanData, "adulte")');
  expect(rapSport.imgs.face).toContain('data:image/png');
  expect(rapSport.meca).toContain('Niveau de preuve');
  const html: string = await page.evaluate(
    'buildBilanPrintSection({ chaine_musculaire: "x" }, {}, [], {}, ' +
      "{imgs:{face:'data:image/png;base64,AA',dos:'data:image/png;base64,AA',profilD:'data:image/png;base64,AA',profilG:'data:image/png;base64,AA'},lignes:['Genou : valgus 9 °'],meca:''})"
  );
  expect(html).toContain('Bilan Morphostatique');
  expect(html).toContain('Genou : valgus 9 °');

  // ── podopédiatrie : mannequin enfant, un modèle par période ──
  for (const periode of ['II', 'IV']) {
    await page.evaluate(
      async ({ n, periode }) => {
        const i = eval('patients').findIndex((p: any) => p.nom === n);
        const p = eval('patients')[i];
        p.bilanDataPodopediatrie = { periode, ageMonths: periode === 'II' ? 48 : 150 };
        p.currentBilanPodopediatrieSousType = 'initial';
        eval('selectPatient')(p);
        eval('nav')('pg-podopediatrie');
      },
      { n: nom, periode }
    );
    await page.click('#pdptab-3');
    await expect(page.locator('#m3d-podo .m3d')).toBeVisible({ timeout: 30_000 });
    await attendre();
    await expect(page.locator('#m3d-podo .m3d-btn.on', { hasText: 'Garçon' })).toBeVisible();
    await expect(page.locator('#m3d-podo .m3d-btn', { hasText: 'Fille' })).toBeVisible();
    await choisirTableau(page, 'genu_valgum_bilat', '#m3d-podo');
    await page.waitForTimeout(2500);
    const podo: any = await page.evaluate('currentPatient.bilanDataPodopediatrie.mannequin3d');
    expect(podo.valeurs.genou_valgus_D).toBeGreaterThan(0);
    if (periode === 'II') {
      // enfant 14 mois–6 ans : écarts souvent physiologiques → pas de mécanismes lésionnels
      await expect(page.locator('#m3d-podo .m3d-meca')).toContainText(
        'non proposés pour cette période'
      );
      await expect(page.locator('#m3d-podo .m3d-meca input[data-meca]')).toHaveCount(0);
    } else {
      await expect(page.locator('#m3d-podo .m3d-meca details.m3d-hyp').first()).toBeVisible();
    }
    // « Retirer la peau » : l'écorché de l'enfant a sa texture (CSP de l'application)
    await page.click('#m3d-podo .m3d-btn:has-text("Retirer la peau")');
    expect(await page.evaluate('_m3dBlocs.podo.api.diag()')).toEqual({
      peauVisible: false,
      muscleVisible: true,
      textureMuscle: true,
    });
    await page.click('#m3d-podo .m3d-btn:has-text("Remettre la peau")');
    const rap: any = await page.evaluate(
      `_m3dVuesRapport(currentPatient.bilanDataPodopediatrie, "${periode}")`
    );
    expect(rap.imgs.face).toContain('data:image/png');
    if (periode === 'II') expect(rap.meca).toBe('');
    // hôte changé de période : le mannequin se remonte avec le bon modèle
    await page.evaluate(() => {
      document.getElementById('m3d-podo')!.remove();
    });
  }
  expect(
    requetes.some((r) => /^garcon_pII\.glb\.gz/.test(r)),
    requetes.join(',')
  ).toBe(true);
  expect(
    requetes.some((r) => /^garcon_pIV\.glb\.gz/.test(r)),
    requetes.join(',')
  ).toBe(true);
  expect(requetes.some((r) => /^homme\.glb\.gz/.test(r))).toBe(true);
  expect(erreurs, erreurs.join(' | ')).toEqual([]);

  // nettoyage du patient fictif
  await page.evaluate(() => (window as any).nav('pg-patients'));
  await page.waitForTimeout(500);
  page.once('dialog', (d) => d.accept());
  const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
  if (await card.count()) await card.first().locator('button', { hasText: '✕' }).click();
});
