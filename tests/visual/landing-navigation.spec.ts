import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { prepare, ready, urls } from './fixtures';

for (const [name, route, destination] of [
  ['Rewards', '/rewards', 'How it works'],
  ['Parent', '/', 'Projects'],
] as const) {
  for (const width of [320, 390, 768, 959, 960, 961, 1440]) {
    test(`${name} navigation stays in page flow ${width}`, async ({page, browserName}, info) => {
      test.skip(browserName !== 'chromium' && ![390,1440].includes(width));
      await page.setViewportSize({width, height:900});await prepare(page);
      await page.goto(urls.landing + route);await ready(page);
      const menu=page.getByRole('button', {name:'Open navigation'});
      const navigation=page.getByRole('navigation', {name:'Mobile navigation'});
      const main=page.locator('main');
      if(width<960) {
        const before=(await main.boundingBox())!.y;
        await menu.click();await expect(navigation).toBeVisible();
        const panel=(await navigation.boundingBox())!;
        const after=(await main.boundingBox())!.y;
        expect(after-before).toBeGreaterThanOrEqual(panel.height);
        expect(after).toBeGreaterThanOrEqual(panel.y+panel.height);
        await expect(navigation).toHaveCSS('position', 'static');
        await expect(navigation).toHaveCSS('box-shadow', 'none');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        for(const link of await navigation.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await page.screenshot({path:`test-results/navigation-${name.toLowerCase()}-${info.project.name}-${width}.png`});
        await page.keyboard.press('Escape');await expect(menu).toBeFocused();
        await expect(navigation).toBeHidden();expect((await main.boundingBox())!.y).toBe(before);
      } else {
        await expect(menu).toBeHidden();await expect(navigation).toBeHidden();
        await expect(page.getByRole('navigation', {name:'Main navigation'})).toBeVisible();
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.clock.resume();expect((await new AxeBuilder({page}).include('header').analyze()).violations).toEqual([]);
    });
  }

  test(`${name} navigation supports keyboard, selection, resizing and text reflow`, async ({page,browserName}) => {
    await page.setViewportSize({width:390,height:568});await prepare(page);
    await page.goto(urls.landing+route);await ready(page);
    const menu=page.getByRole('button',{name:'Open navigation'});
    const navigation=page.getByRole('navigation',{name:'Mobile navigation'});
    await menu.focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('button',{name:'Close navigation'})).toHaveAttribute('aria-expanded','true');
    await page.keyboard.press(browserName==='webkit' && process.platform==='darwin'?'Alt+Tab':'Tab');
    await expect(navigation.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Escape');await expect(menu).toBeFocused();
    await menu.click();await navigation.getByRole('link',{name:destination,exact:true}).click();
    await expect(navigation).toBeHidden();await expect(page).toHaveURL(new RegExp(name==='Rewards'?'#how-it-works$':'#projects$'));
    await menu.click();await page.setViewportSize({width:960,height:900});
    await expect(menu).toBeHidden();await expect(page.locator('header a').first()).toBeFocused();
    await page.setViewportSize({width:320,height:568});await expect(menu).toHaveAttribute('aria-expanded','false');
    await page.addStyleTag({content:'html{font-size:200%} :where(a,button){line-height:1.5;letter-spacing:.12em;word-spacing:.16em}'});
    await menu.click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await navigation.getByRole('link').last().scrollIntoViewIfNeeded();
    await expect(navigation.getByRole('link').last()).toBeInViewport();
    await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});
    await expect(navigation).toBeVisible();await page.clock.resume();
    expect((await new AxeBuilder({page}).include('header').analyze()).violations).toEqual([]);
  });
}
