import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
import { writeFileSync } from 'node:fs';

// V1d2 : rapport POSTURAL avec le plan de semelles 3D (1 et 2 pieds, patient fictif, mode B sans scan).
// Rapport : pied GAUCHE à gauche, pied DROIT à droite. Le rapport vit dans une iframe (#rapport-posturo-body).
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

async function planUnPied(page: any) {
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
}
async function planDeuxPieds(page: any) {
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
    await eval('ouvrirBilanPosturo')(i);
  }, nom);
}
// Lit le rapport dans son iframe : texte, images (alt, largeur, position) et sections.
const lireRapport = (page: any) =>
  page.evaluate(async () => {
    const ifr = document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement;
    const doc = ifr.contentDocument!;
    const imgs = Array.from(doc.querySelectorAll('img')).filter((i) =>
      /Plan de semelles 3D/.test(i.alt)
    );
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    const info = imgs.map((i) => {
      const r = i.getBoundingClientRect();
      return { alt: i.alt, w: i.naturalWidth, g: r.left, dr: r.right, h: r.top, src: i.src.length };
    });
    const texte = doc.body.innerText;
    return {
      info,
      texte,
      titres: Array.from(doc.querySelectorAll('.section-label')).map((e) => e.textContent),
      largeurPage: doc.documentElement.clientWidth,
      html:
        '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
        doc.documentElement.innerHTML.replace(/^<head>[\s\S]*?<\/head>/, '') +
        '</html>',
    };
  });
async function construireRapport(page: any) {
  await page.evaluate(() => eval('buildRapportPosturo')());
  await expect(page.locator('#rapport-posturo-body iframe')).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => (await lireRapport(page)).texte.length, { timeout: 60_000 })
    .toBeGreaterThan(50);
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

test('rapport postural : plan 3D à 1 pied (image, base, éléments, recouvrement), bilan sans plan inchangé', async ({
  page,
}) => {
  test.setTimeout(290_000);
  requireCredentials();
  const etat = surveiller(page);
  const nom = `S3dR1${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPosturo(page, nom);
  await planUnPied(page);
  await expect
    .poll(
      async () => page.evaluate(() => !!eval('currentPatient').bilanDataPosturo._semelle3dPath),
      {
        timeout: 90_000,
      }
    )
    .toBe(true);
  // après rechargement : l'image du rapport vient de Storage
  await rechargerEtRouvrirBilan(page, nom);
  await construireRapport(page);
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
  await page.locator('#rapport-posturo-body iframe').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const d = (document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement)
      .contentDocument!;
    const im = Array.from(d.querySelectorAll('img')).find((i) =>
      /Plan de semelles 3D/.test(i.alt)
    )!;
    im.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: '/tmp/capv1d2/01_rapport_1pied.png' });

  // Storage injoignable et image absente de la mémoire : mention rouge, la liste reste affichée
  await page.route('**/storage/v1/object/**', (rt) => rt.abort());
  await page.evaluate(() => {
    delete eval('currentPatient').bilanDataPosturo._semelle3d;
  });
  await page.evaluate(() => eval('nav')('pg-bilan-posturo'));
  await construireRapport(page);
  const k = await lireRapport(page);
  expect(k.texte).toContain('Image du plan 3D non chargée');
  expect(k.texte).toContain('Base thermoformée');
  expect(k.info.length).toBe(0);
  await page.unroute('**/storage/v1/object/**');

  // plan enregistré mais image introuvable partout (ni mémoire ni chemin Storage) : mention rouge, jamais une absence silencieuse
  await page.evaluate(() => {
    const d = eval('currentPatient').bilanDataPosturo;
    delete d._semelle3d;
    delete d._semelle3dPath;
  });
  await page.evaluate(() => eval('nav')('pg-bilan-posturo'));
  await construireRapport(page);
  const k2 = await lireRapport(page);
  expect(k2.texte).toContain('Image du plan 3D non chargée');
  expect(k2.texte).toContain('Base thermoformée');
  expect(k2.info.length).toBe(0);

  // un bilan postural SANS plan : aucune mention du plan 3D dans le rapport
  await page.evaluate(() => eval('nav')('pg-patients'));
  const nom2 = `S3dR1b${Date.now()}`;
  await nouveauPatient(page, nom2);
  await ouvrirPosturo(page, nom2);
  await page.evaluate(() => eval('nav')('pg-bilan-posturo'));
  await construireRapport(page);
  const s = await lireRapport(page);
  expect(s.texte).not.toContain('Plan de semelles 3D');
  expect(s.info.length).toBe(0);

  expect(etat.dialogues).toBe(0);
  expect(etat.erreurs).toEqual([]);
});

test('rapport postural : plan 3D à 2 pieds côte à côte (gauche à gauche), impression PDF', async ({
  page,
}) => {
  test.setTimeout(290_000);
  requireCredentials();
  const etat = surveiller(page);
  const nom = `S3dR2${Date.now()}`;
  await login(page);
  await nouveauPatient(page, nom);
  await ouvrirPosturo(page, nom);
  await planDeuxPieds(page);
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
  await rechargerEtRouvrirBilan(page, nom);
  await construireRapport(page);
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
  await page.evaluate(() => {
    const doc = (document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement)
      .contentDocument!;
    const im = Array.from(doc.querySelectorAll('img')).find((i) => /pied gauche/.test(i.alt))!;
    im.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: '/tmp/capv1d2/02_rapport_2pieds.png' });

  // impression : printRapportPosturo imprime l'iframe ; window.print de l'iframe est remplacé, le PDF est produit
  // à partir du même document (la même mise en page que celle envoyée à l'imprimante)
  await page.evaluate(() => {
    const w = (document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement)
      .contentWindow as any;
    w.__imprime = 0;
    w.print = () => {
      w.__imprime++;
    };
  });
  await page.evaluate(() => eval('printRapportPosturo')());
  expect(
    await page.evaluate(
      () =>
        (
          (document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement)
            .contentWindow as any
        ).__imprime
    )
  ).toBe(1);
  writeFileSync('/tmp/capv1d2/rapport.html', r.html);
  const p2 = await page.context().newPage();
  await p2.setContent(r.html, { waitUntil: 'load' });
  await p2.pdf({ path: '/tmp/capv1d2/rapport.pdf', format: 'A4', printBackground: true });
  await p2.close();

  // Storage injoignable pour le seul pied gauche : mention rouge sur ce pied, image droite et listes présentes
  await page.route('**/storage/v1/object/**', (rt) => rt.abort());
  await page.evaluate(() => {
    delete eval('currentPatient').bilanDataPosturo._semelle3dG;
  });
  await page.evaluate(() => eval('nav')('pg-bilan-posturo'));
  await construireRapport(page);
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
