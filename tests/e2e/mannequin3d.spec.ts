import { test, expect } from '@playwright/test';
import { login, requireCredentials } from './fixtures/auth';
import { choisirTableau } from './fixtures/tableau';

test('mannequin 3D dans le bilan postural (parcours réel, patiente fictive)', async ({ page }) => {
  test.setTimeout(240_000);
  requireCredentials();
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  // politique de sécurité de l'application : aucune texture / ressource du mannequin ne doit être bloquée
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      /Content Security Policy|Couldn't load texture|GLTFLoader/.test(m.text())
    )
      erreurs.push(m.text());
  });
  const nom = `Mannequin${Date.now()}`;
  await login(page);
  await page.click('button:has-text("Nouveau patient")');
  await page.fill('#np-nom', nom);
  await page.fill('#np-prenom', 'E2E');
  await page.fill('#np-ddn', '1985-06-15');
  await page.selectOption('#np-civilite', 'Mme');
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
  // le bloc mannequin est en 1re position de la section Morphostatique
  expect(
    await page.evaluate(
      "document.getElementById('m3d-posturo').parentElement === document.getElementById('psec-1').firstElementChild"
    )
  ).toBe(true);
  // version affichée et libellé du menu (une page ancienne servie par un cache ne les aurait pas)
  await expect(page.locator('.m3d-build')).toContainText('Mannequin 3D v316');
  await expect(page.locator('.m3d .m3d-tabmenu > summary').first()).toContainText(
    '— Tableau type (cumulable) —'
  );
  // répartition du poids G/D : curseur dans le groupe Pieds, ligne au compte rendu
  const champPoids = (lbl: string) =>
    page.locator('.m3d-row', { hasText: lbl }).locator('input[type=number]').first();
  await page.locator('details.m3d-grp > summary', { hasText: 'Pieds' }).first().click();
  await champPoids('Répartition du poids').fill('10');
  await champPoids('Répartition du poids').dispatchEvent('change');
  await expect(page.locator('.m3d-cr', { hasText: 'Compte rendu' })).toContainText(
    '40 % G / 60 % D'
  );
  await champPoids('Répartition du poids').fill('0');
  await champPoids('Répartition du poids').dispatchEvent('change');
  // tableaux types cumulables : un 2e tableau s'ajoute au 1er
  await choisirTableau(page, 'genu_valgum_bilat');
  await choisirTableau(page, 'bascule_bassin_D');
  const cumul: any = await page.evaluate('_m3dPosturo.api.etat().valeurs');
  expect(cumul.genou_valgus_D).toBeGreaterThan(0);
  expect(cumul.bassin_bascule).not.toBe(0);
  await choisirTableau(page, 'neutre');
  // sexe par défaut d'après la civilité
  await expect(page.locator('.m3d-btn.on', { hasText: 'Femme' })).toBeVisible();
  // curseurs : on ouvre Tronc et Bassin
  await page.locator('details.m3d-grp > summary', { hasText: 'Tronc et rachis' }).click();
  await page.locator('details.m3d-grp > summary', { hasText: 'Bassin' }).click();
  const champ = (lbl: string) =>
    page.locator('.m3d-row', { hasText: lbl }).locator('input[type=number]').first();
  await champ('Inclinaison du tronc').fill('-8');
  await champ('Inclinaison du tronc').dispatchEvent('change');
  await champ('Bascule du bassin').fill('7');
  await champ('Bascule du bassin').dispatchEvent('change');
  await champ('Hyperlordose').fill('15');
  await champ('Hyperlordose').dispatchEvent('change');
  await page.waitForTimeout(2500); // autosave 1 s
  const stocke = await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d');

  expect(stocke.valeurs).toEqual({ tronc_incl: -8, bassin_bascule: 7, tronc_lordose: 15 });
  // « Retirer la peau » : la couche musculaire est visible ET possède sa texture (dans l'application réelle, avec sa CSP)
  await page.click('.m3d-btn:has-text("Retirer la peau")');
  const d = await page.evaluate('_m3dPosturo.api.diag()');
  expect(d).toEqual({ peauVisible: false, muscleVisible: true, textureMuscle: true });
  await page.click('.m3d-btn:has-text("Remettre la peau")');
  // hypothèses de mécanisme lésionnel : bascule 7° + lordose 15° déclenchent des règles, avec preuve et sources
  const meca = page.locator('.m3d-meca');
  await expect(meca).toContainText('Mécanismes lésionnels possibles');
  await expect(meca).toContainText('pas un diagnostic');
  await expect(meca.locator('details.m3d-hyp').first()).toBeVisible();
  // sélection pour le rapport : rien de coché par défaut ; on coche une hypothèse ; elle est stockée et seule elle va au rapport
  const cases = meca.locator('input[data-meca]');
  expect(await cases.count()).toBeGreaterThan(0);
  expect(await meca.locator('input[data-meca]:checked').count()).toBe(0);
  const idRetenue = (await cases.first().getAttribute('data-meca')) as string;
  await cases.first().check();
  await page.waitForTimeout(2500);
  expect(await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d.retenues')).toEqual([
    idRetenue,
  ]);
  const rapM: any = await page.evaluate('_m3dVuesRapport(currentPatient.bilanDataPosturo)');
  expect(rapM.meca).toContain(idRetenue);
  expect((rapM.meca.match(/Niveau de preuve/g) || []).length).toBe(1);
  // compte rendu et mécanismes sur toute la largeur de la zone mannequin
  const lg = await page.evaluate(() => {
    const r = (e: Element | null) => (e ? e.getBoundingClientRect() : null);
    const m3d = r(document.querySelector('.m3d'));
    const cr = r(document.querySelector('.m3d-meca'));
    return { m3d: m3d && [m3d.left, m3d.width], cr: cr && [cr.left, cr.width] };
  });
  expect((lg.cr as number[])[1]).toBeGreaterThan((lg.m3d as number[])[1] * 0.9);
  // curseurs du bassin : repères activés → le bassin s'incline, les épaules et la tête non
  await page.click('.m3d-btn:has-text("Repères")');
  const ang = async () => page.evaluate('_m3dPosturo.api.angles()');
  const setv = async (lbl: string, v: string) => {
    const c = page.locator('.m3d-row', { hasText: lbl }).locator('input[type=number]').first();
    await c.fill(v);
    await c.dispatchEvent('change');
  };
  await setv('Bascule du bassin', '0');
  const a0 = await ang();
  await setv('Bascule du bassin', '9');
  const a1 = await ang();
  expect(Math.abs(a1.bassin - a0.bassin)).toBeGreaterThan(6);
  expect(Math.abs(a1.epaules - a0.epaules)).toBeLessThan(1.5);
  expect(Math.abs(a1.yeux - a0.yeux)).toBeLessThan(1.5);
  await page.locator('details.m3d-grp > summary', { hasText: 'Global' }).click();
  await setv('Antériorisation globale depuis les chevilles', '6');
  await page.waitForTimeout(300);
  await setv('Antériorisation globale depuis les chevilles', '0');
  await setv('Bascule du bassin', '7');
  await page.click('.m3d-btn:has-text("Repères")');
  await page.click('.m3d-btn:has-text("Retirer la peau")');
  await page.click('.m3d-btn:has-text("Profil G")');
  await page.waitForTimeout(500);
  // rapport
  const rap = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    await buildRapportPosturo();
    const ifr = document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement;
    const h = ifr.contentDocument!.body.innerHTML;
    const sec = Array.from(ifr.contentDocument!.querySelectorAll('.section')).find((x) =>
      x.textContent!.includes('Mannequin 3D')
    ) as HTMLElement;
    sec?.scrollIntoView();
    return {
      titre: h.includes('Mannequin 3D'),
      imgs: sec ? sec.querySelectorAll('img').length : 0,
      liste: h.includes('Hyperlordose lombaire : lordose 15'),
      meca: h.includes('Hypothèses de mécanisme lésionnel'),
      reperes: h.includes('Repères :') && h.includes('fil à plomb'),
      nbPreuves: (h.match(/Niveau de preuve/g) || []).length,
    };
  });

  expect(rap.titre).toBe(true);
  expect(rap.imgs).toBeGreaterThanOrEqual(4);
  expect(rap.liste).toBe(true);
  expect(rap.meca).toBe(true); // seule l'hypothèse cochée figure dans le rapport
  expect(rap.nbPreuves).toBe(1);
  expect(rap.reperes).toBe(true);
  expect(erreurs, erreurs.join(' | ')).toEqual([]);
  // anciens dessins : sans dessin la zone est masquée, avec un dessin enregistré elle réapparaît telle quelle
  const hauteur = () =>
    page.evaluate(
      () =>
        (
          document.getElementById('posturo-body-canvas') as HTMLElement
        ).parentElement!.getBoundingClientRect().height
    );
  await page.evaluate("nav('pg-bilan-posturo')");
  await page.click('#ptab-1');
  await expect(page.locator('#m3d-posturo .m3d')).toBeVisible({ timeout: 20_000 });
  // les valeurs enregistrées reviennent dans les curseurs à la réouverture
  await expect(
    page
      .locator('.m3d-row', { hasText: 'Inclinaison du tronc' })
      .locator('input[type=number]')
      .first()
  ).toHaveValue('-8');
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(
          (document.getElementById('posturo-body-canvas') as HTMLElement).parentElement!
        ).visibility
    )
  ).toBe('hidden');
  expect(await hauteur()).toBeGreaterThan(100); // le canevas garde ses dimensions
  await page.evaluate(
    "currentPatient.bilanDataPosturo._bodyCanvas = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; showPosturoSection(1);"
  );
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(
      () =>
        getComputedStyle(
          (document.getElementById('posturo-body-canvas') as HTMLElement).parentElement!
        ).visibility
    )
  ).toBe('visible');
  await expect(page.locator('#po-silh-legacy-titre')).toBeVisible();
  await page.evaluate('delete currentPatient.bilanDataPosturo._bodyCanvas');
  // membres supérieurs : deux colonnes (gauche / droite du patient)
  const bras = page.locator('details.m3d-grp', {
    has: page.locator('summary', { hasText: 'Membres supérieurs' }),
  });
  await bras.locator('summary').first().click();
  await expect(bras.locator('.m3d-colhead', { hasText: 'Gauche' })).toBeVisible();
  await expect(bras.locator('.m3d-colhead', { hasText: 'Droite' })).toBeVisible();
  // dictée : le mannequin propose, le praticien valide
  await page.fill(
    '.m3d-dic textarea',
    'genu valgum bilatéral marqué, tête penchée à gauche de 6 degrés'
  );
  await page.click('.m3d-btn:has-text("Interpréter")');
  await expect(page.locator('.m3d-prop label')).toHaveCount(3);
  expect(
    await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d.valeurs.genou_valgus_D')
  ).toBeUndefined();
  await page.click('.m3d-btn:has-text("Appliquer")');
  await page.waitForTimeout(2500);
  const apres = await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d.valeurs');
  expect(apres.genou_valgus_D).toBe(11);
  expect(apres.genou_valgus_G).toBe(11);
  expect(apres.tete_incl).toBe(-6);
  // profil du patient et chaîne musculaire : tableaux types groupés, encadré, case « Inclure au rapport », rapport
  // menu à catégories dépliables : 8 catégories, 16 tableaux de chaînes, 10 tableaux de genou, replié au départ
  const menuTab = page.locator('.m3d .m3d-tabmenu').first();
  expect(await menuTab.locator('details.m3d-cat').count()).toBe(8);
  expect(await menuTab.locator('details.m3d-cat[data-cat=posturales] [data-tableau]').count()).toBe(
    6
  );
  expect(await menuTab.locator('details.m3d-cat[data-cat=chainistes] [data-tableau]').count()).toBe(
    10
  );
  expect(await menuTab.locator('details.m3d-cat[data-cat=genoux] [data-tableau]').count()).toBe(10);
  expect(await menuTab.evaluate((e: any) => e.open)).toBe(false);
  expect(await menuTab.locator('details.m3d-cat[open]').count()).toBe(0);
  await choisirTableau(page, 'neutre');
  await choisirTableau(page, 'chaine_ouverture_PL');
  await choisirTableau(page, 'chaine_laterale_D');
  const prof = page.locator('.m3d-profbox');
  await expect(prof).toContainText('Profil du patient et chaîne musculaire (hypothèse)');
  await expect(prof).toContainText('Mézières / Myers');
  await expect(prof).toContainText('Busquet / GDS');
  await expect(prof).toContainText('pas un diagnostic');
  await expect(prof).toContainText('Chaîne d’ouverture (Busquet) = PL, postéro-latérale (GDS)');
  expect(await prof.locator('input[data-profil]:checked').count()).toBe(0);
  await prof.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/profil-chaines.png', fullPage: false });
  // chaîne AM (flexion) + valgus de genou unilatéral droit : chaîne ET compensation locale au genou droit
  await choisirTableau(page, 'neutre');
  await choisirTableau(page, 'chaine_flexion_AM');
  await choisirTableau(page, 'genu_valgum_D');
  await expect(prof).toContainText('Biomécanique et/ou viscéral (local)');
  await expect(prof).toContainText('Chaîniste / neuromusculaire (régional)');
  await expect(prof).toContainText('Compensations locales');
  await expect(prof).toContainText('côté droit');
  await expect(prof).toContainText('Entrée basse');
  await prof.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/profil-am-valgum.png', fullPage: false });
  // chaîne d'ouverture unilatérale (tableau type) : côté indiqué
  await choisirTableau(page, 'neutre');
  await choisirTableau(page, 'chaine_ouverture_PL_G');
  await expect(prof).toContainText('côté gauche seulement');
  // retour à la chaîne d'ouverture + ligne latérale D pour la suite (case, rapport)
  await choisirTableau(page, 'neutre');
  await choisirTableau(page, 'chaine_ouverture_PL');
  await choisirTableau(page, 'chaine_laterale_D');
  // sans case cochée : le rapport ne contient pas le profil
  const sansCase: any = await page.evaluate('_m3dVuesRapport(currentPatient.bilanDataPosturo)');
  expect(sansCase.profil).toBe('');
  await prof.locator('input[data-profil]').check();
  await page.waitForTimeout(2500);
  expect(await page.evaluate('currentPatient.bilanDataPosturo.mannequin3d.profilRetenu')).toBe(
    true
  );
  const avecCase: any = await page.evaluate('_m3dVuesRapport(currentPatient.bilanDataPosturo)');
  expect(avecCase.profil).toContain('Busquet / GDS');
  expect(avecCase.profil).toContain('cours, diapo 43');
  const rapProfil = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    await buildRapportPosturo();
    const ifr = document.querySelector('#rapport-posturo-body iframe') as HTMLIFrameElement;
    const h = ifr.contentDocument!.body.innerHTML;
    return {
      titre: h.includes('Profil du patient et chaîne musculaire (hypothèse)'),
      yeux: h.includes('— yeux') && !h.includes('oreilles'),
    };
  });
  expect(rapProfil.titre).toBe(true);
  expect(rapProfil.yeux).toBe(true);
  // nettoyage
  await page.evaluate(() => (window as any).nav('pg-patients'));
  await page.waitForTimeout(500);
  page.once('dialog', (d) => d.accept());
  const card = page.locator('#pt-list-el > div', { has: page.locator(`text=E2E ${nom}`) });
  if (await card.count()) await card.first().locator('button', { hasText: '✕' }).click();
});
