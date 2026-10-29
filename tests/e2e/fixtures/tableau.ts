import type { Page } from '@playwright/test';

// Menu « Tableau type (cumulable) » : ouvre le menu, déplie la catégorie du tableau puis clique dessus.
export async function choisirTableau(page: Page, cle: string, portee = '.m3d') {
  const menu = page.locator(`${portee} .m3d-tabmenu`).first();
  if (!(await menu.evaluate((e: any) => e.open))) await menu.locator('summary').first().click();
  const item = menu.locator(`[data-tableau="${cle}"]`);
  const cat = item.locator('xpath=ancestor::details[contains(@class,"m3d-cat")]');
  if (await cat.count()) {
    if (!(await cat.evaluate((e: any) => e.open))) await cat.locator('summary').first().click();
  }
  await item.click();
}
