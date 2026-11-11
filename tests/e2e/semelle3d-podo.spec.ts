import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

// V1b3 : plan de semelles 3D dans le bilan PODOPÉDIATRIE (patient fictif, onglet Traitement). Règle : schéma gardé / 3D (clé _podo_pieds).
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function nouveauPatient(page: any, nom: string) {
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
}
async function ouvrirPodo(page: any, nom: string, periode = 'IV') {
  await page.evaluate(
    async ({ n, periode }: { n: string; periode: string }) => {
      const p = eval('patients').find((x: any) => x.nom === n);
      p.bilanDataPodopediatrie = { periode, ageMonths: periode === 'II' ? 48 : 150 };
      p.currentBilanPodopediatrieSousType = 'initial';
      eval('selectPatient')(p);
      eval('nav')('pg-podopediatrie');
    },
    { n: nom, periode }
  );
  await page.evaluate(() => eval('showPodopediatrieSection')(8));
  await expect(page.locator('#podo-3d-bloc')).toBeVisible({ timeout: 15_000 });
}

test('semelle 3D podopédiatrie : 3D pour un bilan neuf, dessin gardé sinon, RAZ au changement de patient', async ({
  page,
}) => {
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
  const nom = `S3dPd${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPodo(page, nom);

  // 1. bilan neuf : bloc 3D visible, dessin masqué
  await expect(page.locator('#podo-3d-bloc')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#podo-dessin-bloc')).toBeHidden();
  await expect(page.locator('#podo-3d-resume')).toHaveText('Aucun plan enregistré.');
  await page.screenshot({ path: '/tmp/capv1b3/01_bloc3d.png' });

  // 2. ouverture en grand, mode B, enregistrement, retour avec le résumé (en mémoire seulement)
  await page.click('#podo-3d-ouvrir');
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
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    { timeout: 60_000 }
  );
  await f.click('#btn-fermer');
  await expect(page.locator('#semelle3d-plein-ecran')).toHaveCount(0);
  await expect(page.locator('#podo-3d-resume')).toContainText('Base thermoformée');
  await expect(page.locator('#podo-3d-resume')).toContainText('Coin pronateur postérieur');
  await expect(page.locator('#podo-3d-apercu')).toBeVisible();
  const png = await page.evaluate(async () => {
    const im = document.getElementById('podo-3d-apercu') as HTMLImageElement;
    await im.decode();
    return [im.naturalWidth, im.naturalHeight];
  });
  expect(png[0]).toBeGreaterThan(100);
  await expect(page.locator('#podo-3d-ouvrir')).toContainText('Modifier');
  await page.screenshot({ path: '/tmp/capv1b3/02_resume.png' });
  // V1b3 : rien n'est écrit dans le bilan à cette étape (l'enregistrement est l'étape V1c3)
  const cles = await page.evaluate(() =>
    Object.keys(eval('currentPatient').bilanDataPodopediatrie).filter((k) => /semelle3d/i.test(k))
  );
  expect(cles).toEqual([]);

  // 3. un autre patient : le plan du précédent ne fuit pas
  await page.evaluate(() => eval('nav')('pg-patients'));
  const nom2 = `S3dQd${Date.now()}`;
  await nouveauPatient(page, nom2);
  await ouvrirPodo(page, nom2);
  await expect(page.locator('#podo-3d-bloc')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#podo-3d-resume')).toHaveText('Aucun plan enregistré.');
  await expect(page.locator('#podo-3d-apercu')).toBeHidden();
  await expect(page.locator('#podo-3d-ouvrir')).not.toContainText('Modifier');

  // 4. ancien bilan AVEC dessin (image composite) : dessin gardé, pas de bloc 3D
  await page.evaluate(async (png) => {
    eval('currentPatient').bilanDataPodopediatrie = { periode: 'IV', _podo_pieds: png };
    await eval('_s3dMajBlocPodo')();
  }, PNG);
  await expect(page.locator('#podo-dessin-bloc')).toBeVisible();
  await expect(page.locator('#podo-3d-bloc')).toBeHidden();
  await page.screenshot({ path: '/tmp/capv1b3/03_dessin_garde.png' });

  // 5. dessin migré dans Storage (chemin seul) : dessin gardé
  await page.evaluate(async () => {
    eval('currentPatient').bilanDataPodopediatrie = {
      periode: 'IV',
      _podo_piedsPath: 'x/y/_podo_pieds.png',
    };
    await eval('_s3dMajBlocPodo')();
  });
  await expect(page.locator('#podo-dessin-bloc')).toBeVisible();
  await expect(page.locator('#podo-3d-bloc')).toBeHidden();

  // 6. ancien bilan sans dessin : 3D
  await page.evaluate(async () => {
    eval('currentPatient').bilanDataPodopediatrie = { periode: 'IV', podo_motif: 'ancien' };
    await eval('_s3dMajBlocPodo')();
  });
  await expect(page.locator('#podo-3d-bloc')).toBeVisible();
  await expect(page.locator('#podo-dessin-bloc')).toBeHidden();

  // 7. dessin en cours de saisie (canvas modifié, pas encore enregistré) : jamais masqué
  await page.evaluate(async () => {
    (document.getElementById('podo-pieds-canvas') as any)._userDirty = true;
    await eval('_s3dMajBlocPodo')();
  });
  await expect(page.locator('#podo-dessin-bloc')).toBeVisible();
  await expect(page.locator('#podo-3d-bloc')).toBeHidden();
  await page.evaluate(() => {
    (document.getElementById('podo-pieds-canvas') as any)._userDirty = false;
  });

  expect(dialogues).toBe(0);
  expect(erreurs).toEqual([]);
});
