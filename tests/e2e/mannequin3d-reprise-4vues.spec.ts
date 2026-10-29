import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

// Reprise des « captures 4 vues » sur le mannequin (parcours réel, patient fictif, toujours supprimé) :
// les angles viennent du vrai calcul de l'application (_computeFaceAngles) sur des points posés.
const pts = (d: Record<string, [number, number]>) =>
  Object.entries(d).map(([name, [x, y]]) => ({ name, x, y }));

test('reprise 4 vues : fermeture viscérale D, buste droit puis dévié', async ({ page }) => {
  test.setTimeout(300_000);
  requireCredentials();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const nom = `Reprise${Date.now()}`;
  await login(page);
  try {
    await page.click('button:has-text("Nouveau patient")');
    await page.fill('#np-nom', nom);
    await page.fill('#np-prenom', 'E2E');
    await page.fill('#np-ddn', '1985-06-15');
    await page.selectOption('#np-civilite', 'M.');
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
    // 1) bouton présent mais aucune vue analysée
    await page.click('[data-m3d-reprise]');
    await expect(page.locator('.m3d-reprise')).toContainText('Aucune vue');
    await page.click('[data-m3d-reprise]');

    const poser = async (fourchetteX: number) => {
      await page.evaluate(
        ({ mk, fx }) => {
          // eslint-disable-next-line no-undef
          const d = currentPatient.bilanDataPosturo;
          const m: any = {};
          for (const e of mk) m[e.name] = e;
          m['Fourchette sternale'] = { name: 'Fourchette sternale', x: fx, y: 230 };
          const list = Object.values(m) as any[];
          // vrai calcul de l'application sur des points posés (patient de face : D = côté gauche de l'image)
          // eslint-disable-next-line no-undef
          const angles = _computeFaceAngles(list, null);
          d._postureAnalysis = { face: { angles, markers: list } };
        },
        {
          fx: fourchetteX,
          mk: pts({
            'Acromion D': [300, 250], // épaule D BASSE
            'Acromion G': [500, 215],
            'EIAS D': [300, 410], // bassin D HAUT
            'EIAS G': [500, 445],
            Nombril: [400, 420],
            'Œil D': [370, 80],
            'Œil G': [430, 80],
            Glabelle: [400, 80],
            'Cheville D': [330, 700],
            'Cheville G': [470, 700],
          }),
        }
      );
    };

    // 2) buste droit sur la photo
    await poser(400);
    const ang: any = await page.evaluate(
      // eslint-disable-next-line no-undef
      'JSON.stringify((({fermetureViscerale,ligneEpaules,basculeBassin,inclinaisonTronc})=>({fermetureViscerale,ligneEpaules,basculeBassin,inclinaisonTronc}))(currentPatient.bilanDataPosturo._postureAnalysis.face.angles))'
    );
    expect(JSON.parse(ang).fermetureViscerale).toBe('D');
    await page.click('[data-m3d-reprise]');
    await expect(page.locator('.m3d-reprise')).toContainText('fermeture viscérale D');
    // rien n'est écrit tant que le praticien n'a pas cliqué sur « Appliquer »
    expect(await page.evaluate('JSON.stringify(_m3dPosturo.api.etat().valeurs)')).toBe('{}');
    await page.click('[data-m3d-reprise-ok]');
    const v1: any = await page.evaluate('_m3dPosturo.api.etat().valeurs');
    expect(v1.ceinture_incl).toBeGreaterThan(0); // épaule D basse
    expect(v1.bassin_bascule).toBeLessThan(0); // bassin D monté (G bas)
    expect(v1.tronc_incl).toBeUndefined();
    const a1: any = await page.evaluate('_m3dPosturo.api.angles()');
    expect(a1.epaules).toBeLessThan(-5); // épaule D plus basse sur le mannequin
    expect(a1.bassin).toBeGreaterThan(5); // bassin D plus haut sur le mannequin

    // 3) buste dévié : on repart d'un mannequin neutre
    await page.locator('.m3d-btn', { hasText: '↺ Neutre' }).click();
    await poser(440);
    await page.click('[data-m3d-reprise]');
    await expect(page.locator('.m3d-reprise')).toContainText('buste dévié');
    await page.click('[data-m3d-reprise-ok]');
    const v2: any = await page.evaluate('_m3dPosturo.api.etat().valeurs');
    expect(v2.tronc_incl).toBeGreaterThan(0); // incliné du côté D
    expect(v2.ceinture_incl).toBeUndefined();
    expect(v2.bassin_bascule).toBeUndefined();
    // l'inclinaison du buste n'entraîne AUCUNE bascule du bassin sur le mannequin
    const a2: any = await page.evaluate('_m3dPosturo.api.angles()');
    expect(Math.abs(a2.bassin)).toBeLessThan(0.5);
    expect(a2.epaules).toBeLessThan(-5);
  } finally {
    await page.evaluate(() => (window as any).nav('pg-patients'));
    await page.waitForTimeout(500);
    page.once('dialog', (d) => d.accept());
    const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
    if (await card.count()) await card.first().locator('button', { hasText: '✕' }).click();
  }
  expect(erreurs).toEqual([]);
});
