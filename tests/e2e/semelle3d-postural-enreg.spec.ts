import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

// V1c2 : enregistrement du plan de semelles 3D dans le bilan POSTURAL (patient fictif, mode B sans scan).
// 1 pied puis 2 pieds : JSON + résumé dans le bilan, PNG dans Storage, relecture après rechargement, réouverture.
const PNG_A =
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
async function ouvrirPosturo(page: any, nom: string) {
  await page.evaluate(async (n: string) => {
    const i = eval('patients').findIndex((p: any) => p.nom === n);
    eval('creerBilanPosturo')(i, 'initial');
  }, nom);
  await page.evaluate(() => eval('showPosturoSection')(8));
  await expect(page.locator('#po-3d-bloc')).toBeVisible({ timeout: 15_000 });
}
const trouverCadre = async (page: any) => {
  for (let i = 0; i < 100; i++) {
    const fr = page.frames().find((x: any) => x.url().includes('app.html'));
    if (fr) return fr;
    await page.waitForTimeout(100);
  }
  throw new Error('iframe absente');
};
const attendre = (f: any, m: string) =>
  f.waitForFunction(
    (x: string) => {
      const t = document.getElementById('etat')!.textContent || '';
      return t.includes(x) || t.startsWith('erreur');
    },
    m,
    { timeout: 120_000 }
  );
const raz = (f: any) => f.evaluate(() => (document.getElementById('etat')!.textContent = '·'));

async function rechargerEtRouvrirBilan(page: any, nom: string) {
  // le rechargement ne doit pas devancer l'envoi au serveur (délai de synchronisation) : attendre « Enregistré ».
  // Un envoi refusé ponctuellement par le serveur de test laisse l'état « pending » : on continue, la suite prouve le résultat.
  await expect
    .poll(async () => page.evaluate(() => eval('_etatSauv')), { timeout: 40_000 })
    .toBe('saved')
    .catch(() => {});
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
  // ouvrirBilanPosturo recharge les images depuis Storage (prefetch) avant d'afficher le bilan
  await page.evaluate(async (n: string) => {
    const i = eval('patients').findIndex((p: any) => p.nom === n);
    await eval('ouvrirBilanPosturo')(i);
  }, nom);
  await page.evaluate(() => eval('showPosturoSection')(8));
}
const largeurImage = (page: any, id: string) =>
  expect
    .poll(
      async () =>
        page.evaluate(async (i: string) => {
          const im = document.getElementById(i) as HTMLImageElement;
          if (!im.src) return 0;
          try {
            await im.decode();
          } catch {
            return 0;
          }
          return im.naturalWidth;
        }, id),
      { timeout: 30_000 }
    )
    .toBeGreaterThan(100);

function surveiller(page: any) {
  const etat = { erreurs: [] as string[], dialogues: 0 };
  page.on('pageerror', (e: any) => etat.erreurs.push(e.message));
  page.on('console', (m: any) => {
    if (m.type() === 'error' && /Content Security Policy/.test(m.text()))
      etat.erreurs.push(m.text());
  });
  page.on('dialog', (d: any) => {
    etat.dialogues++;
    d.dismiss();
  });
  return etat;
}

test('semelle 3D postural : 1 pied enregistré (Storage), relu après rechargement, rouvert', async ({
  page,
}) => {
  test.setTimeout(290_000);
  requireCredentials();
  const etat = surveiller(page);
  const nom = `S3dP1${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPosturo(page, nom);

  await page.click('#po-3d-ouvrir');
  const f = await trouverCadre(page);
  await f.waitForSelector('#btn-modeb', { state: 'attached' });
  await page.waitForTimeout(800);
  await f.evaluate(() => ((document.getElementById('p-modeb') as HTMLDetailsElement).open = true));
  await f.fill('#mb-long', '262');
  await raz(f);
  await f.click('#btn-modeb');
  await attendre(f, 'affiché');
  await f.evaluate(() => {
    const r = document.querySelector(
      'input[name=type-base][value=thermoformee]'
    ) as HTMLInputElement;
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await raz(f);
  await f.click('#btn-base');
  await attendre(f, 'base affichée');
  await f.selectOption('#el-type', 'coin_pronateur_posterieur');
  await raz(f);
  await f.click('#btn-el-ajouter');
  await attendre(f, 'éléments appliqués');
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré|impossible/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    { timeout: 120_000 }
  );
  expect(await f.textContent('#hote-msg')).toContain('Enregistré dans le bilan');
  await f.click('#btn-fermer');
  await expect(page.locator('#semelle3d-plein-ecran')).toHaveCount(0);
  await expect(page.locator('#po-3d-resume')).toContainText('Base thermoformée');
  await expect(page.locator('#po-3d-resume')).toContainText('Coin pronateur postérieur');
  await largeurImage(page, 'po-3d-apercu');
  await expect(page.locator('#po-3d-ouvrir')).toContainText('Modifier');
  await page.screenshot({ path: '/tmp/capv1c2/01_1pied_enregistre.png' });

  // Storage : chemin posé, aucune image data: persistée, plan sans scan
  await expect
    .poll(
      async () => page.evaluate(() => !!eval('currentPatient').bilanDataPosturo._semelle3dPath),
      {
        timeout: 90_000,
      }
    )
    .toBe(true);
  const bilan = await page.evaluate(() => {
    const d = eval('currentPatient').bilanDataPosturo;
    const sauve = Object.keys(localStorage)
      .filter((k) => /patients/i.test(k))
      .map((k) => localStorage.getItem(k) || '')
      .join('');
    return {
      plan: JSON.stringify(d._semelle3dPlan).length,
      scan: JSON.stringify(d._semelle3dPlan).includes('buffer'),
      path: d._semelle3dPath,
      pathG: d._semelle3dGPath || null,
      persisteTrouve: sauve.indexOf('_semelle3dPlan') >= 0,
      persisteImageData: /_semelle3dG?"\s*:\s*"data:/.test(sauve),
      sportIntact: !(eval('currentPatient').bilanData || {})._semelle3dPlan,
    };
  });
  expect(bilan.plan).toBeLessThan(6000);
  expect(bilan.scan).toBe(false);
  expect(bilan.path).toMatch(/semelle3d_?\d*\.png$|_semelle3d\.png$|semelle3d/);
  expect(bilan.pathG).toBeNull();
  expect(bilan.persisteTrouve).toBe(true);
  expect(bilan.persisteImageData).toBe(false);
  expect(bilan.sportIntact).toBe(true); // rien n'est écrit dans le bilan sport

  // rechargement complet : résumé et image reviennent de Storage
  await rechargerEtRouvrirBilan(page, nom);
  await expect(page.locator('#po-3d-bloc')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#po-3d-resume')).toContainText('Base thermoformée', {
    timeout: 30_000,
  });
  await expect(page.locator('#po-3d-resume')).toContainText('Coin pronateur postérieur');
  await largeurImage(page, 'po-3d-apercu');
  await expect(page.locator('#po-3d-ouvrir')).toContainText('Modifier');
  await page.screenshot({ path: '/tmp/capv1c2/02_1pied_apres_rechargement.png' });

  // réouverture du plan enregistré
  await page.click('#po-3d-ouvrir');
  const f2 = await trouverCadre(page);
  await f2.waitForFunction(
    () => /rouvert|impossible/.test(document.getElementById('hote-msg')?.textContent || ''),
    null,
    { timeout: 120_000 }
  );
  expect(await f2.textContent('#hote-msg')).toContain('rouvert');
  expect(await f2.locator('#liste-elements .el').count()).toBe(1);
  await f2.click('#btn-fermer');

  // un 2e patient neuf n'hérite de rien
  await page.evaluate(() => eval('nav')('pg-patients'));
  const nom2 = `S3dP1b${Date.now()}`;
  await nouveauPatient(page, nom2);
  await ouvrirPosturo(page, nom2);
  await expect(page.locator('#po-3d-resume')).toHaveText('Aucun plan enregistré.');
  await expect(page.locator('#po-3d-apercu')).toBeHidden();
  expect(
    await page.evaluate(() =>
      Object.keys(eval('currentPatient').bilanDataPosturo).filter((k) => /semelle3d/i.test(k))
    )
  ).toEqual([]);

  expect(etat.dialogues).toBe(0);
  expect(etat.erreurs).toEqual([]);
});

test('semelle 3D postural : 2 pieds enregistrés, relus, rouverts, retour à 1 pied sans reste', async ({
  page,
}) => {
  test.setTimeout(290_000);
  requireCredentials();
  const etat = surveiller(page);
  const nom = `S3dP2${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPosturo(page, nom);

  await page.click('#po-3d-ouvrir');
  const f = await trouverCadre(page);
  await f.waitForSelector('#btn-modeb2', { state: 'attached' });
  await f.waitForFunction(
    () => /Nouveau plan/.test(document.getElementById('hote-msg')?.textContent || ''),
    null,
    { timeout: 60_000 }
  );
  await f.evaluate(() => {
    const rb = document.querySelector('input[name=nbpieds][value="2"]') as HTMLInputElement;
    rb.checked = true;
    rb.dispatchEvent(new Event('change', { bubbles: true }));
    (document.getElementById('p-modeb2') as HTMLDetailsElement).open = true;
  });
  await f.fill('#g2-long-D', '265');
  await f.fill('#g2-long-G', '252');
  await raz(f);
  await f.click('#btn-modeb2');
  await attendre(f, 'génériques créés');
  await f.evaluate(() => {
    const r = document.querySelector(
      'input[name=type-base][value=thermoformee]'
    ) as HTMLInputElement;
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await raz(f);
  await f.click('#btn-base');
  await attendre(f, 'base affichée');
  await f.click('#onglets-pieds button[data-onglet="D"]');
  await attendre(f, 'base affichée');
  await f.selectOption('#el-type', 'coin_pronateur_posterieur');
  await f.selectOption('#el-portee', 'D');
  await raz(f);
  await f.click('#btn-el-ajouter');
  await attendre(f, 'base affichée');
  await f.click('#onglets-pieds button[data-onglet="3D"]');
  await attendre(f, 'base affichée');
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré|impossible/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    { timeout: 120_000 }
  );
  expect(await f.textContent('#hote-msg')).toContain('Enregistré dans le bilan');
  await f.click('#btn-fermer');
  await expect(page.locator('#po-3d-resume')).toContainText('Pied droit');
  await expect(page.locator('#po-3d-resume')).toContainText('Pied gauche');
  const resume = await page.locator('#po-3d-resume').innerText();
  expect((resume.match(/Coin pronateur postérieur/g) || []).length).toBe(1);
  await largeurImage(page, 'po-3d-apercu');
  await largeurImage(page, 'po-3d-apercu-g');
  expect(
    await page.evaluate(() => {
      const d = eval('currentPatient').bilanDataPosturo;
      return !!d._semelle3d && d._semelle3d === d._semelle3dG;
    })
  ).toBe(false);
  const geo = await page.evaluate(() => {
    const r = (i: string) => document.getElementById(i)!.getBoundingClientRect();
    const g = r('po-3d-apercu-g'),
      d = r('po-3d-apercu');
    return { gDroite: g.right, dGauche: d.left, ecartHaut: Math.abs(g.top - d.top) };
  });
  expect(geo.gDroite).toBeLessThanOrEqual(geo.dGauche); // image du pied gauche à gauche
  expect(geo.ecartHaut).toBeLessThan(2);
  await page.locator('#po-3d-bloc').scrollIntoViewIfNeeded();
  await page.locator('#po-3d-bloc').screenshot({ path: '/tmp/capv1c2/03_2pieds_bilan.png' });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const d = eval('currentPatient').bilanDataPosturo;
          return !!d._semelle3dPath && !!d._semelle3dGPath;
        }),
      { timeout: 90_000 }
    )
    .toBe(true);
  const ch = await page.evaluate(() => {
    const d = eval('currentPatient').bilanDataPosturo;
    const sauve = Object.keys(localStorage)
      .filter((k) => /patients/i.test(k))
      .map((k) => localStorage.getItem(k) || '')
      .join('');
    return {
      d: d._semelle3dPath,
      g: d._semelle3dGPath,
      plan: JSON.stringify(d._semelle3dPlan).length,
      scan: JSON.stringify(d._semelle3dPlan).includes('buffer'),
      imageData: /_semelle3dG?"\s*:\s*"data:/.test(sauve),
    };
  });
  expect(ch.d).not.toBe(ch.g);
  expect(ch.plan).toBeLessThan(9000);
  expect(ch.scan).toBe(false);
  expect(ch.imageData).toBe(false);

  await rechargerEtRouvrirBilan(page, nom);
  await expect(page.locator('#po-3d-resume')).toContainText('Pied gauche', { timeout: 30_000 });
  await largeurImage(page, 'po-3d-apercu');
  await largeurImage(page, 'po-3d-apercu-g');
  await page.screenshot({ path: '/tmp/capv1c2/04_2pieds_apres_rechargement.png' });

  await page.click('#po-3d-ouvrir');
  const f2 = await trouverCadre(page);
  await f2.waitForFunction(
    () => /rouvert|impossible/.test(document.getElementById('hote-msg')?.textContent || ''),
    null,
    { timeout: 120_000 }
  );
  expect(await f2.textContent('#hote-msg')).toContain('Plan des 2 pieds rouvert');
  const pill = await f2.textContent('#pill-long');
  expect(pill).toContain('D 265');
  expect(pill).toContain('G 252');
  expect(await f2.locator('#liste-elements .el').count()).toBe(1);
  await f2.click('#btn-fermer');

  // retour à 1 pied : l'image et le chemin du pied gauche disparaissent
  await page.evaluate(async (png) => {
    const bin = atob(png.split(',')[1]);
    const blob = new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: 'image/png' });
    await eval('_s3dEnregistrerPosturo')({
      etat: { v: 1, mode: 'B' },
      resume: { lignes: ['Base thermoformée (un pied)'] },
      png: blob,
    });
  }, PNG_A);
  const apres = await page.evaluate(() => {
    const d = eval('currentPatient').bilanDataPosturo;
    return { g: '_semelle3dG' in d, gPath: '_semelle3dGPath' in d, plan: d._semelle3dPlan.v };
  });
  expect(apres).toEqual({ g: false, gPath: false, plan: 1 });
  await expect(page.locator('#po-3d-apercu-g')).toBeHidden();
  await expect(page.locator('#po-3d-resume')).not.toContainText('Pied gauche');

  expect(etat.dialogues).toBe(0);
  expect(etat.erreurs).toEqual([]);
});
