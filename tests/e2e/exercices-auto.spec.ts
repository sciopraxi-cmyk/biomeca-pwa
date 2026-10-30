import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';

// Chantier B lot 2 : « Proposer les exercices des circuits » (posturo puis sport), patient fictif supprimé à la fin.
const LIGNES = ['c1-ex1', 'c1-ex2', 'c1-ex3', 'c1-ex4', 'c2-ex1', 'c2-ex2', 'c2-ex3', 'c2-ex4'];
test('exercices proposés dans les circuits Express (parcours réel, patient fictif)', async ({
  page,
}) => {
  test.setTimeout(250_000);
  requireCredentials();
  const nom = `Exa${Date.now()}`;
  await login(page);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '1985-06-15');
  await page.selectOption('#np-civilite', 'Mme');
  await page.click('button:has-text("Créer le dossier")');
  await expect(page.locator('#modal-new-patient')).toBeHidden({ timeout: 10_000 });
  const etat = (pref: string, sport: boolean) =>
    page.evaluate(
      ([p, s, lignes]) =>
        (lignes as string[]).map((id) => {
          const libre = document.getElementById(`${p}-${id}-libre`)!;
          const row = s ? libre.closest('.exo-stack')! : libre.closest('div[style*="border"]')!;
          return Array.from(row.querySelectorAll('select.exo-sys')).map((sel: any) => {
            const pr = sel.closest('.exo-pair');
            const sub = pr && pr.querySelector('select.exo-sub');
            return (
              (sel.value ? sel.selectedOptions[0].text : '-') +
              ' > ' +
              (sub && sub.value ? sub.selectedOptions[0].text : '-')
            );
          });
        }),
      [pref, sport, LIGNES] as const
    );
  try {
    await page.evaluate(async (n) => {
      const i = patients.findIndex((p: any) => p.nom === n);
      await ouvrirBilanPosturo(i, null);
    }, nom);
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      currentPatient.bilanDataPosturo = currentPatient.bilanDataPosturo || {};
      const d = currentPatient.bilanDataPosturo;
      d.neuro4 = { 'ref-moro-o': true, 'prop-lent-g': true, 'vest-ant-g': true };
      d.mannequin3d = { v: 1, sexe: 'F', peau: 'clair', valeurs: { pied_valgus_D: 10 } };
    });
    await page.evaluate(() => showPosturoSection(8));
    await page.waitForTimeout(800);
    await page.click('#psec-8 .exo-auto-btn');
    await page.waitForSelector('#exo-auto-modal');
    // rien n'est écrit avant « Appliquer »
    expect((await etat('po', false)).flat().every((x) => x === '- > -')).toBe(true);
    page.once('dialog', (d) => d.accept());
    await page.locator('#exo-auto-modal button', { hasText: 'Appliquer' }).click();
    await page.waitForTimeout(800);
    const po = await etat('po', false);
    expect(po[0][0]).toMatch(/vestibulaire > .*canal antérieur/i);
    expect(po[1][0]).toMatch(/proprioceptif/i);
    expect(po[2][0]).toMatch(/Moro/i);
    expect(po[3][0]).toMatch(/Rééducation du pied/);
    po.forEach((l, i) => {
      expect(l[1]).toMatch(i % 2 === 0 ? /Faim d'air/ : /stress/);
      expect(l[2]).toBe('- > -');
    });
    expect(
      await page.evaluate(() => (document.getElementById('po-prog-pied-on') as any).checked)
    ).toBe(true);
    // second passage : rien n'est dupliqué
    await page.click('#psec-8 .exo-auto-btn');
    await page.waitForSelector('#exo-auto-modal');
    expect(await page.locator('#exo-auto-modal').innerText()).toContain('Déjà présent');
    await page.locator('#exo-auto-modal button', { hasText: 'Annuler' }).click();

    // sport
    await page.evaluate(async (n) => {
      const i = patients.findIndex((p: any) => p.nom === n);
      await ouvrirBilanSport(i, null);
    }, nom);
    await page.waitForTimeout(3000);
    await page.click('button:has-text("Bilan Clinique Sportif")');
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      ['sn-ref-moro-o', 'sn-vest-post-d'].forEach((id) =>
        (document.getElementById(id) as any).click()
      );
      const c: any = document.getElementById('sp-prog-circ-on');
      if (c && !c.checked) c.click();
    });
    await page.evaluate(() =>
      showSportBilanSection(
        Array.from(document.querySelectorAll('#pg-bilan .sport-section')).findIndex(
          (e: any) => e.id === 'ssec-9'
        )
      )
    );
    await page.waitForTimeout(1000);
    await page.click('#ssec-9 .exo-auto-btn');
    await page.waitForSelector('#exo-auto-modal');
    page.once('dialog', (d) => d.accept());
    await page.locator('#exo-auto-modal button', { hasText: 'Appliquer' }).click();
    await page.waitForTimeout(800);
    const sp = await etat('sp', true);
    expect(sp[0][0]).toMatch(/canal postérieur/i);
    expect(sp[1][0]).toMatch(/Moro/i);
    sp.forEach((l, i) => expect(l[1]).toMatch(i % 2 === 0 ? /Faim d'air/ : /stress/));

    // podopédiatrie : réflexes cochés, valgus du pied, chaînes du mannequin (charge à droite), respiration
    await page.evaluate(async (n) => {
      const p = patients.findIndex((x: any) => x.nom === n);
      const pat = patients[p];
      pat.bilanDataPodopediatrie = {
        periode: 'IV',
        ageMonths: 150,
        mannequin3d: {
          v: 1,
          sexe: 'M',
          peau: 'clair',
          valeurs: { poids_lr: 12, tronc_incl: 8, tete_incl: -4 },
        },
      };
      pat.currentBilanPodopediatrieSousType = 'initial';
      selectPatient(pat);
      nav('pg-podopediatrie');
    }, nom);
    await page.waitForTimeout(3000);
    await page.evaluate(() => showPodopediatrieSection(1));
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      for (const k of ['podo_reflexe_moro', 'podo_reflexe_parachute']) {
        (document.querySelector(`[data-field="${k}"]`) as any).click();
      }
    });
    await page.evaluate(() => showPodopediatrieSection(3));
    await page.waitForTimeout(500);
    await page.evaluate(() =>
      (document.querySelector('[data-field="podo_morpho_d_valgus"]') as any).click()
    );
    await page.evaluate(() => showPodopediatrieSection(8));
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const c: any = document.getElementById('pd-prog-circ-on');
      if (c && !c.checked) c.click();
      const e: any = document.getElementById('pd-prog-express-on');
      if (e && !e.checked) e.click();
    });
    await page.waitForTimeout(500);
    await page.click('#pd-circuits-tables .exo-auto-btn');
    await page.waitForSelector('#exo-auto-modal');
    await page.screenshot({ path: '/tmp/b2-podo-apercu.png' });
    const apercu = await page.locator('#exo-auto-modal').innerText();
    expect(apercu).toMatch(/parachute.*aucune fiche/);
    expect(apercu).toMatch(/ligne latérale (droite|gauche) de Myers/);
    expect(apercu).toMatch(/valgus droit \(morphostatique\)/);
    page.once('dialog', (d) => d.accept());
    await page.locator('#exo-auto-modal button', { hasText: 'Appliquer' }).click();
    await page.waitForTimeout(800);
    const pd = await page.evaluate(() =>
      ['c1-ex1', 'c1-ex2', 'c1-ex3', 'c1-ex4', 'c2-ex1', 'c2-ex2', 'c2-ex3', 'c2-ex4'].map((id) => {
        const row = document.getElementById(`pd-${id}-libre`)!.closest('.exo-stack')!;
        return Array.from(row.querySelectorAll('select.exo-sys')).map((sel: any) => {
          const pr = sel.closest('.exo-pair');
          const sub = pr && pr.querySelector('select.exo-sub');
          return (
            (sel.value ? sel.selectedOptions[0].text : '-') +
            ' > ' +
            (sub && sub.value ? sub.selectedOptions[0].text : '-')
          );
        });
      })
    );
    console.log('PODO', JSON.stringify(pd));
    const tous = pd.flat().join(' | ');
    expect(tous).toMatch(/Moro/i);
    expect(tous).toMatch(/Rééducation du pied/);
    expect(tous).toMatch(/posturale/i);
    expect(
      await page.evaluate(() => (document.getElementById('pd-prog-pied-on') as any).checked)
    ).toBe(true);
    pd.forEach((l, i) => expect(l[1]).toMatch(i % 2 === 0 ? /Faim d'air/ : /stress/));
  } finally {
    await page.evaluate(() => {
      document.getElementById('exo-auto-modal')?.remove();
      (window as any).nav('pg-patients');
    });
    await page.waitForTimeout(500);
    page.once('dialog', (d) => d.accept());
    const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
    if (await card.count()) await card.first().locator('button', { hasText: '✕' }).click();
  }
});
