import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

// V1d-2p : plan de semelles 3D des DEUX pieds dans le bilan sport (patient fictif, mode B sans scan).
// Chaque pied a sa longueur (D 265 mm, G 252 mm) et ses éléments (coin sur le pied D seulement).
test('semelle 3D sport : 2 pieds enregistrés, relus après rechargement, rouverts', async ({
  page,
}) => {
  test.setTimeout(290_000);
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
  const nom = `S3dDeux${Date.now()}`;
  await login(page);
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

  const trouverCadre = async () => {
    for (let i = 0; i < 100; i++) {
      const fr = page.frames().find((x) => x.url().includes('app.html'));
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

  // 1. ouverture, 2 pieds génériques D 265 / G 252, base, coin sur le pied D seulement
  await page.click('#sp-3d-ouvrir');
  const f = await trouverCadre();
  await f.waitForSelector('#btn-modeb2', { state: 'attached' });
  // le module est chargé quand la page hôte a répondu « init » (message « Nouveau plan »)
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
  await page.screenshot({ path: '/tmp/capv1d2p/01_les2.png' });

  // 2. enregistrement : 2 images, 2 résumés
  await f.click('#btn-enregistrer');
  await f.waitForFunction(
    () => /Enregistré|impossible/.test(document.getElementById('hote-msg')!.textContent || ''),
    null,
    { timeout: 120_000 }
  );
  expect(await f.textContent('#hote-msg')).toContain('Enregistré dans le bilan');
  // l'onglet affiché est remis comme avant (les 2 pieds)
  expect(await f.locator('#onglets-pieds button.on').getAttribute('data-onglet')).toBe('3D');
  await f.click('#btn-fermer');
  await expect(page.locator('#semelle3d-plein-ecran')).toHaveCount(0);
  await expect(page.locator('#sp-3d-resume')).toContainText('Pied droit');
  await expect(page.locator('#sp-3d-resume')).toContainText('Pied gauche');
  const resume = await page.locator('#sp-3d-resume').innerText();
  expect((resume.match(/Coin pronateur postérieur/g) || []).length).toBe(1); // D seulement
  expect(resume.indexOf('Coin pronateur postérieur')).toBeLessThan(resume.indexOf('Pied gauche'));
  for (const id of ['sp-3d-apercu', 'sp-3d-apercu-g']) {
    const w = await page.evaluate(async (i) => {
      const im = document.getElementById(i) as HTMLImageElement;
      await im.decode();
      return im.naturalWidth;
    }, id);
    expect(w).toBeGreaterThan(100);
  }
  // les 2 images sont bien DIFFÉRENTES (pied D 265 mm avec coin, pied G 252 mm sans élément)
  const memeImage = await page.evaluate(() => {
    const bd = eval('currentPatient').bilanData;
    return !!bd._semelle3d && bd._semelle3d === bd._semelle3dG;
  });
  expect(memeImage).toBe(false);
  await page.screenshot({ path: '/tmp/capv1d2p/02_bilan.png' });

  // 3. Storage : 2 fichiers distincts, aucune image data: persistée
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const bd = eval('currentPatient').bilanData;
          return !!bd._semelle3dPath && !!bd._semelle3dGPath;
        }),
      { timeout: 90_000 }
    )
    .toBe(true);
  const chemins = await page.evaluate(() => {
    const bd = eval('currentPatient').bilanData;
    const sauve = Object.keys(localStorage)
      .filter((k) => /patients/i.test(k))
      .map((k) => localStorage.getItem(k) || '')
      .join('');
    return {
      d: bd._semelle3dPath,
      g: bd._semelle3dGPath,
      plan: JSON.stringify(bd._semelle3dPlan).length,
      scan: JSON.stringify(bd._semelle3dPlan).includes('buffer'),
      imageData: /_semelle3dG?"\s*:\s*"data:/.test(sauve),
    };
  });
  expect(chemins.d).not.toBe(chemins.g);
  expect(chemins.plan).toBeLessThan(9000);
  expect(chemins.scan).toBe(false);
  expect(chemins.imageData).toBe(false);

  // 4. rechargement complet : les 2 images reviennent de Storage
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
  await expect(page.locator('#sp-3d-resume')).toContainText('Pied gauche', { timeout: 30_000 });
  for (const id of ['sp-3d-apercu', 'sp-3d-apercu-g']) {
    await expect
      .poll(
        async () =>
          page.evaluate(async (i) => {
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
  }
  await page.screenshot({ path: '/tmp/capv1d2p/03_rechargement.png' });

  // 5. réouverture : les 2 pieds, leurs longueurs et le coin du pied D reviennent
  await page.click('#sp-3d-ouvrir');
  const f2 = await trouverCadre();
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
  expect(await f2.locator('#liste-elements .el .portee').first().textContent()).toContain(
    'Pied D seul'
  );
  await page.screenshot({ path: '/tmp/capv1d2p/04_rouvert.png' });
  await f2.click('#btn-fermer');

  // 6. retour à un seul pied : l'image et la clé du pied gauche disparaissent (pas de reste périmé)
  await page.evaluate(async () => {
    const enregistrer = eval('_s3dEnregistrerSport'); // résolu avant tout await (CSP : pas d'eval après)
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 4;
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    await enregistrer({
      etat: { v: 1, mode: 'B', cote: 'D' },
      resume: { lignes: ['x'] },
      png: blob,
    });
  });
  const apres = await page.evaluate(() => {
    const bd = eval('currentPatient').bilanData;
    return { g: bd._semelle3dG === undefined, gp: bd._semelle3dGPath === undefined };
  });
  expect(apres.g).toBe(true);
  expect(apres.gp).toBe(true);
  await expect(page.locator('#sp-3d-apercu-g')).toBeHidden();

  expect(dialogues).toBe(0);
  expect(erreurs).toEqual([]);
});
