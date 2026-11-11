import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

// V1b : plan de semelles 3D dans le bilan sport (patient fictif). Règle : dessin gardé / 3D.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('semelle 3D sport : 3D pour un bilan neuf, dessin gardé sinon', async ({ page }) => {
  test.setTimeout(280_000);
  requireCredentials();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy/.test(m.text())) erreurs.push(m.text());
  });
  let dialogues = 0;
  page.on('dialog', (d) => {
    dialogues++;
    d.dismiss();
  });
  const nom = `S3d${Date.now()}`;
  await login(page);
  // la liste des patients est chargée de façon asynchrone après la connexion : créer avant écraserait le nouveau patient
  await expect
    .poll(async () => page.evaluate(() => eval('patients').length), { timeout: 60_000 })
    .toBeGreaterThan(0);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '1990-03-10');
  await page.click('button:has-text("Créer le dossier")');
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  await page.evaluate(async (n) => {
    const i = eval('patients').findIndex((p: any) => p.nom === n);
    eval('creerBilanSport')(i, 'initial');
  }, nom);
  await page.evaluate(() => eval('nav')('pg-bilan'));
  await page.evaluate(() => eval('showSportBilanSection')(8));

  // 1. bilan neuf : bloc 3D visible, dessin masqué
  await expect(page.locator('#sp-3d-bloc')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#sp-dessin-bloc')).toBeHidden();
  await expect(page.locator('#sp-3d-resume')).toHaveText('Aucun plan enregistré.');
  await page.screenshot({ path: '/tmp/capv1b/01_bloc3d.png' });

  // 2. ouverture en grand, plan mode B, enregistrement, retour au bilan avec le résumé
  await page.click('#sp-3d-ouvrir');
  const cadre = page.frameLocator('#semelle3d-plein-ecran iframe');
  await expect(page.locator('#semelle3d-plein-ecran')).toBeVisible();
  const f = await (async () => {
    for (let i = 0; i < 100; i++) {
      const fr = page.frames().find((x) => x.url().includes('app.html'));
      if (fr) return fr;
      await page.waitForTimeout(100);
    }
    throw new Error('iframe absente');
  })();
  await f.waitForSelector('#btn-modeb', { state: 'attached' });
  await page.waitForTimeout(800);
  const att = (m: string) =>
    f.waitForFunction(
      (x) => {
        const t = document.getElementById('etat')!.textContent || '';
        return t.includes(x) || t.startsWith('erreur');
      },
      m,
      { timeout: 120_000 }
    );
  await f.evaluate(() => ((document.getElementById('p-modeb') as HTMLDetailsElement).open = true));
  await f.fill('#mb-long', '262');
  await f.evaluate(() => (document.getElementById('etat')!.textContent = '·'));
  await f.click('#btn-modeb');
  await att('affiché');
  await f.evaluate(() => {
    const r = document.querySelector(
      'input[name=type-base][value=thermoformee]'
    ) as HTMLInputElement;
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await f.evaluate(() => (document.getElementById('etat')!.textContent = '·'));
  await f.click('#btn-base');
  await att('base affichée');
  await f.selectOption('#el-type', 'coin_pronateur_posterieur');
  await f.evaluate(() => (document.getElementById('etat')!.textContent = '·'));
  await f.click('#btn-el-ajouter');
  await att('éléments appliqués');
  await page.screenshot({ path: '/tmp/capv1b/02_vue3d.png' });
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    {
      timeout: 60_000,
    }
  );
  await f.click('#btn-fermer');
  await expect(page.locator('#semelle3d-plein-ecran')).toHaveCount(0);
  await expect(page.locator('#sp-3d-resume')).toContainText('Base thermoformée');
  await expect(page.locator('#sp-3d-resume')).toContainText('Coin pronateur postérieur');
  await expect(page.locator('#sp-3d-apercu')).toBeVisible();
  const png = await page.evaluate(async () => {
    const im = document.getElementById('sp-3d-apercu') as HTMLImageElement;
    await im.decode();
    return [im.naturalWidth, im.naturalHeight, im.src.slice(0, 5)];
  });
  expect(png[0]).toBeGreaterThan(100);
  expect(png[2]).toBe('data:');
  await expect(page.locator('#sp-3d-ouvrir')).toContainText('Modifier');
  await page.screenshot({ path: '/tmp/capv1b/03_resume.png' });

  // 3. V1c : JSON + résumé dans le bilan, PNG envoyé dans Storage, aucune image data: dans ce qui est persisté
  await expect
    .poll(async () => page.evaluate(() => !!eval('currentPatient').bilanData._semelle3dPath), {
      timeout: 60_000,
    })
    .toBe(true);
  const bilan = await page.evaluate(() => {
    const bd = eval('currentPatient').bilanData;
    const sauve = Object.keys(localStorage)
      .filter((k) => /patients/i.test(k))
      .map((k) => localStorage.getItem(k) || '')
      .join('');
    const i = sauve.indexOf('_semelle3dPlan');
    return {
      plan: JSON.stringify(bd._semelle3dPlan).length,
      mode: bd._semelle3dPlan.mode,
      scan: JSON.stringify(bd._semelle3dPlan).includes('buffer'),
      path: bd._semelle3dPath,
      ramData: String(bd._semelle3d || '').slice(0, 14),
      persisteTrouve: i >= 0,
      persisteImageData: /_semelle3d"\s*:\s*"data:/.test(sauve),
    };
  });
  expect(bilan.plan).toBeLessThan(6000);
  expect(bilan.scan).toBe(false);
  expect(bilan.path).toMatch(/semelle3d_\d+\.png$/);
  expect(bilan.persisteTrouve).toBe(true);
  expect(bilan.persisteImageData).toBe(false);

  // 3b. rechargement complet : le plan, le résumé et l'image reviennent depuis Storage
  // la session est conservée au rechargement (pas de nouvelle connexion)
  await page.reload();
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          try {
            return eval('patients').length;
          } catch {
            return 0;
          }
        }),
      { timeout: 60_000 }
    )
    .toBeGreaterThan(0);
  await page.evaluate(async (n) => {
    const i = eval('patients').findIndex((p: any) => p.nom === n);
    eval('selectPatient')(eval('patients')[i]);
  }, nom);
  await page.evaluate(() => eval('nav')('pg-bilan'));
  await page.evaluate(() => eval('showSportBilanSection')(8));
  await expect(page.locator('#sp-3d-bloc')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#sp-3d-resume')).toContainText('Base thermoformée', {
    timeout: 30_000,
  });
  await expect(page.locator('#sp-3d-resume')).toContainText('Coin pronateur postérieur');
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const im = document.getElementById('sp-3d-apercu') as HTMLImageElement;
          if (!im.src) return 0;
          try {
            await im.decode();
          } catch {
            return 0;
          }
          return im.naturalWidth;
        }),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(100);
  await expect(page.locator('#sp-3d-ouvrir')).toContainText('Modifier');
  await page.screenshot({ path: '/tmp/capv1b/05_apres_rechargement.png' });

  // 3c. V1d : rapport du bilan (après rechargement : l'image vient de Storage) = image + base + éléments + recouvrement
  await page.evaluate(() => eval('nav')('pg-rapport'));
  await page.evaluate(() => eval('buildRapport')());
  await expect(page.locator('#rpt-body')).toContainText('Plan de semelles 3D', { timeout: 60_000 });
  await expect(page.locator('#rpt-body')).toContainText('Base thermoformée');
  await expect(page.locator('#rpt-body')).toContainText('Coin pronateur postérieur');
  await expect(page.locator('#rpt-body')).toContainText('Recouvrement : aucun');
  const imgRapport = await page.evaluate(async () => {
    const im = document.querySelector(
      '#rpt-body img[alt="Plan de semelles 3D"]'
    ) as HTMLImageElement | null;
    if (!im) return 0;
    await im.decode();
    return im.naturalWidth;
  });
  expect(imgRapport).toBeGreaterThan(100);
  await page.locator('#rpt-body img[alt="Plan de semelles 3D"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/capv1b/06_rapport.png' });
  await page.locator('#rpt-body li', { hasText: 'Recouvrement' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/capv1b/07_rapport_liste.png' });

  // 3d. Storage injoignable : mention rouge, la liste reste affichée
  await page.route('**/storage/v1/object/**', (r) => r.abort());
  await page.evaluate(() => {
    const bd = eval('currentPatient').bilanData;
    delete bd._semelle3d;
    delete eval('bilanData')._semelle3d;
  });
  await page.evaluate(() => eval('buildRapport')());
  await expect(page.locator('#rpt-body')).toContainText('Image du plan 3D non chargée', {
    timeout: 60_000,
  });
  await expect(page.locator('#rpt-body')).toContainText('Base thermoformée');
  await page.unroute('**/storage/v1/object/**');

  // 4. ancien bilan AVEC dessin (valeur) : dessin gardé, pas de bloc 3D
  await page.evaluate((png) => {
    // le dessin existe dans le bilan en cours (copie de travail) : l'enregistrement à la sortie le conserve
    eval('bilanData')._pieds = png;
    eval('currentPatient').bilanData = { _pieds: png };
    eval('nav')('pg-patients');
  }, PNG);
  await page.evaluate(() => eval('nav')('pg-bilan'));
  await page.evaluate(() => eval('showSportBilanSection')(8));
  await expect(page.locator('#sp-dessin-bloc')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#sp-3d-bloc')).toBeHidden();
  await page.screenshot({ path: '/tmp/capv1b/04_dessin_garde.png' });

  // 5. dessin migré dans Storage (chemin seul) : dessin gardé
  await page.evaluate(async () => {
    eval('currentPatient').bilanData = { _piedsPath: 'x/y/_pieds.png' };
    await eval('_s3dMajBlocSport')();
  });
  await expect(page.locator('#sp-dessin-bloc')).toBeVisible();
  await expect(page.locator('#sp-3d-bloc')).toBeHidden();

  // 6. ancien bilan sans dessin : 3D
  await page.evaluate(async () => {
    eval('currentPatient').bilanData = { sp_desc: 'ancien' };
    await eval('_s3dMajBlocSport')();
  });
  await expect(page.locator('#sp-3d-bloc')).toBeVisible();
  await expect(page.locator('#sp-dessin-bloc')).toBeHidden();

  expect(dialogues).toBe(0);
  expect(erreurs).toEqual([]);
});
