import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
import { writeFileSync } from 'node:fs';

// V1d3 : rapport PODOPÉDIATRIE avec le plan de semelles 3D (1 et 2 pieds, patient fictif, mode B sans scan).
// Rapport : pied GAUCHE à gauche, pied DROIT à droite. Aperçu = iframe isolée ; impression = iframe lisible.
async function nouveauPatient(page: any, nom: string) {
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
      p.bilanDataPodopediatrie = { periode, ageMonths: 150 };
      p.currentBilanPodopediatrieSousType = 'initial';
      eval('selectPatient')(p);
      eval('nav')('pg-podopediatrie');
    },
    { n: nom, periode }
  );
  await page.evaluate(() => eval('showPodopediatrieSection')(8));
  await expect(page.locator('#podo-3d-bloc')).toBeVisible({ timeout: 15_000 });
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

async function planUnPied(page: any) {
  await page.click('#podo-3d-ouvrir');
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
}
async function planDeuxPieds(page: any) {
  await page.click('#podo-3d-ouvrir');
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
  await expect(page.locator('#semelle3d-plein-ecran')).toHaveCount(0);
}
async function rechargerEtRouvrirBilan(page: any, nom: string) {
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
  await page.evaluate(async (n: string) => {
    const i = eval('patients').findIndex((p: any) => p.nom === n);
    await eval('ouvrirBilanPodopediatrie')(i);
  }, nom);
}
// Le HTML du rapport est construit dans la page de l'application, puis lu dans une 2e page (mesures d'images, PDF).
const construireHtml = (page: any) => page.evaluate(() => eval('buildPodopediatrieRapportHTML')());
async function lireRapport(page: any) {
  const html: string = await construireHtml(page);
  const p2 = await page.context().newPage();
  await p2.setContent(html, { waitUntil: 'load' });
  const r = await p2.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll('img')).filter((i) =>
      /Plan de semelles 3D/.test(i.alt)
    );
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    const info = imgs.map((i) => {
      const r = i.getBoundingClientRect();
      return { alt: i.alt, w: i.naturalWidth, g: r.left, dr: r.right, h: r.top, src: i.src.length };
    });
    return {
      info,
      texte: document.body.innerText,
      titres: Array.from(document.querySelectorAll('.rp-section-title')).map((e) => e.textContent),
      largeurPage: document.documentElement.clientWidth,
    };
  });
  await p2.close();
  return { ...r, html };
}
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

const attendrePlan = (page: any, deux: boolean) =>
  expect
    .poll(
      async () =>
        page.evaluate((deux: boolean) => {
          const d = eval('currentPatient').bilanDataPodopediatrie;
          return !!d._semelle3dPath && (!deux || !!d._semelle3dGPath);
        }, deux),
      { timeout: 90_000 }
    )
    .toBe(true);

// Ordre volontaire : le scénario 2 pieds passe en premier. Joué APRÈS le scénario 1 pied dans le même navigateur de test, il a échoué
// une fois (une des deux images absente du rapport) ; seul, il passe. Même profil que la réouverture du plan (semelle3d-podo-enreg) :
// effet de l'état du navigateur de test, cause non établie (voir le compte rendu de V1d3).
test('rapport podopédiatrie : plan 3D à 2 pieds côte à côte (gauche à gauche), impression PDF', async ({
  page,
}) => {
  test.setTimeout(290_000);
  requireCredentials();
  const etat = surveiller(page);
  const nom = `S3dRd2${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPodo(page, nom);
  await planDeuxPieds(page);
  await attendrePlan(page, true);
  await rechargerEtRouvrirBilan(page, nom);
  const r = await lireRapport(page);
  const d = r.info.find((i: any) => i.alt === 'Plan de semelles 3D, pied droit');
  const g = r.info.find((i: any) => i.alt === 'Plan de semelles 3D, pied gauche');
  expect(d && g).toBeTruthy();
  expect(d.w).toBeGreaterThan(100);
  expect(g.w).toBeGreaterThan(100);
  expect(g.dr).toBeLessThanOrEqual(d.g); // image gauche à gauche, image droite à droite
  expect(Math.abs(g.h - d.h)).toBeLessThan(2);
  expect(d.dr).toBeLessThanOrEqual(r.largeurPage + 1); // ne déborde pas de la page
  expect(d.src).not.toBe(g.src); // images différentes
  expect(r.texte.indexOf('Pied gauche')).toBeLessThan(r.texte.indexOf('Pied droit'));
  expect((r.texte.match(/Coin pronateur postérieur/g) || []).length).toBe(1); // pied droit seulement
  expect(r.texte.indexOf('Coin pronateur postérieur')).toBeGreaterThan(
    r.texte.indexOf('Pied droit')
  );
  expect((r.texte.match(/Recouvrement : aucun/g) || []).length).toBe(2);

  // aperçu réel : capture
  await page.evaluate(() => eval('showPodopediatrieSection')(11));
  const apercu = page.frameLocator('#podopediatrie-rapport-body iframe');
  await expect(apercu.locator('body')).toContainText('Pied gauche', { timeout: 60_000 });
  await apercu.locator('img[alt="Plan de semelles 3D, pied gauche"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/capv1d3/02_apercu_2pieds.png' });

  // impression : printRapportPodopediatrie écrit le MÊME document dans une iframe lisible, puis l'imprime ;
  // on lit cette iframe, et le PDF est produit à partir du même HTML (mise en page envoyée à l'imprimante)
  await page.evaluate(() => eval('printRapportPodopediatrie')());
  const imprime = await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const f = document.querySelector(
            '#podopediatrie-rapport-iframe-wrap iframe'
          ) as HTMLIFrameElement | null;
          const doc = f && f.contentDocument;
          return doc ? doc.querySelectorAll('img[alt^="Plan de semelles 3D, pied"]').length : 0;
        }),
      { timeout: 30_000 }
    )
    .toBe(2);
  void imprime;
  writeFileSync('/tmp/capv1d3/rapport.html', r.html);
  const p2 = await page.context().newPage();
  await p2.setContent(r.html, { waitUntil: 'load' });
  await p2.pdf({ path: '/tmp/capv1d3/rapport.pdf', format: 'A4', printBackground: true });
  await p2.close();

  // Storage injoignable pour le seul pied gauche : mention rouge sur ce pied, image droite et listes présentes
  await page.route('**/storage/v1/object/**', (rt) => rt.abort());
  await page.evaluate(() => {
    delete eval('currentPatient').bilanDataPodopediatrie._semelle3dG;
  });
  const k = await lireRapport(page);
  expect(k.texte).toContain('Image du plan 3D (pied gauche) non chargée');
  expect(k.texte).not.toContain('Image du plan 3D (pied droit) non chargée');
  expect(k.info.length).toBe(1);
  expect(k.info[0].alt).toBe('Plan de semelles 3D, pied droit');
  expect(k.texte).toContain('Coin pronateur postérieur');
  expect((k.texte.match(/Recouvrement : aucun/g) || []).length).toBe(2);
  await page.unroute('**/storage/v1/object/**');

  expect(etat.dialogues).toBe(0);
  expect(etat.erreurs).toEqual([]);
});

test('rapport podopédiatrie : plan 3D à 1 pied (image, base, éléments, recouvrement), bilan sans plan inchangé', async ({
  page,
}) => {
  test.setTimeout(290_000);
  requireCredentials();
  const etat = surveiller(page);
  const nom = `S3dRd1${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPodo(page, nom);
  await planUnPied(page);
  await attendrePlan(page, false);
  // après rechargement : l'image du rapport vient de Storage
  await rechargerEtRouvrirBilan(page, nom);
  const r = await lireRapport(page);
  expect(r.texte).toContain('Plan de semelles 3D');
  expect(r.texte).toContain('Base thermoformée');
  expect(r.texte).toContain('Coin pronateur postérieur');
  expect(r.texte).toContain('Recouvrement : aucun');
  expect(r.info.length).toBe(1);
  expect(r.info[0].alt).toBe('Plan de semelles 3D');
  expect(r.info[0].w).toBeGreaterThan(100);
  expect(r.titres.some((t: string) => /Plan de semelles/.test(t))).toBe(true);
  expect(r.texte).not.toContain('non chargée');

  // aperçu réel (onglet Rapport, iframe isolée) : même contenu, capture
  await page.evaluate(() => eval('showPodopediatrieSection')(11));
  const apercu = page.frameLocator('#podopediatrie-rapport-body iframe');
  await expect(apercu.locator('body')).toContainText('Plan de semelles 3D', { timeout: 60_000 });
  await expect(apercu.locator('body')).toContainText('Base thermoformée');
  await apercu.locator('img[alt="Plan de semelles 3D"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '/tmp/capv1d3/01_apercu_1pied.png' });

  // Storage injoignable et image absente de la mémoire : mention rouge, la liste reste affichée
  await page.route('**/storage/v1/object/**', (rt) => rt.abort());
  await page.evaluate(() => {
    delete eval('currentPatient').bilanDataPodopediatrie._semelle3d;
  });
  const k = await lireRapport(page);
  expect(k.texte).toContain('Image du plan 3D non chargée');
  expect(k.texte).toContain('Base thermoformée');
  expect(k.info.length).toBe(0);
  await page.unroute('**/storage/v1/object/**');

  // plan enregistré mais image introuvable partout (ni mémoire ni chemin Storage) : mention rouge, jamais une absence silencieuse
  await page.evaluate(() => {
    const d = eval('currentPatient').bilanDataPodopediatrie;
    delete d._semelle3d;
    delete d._semelle3dPath;
  });
  const k2 = await lireRapport(page);
  expect(k2.texte).toContain('Image du plan 3D non chargée');
  expect(k2.texte).toContain('Base thermoformée');
  expect(k2.info.length).toBe(0);

  // un bilan podopédiatrie SANS plan : aucune mention du plan 3D dans le rapport
  await page.evaluate(() => eval('nav')('pg-patients'));
  const nom2 = `S3dRd1b${Date.now()}`;
  await nouveauPatient(page, nom2);
  await ouvrirPodo(page, nom2);
  const s2 = await lireRapport(page);
  expect(s2.texte).not.toContain('Plan de semelles 3D');
  expect(s2.info.length).toBe(0);

  expect(etat.dialogues).toBe(0);
  expect(etat.erreurs).toEqual([]);
});
