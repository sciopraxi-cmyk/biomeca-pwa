import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
// @ts-ignore module navigateur sans types
import { ecrireSTLBinaireScan } from '../../js/semelle3d/calcul/ecrivains_scans.js';
// @ts-ignore aide de tests sans types
import { boiteEmpreinteFictive } from '../../js/semelle3d/calcul/boite_fictive.js';
// @ts-ignore module navigateur sans types
import {
  transformerMaillage,
  rotX,
  rotZ,
  produit,
  deg,
} from '../../js/semelle3d/calcul/synthetique.js';

// Étape A (empreinte unique) : mode A avec une BOÎTE D'EMPREINTE CREUSÉE fictive générée par le code (jamais un vrai scan).
// Preuves : le type « Boîte creusée » est pré-sélectionné à l'import, le côté reste à confirmer, le plan enregistré garde le type
// (sans scan), la réouverture + réimport + « Reprendre » réapplique base + élément.
test('semelle 3D mode A : boîte creusée fictive convertie, enregistrement sans scan, reprise du plan', async ({
  page,
}) => {
  test.setTimeout(400_000);
  requireCredentials();
  const boite = boiteEmpreinteFictive({ cote: 'D', longueur_mm: 262, pas_mm: 2 });
  const mesh = transformerMaillage(boite, {
    R: produit(rotZ(deg(200)), rotX(deg(60))),
    t: [10, 20, 30],
  });
  const scan = Buffer.from(ecrireSTLBinaireScan(mesh));
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  let dialogues = 0;
  page.on('dialog', (d) => {
    dialogues++;
    d.dismiss();
  });
  const nom = `S3dA${Date.now()}`;
  await login(page);
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
  await expect(page.locator('#sp-3d-bloc')).toBeVisible({ timeout: 15_000 });

  const ouvrir = async () => {
    await page.click('#sp-3d-ouvrir');
    await expect(page.locator('#semelle3d-plein-ecran')).toBeVisible();
    for (let i = 0; i < 100; i++) {
      const fr = page.frames().find((x) => x.url().includes('app.html'));
      if (fr) {
        await fr.waitForSelector('#fichier', { state: 'attached' });
        await page.waitForTimeout(800);
        return fr;
      }
      await page.waitForTimeout(100);
    }
    throw new Error('iframe absente');
  };
  const att = (f: any, m: string) =>
    f.waitForFunction(
      (x: string) => {
        const t = document.getElementById('etat')!.textContent || '';
        return t.includes(x) || t.startsWith('erreur');
      },
      m,
      { timeout: 150_000 }
    );
  const clic = async (f: any, sel: string, attendu: string) => {
    await f.evaluate(() => (document.getElementById('etat')!.textContent = '·'));
    await f.click(sel);
    await att(f, attendu);
    expect(await f.textContent('#etat')).not.toMatch(/^erreur/);
  };
  const importerScan = async (f: any) => {
    await f.setInputFiles('#fichier', {
      name: 'boite_fictive.stl',
      mimeType: 'model/stl',
      buffer: scan,
    });
    await att(f, 'scan lu');
    // la boîte est reconnue à l'import : « Boîte creusée » pré-sélectionnée, avertissement affiché
    await expect(f.locator('input[name=typeemp][value=creusee]')).toBeChecked();
    await expect(f.locator('#info-fichier')).toContainText("boîte d'empreinte creusée");
    await f.fill('#longueur', '262');
    await clic(f, '#btn-analyser', 'affiché');
    await expect(f.locator('#prop-cote')).toContainText('miroir');
    await expect(f.locator('input[name=cote]:checked')).toHaveCount(0); // le côté n'est jamais pré-coché
    await f.check('input[name=cote][value=D]');
    await f.click('#btn-cote');
    await page.waitForTimeout(400);
  };

  // 1. plan en mode A : scan -> base -> coin pronateur -> enregistrement
  let f = await ouvrir();
  await importerScan(f);
  await page.screenshot({ path: '/tmp/capv-creusee/01_scan.png' });
  await f.evaluate(() => {
    const r = document.querySelector(
      'input[name=type-base][value=thermoformee]'
    ) as HTMLInputElement;
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await clic(f, '#btn-base', 'base affichée');
  await f.selectOption('#el-type', 'coin_pronateur_posterieur');
  await clic(f, '#btn-el-ajouter', 'éléments appliqués');
  await page.screenshot({ path: '/tmp/capv-creusee/02_plan_modeA.png' });
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    { timeout: 90_000 }
  );
  await f.click('#btn-fermer');
  await expect(page.locator('#semelle3d-plein-ecran')).toHaveCount(0);
  await expect(page.locator('#sp-3d-resume')).toContainText('Base thermoformée');
  await expect(page.locator('#sp-3d-resume')).toContainText('Coin pronateur postérieur');

  // 2. le scan n'est jamais conservé : plan = JSON court, mode A, sans maillage
  const plan = await page.evaluate(() => {
    const bd = eval('currentPatient').bilanData;
    const sauve = Object.keys(localStorage)
      .filter((k) => /patients/i.test(k))
      .map((k) => localStorage.getItem(k) || '')
      .join('');
    return {
      mode: bd._semelle3dPlan.mode,
      taille: JSON.stringify(bd._semelle3dPlan).length,
      scan: /positions|indices|buffer/.test(JSON.stringify(bd._semelle3dPlan)),
      stlDansStockage: /solid exporte|boite_fictive/.test(sauve),
      elements: bd._semelle3dPlan.elements.length,
      fiche: bd._semelle3dPlan.fiche && bd._semelle3dPlan.fiche.type_empreinte,
    };
  });
  expect(plan.mode).toBe('A');
  expect(plan.fiche).toBe('creusee');
  expect(plan.taille).toBeLessThan(6000);
  expect(plan.scan).toBe(false);
  expect(plan.stlDansStockage).toBe(false);
  expect(plan.elements).toBe(1);

  // 3. réouverture : message d'invitation + bouton « Reprendre » ; sans scan la reprise est refusée
  f = await ouvrir();
  await expect(f.locator('#btn-reprendre')).toBeVisible();
  await expect(f.locator('#hote-msg')).toContainText('réimportez le même scan');
  await f.click('#btn-reprendre');
  await expect(f.locator('#hote-msg')).toContainText('importez et analysez');
  await page.screenshot({ path: '/tmp/capv-creusee/03_reouverture.png' });

  // 4. réimport du même scan puis reprise : base + élément réappliqués
  await importerScan(f);
  // le bouton reste visible même quand la carte 1 est repliée
  await expect(f.locator('#p-scan')).not.toHaveAttribute('open', '');
  await expect(f.locator('#btn-reprendre')).toBeVisible();
  await f.evaluate(() => (document.getElementById('etat')!.textContent = '·'));
  await f.click('#btn-reprendre');
  await expect(f.locator('#hote-msg')).toContainText('réappliqué', { timeout: 150_000 });
  await expect(f.locator('#btn-reprendre')).toBeHidden();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/capv-creusee/04_plan_repris.png' });
  const apres = await f.evaluate(
    () => (document.getElementById('hote-msg') as HTMLElement).style.color
  );
  expect(apres).not.toBe('rgb(176, 48, 48)');
  // le plan réappliqué se ré-enregistre à l'identique (même résumé)
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    { timeout: 90_000 }
  );
  await f.click('#btn-fermer');
  await expect(page.locator('#sp-3d-resume')).toContainText('Base thermoformée');
  await expect(page.locator('#sp-3d-resume')).toContainText('Coin pronateur postérieur');
  const plan2 = await page.evaluate(() => eval('currentPatient').bilanData._semelle3dPlan);
  expect(plan2.mode).toBe('A');
  expect(plan2.elements.length).toBe(1);

  expect(dialogues).toBe(0);
  expect(erreurs).toEqual([]);
});
